/* This Source Code Form is subject to the terms of the Mozilla Public
* License, v. 2.0. If a copy of the MPL was not distributed with this
* file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

/*global setTimeout:true */

var Loader = require("sdk/test/loader").Loader;

var getMostRecentBrowserWindow = require('sdk/window/utils').getMostRecentBrowserWindow,
    isBrowser = require('sdk/window/utils').isBrowser,
    tabs = require('sdk/tabs'),
    searchbar = require('searchbar'),
    setTimeout = require('sdk/timers').setTimeout;

exports.test_id = function (test) {
  test.assert(require('sdk/self').id.length > 0);
};

exports["zzz last test uninstall"] = function (test) {
  var loader = new Loader(module),
      main = loader.require("main"),
      getById = function (id) {
        return getMostRecentBrowserWindow().document.getElementById(id);
      };

  test.assertNotNull(getById(searchbar.SEARCH_TEXTBOX),
                     "We should have a searchbar by default");
  //test.assertNull(getById(searchbar.SEARCH_TEXTBOX_OLD),
  //                "The old searchbar should not exist until we run main()");

  main.main();

  test.assertNotNull(getById(searchbar.SEARCH_TEXTBOX),
                     "We should have a searchbar after running main()");
  test.assertEqual(getById(searchbar.SEARCH_TEXTBOX).getAttribute("disableautocomplete"),
                   "true",
                   "The old searchbar should be hidden after running main()");

  loader.unload("uninstall");

  test.assertEqual(getById(searchbar.SEARCH_TEXTBOX).getAttribute("disableautocomplete"),
                   "",
                   "autocomplete should be returned to normal");
  test.assertNotNull(getById(searchbar.SEARCH_TEXTBOX),
                     "Original searchbar should still be around after uninstall");

  loader.unload();
};

exports["clear search on tab close"] = function (test) {
  var loader = new Loader(module),
      main = loader.require("main"),
      document = getMostRecentBrowserWindow().document,
      event = document.createEvent("KeyEvents");

  main.main();

  tabs.on("ready", function (tab) {
    // ignore the tab we opened and any other tabs being opened by other tests
    if (tab.url !== "about:blank" && tab.url.indexOf("resource://") !== 0) {
      test.assertEqual(searchbar.getSearchTextBox().value, "harry",
                       "Selected suggestion should be equal to the text entry");
      tab.close();
    }
  });

  // open a new tab an run a search in it
  tabs.open({
    url : "about:blank",
    inBackground : false,
    onOpen: function onOpen(tab) {
      // set a new search
      searchbar.getSearchTextBox().value = "harry";
    },
    onReady : function onReady(tabs) {
      searchbar.getSearchTextBox().focus();

      // give the panel a moment to open and initialize
      setTimeout(function () {
        // send a key event to trigger a search via the "enter key"
        event.initKeyEvent("keyup",        //  in DOMString typeArg,
                           true,             //  in boolean canBubbleArg,
                           true,             //  in boolean cancelableArg,
                           getMostRecentBrowserWindow().document.defaultView,             //  in nsIDOMAbstractView viewArg
                           false,            //  in boolean ctrlKeyArg,
                           false,            //  in boolean altKeyArg,
                           false,            //  in boolean shiftKeyArg,
                           false,            //  in boolean metaKeyArg,
                           0x0D,               //  in unsigned long keyCodeArg,
                           0);              //  in unsigned long charCodeArg
        searchbar.getSearchTextBox().focus();
        searchbar.getSearchTextBox().dispatchEvent(event);
      }, 2 * 1000);
    },
    onClose : function onClose(tab) {
      // escape from our other onClose function
      setTimeout(function () {
        test.assertEqual(searchbar.getSearchTextBox().value, "",
                         "Search entry should have cleared value");
        test.done();
        loader.unload();
      }, 100);
    }
  });
  test.waitUntilDone(10 * 1000);
};
