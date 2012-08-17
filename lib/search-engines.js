/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const { Trait } = require('traits'),
      { EventEmitter } = require("events"),

      SimpleStorage = require("simpler-storage"),
      storage = SimpleStorage.storage,
      ObserverService = require("observer-service"),

      { SearchEnginesCollector } = require("search-engines-collector"),
      { StatisticsReporter } = require("statistics"),
      { Geolocation } = require("geolocation"),
      { getSearchTextBox } = require("searchbar"),

      { defer, resolve, reject } = require('api-utils/promise'),
      data = require("self").data,
      URL = require("url"),
      xhr = require("xhr"),
      timers = require("timers");

// Some translators for services whose suggestions do not match spec.
const translators = {
  'http://www.yelp.com/opensearch': function (req) {
    var response = null, items = [];
    try {
      response = JSON.parse(req.responseText)["body"];
      response.replace(/\<li\s+title="([^"]+)"/g, function (match, title) {
        // do some simple unescaping, hopefully this is where it ends
        items.push(title.replace("&amp;", "&"));
      });
    } catch (error) { console.error("Yelp translator", error); }
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
        //console.log("ressse", options[j]);
        continue;
      }
    }
    return null;
  }
};

const geoLocationExtRegex = /{geo:/g;

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

  _usesGeoLocation : null,
  get usesGeoLocation() {
    if (this._usesGeoLocation === null) {
      this._usesGeoLocation = geoLocationExtRegex.test(this.queryURL) ||
                              geoLocationExtRegex.test(this.suggestionURL);
    }
    return this._usesGeoLocation;
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

  _getURL : function _getURL(url, terms, geo) {
    return url.replace("{geo:name}",
                       encodeURIComponent(geo.name)).
               replace("{geo:lat}",
                       encodeURIComponent(geo.lat)).
               replace("{geo:lon}",
                       encodeURIComponent(geo.lon)).
               replace("{searchTerms}",
                       encodeURIComponent(terms));
  },

  getSubmission : function getSubmission(terms, geo) {
    if (!geo) {
      geo = { name : Geolocation.formatted_address,
              lat : Geolocation.coords.latitude,
              lon : Geolocation.coords.longitude
            };
    }
    return this._getURL(this.queryURL, terms, geo);
  },

  getSuggestion : function getSuggestion(terms, geo) {
    if (!geo) {
      geo = { name : Geolocation.formatted_address,
              lat : Geolocation.coords.latitude,
              lon : Geolocation.coords.longitude
            };
    }
    return this._getURL(this.suggestionURL, terms, geo);
  },

  equals : function equals(other) {
    return this.id == other.id;
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
  contentScriptFile : [data.url("js/jquery.js"),
                       data.url("geolocation.js")]
});

GeoPermissionPanel.port.on("resize", function(sizes) {
  var textbox = 300;
  try {
    textbox = getSearchTextBox().clientWidth;
  } catch (ignore) { }
  GeoPermissionPanel.resize(Math.max(sizes.width, textbox, 300), Math.max(sizes.height,50));
});


const SearchEngines = EventEmitter.compose({
  _emit: EventEmitter.required,
  on: EventEmitter.required,

  _maxResults : 3,
  get maxResults() this._maxResults,
  set maxResults(maxResults) { this._maxResults = maxResults; },

  _debug : function(isDebug) {
    if (isDebug) {
      this.geolocation = true;
    }
  },

  // Cached list of engines
  _engines : null,

  // Current search terms cache
  _terms : "",

  _suggestionTimer : null,
  get suggestionTimer() { this._suggestionTimer; },

  set suggestionTimer(suggestionTimer) {
    if (this._suggestionTimer !== null) {
      timers.clearTimeout(this._suggestionTimer);
      this._suggestionTimer = null;
    }
    this._suggestionTimer = suggestionTimer;
  },

  constructor : function SearchEngines() {
    if (!storage.engines) {
      // list of currently used engines according to user order
      storage.engines = this._engines = [];
      // list of found engines according to how often they are seen
      storage.other = [];
      this._first_run();
    } else {
      this._engines = storage.engines.map(function(engine) {
        //console.log("engine", JSON.stringify(engine));
        return this._engineFromJSON(engine);
      }.bind(this));
      //storage.other.forEach(function(e) { console.log(JSON.stringify(e)); });
    }

    this.on("defaults.added", function(engine) {  StatisticsReporter.send("defaults.added", engine); });
    this.on("defaults.removed", function(engine) {  StatisticsReporter.send("defaults.removed", engine); });

    this.on("others.added", function(engine) {  StatisticsReporter.send("others.added", engine); });
    this.on("others.removed", function(engine) {  StatisticsReporter.send("others.removed", engine); });

    ObserverService.add("search:debug", this._debug.bind(this), this);

    SearchEnginesCollector.on("engine", this._collector.bind(this));

    SimpleStorage.on("OverQuota", this._overQuota.bind(this));

    require("unload").ensure(this);
  },

  // The first run initialization code to pull in some default engines from Firefox
  _first_run : function _first_run() {
    var { BrowserSearchEngines } = require("browser-search-engine");

    // Add in some suggestions for engines we know already work but aren't listed
    BrowserSearchEngines.get("Amazon.com").addSuggest("http://completion.amazon.com/search/complete?method=completion&search-alias=aps&mkt=1&q={searchTerms}");

    // Our default order of engines as an array of ids
    var order = [
      "https://www.google.com/",
      "http://d2lo25i6d3q8zm.cloudfront.net/browser-plugins/AmazonSearchSuggestionsOSD.Firefox.xml",
      "http://www.yelp.com/opensearch",
      "http://en.wikipedia.org/w/opensearch_desc.php"
    ];

    // Add LinkedIn to the list of other engines
    this.others.add(SearchEngine("http://www.linkedin.com/search/fpsearch",
                                "LinkedIn",
                                "http://www.linkedin.com/search/fpsearch?keywords={searchTerms}",
                                "http://www.linkedin.com/ta/federator?query={searchTerms}&types=mynetwork,company,group,sitefeature,skill",
                                "http://static01.linkedin.com/scds/common/u/img/favicon_v3.ico"));

    // Add Yelp to our list of other engines
    // We'll try to add this to the defaults afterward
    this.others.add(SearchEngine("http://www.yelp.com/opensearch",
                                 "Yelp",
                                 "http://www.yelp.com/search?find_desc={searchTerms}&src=firefox&find_loc={geo:name}",
                                 "http://www.yelp.com/search_suggest?prefix={searchTerms}&src=firefox&loc={geo:name}",
                                 "http://media2.ak.yelpcdn.com/static/201012161623981098/img/ico/favicon.ico"));

    // Provide a mapping of the OpenSearch descriptor locations to our default engines
    // (which either don't have them or are incorrect)
    var sites   = { "Wikipedia (en)" : "http://en.wikipedia.org/w/opensearch_desc.php",
                    "Amazon.com" : "http://d2lo25i6d3q8zm.cloudfront.net/browser-plugins/AmazonSearchSuggestionsOSD.Firefox.xml" };

    BrowserSearchEngines.getVisible().forEach(function (engine) {
      var queryURL = decodeURIComponent(engine.getSubmission("{searchTerms}")),
          suggestionURL = decodeURIComponent(engine.getSuggestion("{searchTerms}") || ""),
          id = sites[engine.name] || engine.searchForm,
          se = SearchEngine(id, engine.name, queryURL, suggestionURL, engine.icon);

      if (order.indexOf(id) >= 0) {
        this.defaults.add(se)
      } else {
        this.others.add(se);
      }
    }, this);

    // set our intial default sort order
    this.defaults.sort(order);

    StatisticsReporter.once("allowed", function() {
      // Ask to move Yelp to to the defaults once we've gotten permission to send statistics
      this.defaults.add(this.get("http://www.yelp.com/opensearch")).
                    then(function(added) {
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
        self._engines.every(function(e, i) {
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

        var { promise, resolve, reject } = defer();

        var actuallyAdd = function(engine) {
          // Only add this engine if it doesn't already exist
          if (!self._engines.some(function(e) { return engine.equals(e); })) {
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
            getSearchTextBox().focus();
            GeoPermissionPanel.hide();
            if (data == "ok") {
              actuallyAdd(engine);
              // If geolocation isn't alredy turned on we can turn it on now
              if (!Geolocation.allowed) {
                Geolocation.allowed = true;
              }
            } else {
              reject(engine);
              console.log("permission denied, try installing the search engine again");
            }
          });

          // By default we'll put this engine in the others list
          // it will get swapped out if the person agrees to the geolocation
            self.others.add(engine);

          // Our permission panel will overrun others who are asking
          GeoPermissionPanel.port.emit("engine", engine);
          GeoPermissionPanel.show(getSearchTextBox());
          return promise;

        } else {
          // If this engine doesn't require geolocation just add it
          actuallyAdd(engine);
          return promise;
        }
      },
      get : function get(id) {
        var engine = null;
        self._engines.every(function(e, i) {
          if (e.id == id) {
            engine = e;
            return false;
          }
          return true;
        });
        return engine;
      },
      // Returns the list of all default engines
      get all() self._engines,
      // Examine the ids of our new list order and sort the engines by that
      sort : function sort(newOrder) {
        self._engines.sort(function(a, b) {
          return newOrder.indexOf(a.id) > newOrder.indexOf(b.id)
        });
      },
      usingGeolocation : function usingGeolocation() {
        return self._engines.some(function(engine) { return engine.usesGeoLocation; });
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

        storage.other.every(function(e, i) {
          if (e.id == engine.id) {
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
        if (!storage.other.some(function(e) { return e.id == engine.id; })) {
          storage.other.push(engine);
        }

        self._emit("others.added", engine);

      },
      get : function get(id) {
        var engine = null;
        storage.other.every(function(e) {
          if (e.id == id) {
            engine = self._engineFromJSON(e);
            return false;
          }
          return true;
        });
        return engine;
      },
      get all() storage.other
    };
  },

  _engineFromJSON : function _engineFromJSON(engine) {
    if (engine == null) { return null; }
    var e = null;
    try {
      e = SearchEngine(engine.id || engine.siteURL,
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
    if (this._engines.some(function(e, i, a) {
                              if (e.id == engine.id) {
                                e = engine;
                                return true;
                              }
                              return false;
                            }
                          )) {

      storage.engines = this._engines;

      return;
    }

    storage.other.every(function(e, i, a) {
      if (engine.id == e.id) {
        e = engine;
        return false;
      }
      return true;
    });
  },

  search : function search(terms) {
    this._terms = terms;
    this.suggestionTimer = timers.setTimeout(this._run.bind(this, terms), 300);
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
      // DATA we should be tracking this update to track when sites add suggestions
      if (engine.name != collected.name                    ||
          engine.queryURL != collected.queryURL            ||
          engine.suggestionURL != collected.suggestionURL  ||
          engine.icon != collected.icon) {

        console.log(engine.name," != ",collected.name, "\n",
                    engine.queryURL," != ",collected.queryURL, "\n",
                    engine.suggestionURL," != ",collected.suggestionURL);

        engine.name = collected.name;
        engine.icon = collected.icon;

        // XXX for now don't let search engines update their URLs, only name and icon
        // instead we'll send out the fact that they wanted to so we can examine
        // that need from the cloud
        //engine.queryURL = collected.queryURL;
        //engine.suggestionURL = collected.suggestionURL;

        StatisticsReporter.send("update", engine);

        this._update(engine);
      }
    } else {
      this.others.add(SearchEngine(collected.url,
                                   collected.name,
                                   collected.queryURL,
                                   collected.suggestionURL,
                                   collected.icon))
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
        storage.engines.pop()
      }
    }
    console.warn("_overQuota");
  },

  // Runs the XHR calls to the engines.
  _run : function (terms) {
    // Stop the run before it start if the terms have already changed
    if (this._terms != terms) {
      return;
    }

    for (var i = 0; i < this.defaults.all.length; i++) {
      var engine = this.defaults.all[i];

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
      this.queryEngineSuggestions(engine, terms);
    }
  },

  queryEngineSuggestions : function _query_engine(engine, terms) {
    var url = engine.getSuggestion(terms);
    return this._xhr(url).then(function(req) {
      //// Our request returned but it's too late and the terms have changed
      //if (this._terms != terms) {
      //  throw new Error("no results");
      //}

      // ["term", ["suggestions", "of", "matches" ]]
      // ex: ["json",["jsonline","json","json validator","jsonp"]]
      try {
        var results = [],
            translator = translators[engine.id];
        var suggestions =  translator ? translator(req) : JSON.parse(req.responseText)[1];
        //console.log("req.responseText", req.responseText);
        suggestions.every(function(item) {
          // Break loop if we have more results than we need
          if (results.length >= SearchEngines.maxResults) {
            return false;
          }
          // If the term searched exactly matches the response then ignore it
          if (terms != item) {
            results.push({ "title" : item });
          }

          return true;
        });

        this._emit("suggestions", engine, terms, results);
        return resolve(results);
      } catch (error) { console.error("suggest error: " + error + "\n" + url + "\n"); }

      throw new Error("no results");

    }.bind(this));
  },

  // Returns an XHR promise with resolved or rejected request objects
  _xhr: function (url) {
      var deferred = defer(),
          req = new xhr.XMLHttpRequest();
      req.open('GET', url, true);
      req.onreadystatechange = function (aEvt) {
        if (req.readyState == 4) {
          if (req.status == 200) {
            deferred.resolve(req);
          } else {
            console.error('req.error', req.readyState, req.status, req.statusText, url);
            deferred.reject(req);
          }
        }
      };
      req.send(null);
      return deferred.promise;
  },

  unload : function unload(reason) {
    storage.engines = this._engines;
    ObserverService.remove("search:debug", this._debug, this);
    SearchEnginesCollector.removeListener("engine", this._collector);
    SimpleStorage.removeListener("OverQuota", this._overQuota);
  }

})();

exports.SearchEngines = SearchEngines;
exports.SearchEngine = SearchEngine;
