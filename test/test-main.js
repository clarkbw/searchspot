/* This Source Code Form is subject to the terms of the Mozilla Public
* License, v. 2.0. If a copy of the MPL was not distributed with this
* file, You can obtain one at http://mozilla.org/MPL/2.0/. */

 /*jshint esnext:true, node:true, newcap:false */

"use strict";

/*global setTimeout:true */

var { Loader } = require('sdk/test/loader');

var { getMostRecentBrowserWindow } = require('sdk/window/utils'),
    { isBrowser } = require('sdk/window/utils'),
    tabs = require('sdk/tabs'),
    searchbar = require('searchbar'),
    { setTimeout } = require('sdk/timers');


exports['test zzz last test uninstall'] = function (assert) {
  var loader = new Loader(module),
      main = loader.require("main"),
      getById = function (id) {
        return getMostRecentBrowserWindow().document.getElementById(id);
      };

  assert.notEqual(getById(searchbar.SEARCH_TEXTBOX), null,
                  "We should have a searchbar by default");

  main.main();

  assert.notEqual(getById(searchbar.SEARCH_TEXTBOX), null,
                  "We should have a searchbar after running main()");
  assert.equal(getById(searchbar.SEARCH_TEXTBOX).getAttribute("disableautocomplete"),
              "true", "The old searchbar should be hidden after running main()");

  loader.unload();

  assert.equal(getById(searchbar.SEARCH_TEXTBOX).getAttribute("disableautocomplete"),
               "", "autocomplete should be returned to normal");

  assert.notEqual(getById(searchbar.SEARCH_TEXTBOX), null,
                  "Original searchbar should still be around after uninstall");
};

exports['test clear search on tab close'] = function (assert, done) {
  var loader = new Loader(module),
      main = loader.require("main"),
      terms = 'harry';

  main.main();

  // open a new tab an run a search in it
  tabs.open({
    url : "about:blank",
    inBackground : false,
    onOpen: function onOpen(tab) {
      // set a new search
      searchbar.getSearchTextBox().value = terms;
    },
    onReady : function onReady(tab) {
      searchbar.getSearchTextBox().focus();
      main.SearchSpotPanel.show(searchbar.getSearchTextBox());

      // ready for the next ready
      tab.once("ready", function onNextReady(tab) {
        assert.equal(searchbar.getSearchTextBox().value, terms,
                    "Selected suggestion should be equal to the text entry");
        tab.close();
      });

      // give the panel a moment to open and initialize
      setTimeout(function () {
        main.SearchSpotPanel.port.emit("go");
      }, 2 * 1000);
    },
    onClose : function onClose(tab) {
      // escape from our other onClose function
      setTimeout(function () {
        assert.equal(searchbar.getSearchTextBox().value, "",
                         "Search entry should have cleared value");
        loader.unload();
        done();
      }, 100);
    }
  });
};

require('test').run(exports);
