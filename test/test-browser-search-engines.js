/* This Source Code Form is subject to the terms of the Mozilla Public
* License, v. 2.0. If a copy of the MPL was not distributed with this
* file, You can obtain one at http://mozilla.org/MPL/2.0/. */
"use strict";

const { BrowserSearchEngines, SearchEngine } = require("browser-search-engine");

const WIKIPEDIA_NAME = "Wikipedia (en)" ;
const AMAZON_NAME = "Amazon.com";
const AMAZON_SUGGEST_URL = "http://completion.amazon.com/search/complete?method=completion&search-alias=aps&mkt=1&q={searchTerms}";
const YELP_SUGGEST_URL = "http://www.yelp.ca/search_suggest?prefix={searchTerms}&loc={geo:name}";
const YELP_ENGINE = {
                  "name" : "Yelp",
                  "icon" : "data:image/x-icon;base64,AAABAAIAEBAAAAEAIABoBAAAJgAAACAgAAABAAgAqAgAAI4EAAAoAAAAEAAAACAAAAABACAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAMDL8ADS2vQDjqDlGzpa0iCWp+cPfJHhAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAHaM4ACEmOMYTGnWfz5d09crTc/mfpPicG+G3gD///8Dp7XrGX2S4Q15juAAAAAAAAAAAAAAAAAAAAAAAAAAAACFmOMAnq3paTZW0fwQNsn/IkbN/2+H339shN4Ao7HqI1t12tBEY9Sob4beFmF72wAAAAAAAAAAAAAAAAAAAAAAvMbvAN7j9xdqgt2qIETM/iFFzf9vht5+////Bm2E3qYbQMv/Gj/L/1Ft2Ke+yfELl6joAAAAAADR2PQA3OL3DsjQ8hn///8Bt8LuFE1q1qcvUdD/eY7hfH2S4kkxUtDzETfJ/xtAy/81VtHaUW3YGEpn1gAAAAAAZ4DcAG+G3nJVcNjcS2jWi5+v6XGUpuc6aoLdea+87DtEYtRzNVXR/k1q1ttYc9mMhZnjSQAArAE5WdIAAAAAABQ6ygAVO8p/EjnJ/xo/y/8qTM/9RmTVz2qC3RiGmeMApbPqJ7nE74PO1vQj////Af///wAAAAAAAAAAAAAAAAAkR80AKEvOfxY8yv8dQcz7MlPQ6VRv2KQjRs0K////C4OX46VbddrXSmjWiYea5HN9kuEjkaPnAo6g5gAAAAAAhZnjAJOl5nJdd9rdX3naf3qP4CSyv+0iTGnWdZip6Ex4jeCmHUHM/xk+y/8kR839Q2HUz4OX4xh0i98AAAAAAODk+ADr7voOydHyGdDY8wL///8LdIvfpSlMzv9Oatd+tcHuEUVj1bQXPMr/FzzK/1Ju17K5xe8LkaPmAAAAAAAAAAAAAAAAAP///wD///8Aj6HlWDJT0fMcQMv/T2vXf2F62wCntepKTGnW6VFt1+msuetKlqfnAAAAAAAAAAAAAAAAAAAAAACAleIAjJ/lI01q19sUOsr/IkbN/26F3n9gedsA////AbTA7ky9x+9M////AfL0/AAAAAAAAAAAAAAAAAB9keEAnKvoDEhl1acXPcr/EjjJ/yJGzf9wh99/XHbaAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAi57kAJur6BlZdNnMI0bN8h1BzP8kSM3/dIvgf2B62wAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAPn5/QD///8DqbbrFnqQ4E1SbtiAL1DQgIyf5T91i98AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAP//AAD8/wAA+OcAAPjDAAD8wwAA58cAAOHfAADhjwAA74MAAPzDAAD85wAA+P8AAPD/AADw/wAA/P8AAP//AAAoAAAAIAAAAEAAAAABAAgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAFDrKACNGzQAxU9EAQF/UAE5r1wBPa9cAXXfaAF542wBsg94AbITeAHqQ4QB7keEAip3lAJio6ACZqegAp7XrAKe26wC1we4AtsLvAMTO8gDFzvIA09r1ANTb9QDi5vgA4uf5APDz/ADx8/wAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsQCQEAEhsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsMAQAAAAAMGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbDgAAAAAAAAwbGxsbGxoFCxsbGxsbGxsbGxsbGxsbGxsXAQAAAAAADBsbGxsbBQAACRsbGxsbGxsbGxsbGxsbGxsVAAAAAAAMGxsbGw4AAAAACRsbGxsbGxsbGxsbGxsbGxsPAAAAAAwbGxsYAQAAAAAAEhsbGxsbGxsbGxsbGxsbGxsPAAAADBsbGwcAAAAAAAACGxsbGxsbGxsbGxsbGxsbGxsJAAAMGxsSAAAAAAAAAAMbGxsbGxsbGxsWDBQbGxsbGxsKBhUbGwEAAAAAAgoTGxsbGxsbGxsbGwMAAAEJEhobGxsbGxsbBwACChUbGxsbGxsbGxsbGxsbAAAAAAAAAAcSGxsbGxsbFRcbGxsbGxsbGxsbGxsbGxsAAAAAAAAAAAAbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGwAAAAAAAAAABRsbGxsbFBAYGxsbGxsbGxsbGxsbGxsbAwAAAAABChUbGxsbGxYAAAACBw4WGxsbGxsbGxsbGxsLAAAFDxsbGxsbGxsbFwEAAAAAAAABDBsbGxsbGxsbGxkNERsbGxsbGwsAEhsbDwAAAAAAAAAFGxsbGxsbGxsbGxsbGxsbGxsQAAAHGxsbCwAAAAAAABAbGxsbGxsbGxsbGxsbGxsbGgEAAAUbGxsbAwAAAAAFGxsbGxsbGxsbGxsbGxsbGxsHAAAABRsbGxsXAQAAARcbGxsbGxsbGxsbGxsbGxsbEgAAAAAJGxsbGxsTAAEVGxsbGxsbGxsbGxsbGxsbGxgBAAAAAAwbGxsbGxsVFxsbGxsbGxsbGxsbGxsbGxsbAwAAAAAADBsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGwkAAAAAAAAMGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsOAAAAAAAAAAwbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGwIAAAAAAAAADBsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbFwgBAAAAAAAMGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsRCgQAAREbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxv////////////wf///wH///4B8f/+AfD//wHgf/+BwD//wcA//+GAP+PxgH/gP4P/4A/P/+AP///gD4//4B8A/+D/AD/j8YA//+HAP//B4H//weB//4Hw//8B+f//Af///gH///wB///8Af///AH///+B//////////////////w==",
                  "alias" : "YelpAlias",
                  "description" : "Yelp - Connecting people with great local businesses",
                  "method" : "get",
                  "url" : "http://www.yelp.ca/search?ns=1&find_desc={searchTerms}&find_loc={geo:name}"
};

exports.test001VisibleEngines = function(test) {
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

exports.test002MissingSuggest = function(test) {
  ["Twitter"].forEach(function(engine) {
    test.assertNotNull(BrowserSearchEngines.get(engine), engine + " exists");
    test.assertNull(BrowserSearchEngines.get(engine).getSuggestion("search"), engine + " should not have a suggestion URL");
  });
}

exports.test003HasSuggest = function(test) {
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

exports.test004IncorrectSiteURLs = function(test) {
  [
   { name : "Wikipedia (en)", incorrect : "http://en.wikipedia.org/wiki/Special:Search", correct : "http://en.wikipedia.org/w/opensearch_desc.php" },
   // this Amazon one seems backwards but in reality they list their rel="self" template as this url instead of the default domain dunno
   { name : "Amazon.com", incorrect : "http://www.amazon.com/", correct : "http://d2lo25i6d3q8zm.cloudfront.net/browser-plugins/AmazonSearchSuggestionsOSD.Firefox.xml" }
  ].forEach(function(engine) {
    test.assertNotNull(BrowserSearchEngines.get(engine.name), engine.name + " exists");
    test.assertEqual(BrowserSearchEngines.get(engine.name).searchForm, engine.incorrect, engine.name + " has " + BrowserSearchEngines.get(engine.name).searchForm + " and wants to have " + engine.correct + " instead of the searchForm URL we expected: " + engine.incorrect);
  });
}

exports.test005GetDefaultEngine = function(test) {
  var amazon = BrowserSearchEngines.get(AMAZON_NAME);
  test.assertObject(amazon, "Amazon get");
};

exports.test006AddEngine = function(test) {
  BrowserSearchEngines.add(YELP_ENGINE);
  var yelp = BrowserSearchEngines.get(YELP_ENGINE.alias);
  test.assertNotNull(yelp, "Yelp wasn't added or an Alias get didn't match!");
  test.assertEqual(yelp.name, YELP_ENGINE.name, "Yelp name matches");
  test.assertEqual(yelp.icon, YELP_ENGINE.icon, "Yelp icon matches");
  test.assertEqual(yelp.alias, YELP_ENGINE.alias, "Yelp alias matches");
  test.assertEqual(yelp.description, YELP_ENGINE.description, "Yelp description matches");
  test.assertEqual(yelp.getSubmission("search"), YELP_ENGINE.url.replace("{searchTerms}", "search"), "Yelp Query URL matches");
};

exports.test0071GetEngineByAlias = function(test) {
  var yelp = BrowserSearchEngines.get(YELP_ENGINE.alias);
  test.assertNotNull(yelp, "Could not find the Yelp Engine by alias");
};

exports.test0072GetEngineByName = function(test) {
  var yelp = BrowserSearchEngines.get(YELP_ENGINE.name);
  test.assertNotNull(yelp, "Found the Yelp Engine by name");
};

exports.test007AddSuggest = function(test) {
  var yelp = BrowserSearchEngines.get(YELP_ENGINE.alias);
  test.assertNotNull(yelp, "Found the Yelp Engine");
  yelp.addSuggest(YELP_SUGGEST_URL);
  test.assertEqual(yelp.getSuggestion("search"), YELP_SUGGEST_URL.replace("{searchTerms}", "search"));
};

exports.test008RemoveEngine = function(test) {
  BrowserSearchEngines.remove(BrowserSearchEngines.get(YELP_ENGINE.name));
  var yelp = BrowserSearchEngines.get(YELP_ENGINE.name);
  test.assertNull(yelp, "Yelp removed");
};

exports.test009AddEngineWithSuggest = function(test) {
  var engine = YELP_ENGINE;
  engine["suggest"] = YELP_SUGGEST_URL;
  BrowserSearchEngines.add(engine);
  var yelp = BrowserSearchEngines.get(engine.alias);
  test.assertNotNull(yelp, "Found the Yelp Engine");

  BrowserSearchEngines.remove(BrowserSearchEngines.get(YELP_ENGINE.alias));
  BrowserSearchEngines.get(YELP_ENGINE.alias);
};
