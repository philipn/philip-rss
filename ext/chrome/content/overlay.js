Components.utils.import("resource://gre/modules/XPCOMUtils.jsm");
Components.utils.import("resource://philip-rss/chrome/content/utils.js");
var bmsvc = Components.classes["@mozilla.org/browser/nav-bookmarks-service;1"]
                      .getService(Components.interfaces.nsINavBookmarksService);

var livemarkService = Components.classes["@mozilla.org/browser/livemark-service;2"]
                                .getService(Components.interfaces.nsILivemarkService);

// An nsINavBookmarkObserver
var philipRSS_bookmarkListener = {
  onBeginUpdateBatch: function() {},
  onEndUpdateBatch: function() {},
  onItemAdded: function() {},
  onItemRemoved: function() {},
  onItemChanged: function(aBookmarkId, aProperty, aIsAnnotationProperty, aValue) {
    // make sure it's a livemark and that it's just going to fire once
    // per livemark update
    if (livemarkService.isLivemark(aBookmarkId) && aProperty == 'livemark/expiration') {
        PhilipRSS.refreshFeed(livemarkService.getFeedURI(aBookmarkId));
    }
  },
  onItemVisited: function() {},
  onItemMoved: function() {},
  QueryInterface: XPCOMUtils.generateQI([Components.interfaces.nsINavBookmarkObserver])
};

// An extension
var PhilipRSS = {
  // This function is called when my add-on is loaded
  onLoad: function() {
    dump('listener addded');
    bmsvc.addObserver(philipRSS_bookmarkListener, false);
  },
  // This function is called when my add-on is unloaded
  onUnLoad: function() {
    bmsvc.removeObserver(philipRSS_bookmarkListener);
  },
  // This function is called when the status bar icon is clicked
  onSBTBClick: function () {
    var browser = top.document.getElementById("content");
    var tab = browser.addTab("chrome://philip-rss/content/read.html");
    browser.selectedTab = tab;
  },
  refreshFeed: function(URI) {
    var req = new XMLHttpRequest();
    req.overrideMimeType('text/xml');
    req.open('GET', URI.spec, true);
    req.onreadystatechange = function (aEvt) {  
        var d = new Date();
        var grabbedDate = toUnixTime(d.getTime());
        if (req.readyState == 4) {  
            if(req.status == 200) {
                var rss_dom = req.responseXML;
                var channel = rss_dom.getElementsByTagName('channel')[0];
                var feed_title = channel.getElementsByTagName('title')[0].firstChild.nodeValue;
                var items = channel.getElementsByTagName('item');
                for (var i=0; i < items.length; i++) {
                    var item = items[i];
                    var feedItem = PhilipFeedItemFromDOM(item, URI);
                    if (feedItem.valid()) {
                        storeFeedItem(feedItem, grabbedDate);
                    }
                    else
                    {
                        dump('Invalid feed: ' + URI.spec);
                    }
                }
            }
        }  
    };
    req.send(null);
  },
};

window.addEventListener("load", function(e) { PhilipRSS.onLoad(e); }, false);
