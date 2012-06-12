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
const storage = SimpleStorage.storage;
const { SearchEnginesCollector } = require("search-engines-collector");
const { StatisticsReporter } = require("statistics");
const URL = require("url");
const xhr = require("xhr");
const timers = require("timers");
const { Geolocation } = require("geolocation");
const { history } = require("places");

const DEFAULT_TAG = exports.DEFAULT_TAG  = "_default";
const INSTALLED_TAG = exports.INSTALLED_TAG = "_installed";
const FOUND_TAG = exports.FOUND_TAG = "others";

// Some translators for services whose suggestions do not match spec.
const translators = {
  'http://www.yelp.com/search.xml': function (req) {
    var response = JSON.parse(req.responseText)["body"],
        items = [];

    response.replace(/\<li\s+title="([^"]+)"/g, function (match, title) {
      items.push(title);
    });

    return items;
  },
  "http://www.linkedin.com/search/fpsearch" : function (req) {
    var response = null, options = ["mynetwork", "company", "group", "sitefeature", "skill"],
        items = [];
    var res = JSON.parse(req.responseText);
    for (var j = 0; j < options.length; j++) {
      if (res && options[j] in res) {
        response = res[options[j]].resultList;
        for (var i = 0; i < response.length; i++) {
          var results = response[i];
          items.push(results.displayName);
        }
        //console.log("items", items, items.length);
        return items;
      } else {
        console.log("ressse", options[j]);
        continue;
      }
    }
    return null;
  }
};

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

  constructor: function SearchEngine(siteURL, name, queryURL, suggestionURL, icon, type, baseURL) {
    this._site = URL.URL(siteURL);
    this._name = name;
    this._queryURL = queryURL;
    this._suggestionURL = suggestionURL;
    this._icon = icon;
    this._type = type;
    this._baseURL = baseURL;
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
  set name(name) this._name = name,

  // URL for sending queries e.g. http://www.google.ca/search?q=firefox
  get queryURL() this._queryURL,
  set queryURL(queryURL) this._queryURL = queryURL,

  // URL for retrieving suggestions e.g. http://suggestqueries.google.com/complete/search?q=firefox
  get suggestionURL() this._suggestionURL,
  set suggestionURL(suggestionURL) this._suggestionURL = suggestionURL,

  // Data URL for the icon of the search engine image
  get icon() this._icon,
  set icon(icon) this._icon = icon,

  // returns either "suggest" or "match"
  // used for to inform UI of sites that offer search results or direct links
  get type() this._type,

  // baseURL is used as the base point for direct matching results to build a URL
  get baseURL() this._baseURL,

  _getURL : function _getURL(url, terms, location) {
    return url.replace("{geo:name}",
                       encodeURIComponent(location)).
               replace("{searchTerms}",
                       encodeURIComponent(terms));
  },

  getExactMatch : function getExactMatch(item) {
    return (this.type == "match")? this.baseURL + encodeURIComponent(item) : ""
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
    return { id : this.id,
             name : this.name,
             siteURL : this.siteURL,
             host : this.host,
             type : this.type,
             baseURL : this.baseURL,
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
    for (var t in storage.tags) {
      if (t != DEFAULT_TAG) {
        tags.push(t);
      }
    }
    tags.sort(this._tag_sort.bind(this));
    return tags;
  },

  _tag_sort_order : ["web", "shopping", "social", "local", "reference"],
  _tag_sort : function _tag_sort(a, b) {
    var aindex = this._tag_sort_order.indexOf(a),
        bindex = this._tag_sort_order.indexOf(b);

    if (aindex < 0) {
      return 1;
    }
    if (bindex < 0) {
      return -1;
    }
    if (aindex >= 0) {
      if (bindex >= 0) {
        return aindex - bindex;
      }
      return aindex;
    }
    return 0;
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

  get historyTimer() { this._historyTimer; },

  set historyTimer(historyTimer) {
    if (this._historyTimer) {
      timers.clearTimeout(this.historyTimer);
    }
    this._historyTimer = historyTimer;
  },

  constructor : function SearchEngines() {
    if (!storage.engines) {
      storage.engines = {};
      storage.tags = {};
      this._first_run();
    }

    SearchEnginesCollector.on("engine", this._collector.bind(this));

    SimpleStorage.on("OverQuota", this._overQuota.bind(this));
    require("unload").ensure(this);
  },

  // The first run initialization code to pull in some default engines from Firefox
  _first_run : function _first_run() {
    var { BrowserSearchEngines } = require("browser-search-engine");
    // Add in some suggestions for engines we know already work but aren't listed
    BrowserSearchEngines.get("Wikipedia (en)").addSuggest("http://en.wikipedia.org/w/api.php?action=opensearch&search={searchTerms}");
    BrowserSearchEngines.get("Amazon.com").addSuggest("http://completion.amazon.com/search/complete?method=completion&q={searchTerms}&search-alias=aps&client=amzn-search-suggestions/9fe582406fb5106f343a84083d78795713c12d68&mkt=1");
    this.add(SearchEngine("http://www.linkedin.com/search/fpsearch",
             "LinkedIn",
             "http://www.linkedin.com/pub/dir/?first={searchTerms}&last=&search=Search",
             "http://www.linkedin.com/ta/federator?query={searchTerms}&types=mynetwork,company,group,sitefeature,skill",
             "http://static01.linkedin.com/scds/common/u/img/favicon_v3.ico",
             "suggest",
             ""), ["social", DEFAULT_TAG]);

    // Map a default set of tags into our engines
    var tags = { "Google" :         ["web", DEFAULT_TAG],
                 "Yahoo" :          ["web"],
                 "Bing" :           ["web"],
                 "Amazon.com" :     ["shopping", DEFAULT_TAG],
                 "eBay" :           ["shopping"],
                 "Twitter" :        ["social"],
                 "Wikipedia (en)" : ["reference", DEFAULT_TAG],
                 "LinkedIn"       : ["social", DEFAULT_TAG] };

    // Map the engines which are considered "matching" versus the others which provide suggestions
    var matches = [ "Wikipedia (en)" ];

    // Provide a mapping of the OpenSearch descriptor locations to our default engines (which don't have them)
    var sites   = { "Wikipedia (en)" : "http://en.wikipedia.org/w/opensearch_desc.php",
                    "Amazon.com" : "http://d2lo25i6d3q8zm.cloudfront.net/browser-plugins/AmazonSearchSuggestionsOSD.Firefox.xml",
                    "LinkedIn" : "http://www.linkedin.com/search/fpsearch"};

    BrowserSearchEngines.getVisible().forEach(function (engine, i, a) {
      var queryURL = decodeURIComponent(engine.getSubmission("{searchTerms}", "{geo:name}"));
      var suggestionURL = decodeURIComponent(engine.getSuggestion("{searchTerms}", "{geo:name}") || "");
      var site = sites[engine.name] || engine.searchForm;
      var type = (matches.indexOf(engine.name) >= 0)? "match" : "suggest";
      var base = (engine.name == "Wikipedia (en)")? "http://en.wikipedia.org/wiki/" : "";

      this.add(SearchEngine(site, engine.name, queryURL, suggestionURL, engine.icon, type, base),
               (tags[engine.name] || [DEFAULT_TAG]).concat(INSTALLED_TAG));

    }.bind(this));

    Geolocation.once("address", function() {
      // Add Yelp to our Search Engines once we have Geolocation
      let engine = SearchEngine("http://www.yelp.com/search.xml",
                                "Yelp",
                                "http://www.yelp.com/search?ns=1&find_desc={searchTerms}&find_loc={geo:name}",
                                "http://www.yelp.com/search_suggest?prefix={searchTerms}&loc={geo:name}",
                                "data:image/x-icon;base64,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AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsQCQEAEhsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsMAQAAAAAMGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbDgAAAAAAAAwbGxsbGxoFCxsbGxsbGxsbGxsbGxsbGxsXAQAAAAAADBsbGxsbBQAACRsbGxsbGxsbGxsbGxsbGxsVAAAAAAAMGxsbGw4AAAAACRsbGxsbGxsbGxsbGxsbGxsPAAAAAAwbGxsYAQAAAAAAEhsbGxsbGxsbGxsbGxsbGxsPAAAADBsbGwcAAAAAAAACGxsbGxsbGxsbGxsbGxsbGxsJAAAMGxsSAAAAAAAAAAMbGxsbGxsbGxsWDBQbGxsbGxsKBhUbGwEAAAAAAgoTGxsbGxsbGxsbGwMAAAEJEhobGxsbGxsbBwACChUbGxsbGxsbGxsbGxsbAAAAAAAAAAcSGxsbGxsbFRcbGxsbGxsbGxsbGxsbGxsAAAAAAAAAAAAbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGwAAAAAAAAAABRsbGxsbFBAYGxsbGxsbGxsbGxsbGxsbAwAAAAABChUbGxsbGxYAAAACBw4WGxsbGxsbGxsbGxsLAAAFDxsbGxsbGxsbFwEAAAAAAAABDBsbGxsbGxsbGxkNERsbGxsbGwsAEhsbDwAAAAAAAAAFGxsbGxsbGxsbGxsbGxsbGxsQAAAHGxsbCwAAAAAAABAbGxsbGxsbGxsbGxsbGxsbGgEAAAUbGxsbAwAAAAAFGxsbGxsbGxsbGxsbGxsbGxsHAAAABRsbGxsXAQAAARcbGxsbGxsbGxsbGxsbGxsbEgAAAAAJGxsbGxsTAAEVGxsbGxsbGxsbGxsbGxsbGxgBAAAAAAwbGxsbGxsVFxsbGxsbGxsbGxsbGxsbGxsbAwAAAAAADBsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGwkAAAAAAAAMGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsOAAAAAAAAAAwbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGwIAAAAAAAAADBsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbFwgBAAAAAAAMGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsRCgQAAREbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxv////////////wf///wH///4B8f/+AfD//wHgf/+BwD//wcA//+GAP+PxgH/gP4P/4A/P/+AP///gD4//4B8A/+D/AD/j8YA//+HAP//B4H//weB//4Hw//8B+f//Af///gH///wB///8Af///AH///+B//////////////////w==",
                                "suggest",
                                "");
      this.add(engine, ["local", DEFAULT_TAG]);
    }.bind(this));
  },

  remove : function remove(engine) {
    delete storage.engines[engine.id];
    this._emit("removed", engine);
  },

  get : function get(id) {
    var engine = storage.engines[id];
    try {
      return SearchEngine(engine.siteURL,
                          engine.name,
                          engine.queryURL,
                          engine.suggestionURL,
                          engine.icon,
                          engine.type,
                          engine.baseURL);
    } catch (e) {
      console.log("get", engine, id);
      return null;
    }
  },

  _set : function set(engine) {
    storage.engines[engine.id] = engine;
  },

  getEnginesByTag : function(tag) {
    tag = (tag)? tag : DEFAULT_TAG;

    if (!this._engines[tag]) {
      var ids = storage.tags[tag];

      // If no IDs in storage, just create an empty array.
      if (ids || !ids.length) {
        this._engines[tag] = [];
      }

      // Convert engine IDs into the engine objects.
      this._engines[tag] = ids.map(function(id) {
        var savedEngine = storage.engines[id];
        return SearchEngine(savedEngine.siteURL,
                            savedEngine.name,
                            savedEngine.queryURL,
                            savedEngine.suggestionURL,
                            savedEngine.icon,
                            savedEngine.type,
                            savedEngine.baseURL);
      });

      if (tag == DEFAULT_TAG) {
        // ensure a sort order of the default so engines remain grouped by tag
        this._engines[tag].sort(function compare(a,b) {
          for (var i = 0; i < this._tag_sort_order.length; i++) {
            var t = this._tag_sort_order[i];
            var aindex = storage.tags[t].indexOf(a.id);
            var bindex = storage.tags[t].indexOf(b.id);
            if (aindex >= 0) {
              if (bindex >=0) {
                return 0;
              }
              return -1;
            } else if (bindex >= 0) {
              return 1;
            }
          }
          return 0;
        }.bind(this));
      }
    }
    return this._engines[tag];
  },

  add : function add(engine, tags) {
    var action = (tags.indexOf(DEFAULT_TAG) >= 0 || tags.indexOf(INSTALLED_TAG) >= 0)? "default" : "add";
    action = (tags.indexOf(FOUND_TAG) > 0)? "collect" : action;

    StatisticsReporter.send(action, engine.toJSON());

    for (var i = 0; i < tags.length; i++) {
      this._updateTags(tags[i], engine);
    }

    // Save this engine to the simple storage according to it's provided ID
    storage.engines[engine.id] = engine;

    this._emit("added", engine);
  },

  _updateTags : function _updateTags(tag, engine) {
      // Remove the cached version, will be regenerated on next getEnginesByTag
      if (this._engines[tag]) {
        delete this._engines[tag];
      }

      if (!storage.tags[tag]) {
        storage.tags[tag] = [];
      }

      //Only add it if it does not already exist.
      var index = storage.tags[tag].indexOf(engine.id);
      if (index === -1) {
        //console.log("pushed", tag, engine.id);
        storage.tags[tag].push(engine.id);
      }
  },

  // Helper function for adding a tag to an engine and to the cache list of engines
  addTagById : function addTagById(tag, id) {
    //console.log("addTagById", tag, id);
    var engine = storage.engines[id];
    this._updateTags(tag, engine);
  },

  // Helper function for removing a tag from an engine and from the cache list of engines
  removeTagById : function removeTagById(tag, id) {
    //console.log("removeTagById", tag, id);

    // Clear the cache, will be regenerated on next call to getEnginesByTag
    if (this._engines[tag]) {
      delete this._engines[tag];
    }

    var index = storage.tags[tag].indexOf(id);
    if (index !== -1) {
      //console.log("removing id from tag", id, tag);
      storage.tags[tag].splice(index, 1);
    }
  },

  search : function search(terms, tags) {
    this._terms = terms;
    tags = (tags)? tags : [DEFAULT_TAG];

    this.suggestionTimer = timers.setTimeout(this._run.bind(this, terms), 300);

    // XXX for now this is really destroying performance so we'll have to disable it
    //this.historyTimer = timers.setTimeout(this._query_history.bind(this, terms), 500);
  },

  /**
   * Listener function for the SearchEnginesCollector module
   *
   * This listener should have been set in the constructor
   *
   * @param   engine       {Object}
   *          an object that represents and engine pulled from the site offering it
   *          See SearchEnginesCollector._parse
   *
   * Existing search engines are updated with new data
   * New search engines are added with the FOUND_TAG
   *
   */
  _collector : function _collector(engine) {
    console.log("_collector", engine, engine.url);
    var se = this.get(engine.url);
    // if this engine already exists lets just update our records for it
    // SECURITY : this should have some kind of security review here
    if (se) {
      // DATA we should be tracking this update to track when sites add suggestions
      if (se.name != engine.name                    ||
          se.queryURL != engine.queryURL            ||
          se.suggestionURL != engine.suggestionURL  ||
          se.icon != engine.icon) {
        console.log(se.name," != ",engine.name, "\n",
          se.queryURL," != ",engine.queryURL, "\n",
          se.suggestionURL," != ",engine.suggestionURL);
        StatisticsReporter.send("update", se.toJSON());
      }

      se.name = engine.name;
      se.queryURL = engine.queryURL;
      se.suggestionURL = engine.suggestionURL;
      se.icon = engine.icon;

      this._set(se);

    } else {
      this.add(SearchEngine(engine.url, engine.name, engine.queryURL, engine.suggestionURL, engine.icon, "suggest", ""),
              [FOUND_TAG]);
    }
  },

  /**
   * Builds query URL given a search engine ID and search terms
   *
   * @param   id       {String} search engine id
   *          terms    {String} search terms
   *
   * @returns {String} The search engines query URL with the terms and (possibly) location encoded
   *
   */
  getSubmission : function (id, terms) {
    var location = Geolocation.formatted_address;
    //console.log("getSubmission", id, this.get(id), terms, location, Geolocation.coords);
    return this.get(id).getSubmission(terms, location);
  },

  // XXX Totally untested
  _overQuota: function _overQuota() {
    //while (SimpleStorage.quotaUsage > 1) {
    //  storage.engines;
    //}
    console.error("_overQuota");
  },

  // Runs the XHR calls to the engines.
  _run : function (terms) {
    // Stop the run before it start if the terms have already changed
    if (this._terms != terms) {
      return;
    }

    var engines = this.getEnginesByTag();
    for (var i = 0; i < engines.length; i++) {
      var engine = engines[i];

      // If our terms are older than the terms set break and quit
      if (this._terms != terms) {
        break;
      }

      // If this engine doesn't support suggestions just skip it
      if (!engine.suggestionURL) {
        //console.log("engine ", engine.name, " has no suggestions");
        continue;
      }

      // TODO: Could collect the xhrs returned from this call and for instance,
      // call abort() on them when the terms change.
      this._query_engine(engine, terms);
    }
  },

  _query_history : function _query_history(terms) {
    var self = this;
    history.search({ sortBy : "frecency", limit : 1, phrase : terms,
                     onComplete : function () {
                                  var result = this.results[0],
                                      matches = [ ],
                                      engine = {
                                                  "id" : "history",
                                                  "name" : "History",
                                                  "type" : "match",
                                                  "icon" : null
                                                  };
                                  if (result) {
                                    if (result.icon) {
                                      engine.icon = result.icon;
                                    }
                                    // XXX do not ship with 100 as the value
                                    // 2000 - 6000 are high values we should consider
                                    if (result.frecency >= 2000) {
                                      matches = [{ "url" :    result.location,
                                                   "title" :  result.title || result.host,
                                                   "host" :   result.host
                                                  }];
                                    }
                                  }
                                  // Emit an empty history result if we come up empty
                                  self._emit("suggestions", engine, terms, matches);
                                 }
                    });
  },

  _query_engine : function _query_engine(engine, terms) {
    var url = engine.getSuggestion(terms, Geolocation.formatted_address);
    return this._xhr(url, function(req) {

      // Our request returned but it's too late and the terms have changed
      if (this._terms != terms) {
        return;
      }

      // ["term", ["suggestions", "of", "matches" ]]
      // ex: ["json",["jsonline","json","json validator","jsonp"]]
      try {
        var results = [],
            translator = translators[engine.id];
        var suggestions =  translator ? translator(req) : JSON.parse(req.responseText)[1];
        //console.log("req.responseText", req.responseText);
        suggestions.forEach(function(item) {
          // Break loop if we have more results than we need
          if (results.length >= SearchEngines.maxResults) {
            return;
          }
          // If the term searched matches the response then ignore it
          if (terms != item) {
            results.push({ "title" : item, "url" : engine.getExactMatch(item) });
          }
        });
        this._emit("suggestions", engine, terms, results);
      } catch (error) { console.error("suggest error: " + error + "\n" + url + "\n"); }
    }.bind(this));
  },

  // Runs an XHR and calls callback with the XHR request that successfully
  // completes.
  _xhr: function (url, callback) {
      var req = new xhr.XMLHttpRequest();
      req.open('GET', url, true);
      req.onreadystatechange = function (aEvt) {
        if (req.readyState == 4) {
          if (req.status == 200) {
            callback(req);
          } else {
            console.error('req.error', req.readyState, req.status, req.statusText, url);
          }
        }
      };
      req.send(null);
      return req;
  },

  unload : function unload(reason) {
    SearchEnginesCollector.removeListener("engine", this._collector);
    SimpleStorage.removeListener("OverQuota", this._overQuota);
  }

})();


exports.SearchEngines = SearchEngines;
exports.SearchEngine = SearchEngine;
