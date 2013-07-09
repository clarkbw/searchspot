/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

 /*jshint esnext:true, node:true, newcap:false */

"use strict";

var activeBrowserWindow = require('sdk/window/utils').getMostRecentBrowserWindow,
    allWindows = require('sdk/window/utils').windows,
    isBrowser = require('sdk/window/utils').isBrowser,
    SearchEngines = require('search-engines').SearchEngines,

    SEARCH_TEXTBOX = "searchbar";

exports.SEARCH_TEXTBOX = SEARCH_TEXTBOX;

function getSearchTextBox() {
  return activeBrowserWindow().document.getElementById(SEARCH_TEXTBOX);
}

/// SEARCH INPUT

/// OLD STUFF should only require a single instance to work instead
/// of per window saving

// old labels and such
var oldLabel, oldTooltipText;

// old functions
var oldHandleSearchCommand, oldOnKeyup, oldOnBlur;

function attachToSearch(document, openpanel, closepanel) {
  var textbox = document.getElementById(SEARCH_TEXTBOX);
  if (textbox) {
    // Disable the normal autocomplete features
    textbox.setAttribute("disableautocomplete", "true");

    oldHandleSearchCommand = textbox.handleSearchCommand;
    textbox.handleSearchCommand = openpanel;

    textbox.onkeyup = openpanel;
    textbox.onblur = closepanel;

    document.getAnonymousElementByAttribute(textbox, "class",
                                            "searchbar-engine-button").setAttribute("disabled", "true");

    // grab the old values for our new window in case we're removed later
    oldLabel = textbox.textbox.getAttribute("label");
    oldTooltipText = textbox.textbox.getAttribute("tooltiptext");

    setEnginePlaceholder(textbox, SearchEngines.defaults.all[0]);
  } else {
    console.debug("attachToSearch: couldn't find ", SEARCH_TEXTBOX);
  }
}

function detachFromSearch(document) {
  var textbox = document.getElementById(SEARCH_TEXTBOX);
  if (textbox) {
    // Reset the old search entry to it's former glory
    textbox.removeAttribute("disableautocomplete");

    textbox.handleSearchCommand = oldHandleSearchCommand;
    textbox.onkeyup = null;
    delete textbox.onkeyup;
    textbox.onblur = null;
    delete textbox.onblur;

    textbox.setAttribute("src", textbox.currentEngine.iconURI.spec);
    textbox.textbox.setAttribute("placeholder", textbox.currentEngine.name);
    textbox.textbox.setAttribute("label", oldLabel);
    textbox.textbox.setAttribute("tooltiptext", oldTooltipText);

    document.getAnonymousElementByAttribute(textbox, "class",
                                            "searchbar-engine-button").removeAttribute("disabled");

  } else {
    console.debug("detachFromSearch: couldn't find ", SEARCH_TEXTBOX);
  }
}

// Looks at every window when defaults are changed
function setAllEnginePlaceholders() {
  var defaultEngine = SearchEngines.defaults.all[0];
  allWindows().forEach(function (window) {
    if (isBrowser(window)) {
      setEnginePlaceholder(window.document.getElementById(SEARCH_TEXTBOX), defaultEngine);
    }
  });
}

// sets a single search box with the correct parameters
function setEnginePlaceholder(searchbox, defaultEngine) {
  searchbox.setAttribute("src", defaultEngine.icon);
  searchbox.textbox.setAttribute("label", defaultEngine.name);
  searchbox.textbox.setAttribute("tooltiptext", defaultEngine.name);
  searchbox.textbox.setAttribute("placeholder", defaultEngine.name);
}

SearchEngines.on("initialized", setEnginePlaceholder);
SearchEngines.on("defaults.added", setEnginePlaceholder);
SearchEngines.on("defaults.sorted", setEnginePlaceholder);
SearchEngines.on("defaults.removed", setEnginePlaceholder);

exports.attachToSearch = attachToSearch;
exports.detachFromSearch = detachFromSearch;
exports.getSearchTextBox = getSearchTextBox;
