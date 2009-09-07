var EXPORTED_SYMBOLS = [
    'set_read_bookmark',
    'get_read_bookmark',
    'storeFeedItem',
    'PhilipFeedItem',
    'PhilipFeedItemFromDOM',
    'toUnixTime',
];

var philipRSSDb = null;

Components.utils.import("resource://philip-rss/chrome/content/htmlparser.js");

function db_connect() {
    if (philipRSSDb) return philipRSSDb;
    var file = Components.classes["@mozilla.org/file/directory_service;1"]
                         .getService(Components.interfaces.nsIProperties)
                         .get("ProfD", Components.interfaces.nsIFile);
    file.append("philip-rss-db.sqlite");
    
    var storageService = Components.classes["@mozilla.org/storage/service;1"]
                            .getService(Components.interfaces.mozIStorageService);
    // Will also create the file if it does not exist
    var mDBConn = storageService.openDatabase(file); 
    // To speed things up & never lock up the disk
    var statement = mDBConn.createStatement("PRAGMA synchronous=OFF;");
    statement.execute();

    philipRSSDb = mDBConn;
    return mDBConn;
}

function PhilipFeedItem(guid, title, link, description, author, pubDate, feedURI, id) {
    this.title = title;
    this.link = link;
    this.pubDate = pubDate;
    this.feedURI = feedURI
    this.guid = guid;
    this.description = description;
    this.id = id;
}

function toUnixTime(tm) {
    return tm / 1000.0;
}

function PhilipFeedItemFromDOM(item, feedURI) {
    var guid = null;
    if (item.getElementsByTagName('guid') && item.getElementsByTagName('guid')[0]) {
        guid = item.getElementsByTagName('guid')[0].textContent;
    }
    var title = HTMLtoXML(item.getElementsByTagName('title')[0].textContent);
    var link = item.getElementsByTagName('link')[0].textContent;
    if (!guid) {
        guid = link;
    }
    var description_raw = item.getElementsByTagName('description')[0].textContent;
    var description = HTMLtoXML(description_raw);
    var author = null;
    if (item.getElementsByTagName('author') &&
        item.getElementsByTagName('author')[0]) {
        author = item.getElementsByTagName('author')[0].textContent;
    }
    var pubDate_str = null;
    if (item.getElementsByTagName('pubDate') &&
        item.getElementsByTagName('pubDate')[0]) {
        pubDate_str = item.getElementsByTagName('pubDate')[0].textContent;
    }
    var pubDate = Date.parse(pubDate_str);
    if (pubDate)
        pubDate = toUnixTime(pubDate);
    var d = new Date();
    var now = toUnixTime(d.getTime());
    // "> now" because, well, this doesn't make much sense otherwise
    if (!pubDate || (pubDate > now))
        pubDate = now;

    return new PhilipFeedItem(guid, title, link, description,
                              author, pubDate, feedURI, null);
}

PhilipFeedItem.prototype.valid = function() {
    return this.pubDate;
}

function _init_read_times() {
    var db = db_connect();
    db.executeSimpleSQL("CREATE TABLE IF NOT EXISTS read_times " +
                        "(feed_url TEXT, tm_id INTEGER, " + 
                        "primary key (feed_url))");
}

function set_read_bookmark(id) {
    _init_read_times();
    var db = db_connect();
    var statement = db.createStatement(
        "INSERT OR REPLACE INTO read_times (feed_url, tm_id) VALUES (?1, ?2)"
    );
    // all feeds are set at once right now - we use the * char to designate
    statement.bindUTF8StringParameter(0, '*'); 
    statement.bindInt32Parameter(1, id);
    statement.execute();
}

function get_read_bookmark() {
    _init_read_times();
    var db = db_connect();
    var statement = db.createStatement(
        "SELECT tm_id FROM read_times WHERE feed_url=?1"
    );
    // all feeds have same bookmark id for now... using * char to designate this
    statement.bindUTF8StringParameter(0, '*');
    var tm = null;
    if (statement.executeStep())
        tm = statement.getInt32(0);
    return tm;
}

var ioService = Components.classes["@mozilla.org/network/io-service;1"]  
                   .getService(Components.interfaces.nsIIOService);

function getFeeds() {
    /* Gets feeds that occur after the read bookmark */
    _init_feed_items();
    var db = db_connect();
    var read_bookmark = get_read_bookmark();
    var statement = null;
    if (read_bookmark) {
        statement = db.createStatement(
            "SELECT id, feed_url, guid, title, link, description, " +
                   "author, pubDate " +
            "FROM feed_items " + 
            "WHERE id > ?1 " +
            "ORDER BY id DESC");
        statement.bindInt32Parameter(0, read_bookmark);
    }
    else {
        statement = db.createStatement(
            "SELECT id, feed_url, guid, title, link, description, " + 
                   "author, pubDate " +
            "FROM feed_items " + 
            "ORDER BY id DESC");
    }
    var feeds = [];
    while (statement.executeStep()) {
        var feed_id = statement.getInt32(0);
        var feed_url = statement.getUTF8String(1);
        var feedURI = ioService.newURI(feed_url, null, null);
        var guid = statement.getUTF8String(2);
        var title = statement.getUTF8String(3);
        var link = statement.getUTF8String(4);
        var description = statement.getUTF8String(5);
        var author = statement.getUTF8String(6);
        var pubDate = statement.getDouble(7);
        var feedItem = new PhilipFeedItem(
            guid, title, link, description,
            author, pubDate, feedURI, feed_id
        );
        feeds.push(feedItem);
    }
    delOldFeeds();
    return feeds;
}

function delOldFeeds() {
    /* Clear out feeds with id < currently 'cleared' id
       and only clear when the item isn't currently in the feed.
       (Otherwise items will reappear when the feed is re-grabbed) */

    function _current_feed_items() {
        var lookup_a = {};
        statement = db.createStatement(
                "SELECT feed_url, guid " +
                "FROM feed_items " + 
                "ORDER BY id DESC");
        while (statement.executeStep()) {
            var feed_url = statement.getUTF8String(0);
            var guid = statement.getUTF8String(1);
            lookup_a[ (feed_url + ' ' + guid) ] = true;
        }
        return lookup_a;
    }

    function is_in_current_feeds(feed_url, guid) {
        return cur_feed_items[feed_url + ' ' + guid];
    }

    function del_item(feed_url, guid) { 
        delItem = db.createStatement(
            "DELETE FROM feed_items WHERE feed_url=?1 AND guid=?2"
        );
        delItem.bindUTF8StringParameter(0, feed_url);
        delItem.bindUTF8StringParameter(1, guid);
        delItem.execute();
    }

    var db = db_connect();
    var read_bookmark = get_read_bookmark();
    if (!read_bookmark)
        return;

    var cur_feed_items = _current_feed_items();

    statement = db.createStatement(
        "SELECT feed_url, guid FROM feed_items WHERE id < ?1"
    );
    statement.bindInt32Parameter(0, read_bookmark);
    while (statement.executeStep()) {
        var feed_url = statement.getUTF8String(0);
        var guid = statement.getUTF8String(1);
        if (!is_in_current_feeds(feed_url, guid)) {
            del_item(feed_url, guid);
        }
    }
}

function _init_feed_items() {
    var db = db_connect();
    db.executeSimpleSQL(
        "CREATE TABLE IF NOT EXISTS feed_items " +
        "(id INTEGER PRIMARY KEY AUTOINCREMENT, feed_url TEXT, guid TEXT, " +
         "title TEXT, link TEXT, description TEXT, " +
         "author TEXT, pubDate float, grabbedDate float" +
       " )"
    );
    db.executeSimpleSQL(
        "CREATE INDEX IF NOT EXISTS feed_url_feed_items ON feed_items (feed_url)"
    );
    db.executeSimpleSQL(
        "CREATE INDEX IF NOT EXISTS guid_feed_items ON feed_items (guid)"
    );
}

function isInFeeds(item, db) {
    /* Is the given item already stored (guid)? */
    var statement = db.createStatement(
        "SELECT guid FROM feed_items " +
        "WHERE feed_url=?1 AND guid=?2"
    );
    statement.bindUTF8StringParameter(0, item.feedURI.spec);
    statement.bindUTF8StringParameter(1, item.guid);
    if (statement.executeStep()) {
        if (statement.getUTF8String(0)) {
            return true;
        }
    }
    return false;
}

function storeFeedItem(item, grabbedDate) {
    /* Stores a feed item unless we already have one that's
       the same (modulo guid) in the DB. */
    _init_feed_items();
    var db = db_connect();
    if (isInFeeds(item, db)) return;
    var statement = db.createStatement(
        "INSERT INTO feed_items " + 
        "(feed_url, guid, title, link, description, author, pubDate, grabbedDate) " + 
        "VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)"
    );
    statement.bindUTF8StringParameter(0, item.feedURI.spec);
    statement.bindUTF8StringParameter(1, item.guid);
    statement.bindUTF8StringParameter(2, item.title);
    statement.bindUTF8StringParameter(3, item.link);
    statement.bindUTF8StringParameter(4, item.description);
    statement.bindUTF8StringParameter(5, item.author);
    statement.bindUTF8StringParameter(6, item.pubDate);
    statement.bindUTF8StringParameter(7, grabbedDate);
    statement.execute();
}
