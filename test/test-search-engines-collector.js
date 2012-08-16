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

exports.testCollectorWikipedia = function(test) {

  SearchEnginesCollector.on("engine", function onCollectorWikipedia(collected) {
    SearchEnginesCollector.removeListener("engine", onCollectorWikipedia);

    test.assertEqual(collected.name, "Wikipedia (en)", "Wikipedia name is correct");
    test.assertEqual(collected.queryURL,"http://en.wikipedia.org/w/index.php?title=Special:Search&search={searchTerms}", "Wikipedia Query URL is correct");
    test.assertEqual(collected.suggestionURL,"http://en.wikipedia.org/w/api.php?action=opensearch&search={searchTerms}&namespace=0", "Wikipedia Suggestion URL is correct");
    test.assertEqual(collected.icon,"http://en.wikipedia.org/favicon.ico", "Wikipedia Icon is correct");

    test.done();
  });

  var dataurl = url.DataURL("data:application/opensearchdescription+xml;charset=utf-8," + escape(readBinaryURI(WIKIPEDIA_URI)));
  SearchEnginesCollector.getEngineByXMLURL(dataurl);
  test.waitUntilDone(5 * 1000);
}

exports.testCollectorFoursquare = function(test) {

  SearchEnginesCollector.on("engine", function onCollectorFoursquare(collected) {
    SearchEnginesCollector.removeListener("engine", onCollectorFoursquare);

    test.assertEqual(collected.name, "foursquare", "FourSquare name is correct");
    test.assertEqual(collected.queryURL,"https://foursquare.com/search?q={searchTerms}", "FourSquare Query URL is correct");
    test.assertEqual(collected.suggestionURL,"", "FourSquare Suggestion URL is empty");
    test.assertEqual(collected.icon,"https://foursquare.com/favicon.ico", "FourSquare icon is correct");

    test.done();
  });

  var dataurl = url.DataURL("data:application/opensearchdescription+xml;charset=utf-8," + escape(readBinaryURI(FOURSQUARE_URI)));
  SearchEnginesCollector.getEngineByXMLURL(dataurl);
  test.waitUntilDone(5 * 1000);
}
