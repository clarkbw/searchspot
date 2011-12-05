const XUL_NS = "http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul",
      ON_SHOW = 'popupshown',
      ON_HIDE = 'popuphidden';

const data = require("self").data;
const winUtils = require("window-utils");
const windowManager = new ffWindowManager();
const tabs = require("tabs");
const xhr = require("xhr");
const url = require("url");
const timers = require("timers");

const {Cu} = require("chrome");
const Services = Cu.import("resource://gre/modules/Services.jsm").Services;

exports.main = function (options, callbacks) {

  var windowTracker = new winUtils.WindowTracker(windowManager);
  require("unload").ensure(windowTracker)
};



/**
 * Window watcher object (will attach to all windows, even pref windows)
 * Attaches buttons to new windows and removes them when they disappear
 */
function ffWindowManager() {
  var panels = {};
  return {
    getPanel : function ffWindowManager_getPanel(document) {
      return panels[document];
    },
    onTrack: function ffWindowManager_onTrack(window) {
      if (this._isBrowserWindow(window)) {
        //console.log("Tracking a window: " + window.document);
        addStylesheet(window.document);
        var panel = addPanel(window.document);
        if (panel) {
          panels[window.document] = panel;
        }
        attachToSearch(window.document);
      }
    },
    onUntrack: function ffWindowManager_onUntrack(window) {
      if (this._isBrowserWindow(window)) {
        //console.log("Untracking a window: " + window.document);
        removeStylesheet(window.document);
        removePanel(window.document);
        delete panels[window.document];
        detachFromSearch(window.document);
      }
    },
    _isBrowserWindow: function browserManager__isBrowserWindow(win) {
      let winType = win.document.documentElement.getAttribute("windowtype");
      return winType === "navigator:browser";
    }
  }
}


function add(document, id, callback) {
  var object = document.getElementById(id);
  if (object) {
    callback();
  } else {
    console.error("couldn't find " + id);
  }
}

const SEARCH_PANEL_ID = "searchspot-panel";

/**
 * 
 *
 * @param {Object} document is the document related to the Window
 * 
 */
function addPanel(document) {
  var popupset = document.getElementById("mainPopupSet");
  var textbox = document.getElementById(SEARCH_TEXTBOX);

  if (popupset) {
    function Panel() {
      var _document = document;
      var panel = document.createElementNS(XUL_NS, "panel");
          panel.setAttribute("id", SEARCH_PANEL_ID);
          panel.setAttribute("noautofocus", "true");
          panel.setAttribute("tooltiptext", "");
          panel.setAttribute("width", textbox.clientWidth * 2);
          panel.setAttribute("height", 300);
      var iframe = document.createElementNS(XUL_NS, "iframe");
          iframe.setAttribute("flex", "1");
          iframe.setAttribute("src", data.url("searchspot-results.html"));
        panel.appendChild(iframe);


      var _content_messageListener = function(evt) {
        // Only accept postMessage events from our add-on
        var myURL = url.URL(data.url());
        var localScheme = myURL.scheme + "://" + myURL.host;
        if (evt.origin != localScheme) {
          //dump("postMessage from another origin " +  evt.origin  +"; mine is "+ localScheme + "\n");
          return;
        }

        var d = JSON.parse(evt.data);

        if (d.topic == "document") {
          panel.setAttribute("width", Math.max(d.data.width, textbox.clientWidth * 2));
          panel.setAttribute("height", Math.max(d.data.height,300));
        } else if (d.topic == "click") {

          let engine = Services.search.getEngineByName(d.data.engine);
          let submission = engine.getSubmission(d.data.terms);
          tabs.activeTab.url = submission.uri.spec;

          textbox.value = d.data.terms;
          panel.hidePopup();
        }
      };

      panel.addEventListener('popuphidden', function(e) {
        iframe.contentWindow.window.removeEventListener("message", _content_messageListener, false);
      }, false);
      panel.addEventListener('popupshown', function(e) {
        iframe.contentWindow.window.addEventListener("message", _content_messageListener, false);
      }, false);

      return {
        panel : function() {
          return panel;
        },
        isClosed : function() {
          return (panel.state != "open");
        },
        open : function(textbox, e) {
          panel.openPopup(textbox, "after_start", 0, 0, false, false, e);
        },
        setEngines : function(values) {
          iframe.contentWindow.wrappedJSObject.setEngines(values);
        },
        add : function(values) {
          iframe.contentWindow.wrappedJSObject.add(values);
        },
        update : function(values) {
          iframe.contentWindow.wrappedJSObject.update(values);
        },
        next : function() {
          iframe.contentWindow.wrappedJSObject.next();
        },
        previous : function() {
          iframe.contentWindow.wrappedJSObject.previous();
        },
        go : function() {
          iframe.contentWindow.wrappedJSObject.go();
        }
      }
    }
    var p = new Panel();
    popupset.appendChild(p.panel());
    return p;
  } else {
    console.error("addPanel: couldn't find the mainPopupSet")
  }
  return null;
}

/**
 *
 *
 * @param {Object} document is the document related to the Window 
 */
function removePanel(document) {
  var panel = document.getElementById(SEARCH_PANEL_ID);
  if (panel) {
    var parent = panel.parentNode;
    parent.removeChild(panel);
  } else {
    console.error("removePanel: couldn't find the searchbar-textbox")
  }
}











const SEARCH_TEXTBOX = "searchbar";

/**
 * 
 *
 * @param {Object} document is the document related to the Window
 * 
 */
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
      var p = windowManager.getPanel(_document);
      if (p.isClosed()) {
        p.open(textbox, e);

        var engines = {};
        for each (let engine in Services.search.getVisibleEngines()) {
          //dump("name: " + engine.name + "\n");
          engines[engine.name] = { name : engine.name,
                                   icon : engine.iconURI.spec,
                                   description: engine.description,
                                   search : engine.searchForm
                                  };
        }
        p.setEngines(engines);

      } else {
        // down arrow
        if (e.keyCode == 40) {
          p.next();
          e.preventDefault();
          return;
        // up arrow
        } else if (e.keyCode == 38) {
          p.previous();
          e.preventDefault();
          return;
        // enter
        } else if (e.keyCode == 13) {
          e.preventDefault();
          e.stopPropagation();
          p.go();
          return;
        }
      }
      p.update(textbox.value);

      try {

        function refreshSuggestions()
        {
          for each (let engine in Services.search.getVisibleEngines()) {
            dump("name: " + engine.name + "\n");

            function runRequest(terms, name, suggestionUri) {
              var url = null, type = "suggest";
              if (suggestionUri) {
                url = suggestionUri.uri.spec;
              }

              // XXX HACKS!!
              if (name == "Wikipedia (en)") {
                url = "http://en.wikipedia.org/w/api.php?action=opensearch&search=" +  encodeURIComponent(terms);
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
                    var suggestions = JSON.parse(request.responseText)[1];
        
                    var results = [];
                    for (var i in suggestions) {
                      if (results.length >= 3) {
                        break;
                      }
                      if (terms !=  suggestions[i]) {
                        results.push({ "terms" : terms, "title" : suggestions[i] });
                      }
                    }
                    p.add( { "name" : name, "results" : results, "type" : type });
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

        var currentTimer;
        if (currentTimer) {
          timers.clearTimeout(currentTimer);
        }
        currentTimer = timers.setTimeout(refreshSuggestions, 1000);

      }catch(err) { dump("err: " + err + "\n"); }

      return;

    };


    textbox.onfocus = openpanel;
    textbox.onclick = openpanel;
    textbox.onkeyup = openpanel;
    //textbox.onblur = function() { window.setTimeout( function (e) { windowManager.getPanel(_document).panel().hidePopup(); }, 1000 * 1) }
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
