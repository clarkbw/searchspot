/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

/*jshint forin:true, noarg:true, noempty:true, eqeqeq:true, bitwise:true,
  strict:true, undef:true, curly:true, browser:true, es5:true,
  indent:2, maxerr:50, devel:true, node:true, boss:true, white:true,
  globalstrict:true, nomen:false, newcap:true*/

/*global setTimeout:true */

"use strict";

var data = require('sdk/self').data,
    WindowTracker = require('sdk/deprecated/window-utils').WindowTracker,
    getMostRecentBrowserWindow = require('sdk/window/utils').getMostRecentBrowserWindow,
    isBrowser = require('sdk/window/utils').isBrowser,
    tabs = require('sdk/tabs'),
    simpleprefs = require('sdk/simple-prefs'),
    setTimeout = require('sdk/timers').setTimeout,

    _engines = require("search-engines"),
    SearchEngines = _engines.SearchEngines,
    SearchSuggestManager = _engines.SearchSuggestManager,
    SearchEnginesAddonPage = require("search-engines-addon-page").SearchEnginesAddonPage,
    StatisticsReporter = require("statistics").StatisticsReporter,
    searchbar = require("searchbar");

var SearchSpotPanel = require("autocomplete-panel").Panel({
  contentURL: data.url("results.html"),
  onShow : function () {
    SearchSpotPanel.port.emit("engines.reset", SearchEngines.defaults.all);
    SearchSpotPanel.port.emit("terms.reset",
                              searchbar.getSearchTextBox().value);
  }
});

SearchSpotPanel.port.on("resize", function (sizes) {
  var textbox = 300;
  try {
    textbox = searchbar.getSearchTextBox().clientWidth;
  } catch (ignore) { }
  SearchSpotPanel.resize(Math.max(sizes.width, textbox),
                         Math.max(sizes.height, 50));
});

SearchSpotPanel.port.on("click", function (results) {
  var engine = SearchEngines.get(results.id),
      terms = results.terms,
      url = engine.getSubmission(terms) || "about:home";

  StatisticsReporter.send("use", engine, results.stats);

  // Set the search box with the actual terms used
  // i.e. (suggestions may be different than terms in input area)
  try {
    searchbar.getSearchTextBox().value = terms;
  } catch (ignore) { }

  // Here we track the adventure of the search tab!
  // If the term "foodie" is still in the search area when the tab is closed
  // we clear out the search area assuming they are done searching for "foodie"
  tabs.activeTab.once('close', function (tab) {
    // will trigger on shutdown but we'll start losing window
    // objects so just ignore errors
    try {
      if (searchbar.getSearchTextBox().value === terms) {
        searchbar.getSearchTextBox().value = "";
      }
    } catch (ignore) {}
  });

  // shift our focus to the browser window and away from the search entry
  getMostRecentBrowserWindow().gBrowser.selectedBrowser.focus();

  if (results.tab) {
    // open the link in a new background tab
    tabs.open({ url : url, inBackground : true });
  } else {
    // Set the URL to start the search
    tabs.activeTab.url = url;
  }

  // Finally hide the search panel as a new search has begun
  SearchSpotPanel.hide();
});

// This keeps the terms in our search box updated with whatever
// the user is hovering over or has selected in the results panel
SearchSpotPanel.port.on("terms", function (terms) {
  try {
    searchbar.getSearchTextBox().value = terms;
  } catch (ignore) { }
});

// Opens up the preferences page from the preferences button in the
// add-on preferences section
simpleprefs.on("preferences", function () {
  SearchEnginesAddonPage.open();
});

// Handles the preferences option (last option) in the results panel
SearchSpotPanel.port.on("preferences", function () {
  SearchEnginesAddonPage.open();
  try {
    searchbar.getSearchTextBox().value = "";
  } catch (ignore) { }
  SearchSpotPanel.hide();
});

SearchSuggestManager.on("suggestions", function (engine, terms, results) {
  if (searchbar.getSearchTextBox().value === terms) {
    SearchSpotPanel.port.emit("suggestions", engine, terms, results);
  }
});

SearchSuggestManager.on("change:terms", function (terms) {
  SearchSpotPanel.port.emit("terms.reset", terms);
});

function closepanel(e) {
  var searchbox = searchbar.getSearchTextBox();
  setTimeout(function (event) {
    if (SearchSpotPanel.isShowing && !searchbox.textbox.focused) {
      SearchSpotPanel.hide();
    }
  }, 500);
}

function openpanel(e) {
  var searchbox = searchbar.getSearchTextBox();

  if (searchbox.value === "") {
    return;
  }
  if (!SearchSpotPanel.isShowing) {
    SearchSpotPanel.show(searchbox);
  } else {
    // down arrow
    if (e.keyCode === 40) {
      SearchSpotPanel.port.emit("next");
      e.preventDefault();
      e.stopPropagation();
      return;
    // up arrow
    } else if (e.keyCode === 38) {
      SearchSpotPanel.port.emit("previous");
      e.preventDefault();
      e.stopPropagation();
      return;
    // enter
    } else if (e.keyCode === 13) {
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
function WindowManager() {
  return {
    onTrack: function ffWindowManager_onTrack(window) {
      if (isBrowser(window)) {
        searchbar.attachToSearch(window.document, openpanel, closepanel);
      }
    },
    onUntrack: function ffWindowManager_onUntrack(window) {
      if (isBrowser(window)) {
        searchbar.detachFromSearch(window.document);
      }
    }
  };
}

exports.main = function (options, callbacks) {
  require('sdk/system/unload').ensure(new WindowTracker(new WindowManager()));
  require('utils').addXULStylesheet(data.url("searchspot-style.css"));

  if (options) {
    // if this is a first time install we'll use the welcome message
    // Or if this is an upgrade from the older version we'll do the same for now
    // XXX remove this upgrade option on the next release
    if (options.loadReason && (options.loadReason === "install" || options.loadReason === "upgrade")) {
      tabs.open(data.url("index.html#welcome"));
    }

    // Debug notifications
    if (options.staticArgs && options.staticArgs.debug) {
      require('sdk/system/events').emit("search:debug", { subject : options.staticArgs.debug });
    }
  }
};
