/*! This Source Code Form is subject to the terms of the Mozilla Public
* License, v. 2.0. If a copy of the MPL was not distributed with this
* file, You can obtain one at http://mozilla.org/MPL/2.0/.
*/

/*jshint forin:true, noarg:true, noempty:true, eqeqeq:true, bitwise:true,
  strict:true, undef:true, curly:true, browser:true, esnext:true,
  indent:2, maxerr:50, devel:true, node:true, boss:true, white:true,
  globalstrict:true, nomen:false, newcap:false*/

/*global */

"use strict";

var Class = require('sdk/core/heritage').Class,
    eventcore = require('sdk/event/core'),
        off = eventcore.off,
        emit = eventcore.emit,
    EventTarget = require('sdk/event/target').EventTarget,
    defer = require('sdk/core/promise').defer,
    ns = require('sdk/core/namespace').ns,
    URL = require('sdk/url').URL,
    xhr = require('sdk/net/xhr'),
    timers = require('sdk/timers'),
    SimpleStorage = require('sdk/simple-storage'),
      storage = SimpleStorage.storage,

    SearchEnginesCollector = require("search-engines-collector")
                              .SearchEnginesCollector,
    Geolocation = require("geolocation").Geolocation,
    Geocode = require('geocode').Geocode,
    speculativeConnect = require("utils").speculativeConnect,
    fixedEncodeURIComponent = require('utils').fixedEncodeURIComponent,
    urlUsesGeolocation = require('utils').urlUsesGeolocation;

var namespace = ns();

// Some translators for services whose suggestions do not match spec.
var translators = {
  'http://www.yelp.com/opensearch': function (req) {
    try {
      return JSON.parse(req.responseText).suggestions;
    } catch (error) { console.error("Yelp translator", error); }
    return [];
  },
  "http://www.linkedin.com/search/fpsearch" : function (req) {
    var response = null,
        options = ["mynetwork", "company", "group", "sitefeature", "skill"],
        items = [];
    var res = JSON.parse(req.responseText);
    if (res) {
      for (var j = 0, option; option = options[j]; j += 1) {
        if (option in res) {
          response = res[option].resultList;
          for (var i = 0, result; result = response[i]; i += 1) {
            items.push(result.displayName);
          }
        } else {
          continue;
        }
      }
      return items;
    }
    return [];
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
var SearchEngine = Class({
  type : 'SearchEngine',

  initialize: function initialize(siteURL, name, queryURL, suggestionURL, icon) {
    var privateAPI = namespace(this);
    privateAPI.site = new URL(siteURL);
    privateAPI.name = name;
    privateAPI.queryURL = queryURL;
    privateAPI.suggestionURL = suggestionURL;
    privateAPI.icon = icon;
    privateAPI.usesGeoLocation = null;
  },

  get usesGeoLocation() {
    if (namespace(this).usesGeoLocation === null) {
      namespace(this).usesGeoLocation = urlUsesGeolocation(this.queryURL) ||
                                        urlUsesGeolocation(this.suggestionURL);
    }
    return namespace(this).usesGeoLocation;
  },

  // use the site URL as our unique ID
  get id() { return this.siteURL; },

  // site is the object reference to the site of the XML origin
  get site() { return namespace(this).site; },
  get siteURL() { return this.site.toString(); },

  // host is the root host URL for the site
  get host() { return this.siteURL.replace(this.site.path, ""); },

  // name of the search engine e.g. Google, Amazon.com
  get name() { return namespace(this).name; },
  set name(name) { namespace(this).name = name; },

  // URL for sending queries e.g. http://www.google.ca/search?q=firefox
  get queryURL() { return namespace(this).queryURL; },
  set queryURL(queryURL) { namespace(this).queryURL = queryURL; },

  // URL for retrieving suggestions
  // e.g. http://suggestqueries.google.com/complete/search?q=firefox
  get suggestionURL() { return namespace(this).suggestionURL; },
  set suggestionURL(suggestionURL) { namespace(this).suggestionURL = suggestionURL; },

  // Data URL for the icon of the search engine image
  get icon() { return namespace(this).icon; },
  set icon(icon) { namespace(this).icon = icon; },

  _getURL : function _getURL(url, terms) {
    var postal_code = Geocode.getAddressByType('postal_code'),
        name = (postal_code) ? postal_code.formatted_address : "",
        lat = Geolocation.latitude,
        lon = Geolocation.longitude;
    return url.replace("{geo:name}", fixedEncodeURIComponent(name))
              .replace("{geo:lat}", fixedEncodeURIComponent(lat))
              .replace("{geo:lon}", fixedEncodeURIComponent(lon))
              .replace("{searchTerms}", fixedEncodeURIComponent(terms));
  },

  getSubmission : function getSubmission(terms) {
    return this._getURL(this.queryURL, terms);
  },

  getSuggestion : function getSuggestion(terms) {
    return this._getURL(this.suggestionURL, terms);
  },

  equals : function equals(other) {
    return this.id === other.id;
  },

  toJSON : function toJSON() {
    return { id : this.id,
             name : this.name,
             siteURL : this.siteURL,
             queryURL: this.queryURL,
             suggestionURL : this.suggestionURL,
             icon : this.icon
            };
  }
});

var SearchEngines = Class({
  extends : EventTarget,
  type : 'SearchEngineManager',

  initialize : function initialize() {
    var privateAPI = namespace(this);

    // Cached list of engines
    privateAPI.engines = [];

    if (!storage.engines) {
      // list of currently used engines according to user order
      storage.engines = privateAPI.engines = [];
      // list of found engines according to how often they are seen
      storage.other = [];
      this._first_run();
    } else {
      privateAPI.engines = storage.engines.map(function (engine) {
        //console.log("engine", JSON.stringify(engine));
        return this._engineFromJSON(engine);
      }.bind(this));
      //storage.other.forEach(function(e) { console.log(JSON.stringify(e)); });
      this._upgrade();
    }

    SearchEnginesCollector.on("engine", this._collector.bind(this));

    SimpleStorage.on("OverQuota", this._overQuota.bind(this));

    require('sdk/system/unload').ensure(this);
  },

  // this is designed to run after the add-on has reinitialized and there are
  // some slight data issues we need to deal with
  _upgrade : function _upgrade() {
    var yelp = this.get("http://www.yelp.com/opensearch");
    if (yelp.suggestionURL !== "http://www.yelp.com/search_suggest/json?prefix={searchTerms}&src=firefox&loc={geo:name}") {
      yelp.suggestionURL = "http://www.yelp.com/search_suggest/json?prefix={searchTerms}&src=firefox&loc={geo:name}";
      this._update(yelp);
    }
  },
  // The first run initialization to pull in some default engines from Firefox
  _first_run : function _first_run() {
    var BrowserSearchEngines = require("browser-search-engine")
                              .BrowserSearchEngines;

    // Add in some suggestions for engines we know work but aren't listed
    BrowserSearchEngines.get("Amazon.com").addSuggest("http://completion.amazon.com/search/complete?method=completion&search-alias=aps&mkt=1&q={searchTerms}");

    // Our default order of engines as an array of ids
    var order = [
      "https://www.google.com/",
      "http://d2lo25i6d3q8zm.cloudfront.net/browser-plugins/AmazonSearchSuggestionsOSD.Firefox.xml",
      "http://www.yelp.com/opensearch",
      "http://en.wikipedia.org/w/opensearch_desc.php"
    ];

    // Add LinkedIn to the list of other engines
    this.others.add(new SearchEngine("http://www.linkedin.com/search/fpsearch",
                                     "LinkedIn",
                                     "http://www.linkedin.com/search/fpsearch?keywords={searchTerms}",
                                     "http://www.linkedin.com/ta/federator?query={searchTerms}&types=mynetwork,company,group,sitefeature,skill",
                                     "http://static01.linkedin.com/scds/common/u/img/favicon_v3.ico"));

    // Add Yelp to our list of other engines
    // We'll try to add this to the defaults afterward
    this.others.add(new SearchEngine("http://www.yelp.com/opensearch",
                                     "Yelp",
                                     "http://www.yelp.com/search?find_desc={searchTerms}&src=firefox&find_loc={geo:name}",
                                     "http://www.yelp.com/search_suggest/json?prefix={searchTerms}&src=firefox&loc={geo:name}",
                                     "http://media2.ak.yelpcdn.com/static/201012161623981098/img/ico/favicon.ico"));

    // Provide a mapping of the OpenSearch descriptors to our default engines
    // (which either don't have them or are incorrect)
    var sites   = {
      "Wikipedia (en)" : "http://en.wikipedia.org/w/opensearch_desc.php",
      "Amazon.com" : "http://d2lo25i6d3q8zm.cloudfront.net/browser-plugins/AmazonSearchSuggestionsOSD.Firefox.xml"
    };

    BrowserSearchEngines.getVisible().forEach(function (engine) {
      var queryURL = decodeURIComponent(engine.getSubmission("{searchTerms}")),
          suggestionURL = decodeURIComponent(engine.getSuggestion("{searchTerms}") || ""),
          id = sites[engine.name] || engine.searchForm,
          se = new SearchEngine(id, engine.name, queryURL,
                            suggestionURL, engine.icon);

      if (order.indexOf(id) >= 0) {
        this.defaults.add(se);
      } else {
        this.others.add(se);
      }
    }, this);

    // set our intial default sort order
    this.defaults.sort(order);

  },

  get defaults() {
    var self = this,
        privateAPI = namespace(this);
    return {
      remove : function remove(engine) {
        if (!(engine instanceof SearchEngine)) {
          engine = self._engineFromJSON(engine);
        }
        var index = -1,
            result = null;
        privateAPI.engines.every(function (e, i) {
          if (engine.equals(e)) {
            index = i;
            return false;
          }
          return true;
        });
        if (index >= 0) {
          result = privateAPI.engines.splice(index, 1)[0];
          if (result) {
            // Save the engine in the other engines
            self.others.add(result);
            // Save our new default engines
            this.save();
            // send out the removed event
            emit(self, "defaults.removed", engine);
          }
        }

        // If we're removing an engine that used geolocation
        // lets double check that we still need it running
        if (engine.usesGeoLocation) {
          Geolocation.allowed = this.usingGeolocation();
          if (Geolocation.allowed) {
            Geolocation.watchPosition();
          }
        }

        return engine;
      },
      add : function add(engine) {
        if (!(engine instanceof SearchEngine)) {
          engine = self._engineFromJSON(engine);
        }

        // if we already have this engine, don't add it again
        if (privateAPI.engines.some(function (e) { return engine.equals(e); })) {
          return engine;
        }

        // Add the engine
        privateAPI.engines.push(engine);
        // Save the defaults
        this.save();
        // Remove this engine from the others list if it exists
        self.others.remove(engine);
        // Send out the add event
        emit(self, "defaults.added", engine);

        // If we're adding an engine that used geolocation
        // lets turn on the geolocation module
        if (engine.usesGeoLocation) {
          Geolocation.allowed = this.usingGeolocation();
          if (Geolocation.allowed) {
            Geolocation.watchPosition();
          }
        }

        return engine;
      },
      get : function get(id) {
        var engine = null;
        privateAPI.engines.every(function (e) {
          if (e.id === id) {
            engine = e;
            return false;
          }
          return true;
        });
        return engine;
      },
      // Returns the list of all default engines
      get all() { return privateAPI.engines; },
      // Examine the ids of our new list order and sort the engines by that
      sort : function sort(newOrder) {
        privateAPI.engines.sort(function (a, b) {
          return newOrder.indexOf(a.id) > newOrder.indexOf(b.id);
        });
        // There is a new order in town.  Regulators! Mount Up!
        emit(self, "defaults.sorted",
                   privateAPI.engines.map(function (engine) { return engine.id; }));
      },
      usingGeolocation : function usingGeolocation() {
        return privateAPI.engines.some(function (engine) {
          return engine.usesGeoLocation;
        });
      },
      save : function save() {
        // Save new default engines to storage
        storage.engines = privateAPI.engines;
      }
    };
  },

  // Others doesn't check that items are in the default list
  get others() {
    var self = this;
    return {
      remove : function remove(engine) {
        if (!(engine instanceof SearchEngine)) {
          engine = self._engineFromJSON(engine);
        }

        storage.other.every(function (e, i) {
          if (e.id === engine.id) {
            // remove the engine from our others list
            storage.other.splice(i, 1);
            return false;
          }
          return true;
        });

        emit(self, "others.removed", engine);

        return engine;
      },
      add : function add(engine) {
        if (!(engine instanceof SearchEngine)) {
          engine = self._engineFromJSON(engine);
        }

        // Only add this engine if it doesn't already exist
        if (!storage.other.some(function (e) { return e.id === engine.id; })) {
          storage.other.push(engine);
        }

        emit(self, "others.added", engine);

        return engine;
      },
      get : function get(id) {
        var engine = null;
        storage.other.every(function (e) {
          if (e.id === id) {
            engine = self._engineFromJSON(e);
            return false;
          }
          return true;
        });
        return engine;
      },
      get all() { return storage.other; }
    };
  },

  _engineFromJSON : function _engineFromJSON(engine) {
    if (engine === null) { return null; }
    var e = null;
    try {
      e = new SearchEngine(engine.id,
                           engine.name,
                           engine.queryURL,
                           engine.suggestionURL,
                           engine.icon);
    } catch (ex) {
      console.error(ex);
      console.log("ENGINE:", JSON.stringify(engine));
    }
    return e;
  },

  // Delete an engine from defaults and others
  remove : function remove(engine) {
    this.defaults.remove(engine);
    this.others.remove(engine);
    emit(this, "removed", engine);
    return engine;
  },

  // Get an engine no matter what list it's in
  get : function get(id) {
    var result = null;
    result = this.defaults.get(id);
    if (result) {
      return result;
    }
    return this.others.get(id);
  },

  // Search both defaults and others list for the engine
  // update the engine with the new definition
  _update : function _update(engine) {
    // Search the default list first
    if (namespace(this).engines.some(function (e) {
                              if (e.id === engine.id) {
                                e = engine;
                                return true;
                              }
                              return false;
                            }
                          )) {

      this.defaults.save();

      // Jump out of this function since we found it in our
      // in-memory defaults list
      return;
    }

    // Search others list of engines to update the engine there
    storage.other.every(function (e) {
      if (engine.id === e.id) {
        e = engine;
        return false;
      }
      return true;
    });

    // XXX we don't check that the engine wasn't found at all
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
  _collector : function _collector(collected) {
    var engine = this.get(collected.url.toString());
    //console.log("_collector", collected.url);
    // if this engine already exists lets just update our records for it
    // XXX : this should have some kind of security review here
    if (engine) {
      // DATA should be tracking this update to track when sites add suggestions
      if (engine.name !== collected.name                    ||
          engine.queryURL !== collected.queryURL            ||
          engine.suggestionURL !== collected.suggestionURL  ||
          engine.icon !== collected.icon) {

        //console.log(engine.name," != ",collected.name, "\n",
        //            engine.queryURL," != ",collected.queryURL, "\n",
        //            engine.suggestionURL," != ",collected.suggestionURL);

        engine.name = collected.name;
        engine.icon = collected.icon;

        // XXX for now don't let search engines update their URLs,
        // only name and icon
        // we'll send out the fact that they wanted to so we can examine
        // that need from the cloud
        //engine.queryURL = collected.queryURL;
        //engine.suggestionURL = collected.suggestionURL;

        this._update(engine);
      }
    } else {
      this.others.add(new SearchEngine(collected.url,
                                       collected.name,
                                       collected.queryURL,
                                       collected.suggestionURL,
                                       collected.icon));
    }
  },

  // XXX Totally untested
  _overQuota: function _overQuota() {
    while (SimpleStorage.quotaUsage > 1) {
      // remove all the items from other starting with the least seen ones
      if (storage.other.length > 0) {
        storage.other.pop();
      } else {
        // if we don't have any other items left remove used engines
        storage.engines.pop();
      }
    }
    console.warn("_overQuota");
  },

  unload : function unload(reason) {
    if (reason === "disable") {
      delete storage.engines;
      delete storage.other;
    } else {
      storage.engines = namespace(this).engines;
    }
    SearchEnginesCollector.removeListener("engine", this._collector);
    SimpleStorage.removeListener("OverQuota", this._overQuota);
  }

})();

// Internal class for handling the querying of suggestions
// This holds a Search Engine but will handle all the guts of backoff and
// retry semantics when gathering suggestions
var SearchSugggestEngine = Class({
  // Our ok value for suggestions
  HTTP_OK                    : 200,
  // These are for future use in tracking backoff errors
  HTTP_INTERNAL_SERVER_ERROR : 500,
  HTTP_BAD_GATEWAY           : 502,
  HTTP_SERVICE_UNAVAILABLE   : 503,

  initialize: function initialize(manager, engine) {
    this.manager = manager;
    this.engine = engine;
    this.request = new xhr.XMLHttpRequest();
    this.translator = translators[this.engine.id];
    this.last_warmup = 0;
    require('sdk/system/unload').ensure(this);
  },
  type: 'SearchSugggestEngine',
  getSuggestions : function getSuggestions(terms) {
    // if someone was waiting on a promise let them know to stop waiting
    if (this.deferred) {
      this.deferred.reject(this.request);
    }
    this.deferred = defer();
    this.terms = terms;
    // repeated calls to open will equal an abort() on any running requests
    this.request.open('GET', this.engine.getSuggestion(terms), true);
    this.request.onreadystatechange = function () {
      if (this.request.readyState === 4) {
        if (this.request.status === this.HTTP_OK) {
          this.translate();
        } else {
          //console.error('req.error', this.request.readyState,
          //              this.request.status,
          //              this.request.statusText);
          this.deferred.reject(this.request);
        }
      }
    }.bind(this);
    this.request.send(null);

    return this.deferred.promise;
  },
  translate : function translate() {
    try {
      var results = [];
      var suggestions =  this.translator ? this.translator(this.request) :
                                      JSON.parse(this.request.responseText)[1];
      //console.log("req.responseText", req.responseText);
      suggestions.every(function (item) {
        // Break loop if we have more results than we need
        if (results.length >= this.manager.maxResults) {
          return false;
        }
        // If the term searched exactly matches the response then ignore it
        // (even a case mismatch)
        if (this.terms.toLowerCase() !== item.toLowerCase()) {
          results.push(item);
        }

        return true;
      }.bind(this));

      emit(this.manager, "suggestions", this.engine, this.terms, results);
      this.deferred.resolve(results);

    } catch (error) {
      console.error("suggest error: " + error + "\n");
    }
    this.deferred.reject();
  },
  // use nsISpeculativeConnect to get the network connections ready
  // to make our queries fast
  warmup : function warmup() {
    var now = Date.now();
    // only warm up every 10 seconds max
    if (this.last_warm_up < now - 10 * 1000) {
      return;
    }
    speculativeConnect(this.engine.getSubmission("firefox"));
    speculativeConnect(this.engine.getSuggestion("firefox"));
    // set this to the latest value possible instead of just using `now`
    this.last_warm_up = Date.now();
  },
  // This is only used for comparison
  toString : function toString() {
    return this.engine.id;
  },
  unload : function unload() {
    if (this.deffered) {
      this.deffered.reject(this.request);
    }
    if (this.request) {
      this.request.abort();
      this.request = null;
    }
  }
});

/**
 * SearchSuggestManager makes the calls to retrieve suggestions for the default
 * engines.  It also caches the results such that you can query it for
 * statistics on any suggestion query.
 */
var SearchSuggestManager = Class({
  extends : EventTarget,

  _emit_change : function _emit_change(attr, args) {
    emit(this, "change:" + attr, args);
  },

  get maxResults() { return namespace(this).maxResults; },
  set maxResults(maxResults) {
    var oldMaxResults = this.maxResults;
    namespace(this).maxResults = maxResults;
    if (oldMaxResults !== namespace(this).maxResults) {
      this._emit_change("maxResults", namespace(this).maxResults);
    }
  },

  _set_engines : function _set_engines() {
    var suggestions = SearchEngines.defaults.all.filter(function (engine) {
      return (typeof engine.suggestionURL !== "undefined" &&
              engine.suggestionURL !== null &&
              engine.suggestionURL !== "");
    });
    // First we unload the existing engines in case they had running queries
    namespace(this).engines.forEach(function (engine) {
      engine.unload();
    });
    // Now we map in the new engines
    var manager = this;
    namespace(this).engines = suggestions.map(function (engine) {
      return new SearchSugggestEngine(manager, engine);
    });
  },
  _reset_engines : function _reset_engines() {
    var old_engines = namespace(this).engines;
    this._set_engines();
    if (old_engines.join(",") !== namespace(this).engines.join(",")) {
      this._emit_change("engines", namespace(this).engines);
    }
  },

  _warm_up_network : function _warm_up_network() {
    namespace(this).engines.forEach(function (engine) {
      engine.warmup();
    });
  },

  // Current search terms cache
  get terms() { return namespace(this).terms; },
  set terms(terms) {
    var old_terms = this.terms;
    namespace(this).terms = terms;
    if (old_terms !== namespace(this).terms) {
      this._emit_change("terms", namespace(this).terms);
    }
  },

  get suggestionTimer() { return namespace(this).suggestionTimer; },
  set suggestionTimer(suggestionTimer) {
    if (namespace(this).suggestionTimer !== null) {
      timers.clearTimeout(namespace(this).suggestionTimer);
      namespace(this).suggestionTimer = null;
    }
    namespace(this).suggestionTimer = suggestionTimer;
  },

  search : function search(terms) {
    this.terms = terms;
    // start the suggestion engine on a timeout in case the person is actively
    // typing we want to cancel our run and allow them to type more
    this.suggestionTimer = timers.setTimeout(this._run.bind(this, terms), 300);
  },

  // calls the engines to run their queries
  _run : function (terms) {
    // Stop the run before it start if the terms have already changed
    if (this.terms !== terms) {
      return;
    }

    // look through our cache of engines that support suggestions
    for (var i = 0, engine; engine = namespace(this).engines[i]; i += 1) {

      // If our terms are older than the terms set break and quit
      if (this.terms !== terms) {
        break;
      }
      engine.getSuggestions(terms);
    }
  },

  initialize : function initialize() {
    var privateAPI = namespace(this);
    // initialize internals
    privateAPI.maxResults = 3;
    // cache of current search terms
    privateAPI.terms = "";
    // timer for pausing requests awaiting term changes
    privateAPI.suggestionTimer = null;
    // cache of the default engines with suggestion urls
    privateAPI.engines = [];

    this._set_engines();

    SearchEngines.on("defaults.added", this._reset_engines.bind(this));
    SearchEngines.on("defaults.removed", this._reset_engines.bind(this));

    this.on("change:terms", this._warm_up_network.bind(this));
    this.on("change:engines", this._warm_up_network.bind(this));

    require('sdk/system/unload').ensure(this);
  },
  unload : function unload() {
    off(this);
  }
})();

exports.SearchEngines = SearchEngines;
exports.SearchSuggestManager = SearchSuggestManager;
exports.SearchEngine = SearchEngine;
