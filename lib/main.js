const data = require("self").data,
      winUtils = require("window-utils"),
      tabs = require("tabs"),
      xhr = require("xhr"),
      timers = require("timers"),

      {Cc, Ci} = require("chrome"),

      WM = Cc['@mozilla.org/appshell/window-mediator;1'].
        getService(Ci.nsIWindowMediator),

      { BrowserSearchEngines } = require("browser-search-engine"),
      { Geolocation } = require("geolocation"),

      SEARCH_TEXTBOX = "searchbar",
      STYLESHEET_ID = "searchspot-style";

const ffwm = new ffWindowManager();

function getSearchTextBox() {
  return winUtils.activeBrowserWindow.document.getElementById(SEARCH_TEXTBOX);
}

BrowserSearchEngines.on("removed", function(engine) {
  SearchSpotPanel.port.emit("removeEngine", engine);
});

BrowserSearchEngines.on("added", function(engine) {
  SearchSpotPanel.port.emit("addEngine", engine);
});

var SearchSpotPanel = require("autocomplete-panel").Panel({
  contentURL: data.url("searchspot-results.html"),
  contentScriptFile : [data.url("jquery.1.6.4.js"),
                       data.url("results.js")],
  onShow : function() {
    SearchSpotPanel.port.emit("setEngines", BrowserSearchEngines.getVisible())
    SearchSpotPanel.port.emit("setTerms", gCurrentQuery);
  }
});

SearchSpotPanel.port.on("resize", function(sizes) {
  var textbox = 300;
  try {
    getSearchTextBox().clientWidth;
  } catch (ignore) { }
  SearchSpotPanel.resize(Math.max(sizes.width, textbox, 300), Math.max(sizes.height,50));
});

SearchSpotPanel.port.on("click", function(data) {
  let engine = BrowserSearchEngines.get(data.engine);
  let location = Geolocation.formatted_address;

  // Here we track the adventure of the search tab!
  // If the term "foodie" is still in the search area when the tab is closed
  // we clear out the search area assuming they are done searching for "foodie"
  tabs.activeTab.once('close', function(tab) {
    var terms = data.terms;
    if (getSearchTextBox().value == terms) {
      getSearchTextBox().value = "";
    }
  });

  // Set the URL to start the search
  tabs.activeTab.url = engine.getSubmission(data.terms, location);

  // Set the search box with the actual terms used
  // i.e. (suggestions may be different than terms in input area)
  try {
    getSearchTextBox().value = data.terms;
  } catch(ignore) { }

  // Finally hide the search panel as a new search has begun
  SearchSpotPanel.hide();
});

var PermissionPanel = require("permission-panel").Panel({
  contentURL: data.url("permission.html"),
  contentScriptFile : [data.url("jquery.1.6.4.js"),
                       data.url("permission.js")]
});

PermissionPanel.port.on("click", function(data) {
  if (data == "ok") {
    Geolocation.allowed = true;
    getSearchTextBox().focus();
  } else {
    console.log("permission denied, please uninstall");
  }
  PermissionPanel.hide();
});

PermissionPanel.port.on("resize", function(sizes) {
  var textbox = 300;
  try {
    getSearchTextBox().clientWidth;
  } catch (ignore) { }
  PermissionPanel.resize(Math.max(sizes.width, textbox, 300), Math.max(sizes.height,50));
});

/**
 * Window watcher object (will attach to all windows, even pref windows)
 * Attaches buttons to new windows and removes them when they disappear
 */
function ffWindowManager() {
  return {
    onTrack: function ffWindowManager_onTrack(window) {
      if (winUtils.isBrowser(window)) {
        addStylesheet(window.document);
        attachToSearch(window.document);
      }
    },
    onUntrack: function ffWindowManager_onUntrack(window) {
      if (winUtils.isBrowser(window)) {
        removeStylesheet(window.document);
        detachFromSearch(window.document);
      }
    }
  }
}

exports.main = function (options, callbacks) {
  var windowTracker = new winUtils.WindowTracker(ffwm);
  require("unload").ensure(windowTracker);

  // Add in some suggestions for engines we know already work but aren't listed
  BrowserSearchEngines.get("Wikipedia (en)").addSuggest("http://en.wikipedia.org/w/api.php?action=opensearch&search={searchTerms}");
  BrowserSearchEngines.get("Amazon.com").addSuggest("http://completion.amazon.com/search/complete?method=completion&search-alias=aps&mkt=1&q={searchTerms}");

  Geolocation.once("address", function() {
    // Add Yelp to our Search Engines once we have Geolocation
    BrowserSearchEngines.add({
                  "name" : "Yelp",
                  "icon" : "data:image/x-icon;base64,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AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsQCQEAEhsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsMAQAAAAAMGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbDgAAAAAAAAwbGxsbGxoFCxsbGxsbGxsbGxsbGxsbGxsXAQAAAAAADBsbGxsbBQAACRsbGxsbGxsbGxsbGxsbGxsVAAAAAAAMGxsbGw4AAAAACRsbGxsbGxsbGxsbGxsbGxsPAAAAAAwbGxsYAQAAAAAAEhsbGxsbGxsbGxsbGxsbGxsPAAAADBsbGwcAAAAAAAACGxsbGxsbGxsbGxsbGxsbGxsJAAAMGxsSAAAAAAAAAAMbGxsbGxsbGxsWDBQbGxsbGxsKBhUbGwEAAAAAAgoTGxsbGxsbGxsbGwMAAAEJEhobGxsbGxsbBwACChUbGxsbGxsbGxsbGxsbAAAAAAAAAAcSGxsbGxsbFRcbGxsbGxsbGxsbGxsbGxsAAAAAAAAAAAAbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGwAAAAAAAAAABRsbGxsbFBAYGxsbGxsbGxsbGxsbGxsbAwAAAAABChUbGxsbGxYAAAACBw4WGxsbGxsbGxsbGxsLAAAFDxsbGxsbGxsbFwEAAAAAAAABDBsbGxsbGxsbGxkNERsbGxsbGwsAEhsbDwAAAAAAAAAFGxsbGxsbGxsbGxsbGxsbGxsQAAAHGxsbCwAAAAAAABAbGxsbGxsbGxsbGxsbGxsbGgEAAAUbGxsbAwAAAAAFGxsbGxsbGxsbGxsbGxsbGxsHAAAABRsbGxsXAQAAARcbGxsbGxsbGxsbGxsbGxsbEgAAAAAJGxsbGxsTAAEVGxsbGxsbGxsbGxsbGxsbGxgBAAAAAAwbGxsbGxsVFxsbGxsbGxsbGxsbGxsbGxsbAwAAAAAADBsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGwkAAAAAAAAMGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsOAAAAAAAAAAwbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGwIAAAAAAAAADBsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbFwgBAAAAAAAMGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsRCgQAAREbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxv////////////wf///wH///4B8f/+AfD//wHgf/+BwD//wcA//+GAP+PxgH/gP4P/4A/P/+AP///gD4//4B8A/+D/AD/j8YA//+HAP//B4H//weB//4Hw//8B+f//Af///gH///wB///8Af///AH///+B//////////////////w==",
                  "alias" : "Yelp",
                  "description" : "Yelp - Connecting people with great local businesses",
                  "method" : "get",
                  "url" : "http://www.yelp.ca/search?ns=1&find_desc={searchTerms}&find_loc={searchLocation}",
                  "suggest" : "http://www.yelp.ca/search_suggest?prefix={searchTerms}&loc={searchLocation}"
    });
  });

};


/// SEARCH INPUT

var gCurrentQuery;
var gCurrentTimer;

function attachToSearch(document) {
  var textbox = document.getElementById(SEARCH_TEXTBOX);
  if (textbox) {
    // Invasion of the search input snatchers!  Clone the search input field
    var searchbox = textbox.cloneNode(false);
    // Insert clone into position
    textbox.parentNode.insertBefore(searchbox, textbox.nextSibling);
    // While the humans aren't looking lets hide the old field and change it's id
    // Now all existing search commands should come to our clone field
    textbox.setAttribute("hidden", "true");
    textbox.setAttribute("id", SEARCH_TEXTBOX + "_old");

    // Disable the normal autocomplete features
    searchbox.setAttribute("disableautocomplete", "true");
    searchbox.removeAttribute("type");
    // Prevent the default search command handler from doing anything, we handle that below
    searchbox.handleSearchCommand = function(e) { }

    var openpanel = function(e) {
      if (searchbox.value == "") {
        return;
      }
      if (!SearchSpotPanel.isShowing) {
        if (Geolocation.allowed) {
          SearchSpotPanel.show(searchbox);
        } else {
          PermissionPanel.show(searchbox);
        }
      } else {
        // Set the terms before we allow them to hit enter
        SearchSpotPanel.port.emit("setTerms",searchbox.value);

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
      if (searchbox.value == gCurrentQuery) { return; }
      gCurrentQuery = searchbox.value;

      try {
        function refreshSuggestions()
        {

          for each (let engine in BrowserSearchEngines.getVisible()) {
            //dump("name: " + engine.name + "\n");

            function runRequest(terms, name, url) {
              var baseurl = "", type = "suggest";

              // XXX HACKS!!
              if (name == "Wikipedia (en)") {
                baseurl = "http://en.wikipedia.org/wiki/";
                type = "match";
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
                    // Our request returned but it's too late and the terms have changed
                    if (gCurrentQuery != terms) {
                      return;
                    }
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
                    var results = [];
                    var suggestions = JSON.parse(request.responseText)[1];
                    suggestions.forEach(function(item) {
                      if (results.length >= 3) {
                        return;
                      }
                      if (terms != item) {
                        results.push({ "title" : item, "url" : (type == "match")? baseurl + item : "" });
                      }
                    });
                    SearchSpotPanel.port.emit("add",{ "name" : name, "results" : results, "type" : type, "terms" : terms });
                    } catch (error) { dump("suggest error: " + error + "\n" + url + "\n"); }
                  }
                  else {
                    dump('Request Error ' + request.status + " : " + request.statusText + "\n" + url + "\n");
                  }
                }
              };
              request.send(null);
            }

            let location = Geolocation.formatted_address;
            //console.log("location", location);
            let suggestions = engine.getSuggestion(searchbox.value, location);
            runRequest(searchbox.value, engine.name, suggestions);
          }
        }

        if (gCurrentTimer) {
          timers.clearTimeout(gCurrentTimer);
        }
        gCurrentTimer = timers.setTimeout(refreshSuggestions, 300);

      }catch(err) { dump("err: " + err + "\n"); }

      return;

    };

    searchbox.onfocus = openpanel;
    searchbox.onclick = openpanel;
    searchbox.onkeyup = openpanel;

  } else {
    console.error("attachToSearch: couldn't find " + SEARCH_TEXTBOX)
  }
}

function detachFromSearch(document) {
  var searchbox = document.getElementById(SEARCH_TEXTBOX);
  var textbox = document.getElementById(SEARCH_TEXTBOX + "_old");
  if (textbox && searchbox) {
    // Remove our search box from the browser
    var parent = searchbox.parentNode;
    parent.removeChild(searchbox);
    // Reset the old search entry to it's former glory
    textbox.removeAttribute("hidden");
    textbox.setAttribute("id", SEARCH_TEXTBOX);
  } else {
    console.error("detachFromSearch: couldn't find " + SEARCH_TEXTBOX)
  }
}

/// STYLE SHEETS

function addStylesheet(document) {
  var uri = data.url(STYLESHEET_ID + ".css");
  var pi = document.createProcessingInstruction(
    "xml-stylesheet", "href=\"" + uri + "\" type=\"text/css\"");
  document.insertBefore(pi, document.firstChild);
}

function removeStylesheet(document) {
  var css = "href=\"" + data.url(STYLESHEET_ID + ".css") + "\" type=\"text/css\"";
  var found = false;
  for (var top = document.firstChild; top.target == "xml-stylesheet"; top = top.nextSibling) {
    if (top.data == css) {
      var parent = top.parentNode;
      parent.removeChild(top);
      found = true;
      break;
    }
  }
  if (!found) {
    console.error("removeStylesheet: couldn't find the " + STYLESHEET_ID);
  }
}
