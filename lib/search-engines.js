/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

if (!require("api-utils/xul-app").is("Firefox")) {
  throw new Error([
    "The search engine module currently supports only Firefox.  In the future ",
    "we would like it to support other applications, however.  Please see ",
    "https://bugzilla.mozilla.org/show_bug.cgi?id=jetpack-panel-apps ",
    "for more information."
  ].join(""));
}

const { Trait } = require('traits');
const { EventEmitter } = require("events");
const SimpleStorage = require("simple-storage");
const { SearchEnginesCollector } = require("search-engines-collector");
const data = require("self").data;
const URL = require("url");
const xhr = require("xhr");
const timers = require("timers");
const { Geolocation } = require("geolocation");

const DEFAULT_TAG = exports.DEFAULT_TAG  = "_default";
const FOUND_TAG = exports.FOUND_TAG = "_found";


/**
 * Search Engine
 *
 * {
 *  site : "http://www.google.com/search.xml",
 *  name : "Google",
 *  queryURL : "http://www.google.com/search?q={searchLocation}",
 *  suggestionURL : "http://www.google.com/suggestion?q={searchLocation}",
 *  icon : "data:image/png,base64;klaj0909awe0a9fas09fasdjf09ajsdfa09d09823"
 * }
 *
 **/
const SearchEngine = Trait.compose({

  constructor: function SearchEngine(siteURL, name, queryURL, suggestionURL, icon) {
    this._site = URL.URL(siteURL);
    this._name = name;
    this._queryURL = queryURL;
    this._suggestionURL = suggestionURL;
    this._icon = icon;
    //console.log("constructor", this._site, siteURL, name, queryURL, suggestionURL);
  },

  // use the site URL as our unique ID
  get id() this.siteURL,

  // site is the object reference to the site of the XML origin
  get site() this._site,
  get siteURL() this._site.toString(),

  // host is the root host URL for the site
  get host() this.siteURL.replace(this._site.path, ""),

  // name of the search engine e.g. Google, Amazon.com
  get name() this._name,

  // URL for sending queries e.g. http://www.google.ca/search?q=firefox
  get queryURL() this._queryURL,

  // URL for retrieving suggestions e.g. http://suggestqueries.google.com/complete/search?q=firefox
  get suggestionURL() this._suggestionURL,

  // Data URL for the icon of the search engine image
  get icon() this._icon,

  // some hacks to get wikipedia special privs
  get type() {
    return (this.name == "Wikipedia (en)")? "match" : "suggest";
  },
  get baseURL() {
    return (this.name == "Wikipedia (en)")? "http://en.wikipedia.org/wiki/" : "";
  },

  _getURL : function _getURL(url, terms, location) {
    return url.replace("{searchLocation}",
                       encodeURIComponent(location)).
               replace("{searchTerms}",
                       encodeURIComponent(terms));
  },

  getSubmission : function getSubmission(terms, location) {
    if (!location) {
      location = Geolocation.formatted_address;
    }
    return this._getURL(this.queryURL, terms, location);
  },

  getSuggestion : function getSuggestion(terms, location) {
    if (!location) {
      location = Geolocation.formatted_address;
    }
    return this._getURL(this.suggestionURL, terms, location);
  },

  toJSON : function toJSON() {
    return { name : this.name,
             id : this.id,
             siteURL : this.siteURL,
             host : this.host,
             tags : this.tags,
             queryURL: this.queryURL,
             suggestionURL : this.suggestionURL,
             icon : this.icon
            };
  }
});


const SearchEngines = EventEmitter.compose({
  _emit: EventEmitter.required,
  on: EventEmitter.required,

  get maxResults() this._maxResults,
  set maxResults(maxResults) { this._maxResults = maxResults; },

  _geolocationAllowed : false,

  get geolocation() {
    if (!this._geolocationAllowed) {
      this._geolocationAllowed = Geolocation.allowed;
    }
    return this._geolocationAllowed;
  },

  set geolocation(allow) {
    Geolocation.allowed = this._geolocationAllowed = allow;
  },

  get tags() {
    var tags = [];
    for (var t in this._engines) {
      tags.push(t);
    }
    return tags;
  },

  // Cached mapping of tags to engines
  // { "web" : [ google, yahoo, bing ], "_default" : [ google, amazon, wikipedia ] }
  _engines : { },

  // Current search terms cache
  _terms : "",

  get suggestionTimer() { this._suggestionTimer; },

  set suggestionTimer(suggestionTimer) {
    if (this.suggestionTimer) {
      timers.clearTimeout(this.suggestionTimer);
    }
    this._suggestionTimer = suggestionTimer;
  },

  constructor : function SearchEngines() {
    if (!SimpleStorage.storage.engines) {
      SimpleStorage.storage.engines = {};
      this._first_run();
    }

    Geolocation.once("address", function() {
      // Add Yelp to our Search Engines once we have Geolocation
      let engine = SearchEngine("http://www.yelp.com/search.xml",
                                "Yelp",
                                "http://www.yelp.com/search?ns=1&find_desc={searchTerms}&find_loc={searchLocation}",
                                "http://www.yelp.com/search_suggest?prefix={searchTerms}&loc={searchLocation}",
                                "data:image/x-icon;base64,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AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsQCQEAEhsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsMAQAAAAAMGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbDgAAAAAAAAwbGxsbGxoFCxsbGxsbGxsbGxsbGxsbGxsXAQAAAAAADBsbGxsbBQAACRsbGxsbGxsbGxsbGxsbGxsVAAAAAAAMGxsbGw4AAAAACRsbGxsbGxsbGxsbGxsbGxsPAAAAAAwbGxsYAQAAAAAAEhsbGxsbGxsbGxsbGxsbGxsPAAAADBsbGwcAAAAAAAACGxsbGxsbGxsbGxsbGxsbGxsJAAAMGxsSAAAAAAAAAAMbGxsbGxsbGxsWDBQbGxsbGxsKBhUbGwEAAAAAAgoTGxsbGxsbGxsbGwMAAAEJEhobGxsbGxsbBwACChUbGxsbGxsbGxsbGxsbAAAAAAAAAAcSGxsbGxsbFRcbGxsbGxsbGxsbGxsbGxsAAAAAAAAAAAAbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGwAAAAAAAAAABRsbGxsbFBAYGxsbGxsbGxsbGxsbGxsbAwAAAAABChUbGxsbGxYAAAACBw4WGxsbGxsbGxsbGxsLAAAFDxsbGxsbGxsbFwEAAAAAAAABDBsbGxsbGxsbGxkNERsbGxsbGwsAEhsbDwAAAAAAAAAFGxsbGxsbGxsbGxsbGxsbGxsQAAAHGxsbCwAAAAAAABAbGxsbGxsbGxsbGxsbGxsbGgEAAAUbGxsbAwAAAAAFGxsbGxsbGxsbGxsbGxsbGxsHAAAABRsbGxsXAQAAARcbGxsbGxsbGxsbGxsbGxsbEgAAAAAJGxsbGxsTAAEVGxsbGxsbGxsbGxsbGxsbGxgBAAAAAAwbGxsbGxsVFxsbGxsbGxsbGxsbGxsbGxsbAwAAAAAADBsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGwkAAAAAAAAMGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsOAAAAAAAAAAwbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGwIAAAAAAAAADBsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbFwgBAAAAAAAMGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsRCgQAAREbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxv////////////wf///wH///4B8f/+AfD//wHgf/+BwD//wcA//+GAP+PxgH/gP4P/4A/P/+AP///gD4//4B8A/+D/AD/j8YA//+HAP//B4H//weB//4Hw//8B+f//Af///gH///wB///8Af///AH///+B//////////////////w==");
      this.add(engine, ["food", DEFAULT_TAG]);
    }.bind(this));

    SearchEnginesCollector.on("engine", this._collector.bind(this));

    SimpleStorage.on("OverQuota", this._overQuota.bind(this));
    require("unload").ensure(this);
  },

  // The first run initialization code to pull in some default engines from Firefox
  _first_run : function _first_run() {
    var { BrowserSearchEngines } = require("browser-search-engine");
    // Add in some suggestions for engines we know already work but aren't listed
    BrowserSearchEngines.get("Wikipedia (en)").addSuggest("http://en.wikipedia.org/w/api.php?action=opensearch&search={searchTerms}");
    BrowserSearchEngines.get("Amazon.com").addSuggest("http://completion.amazon.com/search/complete?method=completion&search-alias=aps&mkt=1&q={searchTerms}");
    var nameTags = { "Google" : ["web", DEFAULT_TAG],
                     "Yahoo" : ["web"],
                     "Bing" : ["web"],
                     "Amazon.com" : ["shopping", DEFAULT_TAG],
                     "eBay" : ["shopping"],
                     "Twitter" : ["social", DEFAULT_TAG],
                     "Wikipedia (en)" : ["reference", DEFAULT_TAG] };
    for each (let systemEngine in BrowserSearchEngines.getVisible()) {
      var queryURL = decodeURIComponent(systemEngine.getSubmission("{searchTerms}", "{searchLocation}"));
      var suggestionURL = decodeURIComponent(systemEngine.getSuggestion("{searchTerms}", "{searchLocation}") || "");
      var name = systemEngine.name;
      var icon = systemEngine.icon;
      var site = systemEngine.searchForm

      let engine = SearchEngine(site, name, queryURL, suggestionURL, icon);
      this.add(engine, nameTags[name]);
    }
  },

  remove : function remove(engine) {
    SimpleStorage.storage.engines[engine.id] = null;
    delete SimpleStorage.storage.engines[engine.id];
    this._emit("removed", engine);
  },

  get : function get(id) {
    return SimpleStorage.storage.engines[id];
  },

  getEnginesByTag : function(tag) {
    tag = (tag)? tag : DEFAULT_TAG;
    return this._engines[tag];
  },

  add : function add(engine, tags) {
    for (var i in tags) {
      var tag = tags[i];
      this._updateTags(tag, engine);
    }

    // Save this engine to the simple storage according to it's provided ID
    SimpleStorage.storage.engines[engine.id] = engine;
    this._emit("added", engine);
  },

  _updateTags : function _updateTags(tag, engine) {
      // If the tag doesn't exist yet just create it
      if (!this._engines[tag]) {
        this._engines[tag] = [];
      }

      var found = false;
      for (var e in this._engines[tag]) {
        if (this._engines[tag][e].id == engine.id) {
          found = true;
          this._engines[tag][e] = engine;
          console.log("added", tag, engine.id)
          break;
        }
      }

      if (!found) {
        console.log("pushed", tag, engine.id, this._engines[tag].length);
        this._engines[tag].push(engine);
      }
  },

  // Helper function for adding a tag to an engine and to the cache list of engines
  addTagById : function addTagById(tag, id) {
    console.log("addTagById", tag, id);
    var engine = SimpleStorage.storage.engines[id];
    this._updateTags(tag, engine);
  },

  // Helper function for removing a tag from an engine and from the cache list of engines
  removeTagById : function removeTagById(tag, id) {
    console.log("removeTagById", tag, id);
    var engine = SimpleStorage.storage.engines[id];
    for (var e in this._engines[tag]) {
      if (this._engines[tag][e].id == engine.id) {
        this._engines[tag][e] = null;
        delete this._engines[tag][e];
        break;
      }
    }
  },

  search : function search(terms, tags) {
    this._terms = terms;
    tags = (tags)? tags : [DEFAULT_TAG];

    var run = function() {
      var engines = this.getEnginesByTag();
      for (var i in engines) {
        var engine = engines[i];

        // If our terms are older than the terms set break and quit
        if (this._terms != terms) {
          break;
        }

        // If this engine doesn't support suggestions just skip it
        if (!engine.suggestionURL) {
          console.log("engine.suggestionURL", engine.suggestionURL);
          continue;
        }

        var request = function(engine, terms) {
          var req = new xhr.XMLHttpRequest();
          var url = engine.getSuggestion(terms, Geolocation.formatted_address);
          req.open('GET', url, true);
          req.onreadystatechange = function (aEvt) {
            if (req.readyState == 4) {
              if (req.status == 200) {
                console.log("this._terms", this._terms, terms, engine.id);

                // Our request returned but it's too late and the terms have changed
                if (this._terms != terms) {
                  return;
                }

                // ["term", ["suggestions", "of", "matches" ]]
                // ex: ["json",["jsonline","json","json validator","jsonp"]]
                try {
                  if (engine.id == "http://www.yelp.com/search.xml") {
                    // Yelp returns a crappy HTML answer instead of JSON
                    // We just send the whole body object to the iframe to let the DOM parse it all
                    // {"body": "<ul>\n\t\t\t
                    //            <li title=\"Elysian Coffee\">Elysian<span class=\"highlight\">&nbsp;Coffee</span></li>\n\t\t\t
                    //            <li title=\"Elysian Room\">Elysian<span class=\"highlight\">&nbsp;Room</span></li>\n\t
                    //           </ul>",
                    // "unique_request_id": "a1fdaa421112b2b5"}
                    var response = JSON.parse(req.responseText)["body"];
                    this._emit("suggestions", "yelp",{ "terms" : terms, "name" : engine.name, "id" : engine.id,
                                                       "results" : response, "type" : engine.type });
                    return;
                  } else {
                    var results = [];
                    var suggestions = JSON.parse(req.responseText)[1];
                    console.log("req.responseText", req.responseText);
                    suggestions.forEach(function(item) {
                      // Break loop if we have more results than we need
                      if (results.length >= SearchEngines.maxResults) {
                        return;
                      }
                      // If the term searched matches the response then ignore it
                      if (terms != item) {
                        results.push({ "title" : item, "url" : (engine.type == "match")? engine.baseURL + item : "" });
                      }
                    });
                    this._emit("suggestions", "add",{ "name" : engine.name, "id" : engine.id,
                                                      "results" : results, "type" : engine.type, "terms" : terms });
                  }
                } catch (error) { console.error("suggest error: " + error + "\n" + url + "\n"); }
              }
              else {
                console.error('req.error', req.readyState, req.status, req.statusText, url);
              }
            }
          }.bind(this);
          req.send(null);

        }.bind(this);

        request(engine, terms);

      }
    }.bind(this);
    console.log("this.suggestionTimer", this, this._suggestionTimer);
    this._suggestionTimer = timers.setTimeout(run, 300);
    console.log("this.suggestionTimer", this, this._suggestionTimer);
  },

  // listener for SearchEnginesCollector engine objects
  _collector : function _collector(engine) {
    console.log("search-engines.SearchEnginesCollector", engine);
    this.add(SearchEngine(engine.url, engine.name, engine.queryURL, engine.suggestionURL, engine.icon), [DEFAULT_TAG, FOUND_TAG]);
  },

  getSubmission : function (engine, terms) {
    let location = Geolocation.formatted_address;
    console.log("getSubmission", engine, terms, location);
    return this.get(engine).getSubmission(terms, location);
  },

  // XXX Totally untested
  _overQuota: function _overQuota() {
    //while (SimpleStorage.quotaUsage > 1) {
    //  SimpleStorage.storage.engines;
    //}
    console.error("_overQuota");
  },

  unload : function unload() {
    SearchEnginesCollector.removeListener("engine", this._collector);
    SimpleStorage.removeListener("OverQuota", this._overQuota);
  }

})();


exports.SearchEngines = SearchEngines;
exports.SearchEngine = SearchEngine;
