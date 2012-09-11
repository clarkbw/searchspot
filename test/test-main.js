/* This Source Code Form is subject to the terms of the Mozilla Public
* License, v. 2.0. If a copy of the MPL was not distributed with this
* file, You can obtain one at http://mozilla.org/MPL/2.0/. */
"use strict";

var Loader = require("test-harness/loader").Loader;

var isBrowser = require("window/utils").isBrowser;
var winUtils = require("window-utils");
var tabs = require("tabs");
var searchbar = require("searchbar");
var timer = require("api-utils/timer");

exports.test_id = function (test) {
  test.assert(require("self").id.length > 0);
};

exports["zzz last test uninstall"] = function (test) {
  var loader = new Loader(module),
      main = loader.require("main"),
      getById = function (id) {
        return winUtils.activeBrowserWindow.document.getElementById(id);
      };

  test.assertNotNull(getById(searchbar.SEARCH_TEXTBOX),
                     "We should have a searchbar by default");
  //test.assertNull(getById(searchbar.SEARCH_TEXTBOX_OLD),
  //                "The old searchbar should not exist until we run main()");

  main.main();

  test.assertNotNull(getById(searchbar.SEARCH_TEXTBOX),
                     "We should have a searchbar after running main()");
  test.assertNotNull(getById(searchbar.SEARCH_TEXTBOX_OLD),
                     "The old searchbar should exist after running main()");
  test.assertEqual(getById(searchbar.SEARCH_TEXTBOX_OLD).getAttribute("hidden"),
                   "true",
                   "The old searchbar should be hidden after running main()");

  loader.unload("uninstall");

  test.assertNull(getById(searchbar.SEARCH_TEXTBOX_OLD),
                  "Old searchbar should be gone after uninstall");
  test.assertEqual(getById(searchbar.SEARCH_TEXTBOX).getAttribute("hidden"),
                   "",
                   "Original searchbar should be visible after uninstall");
  test.assertNotNull(getById(searchbar.SEARCH_TEXTBOX),
                     "Original searchbar should be back after uninstall");

  loader.unload();
};

exports["clear search on tab close"] = function (test) {
  var loader = new Loader(module),
      main = loader.require("main"),
      StatisticsReporter = loader.require("statistics").StatisticsReporter,
      document = winUtils.activeBrowserWindow.document,
      event1 = document.createEvent("KeyboardEvent"),
      event2 = document.createEvent("KeyboardEvent"),
      searchtab = null;

  StatisticsReporter.allowed = true;
  main.main();

  tabs.on("ready", function (tab) {
    // ignore the tab we opened and any other tabs being opened by other tests
    if (tab.url !== "about:home" && tab.url.indexOf("resource://") !== 0) {
      test.assertEqual(searchbar.getSearchTextBox().value, "harry",
                       "Selected suggestion should be equal to the text entry");
      tab.close();
    }
  });

  // open a new tab an run a search in it
  tabs.open({
    url : "about:home",
    inBackground : false,
    onOpen: function onOpen(tab) {
      searchtab = tab;
      // set a new search
      searchbar.getSearchTextBox().value = "harry";
      searchbar.getSearchTextBox().focus();
      // send a key event to trigger the fact that we are searching "y"
      event1.initKeyEvent("keyup",        //  in DOMString typeArg,
                         true,             //  in boolean canBubbleArg,
                         true,             //  in boolean cancelableArg,
                         null,             //  in nsIDOMAbstractView viewArg
                         false,            //  in boolean ctrlKeyArg,
                         false,            //  in boolean altKeyArg,
                         false,            //  in boolean shiftKeyArg,
                         false,            //  in boolean metaKeyArg,
                         89,               //  in unsigned long keyCodeArg,
                         0);              //  in unsigned long charCodeArg
      searchbar.getSearchTextBox().dispatchEvent(event1);

      // give the panel a moment to open and initialize
      timer.setTimeout(function () {
        // send a key event to trigger a search via the "enter key"
        event2.initKeyEvent("keyup",        //  in DOMString typeArg,
                           true,             //  in boolean canBubbleArg,
                           true,             //  in boolean cancelableArg,
                           null,             //  in nsIDOMAbstractView viewArg
                           false,            //  in boolean ctrlKeyArg,
                           false,            //  in boolean altKeyArg,
                           false,            //  in boolean shiftKeyArg,
                           false,            //  in boolean metaKeyArg,
                           13,               //  in unsigned long keyCodeArg,
                           0);              //  in unsigned long charCodeArg
        searchbar.getSearchTextBox().dispatchEvent(event2);
      }, 1 * 3000);
    },
    onClose : function onClose(tab) {
      // escape from our other onClose function
      timer.setTimeout(function () {
        test.assertEqual(searchbar.getSearchTextBox().value, "",
                         "Search entry should have cleared value");
        test.done();
        loader.unload();
      }, 100);
    }
  });
  test.waitUntilDone();
};
