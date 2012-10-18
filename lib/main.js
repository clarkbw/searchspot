/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

/*jshint forin:true, noarg:true, noempty:true, eqeqeq:true, bitwise:true,
  strict:true, undef:true, curly:true, browser:true, es5:true,
  indent:2, maxerr:50, devel:true, node:true, boss:true, white:true,
  globalstrict:true, nomen:false, newcap:true*/

/*global self:true, addon:true */

"use strict";

var data = require("self").data,
    winUtils = require("window-utils"),
    isBrowser = require("window/utils").isBrowser,
    tabs = require("tabs"),
    simpleprefs = require("simple-prefs"),
    timers = require("timers"),

    _engines = require("search-engines"),
    SearchEngines = _engines.SearchEngines,
    SearchSuggestManager = _engines.SearchSuggestManager,
    SearchEnginesAddonPage = require("search-engines-addon-page").SearchEnginesAddonPage,
    StatisticsReporter = require("statistics").StatisticsReporter,
    searchbar = require("searchbar"),

    STYLESHEET_ID = "searchspot-style";

if (require("sdk/system/xul-app").is("Firefox")) {

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

  SearchSpotPanel.port.on("click", function (data) {
    var engine = SearchEngines.get(data.id),
        terms = data.terms,
        url = engine.getSubmission(terms) || "about:home";

    StatisticsReporter.send("use", engine, data.stats);

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
    winUtils.activeBrowserWindow.gBrowser.selectedBrowser.focus();

    if (data.tab) {
      // open the link in a new background tab
      tabs.open({ url : url, inBackground : true });
    } else {
      // Set the URL to start the search
      tabs.activeTab.url = url;
    }

    // Finally hide the search panel as a new search has begun
    SearchSpotPanel.hide();
  });

  SearchSpotPanel.port.on("terms", function (terms) {
    try {
      searchbar.getSearchTextBox().value = terms;
    } catch (ignore) { }
  });

  simpleprefs.on("preferences", function () {
    SearchEnginesAddonPage.open();
  });

  SearchSpotPanel.port.on("preferences", function (data) {
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

  var PermissionPanel = require("permission-panel").Panel({
    contentURL: data.url("permission.html"),
    contentScriptFile : [data.url("js/jquery.min.js"),
                         data.url("permission.js")]
  });

  PermissionPanel.port.on("click", function (data) {
    if (data === "ok") {
      StatisticsReporter.allowed = true;
    } else {
      console.log("permission denied, please uninstall");
    }
    PermissionPanel.hide();
  });

  PermissionPanel.port.on("resize", function (sizes) {
    var textbox = 300;
    try {
      textbox = searchbar.getSearchTextBox().clientWidth;
    } catch (ignore) { }
    PermissionPanel.resize(Math.max(sizes.width, textbox),
                           Math.max(sizes.height, 50));
  });

  SearchSuggestManager.on("change:terms", function (terms) {
    SearchSpotPanel.port.emit("terms.reset", terms);
  });

  var closepanel = function closepanel(e) {
    var searchbox = searchbar.getSearchTextBox();
    timers.setTimeout(function (event) {
      if (SearchSpotPanel.isShowing && !searchbox.textbox.focused) {
        SearchSpotPanel.hide();
      }
    }, 500);
  };

  var openpanel = function openpanel(e) {
    var searchbox = searchbar.getSearchTextBox();

    if (searchbox.value === "") {
      return;
    }
    if (!SearchSpotPanel.isShowing) {
      if (StatisticsReporter.allowed) {
        SearchSpotPanel.show(searchbox);
      } else {
        PermissionPanel.show(searchbox);
      }
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
  };
} else {
  var openpanel = "http://clarkbw.github.com/searchspot/2/fennec.html";
}

/// STYLE SHEETS

function _findStylesheet(document) {
  var uri = data.url(STYLESHEET_ID + ".css"),
      css = "href=\"" + uri + "\" type=\"text/css\"",
      ORDERED_NODE_SNAPSHOT_TYPE = 7, // XPathResult doesn't exist in context
      xpath = null;

  xpath = document.evaluate("//processing-instruction(\"xml-stylesheet\")",
                            document,
                            document.createNSResolver(document),
                            ORDERED_NODE_SNAPSHOT_TYPE,
                            null);

  for (var i = 0; xpath && i < xpath.snapshotLength; i += 1) {
    if (xpath.snapshotItem(i).data === css) {
      return { item : xpath.snapshotItem(i), css : css };
    }
  }
  return { item : null, css : css };
}

function addStylesheet(document) {
  var find = _findStylesheet(document),
      item = find.item,
      css = find.css;
  if (item === null) {
    document.insertBefore(document.createProcessingInstruction("xml-stylesheet",
                                                               css),
                          document.firstChild);
  }
}

function removeStylesheet(document) {
  var item = _findStylesheet(document).item,
      parent = null;
  if (item !== null) {
    parent = item.parentNode;
    if (parent !== null) {
      parent.removeChild(item);
    }
  }
}

/**
 * Window watcher object (will attach to all windows, even pref windows)
 * Attaches buttons to new windows and removes them when they disappear
 */
function WindowManager() {
  return {
    onTrack: function ffWindowManager_onTrack(window) {
      if (isBrowser(window)) {
        addStylesheet(window.document);
        searchbar.attachToSearch(window.document, openpanel, closepanel);
      }
    },
    onUntrack: function ffWindowManager_onUntrack(window) {
      if (isBrowser(window)) {
        removeStylesheet(window.document);
        searchbar.detachFromSearch(window.document);
      }
    }
  };
}

exports.main = function (options, callbacks) {
  var windowTracker = new winUtils.WindowTracker(new WindowManager());
  require("unload").ensure(windowTracker);
  if (options && options.staticArgs && options.staticArgs.debug) {
    require("observer-service").notify("search:debug",
                                       options.staticArgs.debug);
  }
};
