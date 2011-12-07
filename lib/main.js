const data = require("self").data,
      winUtils = require("window-utils"),
      tabs = require("tabs"),
      xhr = require("xhr"),
      url = require("url"),
      timers = require("timers"),

      {Cu, Cc, Ci} = require("chrome"),

      WM = Cc['@mozilla.org/appshell/window-mediator;1'].
        getService(Ci.nsIWindowMediator),

      BROWSER = 'navigator:browser';

const windowManager = new ffWindowManager();

const Services = Cu.import("resource://gre/modules/Services.jsm").Services;

var SearchSpotPanel = require("autocomplete-panel").Panel({
  contentURL: data.url("searchspot-results.html"),
  contentScriptFile : [data.url("jquery.1.6.4.js"),
                       data.url("results.js")]
});

SearchSpotPanel.port.on("resize", function(sizes) {
  //dump("resize : " + sizes.width + " : " + sizes.height + "\n");
  var textbox = 300;
  try {
    textbox = windowManager.getActiveWindowDocument().getElementById(SEARCH_TEXTBOX);
  } catch (ignore) { }
  SearchSpotPanel.resize(Math.max(sizes.width, textbox.clientWidth * 2), Math.max(sizes.height,300));
});

SearchSpotPanel.port.on("click", function(data) {
  let engine = Services.search.getEngineByName(data.engine);
  let submission = engine.getSubmission(data.terms);
  tabs.activeTab.url = submission.uri.spec;

  try {
    windowManager.getActiveWindowDocument().getElementById(SEARCH_TEXTBOX).value = data.terms;
  } catch(ignore) { }
  SearchSpotPanel.hide();
});

/**
 * Window watcher object (will attach to all windows, even pref windows)
 * Attaches buttons to new windows and removes them when they disappear
 */
function ffWindowManager() {
  return {
    onTrack: function ffWindowManager_onTrack(window) {
      if (this._isBrowserWindow(window)) {
        //console.log("Tracking a window: " + window.document);
        addStylesheet(window.document);
        attachToSearch(window.document);
      }
    },
    onUntrack: function ffWindowManager_onUntrack(window) {
      if (this._isBrowserWindow(window)) {
        //console.log("Untracking a window: " + window.document);
        removeStylesheet(window.document);
        detachFromSearch(window.document);
      }
    },
    _isBrowserWindow: function browserManager__isBrowserWindow(win) {
      let winType = win.document.documentElement.getAttribute("windowtype");
      return winType === BROWSER;
    },
    // bit of a hack to get the active window document object
    // solely used to get the search box entry for size / position requests
    getActiveWindowDocument: function browserManager__getActiveWindowDocument() {
      let window = WM.getMostRecentWindow(BROWSER);
      return this._isBrowserWindow(window) ? window.document : null;
    }
  }
}

exports.main = function (options, callbacks) {
  var windowTracker = new winUtils.WindowTracker(windowManager);
  require("unload").ensure(windowTracker)
};

const SEARCH_TEXTBOX = "searchbar";

/**
 * 
 *
 * @param {Object} document is the document related to the Window
 * 
 */
var gCurrentQuery;
var gCurrentTimer;

function attachToSearch(document) {
  var textbox = document.getElementById(SEARCH_TEXTBOX);
  var _document = document;
  if (textbox) {
    // These disable the normal autocomplete features
    textbox.setAttribute("disableautocomplete", "true");
    textbox.removeAttribute("type");
    // This prevents the default search command handler from doing anything at all
    textbox.handleSearchCommand = function(e) { return; }
    var openpanel = function(e) {
      if (textbox.value == "") {
        return;
      }
      if (!SearchSpotPanel.isShowing) {
        SearchSpotPanel.show(textbox);

        var engines = {};
        for each (let engine in Services.search.getVisibleEngines()) {
          //dump("name: " + engine.name + "\n");
          engines[engine.name] = { name : engine.name,
                                   icon : engine.iconURI.spec,
                                   description: engine.description,
                                   search : engine.searchForm
                                  };
        }
        SearchSpotPanel.port.emit("engines", engines);

      } else {
        // down arrow
        if (e.keyCode == 40) {
          SearchSpotPanel.port.emit("next");
          e.preventDefault();
          return;
        // up arrow
        } else if (e.keyCode == 38) {
          SearchSpotPanel.port.emit("previous");
          e.preventDefault();
          return;
        // enter
        } else if (e.keyCode == 13) {
          e.preventDefault();
          e.stopPropagation();
          SearchSpotPanel.port.emit("go");
          return;
        }
      }

      // don't refresh if the string hasn't changed!
      if (textbox.value == gCurrentQuery) return;
      gCurrentQuery = textbox.value;

      try {
        function refreshSuggestions()
        {
          SearchSpotPanel.port.emit("update",textbox.value);

          for each (let engine in Services.search.getVisibleEngines()) {
            //dump("name: " + engine.name + "\n");

            function runRequest(terms, name, suggestionUri) {
              var url = null, baseurl = "", type = "suggest";
              if (suggestionUri) {
                url = suggestionUri.uri.spec;
              }

              // XXX HACKS!!
              if (name == "Wikipedia (en)") {
                url = "http://en.wikipedia.org/w/api.php?action=opensearch&search=" +  encodeURIComponent(terms);
                baseurl = "http://en.wikipedia.org/wiki/";
                type = "match";
              } else if (name == "Amazon.com") {
                url = "http://completion.amazon.com/search/complete?method=completion&search-alias=aps&mkt=1&q=" +  encodeURIComponent(terms);
              }
              
              if (url == null) {
                return;
              }
              // Run an async google suggest query for helpful search suggestions
              var request = new xhr.XMLHttpRequest();
              request.open('GET', url, true);
              request.onreadystatechange = function (aEvt) {
                if (request.readyState == 4) {
                  if (request.status == 200) {
                    // ["term", ["suggestions", "of", "matches" ]]
                    // ex: ["json",["jsonline","json","json validator","jsonp"]]
                    try {
                    var suggestions = JSON.parse(request.responseText)[1];
        
                    var results = [];
                    for (var i in suggestions) {
                      if (results.length >= 3) {
                        break;
                      }
                      if (terms !=  suggestions[i]) {
                        results.push({ "terms" : terms, "title" : suggestions[i], "url" : (type == "match")? baseurl + suggestions[i] : "" });
                      }
                    }
                    SearchSpotPanel.port.emit("add",{ "name" : name, "results" : results, "type" : type });
                    } catch (error) { dump("suggest error: " + error + "\n" + request.responseText + "\n" + url + "\n"); }
                  }
                  else {
                    dump('Error ' + request.statusText + "\n");
                  }
                }
              };
              request.send(null);
            }

            let suggestions = engine.getSubmission(textbox.value, "application/x-suggestions+json");
            runRequest(textbox.value, engine.name, suggestions);
          }
        }

        if (gCurrentTimer) {
          timers.clearTimeout(gCurrentTimer);
        }
        gCurrentTimer = timers.setTimeout(refreshSuggestions, 300);

      }catch(err) { dump("err: " + err + "\n"); }

      return;

    };

    textbox.onfocus = openpanel;
    textbox.onclick = openpanel;
    textbox.onkeyup = openpanel;

  } else {
    console.error("attachToSearch: couldn't find " + SEARCH_TEXTBOX)
  }
}

/**
 *
 *
 * @param {Object} document is the document related to the Window 
 */
function detachFromSearch(document) {
  var textbox = document.getElementById(SEARCH_TEXTBOX);
  if (textbox) {
    // XXX we should probably put things back the way they were
  } else {
    console.error("detachFromSearch: couldn't find " + SEARCH_TEXTBOX)
  }
}









/// STYLE SHEETS

const STYLESHEET_ID = "searchspot-style";

function addStylesheet(document) {
  var uri = data.url(STYLESHEET_ID + ".css");
  var pi = document.createProcessingInstruction(
    "xml-stylesheet", "href=\"" + uri + "\" type=\"text/css\" id=\"" + STYLESHEET_ID + "\"");
  document.insertBefore(pi, document.firstChild);
}

function removeStylesheet(document) {
  var css = document.getElementById(STYLESHEET_ID);
  if (css) {
    var parent = css.parentNode;
    parent.removeChild(css);
  } else {
    console.error("removeStylesheet: couldn't find the searchbar-textbox")
  }
}
