/* This Source Code Form is subject to the terms of the Mozilla Public
* License, v. 2.0. If a copy of the MPL was not distributed with this
* file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/*jshint forin:true, noarg:true, noempty:true, eqeqeq:true, bitwise:true,
  strict:true, undef:true, curly:true, browser:true, es5:true,
  indent:2, maxerr:50, devel:true, node:true, boss:true, white:true,
  globalstrict:true, nomen:false, newcap:true*/

/*global */

"use strict";

var _se = require("search-engines"),
    SearchSuggestManager = _se.SearchSuggestManager,
    SearchEngines = _se.SearchEngines,
    SearchEngine = _se.SearchEngine;

var timers = require('sdk/timers');

var suggestEngine = new SearchEngine(
                      "http://www.example.com/opensearch",
                      "Example Search",
                      "http://www.example.com/search?q={searchTerms}",
                      "http://www.example.com/search_suggest?q={searchTerms}",
                      "http://www.example.com/favicon.ico");

var nonSuggestEngine = new SearchEngine(
                      "http://www.example.com/opensearch",
                      "Example Search",
                      "http://www.example.com/search?q={searchTerms}",
                      null,
                      "http://www.example.com/favicon.ico");

exports["changing terms triggers event"] = function (test) {
  var terms = "hastings";
  var fail = function fail(sameTerms) {
    test.fail("this event should only fire the terms change");
  };

  SearchSuggestManager.once("change:terms", function (newTerms) {
    test.assertEqual(terms, newTerms, "changing terms triggers a change event");
    SearchSuggestManager.on("change:terms", fail);
    SearchSuggestManager.terms = terms;
  });

  SearchSuggestManager.terms = terms;

  timers.setTimeout(function () {
    SearchSuggestManager.removeListener("change:terms", fail);
    SearchSuggestManager.terms = "";
    test.pass("setting the same terms didn't cause an event");
    test.done();
  }, 1000);

  test.waitUntilDone(2 * 1000);
};

exports["changing engines triggers event"] = function (test) {
  var fail = function fail(engine) {
    test.fail("a non suggestion engine triggered a change");
  };

  SearchSuggestManager.once("change:engines", function (newEngine) {
    test.pass("changing default engines triggers a change event");
    SearchSuggestManager.on("change:engines", fail);
    SearchEngines.defaults.add(nonSuggestEngine);
  });

  SearchEngines.defaults.add(suggestEngine);

  timers.setTimeout(function () {
    SearchSuggestManager.removeListener("change:engines", fail);
    SearchEngines.remove(suggestEngine);
    SearchEngines.remove(nonSuggestEngine);
    test.pass("setting the same terms didn't cause an event");
    test.done();
  }, 1000);

  test.waitUntilDone(2 * 1000);
};


//exports.test2AddAndRemoveDefaults = function (test) {
//  // Start with the original 3 
//  test.assertEqual(SearchEngines.defaults.all.length, 3);
//
//  SearchEngines.on("defaults.added", function onDefaultAdded(engine) {
//    SearchEngines.removeListener("defaults.added", onDefaultAdded);
//    test.assertEqual(SearchEngines.defaults.all.length, 4);
//    SearchEngines.defaults.remove(engine);
//  });
//
//  SearchEngines.on("defaults.removed", function onDefaultRemoved(engine) {
//    SearchEngines.removeListener("defaults.removed", onDefaultRemoved);
//    test.assertEqual(SearchEngines.defaults.all.length, 3);
//    test.assertEqual(ExampleSearchEngine, engine);
//    test.done();
//  });
//
//  SearchEngines.defaults.add(ExampleSearchEngine);
//
//  test.waitUntilDone(5 * 1000);
//}
//
//// Test that removing an item from the defaults places it in the others list
//exports.test3RemovingDefaultAddsOthers = function (test) {
//  // lets ensure that we don't have the example search engine installed
//  SearchEngines.remove(ExampleSearchEngine);
//
//  // Start with the original 3
//  test.assertEqual(SearchEngines.defaults.all.length, 3);
//
//  var others = SearchEngines.others.all.length;
//
//  SearchEngines.once("others.added", function onDefaultAdded(engine) {
//    test.assertEqual(SearchEngines.defaults.all.length, 3);
//    test.assertEqual(SearchEngines.others.all.length, others + 1);
//    test.assertEqual(ExampleSearchEngine, engine);
//    test.done();
//  });
//
//  SearchEngines.defaults.add(ExampleSearchEngine).then(function (engine) {
//    SearchEngines.defaults.remove(engine);
//  });
//
//  test.waitUntilDone(5 * 1000);
//}
//
//// Test that we can add and remove others
//exports.test4AddAndRemoveOthers = function (test) {
//  // lets ensure that we don't have the example search engine installed
//  SearchEngines.remove(ExampleSearchEngine);
//
//  var others = SearchEngines.others.all.length;
//
//  SearchEngines.once("others.added", function (engine) {
//    test.assertEqual(SearchEngines.others.all.length, others + 1);
//    test.assertEqual(ExampleSearchEngine, engine);
//    SearchEngines.others.remove(engine);
//  });
//
//  SearchEngines.once("others.removed", function (engine) {
//    test.assertEqual(SearchEngines.others.all.length, others);
//    test.assertEqual(ExampleSearchEngine, engine);
//    test.done();
//  });
//
//  SearchEngines.others.add(ExampleSearchEngine);
//
//  test.waitUntilDone(5 * 1000);
//}
