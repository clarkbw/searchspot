/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */
"use strict";

const data = require("self").data,
      winUtils = require("window-utils"),
      isBrowser = require("window/utils").isBrowser,
      tabs = require("tabs"),

      { SearchEngines, SearchSuggestManager } = require("search-engines"),
      { SearchEnginesPreferences } = require("search-engines-preferences"),
      { StatisticsReporter } = require("statistics"),
      { attachToSearch, detachFromSearch, getSearchTextBox } = require("searchbar"),

      STYLESHEET_ID = "searchspot-style";

SearchSuggestManager.on("suggestions", function(engine, terms, results) {
  if (getSearchTextBox().value == terms) {
    SearchSpotPanel.port.emit("suggestions", engine, terms, results);
  }
});

var SearchSpotPanel = require("autocomplete-panel").Panel({
  contentURL: data.url("results.html"),
  contentScriptFile : [data.url("js/jquery.js"),
                       data.url("results.js")],
  onShow : function() {
    SearchSpotPanel.port.emit("setEngines", SearchEngines.defaults.all)
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
  var engine = SearchEngines.get(data.id),
      terms = data.terms,
      url = engine.getSubmission(terms) || "about:home";

  StatisticsReporter.send("use", engine, data.stats);

  // Set the search box with the actual terms used
  // i.e. (suggestions may be different than terms in input area)
  try {
    getSearchTextBox().value = terms;
  } catch(ignore) { }

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
    StatisticsReporter.allowed = true;
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

function openpanel(e) {
  var searchbox = getSearchTextBox();

  if (searchbox.value == "") {
    return;
  }
  if (!SearchSpotPanel.isShowing) {
    if (StatisticsReporter.allowed) {
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

  SearchSuggestManager.search(searchbox.value);
}

/**
 * Window watcher object (will attach to all windows, even pref windows)
 * Attaches buttons to new windows and removes them when they disappear
 */
function ffWindowManager() {
  function track(window) {
    if (isBrowser(window)) {
      addStylesheet(window.document);
      attachToSearch(window.document, openpanel);
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
      if (isBrowser(window)) {
        removeStylesheet(window.document);
        detachFromSearch(window.document);
      }
    }
  }
}

exports.main = function (options, callbacks) {
  var windowTracker = new winUtils.WindowTracker(new ffWindowManager());
  require("unload").ensure(windowTracker);
  if (options.staticArgs.debug) {
    require("observer-service").notify("search:debug", options.staticArgs.debug);
  }
};

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
