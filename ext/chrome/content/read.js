function loadFeeds() {
    var feeds = getFeeds();
    feeds = feeds.reverse();
    var feeds_html = '';
    var feedsDiv = document.createElement('div');
    feedsDiv.id = 'PhilipRSSFeeds';
    if (!feeds.length) {
        feedsDiv.innerHTML =
            '<div class="PhilipRSSItem">' +
                '<h2 class="PhilipRSSItemTitle">' +
                  'You have no new feed items.' + 
                '</h2>' +
                '<div class="PhilipRSSItemDescription">' +
                '<a href="#" style="font-size: x-large;" ' + 
                   'onclick="location.reload(true);return false;">Refresh' +
                '</a></div>' +
            '</div>';
        document.getElementById('content').appendChild(feedsDiv);
        return;
    }
    for (var i in feeds) {
        var item = feeds[i];
        feeds_html += renderFeedItem(item); 
    }
    feeds_html += '<div id="reloadFeeds">' +
                  '<a href="#" onclick="reloadFeeds();return false;">' +
                    'Reload feeds' +
                  '</a></div>';
    feedsDiv.innerHTML = feeds_html;
    document.getElementById('content').appendChild(feedsDiv);
}

function renderFeedItem(item) {
    var item_html =
        '<div class="PhilipRSSItem">' +
          '<h2 class="PhilipRSSItemTitle">' +
            '<a href="' + item.link + '">' + item.title + '</a>' +
          '</h2>' +
          '<div class="PhilipRSSItemDescription">' +
            item.description +
          '</div>' +
        '</div>' +
        '<div class="clearBookmarkHere" tmId="' + item.id + '" ' +
             'title="Click to clear items above"></div>';
    return item_html; 
}

function clearObserved(tm_id) {
    if (!tm_id) return; // someone pressed 'clear' w/ no feeds on pg
    set_read_bookmark(tm_id);
    location.reload(true);
}

function reloadFeeds() {
    var livemarkService = Components.classes[
        "@mozilla.org/browser/livemark-service;2"].getService(
            Components.interfaces.nsILivemarkService);
    livemarkService.reloadAllLivemarks();
    $('#reloadFeeds').html(
        '<div>Reloading feeds...</div>' + 
        '<div style="font-size:small; color: #444444;">' + 
          '( New items will appear when you reload this page )' +
        '</div>'
    );
}

function get_max_tm_id() {
    // Returns the last / largest tm_id on the page.
    var max_tm_id = null;
    max_tm_id = $('.clearBookmarkHere:last').attr('tmId');
    return max_tm_id;
}

function decorate() {
    $('.clearBookmarkHere').hover(
        // mouseover
        function () {
            $(this).html(
                '<div style="position: relative; ' +
                            'border-top: 1px dashed #999999;">' +
                '</div>'
            );
            $(this).css({color:'#888888'});
        },

        // mouseout
        function() {
            $(this).html('');
        }
    );
    $('.clearBookmarkHere').click(
        function () {
            var tm_id = $(this).attr('tmId');
            clearObserved(tm_id);
            location.reload(true);
        }
    );
}

window.onload = function () { loadFeeds(); decorate(); }
