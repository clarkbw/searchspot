/* This Source Code Form is subject to the terms of the Mozilla Public
* License, v. 2.0. If a copy of the MPL was not distributed with this
* file, You can obtain one at http://mozilla.org/MPL/2.0/. */
"use strict";

const { SearchEngines, SearchEngine } = require("search-engines");

const ExampleSearchEngine = SearchEngine("http://www.example.com/opensearch",
                                         "Example Search",
                                         "http://www.example.com/search?q={searchTerms}",
                                         "http://www.example.com/search_suggest?q={searchTerms}",
                                         "http://www.example.com/favicon.ico");

exports.test1FirstRun = function(test) {
  test.assertEqual(SearchEngines.defaults.all.length, 3);
}

exports.test11DefaultSortOrder = function(test) {
  test.assertEqual(SearchEngines.defaults.all[0].id, "https://www.google.com/");
  test.assertEqual(SearchEngines.defaults.all[1].id, "http://d2lo25i6d3q8zm.cloudfront.net/browser-plugins/AmazonSearchSuggestionsOSD.Firefox.xml");
  // For now Yelp shouldn't be in the list
  //test.assertEqual(SearchEngines.defaults.all[2].id, "http://www.yelp.com/opensearch");
  test.assertEqual(SearchEngines.defaults.all[2].id, "http://en.wikipedia.org/w/opensearch_desc.php");
}

exports.testLindedIn = function(test) {
  var linkedIn = SearchEngine("http://www.linkedin.com/search/fpsearch",
                              "LinkedIn",
                              "http://www.linkedin.com/search/fpsearch?keywords={searchTerms}",
                              "http://www.linkedin.com/ta/federator?query={searchTerms}&types=mynetwork,company,group,sitefeature,skill",
                              "http://static01.linkedin.com/scds/common/u/img/favicon_v3.ico");
  test.assertNotStrictEqual(SearchEngines.others.get(linkedIn.id), linkedIn);
}

exports.test2AddAndRemoveDefaults = function(test) {
  // Start with the original 3 
  test.assertEqual(SearchEngines.defaults.all.length, 3);

  SearchEngines.on("defaults.added", function onDefaultAdded(engine) {
    SearchEngines.removeListener("defaults.added", onDefaultAdded);
    test.assertEqual(SearchEngines.defaults.all.length, 4);
    SearchEngines.defaults.remove(engine);
  });

  SearchEngines.on("defaults.removed", function onDefaultRemoved(engine) {
    SearchEngines.removeListener("defaults.removed", onDefaultRemoved);
    test.assertEqual(SearchEngines.defaults.all.length, 3);
    test.assertEqual(ExampleSearchEngine, engine);
    test.done();
  });

  SearchEngines.defaults.add(ExampleSearchEngine);

  test.waitUntilDone(5 * 1000);
}

// Test that removing an item from the defaults places it in the others list
exports.test3RemovingDefaultAddsOthers = function(test) {
  // lets ensure that we don't have the example search engine installed
  SearchEngines.remove(ExampleSearchEngine);

  // Start with the original 3
  test.assertEqual(SearchEngines.defaults.all.length, 3);

  var others = SearchEngines.others.all.length;

  SearchEngines.once("others.added", function onDefaultAdded(engine) {
    test.assertEqual(SearchEngines.defaults.all.length, 3);
    test.assertEqual(SearchEngines.others.all.length, others + 1);
    test.assertEqual(ExampleSearchEngine, engine);
    test.done();
  });

  SearchEngines.defaults.add(ExampleSearchEngine);
  SearchEngines.defaults.remove(ExampleSearchEngine);

  test.waitUntilDone(5 * 1000);
}

// Test that we can add and remove others
exports.test4AddAndRemoveOthers = function(test) {
  // lets ensure that we don't have the example search engine installed
  SearchEngines.remove(ExampleSearchEngine);

  var others = SearchEngines.others.all.length;

  SearchEngines.once("others.added", function(engine) {
    test.assertEqual(SearchEngines.others.all.length, others + 1);
    test.assertEqual(ExampleSearchEngine, engine);
    SearchEngines.others.remove(engine);
  });

  SearchEngines.once("others.removed", function(engine) {
    test.assertEqual(SearchEngines.others.all.length, others);
    test.assertEqual(ExampleSearchEngine, engine);
    test.done();
  });

  SearchEngines.others.add(ExampleSearchEngine);

  test.waitUntilDone(5 * 1000);
}
