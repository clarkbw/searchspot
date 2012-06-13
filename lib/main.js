/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */
"use strict";

const data = require("self").data,
      winUtils = require("window-utils"),
      tabs = require("tabs"),

      { SearchEngines } = require("search-engines"),
      { SearchEnginesPreferences } = require("search-engines-preferences"),
      { StatisticsReporter } = require("statistics"),

      SEARCH_TEXTBOX = "searchbar",
      SEARCH_TEXTBOX_OLD = SEARCH_TEXTBOX + "_old",
      STYLESHEET_ID = "searchspot-style";

function getSearchTextBox() {
  return winUtils.activeBrowserWindow.document.getElementById(SEARCH_TEXTBOX);
}

SearchEngines.on("suggestions", function(engine, terms, results) {
  if (getSearchTextBox().value == terms) {
    SearchSpotPanel.port.emit("suggestions", engine, terms, results);
  }
});

var SearchSpotPanel = require("autocomplete-panel").Panel({
  contentURL: data.url("results.html"),
  contentScriptFile : [data.url("js/jquery.js"),
                       data.url("results.js")],
  onShow : function() {
    SearchSpotPanel.port.emit("setEngines", SearchEngines.getEnginesByTag())
    SearchSpotPanel.port.emit("setTerms", getSearchTextBox().value);
  }
});

SearchSpotPanel.port.on("resize", function(sizes) {
  var textbox = 300;
  try {
    textbox = getSearchTextBox().clientWidth;
  } catch (ignore) { }
  SearchSpotPanel.resize(Math.max(sizes.width, textbox, 300), Math.max(sizes.height,50));
});

SearchSpotPanel.port.on("click", function(data) {
  var url = "about:home",
      terms = getSearchTextBox().value;

  StatisticsReporter.send("use", SearchEngines.get(data.engine));

  if (data.url) {
    url = data.url;

  } else {
    url = SearchEngines.getSubmission(data.engine, data.terms),
    terms = data.terms;

    // Set the search box with the actual terms used
    // i.e. (suggestions may be different than terms in input area)
    try {
      getSearchTextBox().value = data.terms;
    } catch(ignore) { }
  }

  // Here we track the adventure of the search tab!
  // If the term "foodie" is still in the search area when the tab is closed
  // we clear out the search area assuming they are done searching for "foodie"
  tabs.activeTab.once('close', function(tab) {
    // will trigger on shutdown but we'll start losing window objects so just ignore errors
    try {
      if (getSearchTextBox().value == terms) {
        getSearchTextBox().value = "";
      }
    } catch (ignore) {}
  });

  // Set the URL to start the search
  tabs.activeTab.url = url;

  // Finally hide the search panel as a new search has begun
  SearchSpotPanel.hide();
});


SearchSpotPanel.port.on("preferences", function(data) {
  SearchEnginesPreferences.open();
  try {
    getSearchTextBox().value = "";
  } catch(ignore) { }
  SearchSpotPanel.hide();
});

var PermissionPanel = require("permission-panel").Panel({
  contentURL: data.url("permission.html"),
  contentScriptFile : [data.url("js/jquery.js"),
                       data.url("permission.js")]
});

PermissionPanel.port.on("click", function(data) {
  if (data == "ok") {
    SearchEngines.geolocation = true;
    getSearchTextBox().focus();
  } else {
    console.log("permission denied, please uninstall");
  }
  PermissionPanel.hide();
});

PermissionPanel.port.on("resize", function(sizes) {
  var textbox = 300;
  try {
    textbox = getSearchTextBox().clientWidth;
  } catch (ignore) { }
  PermissionPanel.resize(Math.max(sizes.width, textbox, 300), Math.max(sizes.height,50));
});

/**
 * Window watcher object (will attach to all windows, even pref windows)
 * Attaches buttons to new windows and removes them when they disappear
 */
function ffWindowManager() {
  function track(window) {
    if (winUtils.isBrowser(window)) {
      addStylesheet(window.document);
      attachToSearch(window.document);
    }
  }
  // On first run attach to all the existing windows
  for (var window in winUtils.windowIterator()) {
    track(window);
  }
  return {
    onTrack: function ffWindowManager_onTrack(window) {
      track(window);
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
  var windowTracker = new winUtils.WindowTracker(new ffWindowManager());
  require("unload").ensure(windowTracker);
};

/// SEARCH INPUT

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
    textbox.setAttribute("id", SEARCH_TEXTBOX_OLD);

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
        if (SearchEngines.geolocation) {
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

      SearchEngines.search(searchbox.value);

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
  var textbox = document.getElementById(SEARCH_TEXTBOX_OLD);
  if (textbox && searchbox) {
    // Remove our search box from the browser
    var parent = searchbox.parentNode;
    parent.removeChild(searchbox);
    // Reset the old search entry to it's former glory
    textbox.removeAttribute("hidden");
    textbox.setAttribute("id", SEARCH_TEXTBOX);
  } else {
    console.error("detachFromSearch: couldn't find ", SEARCH_TEXTBOX, " or ", SEARCH_TEXTBOX_OLD)
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
