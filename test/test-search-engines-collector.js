/* This Source Code Form is subject to the terms of the Mozilla Public
* License, v. 2.0. If a copy of the MPL was not distributed with this
* file, You can obtain one at http://mozilla.org/MPL/2.0/. */
"use strict";

const data = require("self").data;
const { Cc, Ci } = require("chrome");
const { SearchEnginesCollector } = require("search-engines-collector");
const url = require("api-utils/url");
// borrowed from addon-kit/tests
const testPageMod = require("pagemod-test-helpers").testPageMod;

const TEST_FILE = "test-search-engines-collector.js";

const TEST_FOLDER_URI = module.uri.split(TEST_FILE)[0];

//console.log("TEST_FOLDER_URI", TEST_FOLDER_URI);

const HTML_FILE = "fixtures/test-search-engines-collector-pagemod.html";
const HTML_URI = module.uri.replace(TEST_FILE, HTML_FILE);

//console.log("HTML_FILE", HTML_FILE, "HTML_URI", HTML_URI);

const WIKIPEDIA_OPENSEARCH_FILE = "fixtures/wikipedia-opensearch.xml";
const WIKIPEDIA_URI = module.uri.replace(TEST_FILE, WIKIPEDIA_OPENSEARCH_FILE);

//console.log("WIKIPEDIA_OPENSEARCH_FILE", WIKIPEDIA_OPENSEARCH_FILE, "WIKIPEDIA_URI", WIKIPEDIA_URI);

const FOURSQUARE_OPENSEARCH_FILE = "fixtures/foursquare-opensearch.xml";
const FOURSQUARE_URI = module.uri.replace(TEST_FILE, FOURSQUARE_OPENSEARCH_FILE);

//console.log("FOURSQUARE_OPENSEARCH_FILE", FOURSQUARE_OPENSEARCH_FILE, "FOURSQUARE_URI", FOURSQUARE_URI);

// Borrowed from: test-harness/tests/test-tmp-file.js
// Utility function that synchronously reads local resource from the given
// `uri` and returns content string. Read in binary mode.
function readBinaryURI(uri) {
  let ioservice = Cc["@mozilla.org/network/io-service;1"].getService(Ci.nsIIOService);
  let channel = ioservice.newChannel(uri, "UTF-8", null);
  let stream = Cc["@mozilla.org/binaryinputstream;1"].
               createInstance(Ci.nsIBinaryInputStream);
  stream.setInputStream(channel.open());

  let data = "";
  while (true) {
    let available = stream.available();
    if (available <= 0)
      break;
    data += stream.readBytes(available);
  }
  stream.close();

  return data;
}

exports.testPageModCollector = function(test) {
  let workerDone = false,
      callbackDone = null;
  let mods = testPageMod(test, HTML_URI,
                         [{
                            include: HTML_URI,
                            contentScriptWhen: 'end',
                            contentScriptFile: data.url("search-engines-collector-pagemod.js"),
                            onAttach: function(worker) {
                              worker.on('message', function(data) {
                                var link = data.pop();
                                test.assertEqual(link.site, HTML_URI);
                                test.assertEqual(link.name, "FourSquare");
                                test.assertEqual(link.opensearch, "/foursquare-opensearch.xml");
                                workerDone = true;
                                if (callbackDone) {
                                  callbackDone();
                                }
                              });
                            }
                          }],
    function(win, done) {
      (callbackDone = function() {
        if (workerDone) {
          done();
        }
      })();
    }
  );
};

exports.testNotAllowedCollector = function(test) {

  SearchEnginesCollector.allowed = false;

  var link = [{ site : "http://www.example.com", name : "Example", opensearch : "/example-opensearch.xml" }];
  test.assertNull(SearchEnginesCollector.collect(link));

  SearchEnginesCollector.allowed = true;
  test.assertEqual(SearchEnginesCollector.collect(link), link);
}

exports.testCollectorWikipedia = function(test) {
  SearchEnginesCollector.allowed = true;
  SearchEnginesCollector.on("engine", function onCollectorWikipedia(collected) {
    SearchEnginesCollector.removeListener("engine", onCollectorWikipedia);

    test.assertEqual(collected.name, "Wikipedia (en)", "Wikipedia name is correct");
    test.assertEqual(collected.queryURL,"http://en.wikipedia.org/w/index.php?title=Special:Search&search={searchTerms}", "Wikipedia Query URL is correct");
    test.assertEqual(collected.suggestionURL,"http://en.wikipedia.org/w/api.php?action=opensearch&search={searchTerms}&namespace=0", "Wikipedia Suggestion URL is correct");
    test.assertEqual(collected.icon, "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAABS0lEQVQ4jcWTwY3EIAxFR6MUETpwDaPcQwekBVICOUIRLiGUQBqYlAAdhB6I/h5GQZPdaLXSrrQHDljW8/e3fSt7wW/e7f8BYQlQg4LsJcISUPYCP3vIXsJMBjFFlL3ATAZqUIgpIqYIPWqoQb0UOOtARBVQ9gLZSxARYorIW4azDsyMshfkLUOPGsz8AsQUIVoBPWrkLaPsBcwM0Qr42WN9rtCjrvADcPJADQqiFVifKw7oocJZBz/7CghLqP/be1C0As66msjMaO4N1KBO1Z11td3TFGQvIXtZjYspont0kL2sOTFFmMlcj9FZh+beVHkH4N1gZq5mXu4BEUENCnnL8LOHHjW6R1dNc9ZVoy8Bzjp0jw5mMvCzr5KJCMx88ugS4GcPIgIR1VbCEmrsmNK3q/zZzLIX6FGDiH52C2EJXyrFFE+b+mfH9AGWL1wAegygIwAAAABJRU5ErkJggg==",
                     "Wikipedia Icon is correct");

    test.done();
  });

  var dataurl = url.DataURL("data:application/opensearchdescription+xml;charset=utf-8," + escape(readBinaryURI(WIKIPEDIA_URI)));
  SearchEnginesCollector.getEngineByXMLURL(dataurl);
  test.waitUntilDone(5 * 1000);
}

exports.testCollectorFoursquare = function(test) {
  SearchEnginesCollector.allowed = true;
  SearchEnginesCollector.on("engine", function onCollectorFoursquare(collected) {
    SearchEnginesCollector.removeListener("engine", onCollectorFoursquare);

    test.assertEqual(collected.name, "foursquare", "FourSquare name is correct");
    test.assertEqual(collected.queryURL,"https://foursquare.com/search?q={searchTerms}&extra=lots", "FourSquare Query URL is correct");
    test.assertEqual(collected.suggestionURL,"", "FourSquare Suggestion URL is empty");
    test.assertEqual(collected.icon, "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAACs0lEQVQ4jY2PXUjTYRTG/9dBdxm4Mdqs0KAsyKxuJG+8sii6KCGMChYZdOE0pA/Lj0qdotVsISiVouXSSrdppNaa21wfZupWbpn7l+FHQqLM2eb8dbHNj+iiAz/OeZ/nOQdeQTexyKPx/+fhWJDLLzyMTc8DINwfXaDm+zLVf7FSqxkNkmsZ57VrikgJWo8fzYgfjcfP7RE/ZS4/Gk8ATUQfWfZvDM6gNYksLrJ8oMzto8Tt49xLEaWugOzWNE7qbpHz5ifXP81yzTlLsdvHjSEvmS0u/AtBVpaQ55wl45VIwfM0Xn1NxTi0l4aPa8nQHSchv43EwnYybRMo9cOIU3NLi7+8fq4YhhCy+35xtPEpnV/SGZgoxvpNSbNjE5XW9cTn69l2rZuEwg7aHZNLyyM/vZx5PMhZyxjC6Z5JDtfr6Bo+Rv94IRbxFE2DG6m0rmNrXgtbCrq5+uwzgWDo473iNGkN/aSbfqC0TSIcMookP3hHcUcqHcMptH7eSe2HNXR8UZJSbiX1tp0ZXwCA5wPj7NP2cMDoYb/ew0GDiJDS5GZfo4tdmi5O1J0i+0kSWnM+84E5PFNexKk5fgeCVHYOsyHzGdtLOknWuUludJHS5EZIqneyp9bBnjoHCTX9yC+0sUFlIO+pkxlfgOm5AOcbB5Cp9GzONbL7wUAoX+sgqd6JkHjvI9ur+5ap6kVxyYhUpSftrp0j2h6kKgOKiwbiq3qXcjuq+0i8148QX/WeuDtvVxFbaUeW04pEZUSS1YYsp4VYjT3ka8PceUt81XuEOI0deYUNeYUNRbjLb9qQV1iJzmomOqsJeYU15N9cnYnV2BFiyi1I1d1hzGFCs6S0G2mpeRWSyKw2E1NuQZCpzUQVmYgqMrE+3FfyLy2iy9RmBEWZGWmJ6b+QhIm8FWVm/gC+c+W5gWzPJgAAAABJRU5ErkJggg==",
                     "FourSquare icon is correct");

    test.done();
  });

  var dataurl = url.DataURL("data:application/opensearchdescription+xml;charset=utf-8," + escape(readBinaryURI(FOURSQUARE_URI)));
  SearchEnginesCollector.getEngineByXMLURL(dataurl);
  test.waitUntilDone(5 * 1000);
}
