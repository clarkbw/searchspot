/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

/*jshint forin:true, noarg:true, noempty:true, eqeqeq:true, bitwise:true,
  strict:true, undef:true, curly:true, browser:true, es5:true,
  indent:2, maxerr:50, devel:true, node:true, boss:true, white:true,
  globalstrict:true, nomen:false, newcap:true*/

/*global */

"use strict";

var Trait = require('traits').Trait,
    EventEmitter = require("events").EventEmitter,
    SimpleStorage = require("simpler-storage"),
    storage = SimpleStorage.storage,
    ObserverService = require("observer-service"),
    SearchEnginesCollector = require("search-engines-collector")
                              .SearchEnginesCollector,
    StatisticsReporter = require("statistics").StatisticsReporter,
    Geolocation = require("geolocation").Geolocation,
    searchbar = require("searchbar"),
    speculativeConnect = require("utils").speculativeConnect,

    Class = require('sdk/core/heritage').Class,
    eventcore = require('sdk/event/core'),
        on = eventcore.on, once = eventcore.once, off = eventcore.off,
        emit = eventcore.emit,
    target = require('sdk/event/target'),
        EventTarget = target.EventTarget,
    defer = require('sdk/core/promise').defer,

    fixedEncodeURIComponent = require('utils').fixedEncodeURIComponent,
    data = require("self").data,
    URL = require("url"),
    xhr = require("xhr"),
    timers = require("timers");

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

var geoLocationExtRegex = /\{geo:/g;

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
var SearchEngine = Trait.compose({

  constructor: function SearchEngine(siteURL, name, queryURL,
                                     suggestionURL, icon) {
    this._site = URL.URL(siteURL);
    this._name = name;
    this._queryURL = queryURL;
    this._suggestionURL = suggestionURL;
    this._icon = icon;
  },

  _usesGeoLocation : null,
  get usesGeoLocation() {
    if (this._usesGeoLocation === null) {
      this._usesGeoLocation = geoLocationExtRegex.test(this.queryURL) ||
                              geoLocationExtRegex.test(this.suggestionURL);
    }
    return this._usesGeoLocation;
  },

  // use the site URL as our unique ID
  get id() { return this.siteURL; },

  // site is the object reference to the site of the XML origin
  get site() { return this._site; },
  get siteURL() { return this._site.toString(); },

  // host is the root host URL for the site
  get host() { return this.siteURL.replace(this._site.path, ""); },

  // name of the search engine e.g. Google, Amazon.com
  get name() { return this._name; },
  set name(name) { this._name = name; },

  // URL for sending queries e.g. http://www.google.ca/search?q=firefox
  get queryURL() { return this._queryURL; },
  set queryURL(queryURL) { this._queryURL = queryURL; },

  // URL for retrieving suggestions
  // e.g. http://suggestqueries.google.com/complete/search?q=firefox
  get suggestionURL() { return this._suggestionURL; },
  set suggestionURL(suggestionURL) { this._suggestionURL = suggestionURL; },

  // Data URL for the icon of the search engine image
  get icon() { return this._icon; },
  set icon(icon) { this._icon = icon; },

  _getURL : function _getURL(url, terms, geo) {
    return url.replace("{geo:name}", fixedEncodeURIComponent(geo.name))
              .replace("{geo:lat}", fixedEncodeURIComponent(geo.lat))
              .replace("{geo:lon}", fixedEncodeURIComponent(geo.lon))
              .replace("{searchTerms}", fixedEncodeURIComponent(terms));
  },

  getSubmission : function getSubmission(terms, geo) {
    if (!geo) {
      geo = { name : Geolocation.formatted_address,
              lat : Geolocation.latitude,
              lon : Geolocation.longitude
            };
    }
    return this._getURL(this.queryURL, terms, geo);
  },

  getSuggestion : function getSuggestion(terms, geo) {
    if (!geo) {
      geo = { name : Geolocation.formatted_address,
              lat : Geolocation.latitude,
              lon : Geolocation.longitude
            };
    }
    return this._getURL(this.suggestionURL, terms, geo);
  },

  equals : function equals(other) {
    return this.id === other.id;
  },

  toJSON : function toJSON() {
    return { id : this.id,
             name : this.name,
             siteURL : this.siteURL,
             host : this.host,
             queryURL: this.queryURL,
             suggestionURL : this.suggestionURL,
             icon : this.icon
            };
  }
});

var GeoPermissionPanel = require("permission-panel").Panel({
  contentURL: data.url("geolocation.html"),
  contentScriptFile : [data.url("js/jquery.min.js"),
                       data.url("geolocation.js")]
});

GeoPermissionPanel.port.on("resize", function (sizes) {
  var textbox = 300;
  try {
    textbox = searchbar.getSearchTextBox().clientWidth;
  } catch (ignore) { }
  GeoPermissionPanel.resize(Math.max(sizes.width, textbox),
                            Math.max(sizes.height, 50));
});


var SearchEngines = EventEmitter.compose({
  _emit: EventEmitter.required,
  on: EventEmitter.required,

  _debug : function _debug(isDebug) {
    if (isDebug) {
      this.geolocation = true;
    }
  },

  // Cached list of engines
  _engines : null,

  constructor : function SearchEngines() {
    if (!storage.engines) {
      // list of currently used engines according to user order
      storage.engines = this._engines = [];
      // list of found engines according to how often they are seen
      storage.other = [];
      this._first_run();
    } else {
      this._engines = storage.engines.map(function (engine) {
        //console.log("engine", JSON.stringify(engine));
        return this._engineFromJSON(engine);
      }.bind(this));
      //storage.other.forEach(function(e) { console.log(JSON.stringify(e)); });
      this._upgrade();
    }

    this.on("defaults.added", function (engine) {
      StatisticsReporter.send("defaults.added", engine);
    });
    this.on("defaults.removed", function (engine) {
      StatisticsReporter.send("defaults.removed", engine);
    });

    this.on("others.added", function (engine) {
      StatisticsReporter.send("others.added", engine);
    });
    this.on("others.removed", function (engine) {
      StatisticsReporter.send("others.removed", engine);
    });

    ObserverService.add("search:debug", this._debug.bind(this), this);

    SearchEnginesCollector.on("engine", this._collector.bind(this));

    SimpleStorage.on("OverQuota", this._overQuota.bind(this));

    require("unload").ensure(this);
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

    StatisticsReporter.once("allowed", function () {
      // Ask to move Yelp to to the defaults once we've
      // gotten permission to send statistics
      this.defaults.add(this.get("http://www.yelp.com/opensearch"))
                    .then(function (added) {
                      this.defaults.sort(order);
                    }.bind(this));
    }.bind(this));
  },

  get defaults() {
    var self = this;
    return {
      remove : function remove(engine) {
        if (!(engine instanceof SearchEngine)) {
          engine = self._engineFromJSON(engine);
        }
        var index = -1,
            result = null;
        self._engines.every(function (e, i) {
          if (engine.equals(e)) {
            index = i;
            return false;
          }
          return true;
        });
        if (index >= 0) {
          result = self._engines.splice(index, 1)[0];
          if (result) {
            // Save the engine in the other engines
            self.others.add(result);
            // Save our new default engines
            storage.engines = self._engines;
            // send out the removed event
            self._emit("defaults.removed", engine);
          }
        }

        // If we're removing an engine that used geolocation
        // lets double check that we still need it running
        if (engine.usesGeoLocation) {
          Geolocation.allowed = this.usingGeolocation();
        }

        return engine;
      },
      add : function add(engine) {
        if (!(engine instanceof SearchEngine)) {
          engine = self._engineFromJSON(engine);
        }

        var d = defer(),
            promise = d.promise,
            resolve = d.resolve,
            reject = d.reject;

        // if we already have this engine, don't add it again
        if (self._engines.some(function (e) { return engine.equals(e); })) {
          resolve(engine);
          return promise;
        }

        var actuallyAdd = function (engine) {
          // Only add this engine if it doesn't already exist
          if (!self._engines.some(function (e) { return engine.equals(e); })) {
            self._engines.push(engine);
          }

          // Save new default engines to storage
          storage.engines = self._engines;
          // Remove this engine from the others list if it exists
          self.others.remove(engine);
          // Send out the add event
          self._emit("defaults.added", engine);

          resolve(engine);
        };

        if (engine.usesGeoLocation) {

          GeoPermissionPanel.port.once("click", function click(data) {
            searchbar.getSearchTextBox().focus();
            GeoPermissionPanel.hide();
            if (data === "ok") {
              actuallyAdd(engine);
              // If geolocation isn't alredy turned on we can turn it on now
              if (!Geolocation.allowed) {
                Geolocation.allowed = true;
              }
            } else {
              // try to add this to the others list if it doesn't exist
              self.others.add(engine);
              reject(engine);
            }
          });

          // Our permission panel will overrun others who are asking
          GeoPermissionPanel.port.emit("engine", engine);
          GeoPermissionPanel.show(searchbar.getSearchTextBox());
          return promise;

        } else {
          // If this engine doesn't require geolocation just add it
          actuallyAdd(engine);
          return promise;
        }
      },
      get : function get(id) {
        var engine = null;
        self._engines.every(function (e, i) {
          if (e.id === id) {
            engine = e;
            return false;
          }
          return true;
        });
        return engine;
      },
      // Returns the list of all default engines
      get all() { return self._engines; },
      // Examine the ids of our new list order and sort the engines by that
      sort : function sort(newOrder) {
        self._engines.sort(function (a, b) {
          return newOrder.indexOf(a.id) > newOrder.indexOf(b.id);
        });
        // There is a new order in town.  Regulators! Mount Up!
        self._emit("defaults.sorted",
                   self._engines.map(function (engine) { return engine.id; }));
      },
      usingGeolocation : function usingGeolocation() {
        return self._engines.some(function (engine) {
          return engine.usesGeoLocation;
        });
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

        self._emit("others.removed", engine);

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

        self._emit("others.added", engine);

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
                           engine.icon,
                           engine.type);
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
    this._emit("removed", engine);
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

  _update : function _update(engine) {
    if (this._engines.some(function (e, i, a) {
                              if (e.id === engine.id) {
                                e = engine;
                                return true;
                              }
                              return false;
                            }
                          )) {

      storage.engines = this._engines;

      return;
    }

    storage.other.every(function (e, i, a) {
      if (engine.id === e.id) {
        e = engine;
        return false;
      }
      return true;
    });
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
    // SECURITY : this should have some kind of security review here
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

        StatisticsReporter.send("update", engine);

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
    storage.engines = this._engines;
    ObserverService.remove("search:debug", this._debug, this);
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
    this.unload = function unload(reason) {
      if (this.deffered) {
        this.deffered.reject(this.request);
      }
      if (this.request) {
        this.request.abort();
        this.request = null;
      }
    };
    require("unload").ensure(this);
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
    this.request.onreadystatechange = function (aEvt) {
      if (this.request.readyState === 4) {
        if (this.request.status === this.HTTP_OK) {
          this.translate();
        } else {
          console.error('req.error', this.request.readyState,
                        this.request.status,
                        this.request.statusText);
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
        if (this.terms !== item) {
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

  get maxResults() { return this._maxResults; },
  set maxResults(maxResults) {
    var oldMaxResults = this._maxResults;
    this._maxResults = maxResults;
    if (oldMaxResults !== this._maxResults) {
      this._emit_change("maxResults", this._maxResults);
    }
  },

  _debug : function _debug(isDebug) {
    if (isDebug) {
      console.log("debuging");
    }
  },

  _set_engines : function _set_engines() {
    var suggestions = SearchEngines.defaults.all.filter(function (engine) {
      return (typeof engine.suggestionURL !== "undefined" &&
              engine.suggestionURL !== null &&
              engine.suggestionURL !== "");
    });
    // First we unload the existing engines in case they had running queries
    this._engines.forEach(function (engine) {
      engine.unload();
    });
    // Now we map in the new engines
    var manager = this;
    this._engines = suggestions.map(function (engine) {
      return new SearchSugggestEngine(manager, engine);
    });
  },
  _reset_engines : function _reset_engines(engine) {
    var old_engines = this._engines;
    this._set_engines();
    if (old_engines.join(",") !== this._engines.join(",")) {
      this._emit_change("engines", this._engines);
    }
  },

  _warm_up_network : function _warm_up_network() {
    this._engines.forEach(function (engine) {
      engine.warmup();
    });
  },

  // Current search terms cache
  get terms() { return this._terms; },
  set terms(terms) {
    var old_terms = this._terms;
    this._terms = terms;
    if (old_terms !== this._terms) {
      this._emit_change("terms", this._terms);
    }
  },

  get suggestionTimer() { return this._suggestionTimer; },
  set suggestionTimer(suggestionTimer) {
    if (this._suggestionTimer !== null) {
      timers.clearTimeout(this._suggestionTimer);
      this._suggestionTimer = null;
    }
    this._suggestionTimer = suggestionTimer;
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
    if (this._terms !== terms) {
      return;
    }

    // look through our cache of engines that support suggestions
    for (var i = 0, engine; engine = this._engines[i]; i += 1) {

      // If our terms are older than the terms set break and quit
      if (this._terms !== terms) {
        break;
      }
      engine.getSuggestions(terms);
      // TODO: Could collect the xhrs returned from this call and for instance,
      // call abort() on them when the terms change.
      //this.queryEngineSuggestions(engine, terms);
    }
  },

  initialize : function initialize() {
    // initialize internals
    this._maxResults = 3;
    // cache of current search terms
    this._terms = "";
    // timer for pausing requests awaiting term changes
    this._suggestionTimer = null;
    // cache of the default engines with suggestion urls
    this._engines = [];

    this._set_engines();

    SearchEngines.on("defaults.added", this._reset_engines.bind(this));
    SearchEngines.on("defaults.removed", this._reset_engines.bind(this));

    this.on("change:terms", this._warm_up_network.bind(this));
    this.on("change:engines", this._warm_up_network.bind(this));

    ObserverService.add("search:debug", this._debug.bind(this), this);
    this.unload = function unload(reason) {
      ObserverService.remove("search:debug", this._debug, this);
      off(this);
    };
    require("unload").ensure(this);
  }
})();

exports.SearchEngines = SearchEngines;
exports.SearchSuggestManager = SearchSuggestManager;
exports.SearchEngine = SearchEngine;
