/* This Source Code Form is subject to the terms of the Mozilla Public
* License, v. 2.0. If a copy of the MPL was not distributed with this
* file, You can obtain one at http://mozilla.org/MPL/2.0/. */
"use strict";


const { BrowserSearchEngines, SearchEngine } = require("browser-search-engine");

exports.testVisibleEngines = function(test) {
  var visible = [
    "Amazon.com",
    "Wikipedia (en)",
    "Google",
    "Yahoo",
    "Bing",
    "eBay",
    "Twitter"
  ]
  // Check that the engines we assume exist actually do exist
  BrowserSearchEngines.getVisible().forEach(function(engine) {
    test.assert(visible.indexOf(engine.name) >= 0);
  });
  // Check that we only have 7 default visible engines
  test.assertEqual(BrowserSearchEngines.getVisible().length, visible.length);
}

exports.testMissingSuggest = function(test) {
  ["Twitter"].forEach(function(engine) {
    test.assertNotNull(BrowserSearchEngines.get(engine), engine + " exists");
    test.assertNull(BrowserSearchEngines.get(engine).getSuggestion("search"), engine + " should not have a suggestion URL");
  });
}

exports.testHasSuggest = function(test) {
  [
   { name : "Amazon.com", url : "http://completion.amazon.com/search/complete?method=completion&search-alias=aps&mkt=1&q=search" },
   { name : "Wikipedia (en)", url : "http://en.wikipedia.org/w/api.php?action=opensearch&search=search" },
   { name : "Google", url : "https://www.google.com/complete/search?client=firefox&q=search" },
   { name : "Yahoo", url : "http://ff.search.yahoo.com/gossip?output=fxjson&command=search" },
   { name : "Bing", url : "http://api.bing.com/osjson.aspx?query=search&form=OSDJAS" },
   { name : "eBay", url : "http://anywhere.ebay.com/services/suggest/?s=0&q=search" }
  ].forEach(function(engine) {
    test.assertNotNull(BrowserSearchEngines.get(engine.name), engine.name + " exists");
    test.assertEqual(BrowserSearchEngines.get(engine.name).getSuggestion("search"), engine.url, engine.name + " does not have the correct suggestion URL");
  });
}

exports.testIncorrectSiteURLs = function(test) {
  [
   { name : "Wikipedia (en)", incorrect : "http://en.wikipedia.org/wiki/Special:Search", correct : "http://en.wikipedia.org/w/opensearch_desc.php" },
   // this Amazon one seems backwards but in reality they list their rel="self" template as this url instead of the default domain dunno
   { name : "Amazon.com", incorrect : "http://www.amazon.com/", correct : "http://d2lo25i6d3q8zm.cloudfront.net/browser-plugins/AmazonSearchSuggestionsOSD.Firefox.xml" }
  ].forEach(function(engine) {
    test.assertNotNull(BrowserSearchEngines.get(engine.name), engine.name + " exists");
    test.assertEqual(BrowserSearchEngines.get(engine.name).searchForm, engine.incorrect, engine.name + " has " + BrowserSearchEngines.get(engine.name).searchForm + " and wants to have " + engine.correct + " instead of the searchForm URL we expected: " + engine.incorrect);
  });
}
