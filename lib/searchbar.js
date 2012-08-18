/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */
"use strict";

const winUtils = require("window-utils"),

      SEARCH_TEXTBOX = "searchbar",
      SEARCH_TEXTBOX_OLD = SEARCH_TEXTBOX + "_old";

exports.SEARCH_TEXTBOX = SEARCH_TEXTBOX;
exports.SEARCH_TEXTBOX_OLD = SEARCH_TEXTBOX_OLD;

function getSearchTextBox() {
  return winUtils.activeBrowserWindow.document.getElementById(SEARCH_TEXTBOX);
}

/// SEARCH INPUT

function attachToSearch(document, openpanel) {
  var textbox = document.getElementById(SEARCH_TEXTBOX);
  if (textbox && document.getElementById(SEARCH_TEXTBOX_OLD) == null) {
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

    searchbox.onfocus = openpanel;
    searchbox.onclick = openpanel;
    searchbox.onkeyup = openpanel;

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

exports.attachToSearch = attachToSearch;
exports.detachFromSearch = detachFromSearch;
exports.getSearchTextBox = getSearchTextBox;
