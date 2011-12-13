const data = require("self").data,
      winUtils = require("window-utils"),
      tabs = require("tabs"),
      xhr = require("xhr"),
      url = require("url"),
      timers = require("timers"),
      prefs = require("preferences-service"),

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
  SearchSpotPanel.resize(Math.max(sizes.width, textbox.clientWidth), Math.max(sizes.height,300));
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
  require("unload").ensure(windowTracker);

  // Do some geolocation magic and add Yelp to our Search Engines
  getLocation();

};

// Global GeoLocation address in the City, Region format
var gLocation = "";

function getLocation() {
  let pref_name = "geo.wifi.protocol";
  if (!prefs.isSet(pref_name)) {
    prefs.set(pref_name, 0);
  }

  pref_name = "geo.wifi.uri";
  if (!prefs.isSet(pref_name)) {
    prefs.set(pref_name, "https://www.google.com/loc/json");
  }

  Cc["@mozilla.org/geolocation;1"].
    getService(Ci.nsIDOMGeoGeolocation).
    getCurrentPosition(
      function ht_gotPosition(position) {
          gLocation = position.address.city + ", " + position.address.region;
          dump("Adding YELP @ " + gLocation + "\n");

          // Add Yelp to the mix
          Services.search.addEngineWithDetails("Yelp",
                                               "data:image/x-icon;base64,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AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsQCQEAEhsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsMAQAAAAAMGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbDgAAAAAAAAwbGxsbGxoFCxsbGxsbGxsbGxsbGxsbGxsXAQAAAAAADBsbGxsbBQAACRsbGxsbGxsbGxsbGxsbGxsVAAAAAAAMGxsbGw4AAAAACRsbGxsbGxsbGxsbGxsbGxsPAAAAAAwbGxsYAQAAAAAAEhsbGxsbGxsbGxsbGxsbGxsPAAAADBsbGwcAAAAAAAACGxsbGxsbGxsbGxsbGxsbGxsJAAAMGxsSAAAAAAAAAAMbGxsbGxsbGxsWDBQbGxsbGxsKBhUbGwEAAAAAAgoTGxsbGxsbGxsbGwMAAAEJEhobGxsbGxsbBwACChUbGxsbGxsbGxsbGxsbAAAAAAAAAAcSGxsbGxsbFRcbGxsbGxsbGxsbGxsbGxsAAAAAAAAAAAAbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGwAAAAAAAAAABRsbGxsbFBAYGxsbGxsbGxsbGxsbGxsbAwAAAAABChUbGxsbGxYAAAACBw4WGxsbGxsbGxsbGxsLAAAFDxsbGxsbGxsbFwEAAAAAAAABDBsbGxsbGxsbGxkNERsbGxsbGwsAEhsbDwAAAAAAAAAFGxsbGxsbGxsbGxsbGxsbGxsQAAAHGxsbCwAAAAAAABAbGxsbGxsbGxsbGxsbGxsbGgEAAAUbGxsbAwAAAAAFGxsbGxsbGxsbGxsbGxsbGxsHAAAABRsbGxsXAQAAARcbGxsbGxsbGxsbGxsbGxsbEgAAAAAJGxsbGxsTAAEVGxsbGxsbGxsbGxsbGxsbGxgBAAAAAAwbGxsbGxsVFxsbGxsbGxsbGxsbGxsbGxsbAwAAAAAADBsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGwkAAAAAAAAMGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsOAAAAAAAAAAwbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGwIAAAAAAAAADBsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbFwgBAAAAAAAMGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsRCgQAAREbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxv////////////wf///wH///4B8f/+AfD//wHgf/+BwD//wcA//+GAP+PxgH/gP4P/4A/P/+AP///gD4//4B8A/+D/AD/j8YA//+HAP//B4H//weB//4Hw//8B+f//Af///gH///wB///8Af///AH///+B//////////////////w==",
                                               "Yelp",
                                               "Yelp - Connecting people with great local businesses",
                                               "get",
                                               "http://www.yelp.ca/search?ns=1&find_desc={searchTerms}&find_loc=" + encodeURIComponent(gLocation));
      },
      function ht_gotError(e) {
        if (e.code == e.PERMISSION_DENIED) {
          dump("GeoLocation Error: Permission denied\n");
        } else if (e.code == e.POSITION_UNAVAILABLE) {
          dump("GeoLocation Error: Position Unavailable\n");
        } else if (e.code == e.TIMEOUT) {
          dump("GeoLocation Error: Timeout\n");
        }
        dump("Yelp will not be working for this session, try using the latest stable Firefox\n");
      },
      {enableHighAccuracy:false, timeout:15*1000}
    );
}

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
              } else if (name == "Yelp") {
                url = "http://www.yelp.ca/search_suggest?prefix=" + encodeURIComponent(terms) + "&loc=" + encodeURIComponent(gLocation);
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
                      if (name == "Yelp") {
                        // Yelp returns a crappy HTML answer instead of JSON
                        // We just send the whole body object to the iframe to let the DOM parse it all
                        // {"body": "<ul>\n\t\t\t
                        //            <li title=\"Elysian Coffee\">Elysian<span class=\"highlight\">&nbsp;Coffee</span></li>\n\t\t\t
                        //            <li title=\"Elysian Room\">Elysian<span class=\"highlight\">&nbsp;Room</span></li>\n\t
                        //           </ul>",
                        // "unique_request_id": "a1fdaa421112b2b5"}
                        var response = JSON.parse(request.responseText)["body"];
                        SearchSpotPanel.port.emit("yelp",{ "terms" : terms, "name" : name, "results" : response, "type" : type });
                        return;
                      }
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
                    } catch (error) { dump("suggest error: " + error + "\n" + url + "\n"); }
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
