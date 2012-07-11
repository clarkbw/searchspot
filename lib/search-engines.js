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

const { Trait } = require('traits'),
      { EventEmitter } = require("events"),

      SimpleStorage = require("simple-storage"),
      storage = SimpleStorage.storage,

      { SearchEnginesCollector } = require("search-engines-collector"),
      { StatisticsReporter } = require("statistics"),
      { Geolocation } = require("geolocation"),

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

  constructor: function SearchEngine(siteURL, name, queryURL, suggestionURL, icon, type) {
    this._site = URL.URL(siteURL);
    this._name = name;
    this._queryURL = queryURL;
    this._suggestionURL = suggestionURL;
    this._icon = icon;
    this._type = type;
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

  toJSON : function toJSON() {
    return { id : this.id,
             name : this.name,
             siteURL : this.siteURL,
             host : this.host,
             type : this.type,
             queryURL: this.queryURL,
             suggestionURL : this.suggestionURL,
             icon : this.icon
            };
  }
});


const SearchEngines = EventEmitter.compose({
  _emit: EventEmitter.required,
  on: EventEmitter.required,

  _maxResults : 3,
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

  debug : function(isDebug) {
    if (isDebug) {
      this.geolocation = true;
    }
  },

  // Cached list of engines
  _engines : null,
  get engines() this._engines,

  get others() storage.other,

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
        return SearchEngine(engine.siteURL,
                            engine.name,
                            engine.queryURL,
                            engine.suggestionURL,
                            engine.icon,
                            engine.type);
      });
      //storage.other.forEach(function(e) { console.log(JSON.stringify(e)); });
    }

    SearchEnginesCollector.on("engine", this._collector.bind(this));

    SimpleStorage.on("OverQuota", this._overQuota.bind(this));

    require("unload").ensure(this);
  },

  // The first run initialization code to pull in some default engines from Firefox
  _first_run : function _first_run() {
    var { BrowserSearchEngines } = require("browser-search-engine");

    // Add in some suggestions for engines we know already work but aren't listed
    BrowserSearchEngines.get("Wikipedia (en)").addSuggest("http://en.wikipedia.org/w/api.php?action=opensearch&search={searchTerms}&namespace=0");
    BrowserSearchEngines.get("Amazon.com").addSuggest("http://completion.amazon.com/search/complete?method=completion&q={searchTerms}&search-alias=aps&client=amzn-search-suggestions/9fe582406fb5106f343a84083d78795713c12d68&mkt=1");

    // Map a default set of tags into our engines
    var index = { "Google"        : 0,
                 "Amazon.com"     : 1,
                 "LinkedIn"       : 2,
                 "Yelp"           : 3,
                 "Wikipedia (en)" : 4
                };

    var linkedin = SearchEngine("http://www.linkedin.com/search/fpsearch",
                                "LinkedIn",
                                "http://www.linkedin.com/search/fpsearch?keywords={searchTerms}",
                                "http://www.linkedin.com/ta/federator?query={searchTerms}&types=mynetwork,company,group,sitefeature,skill",
                                "http://static01.linkedin.com/scds/common/u/img/favicon_v3.ico",
                                "suggest");

    this.add(linkedin, index[linkedin.name], true);

    // Map the engines which are considered "matching" versus the others which provide suggestions
    var matches = [ "Wikipedia (en)" ];

    // Provide a mapping of the OpenSearch descriptor locations to our default engines (which don't have them)
    var sites   = { "Wikipedia (en)" : "http://en.wikipedia.org/w/opensearch_desc.php",
                    "Amazon.com" : "http://d2lo25i6d3q8zm.cloudfront.net/browser-plugins/AmazonSearchSuggestionsOSD.Firefox.xml",
                    "LinkedIn" : "http://www.linkedin.com/search/fpsearch"};

    // This gives Wikipedia a better search query URL than the Search page they use
    var queryURLs = { "Wikipedia (en)" : "http://en.wikipedia.org/wiki/{searchTerms}" };

    BrowserSearchEngines.getVisible().forEach(function (engine, i, a) {
      var queryURL = queryURLs[engine.name] || decodeURIComponent(engine.getSubmission("{searchTerms}"));
      var suggestionURL = decodeURIComponent(engine.getSuggestion("{searchTerms}") || "");
      var site = sites[engine.name] || engine.searchForm;
      var type = (matches.indexOf(engine.name) >= 0)? "match" : "suggest";

      this.add(SearchEngine(site, engine.name, queryURL, suggestionURL, engine.icon, type),
               index[engine.name], (typeof(index[engine.name]) != "undefined")? true : false);

    }, this);

    Geolocation.once("address", function() {
      // Add Yelp to our Search Engines once we have Geolocation
      let engine = SearchEngine("http://www.yelp.com/opensearch",
                                "Yelp",
                                "http://www.yelp.com/search?find_desc={searchTerms}&src=firefox&find_loc={geo:name}",
                                "http://www.yelp.com/search_suggest?prefix={searchTerms}&src=firefox&loc={geo:name}",
                                "http://media2.ak.yelpcdn.com/static/201012161623981098/img/ico/favicon.ico",
                                "suggest");
      this.add(engine, index[engine.name], true);
    }.bind(this));
  },

  _engineFromOther: function _engineFromOther(id) {
    var engine = null, obj = null;
    this.others.every(function(savedEngine, i) {
      if (savedEngine.siteURL == id) {
        engine = this.others.splice(i, 1)[0];
        return false;
      }
      return true;
    }.bind(this));
    obj =  SearchEngine(engine.siteURL,
                        engine.name,
                        engine.queryURL,
                        engine.suggestionURL,
                        engine.icon,
                        engine.type);
    return obj;
  },

  remove : function remove(engine) {
    var index = this._engines.indexOf(engine),
        result = null;
    if (index >= 0) {
      result = this._engines.splice(index, 1);
    } else {
      storage.other.every(function(e, i, a) {
        if (engine.id == e.id) {
          index = i;
          return false;
        }
        return true;
      });
      if (index >= 0) {
        result = storage.other.splice(index, 1);
      }
    }

    this._emit("removed", result);
    return result;
  },

  setDefaults : function setDefaults(defaults) {
    // make a quick copy of the engines array
    var oldEngines = this.engines.map(function(x) {return x;});

    // map the new defaults to the old engines list
    this._engines = defaults.map(function(id, i, a) {
      for (var index = 0; index < this.engines.length; index++) {
        if (this.engines[index].id == id) {
          // null out the engines that are still being used so we can track
          // the old unused engines later
          oldEngines[index] = null;
          return this.engines[index];
        }
      }
      return this._engineFromOther(id);
    }.bind(this));

    // Save
    storage.engines = this._engines;

    // if engines were removed from the list we need to deal with those here
    if (oldEngines.length != this.engines.length) {
      while (oldEngines.length > 0) {
        var e = oldEngines.pop();
        if (e) {
          storage.other.push(e);
        }
      }
    }

  },

  get : function get(id) {
    var index = -1,
        result = null;
    this.engines.every(function(engine, i, a) {
      if (engine.id == id) {
        index = i;
        return false;
      }
      return true;
    });
    // return if we were looking for a default engine
    if (index >= 0) {
      return this.engines[index];
    }

    // otherwise try the slower storage option for a non-default engine
    storage.other.every(function(engine, i, a) {
      if (engine.id == id) {
        // callers should be expecting an object so make it happen
        result = SearchEngine(engine.siteURL,
                              engine.name,
                              engine.queryURL,
                              engine.suggestionURL,
                              engine.icon,
                              engine.type);
        return false;
      }
      return true;
    });
    // return either null or an unused engine
    return result;
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

  add : function add(engine, index, on) {
    var action = "add";
    //console.log(action, engine, index, on);

    // if this engine is supposed to be turned on by default
    if (on) {
      var these = this._engines.indexOf(engine);
      if (these < 0) {
        // insert the engine at the specified index
        this._engines.splice(index, 0, engine);
      } else {
        // move the engine to the specified index
        this._engines.splice(index, 0, this._engines.splice(these, 1)[0]);
      }

      storage.engines = this._engines;

      // double check this engine doesn't exist in the other items
      var other = storage.other.indexOf(engine);
      if (other >= 0) {
        // if so, remove it
        storage.other.splice(storage.other.indexOf(engine), 1);
      }

    } else {
      // throw this non-default engine in the heap with the others
      // but increment it's position if it already exists
      var other = storage.other.indexOf(engine);
      if (other >= 1) {
          // move the engine up on in the array
          storage.other.splice(other - 1, 0, storage.other.splice(other, 1)[0]);
      } else {
        // add this new engine to the list
        storage.other.push(engine);
        action = "collect";
      }
    }

    StatisticsReporter.send(action, engine.toJSON());

    this._emit("added", engine);
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
        // XXX for now don't let search engines update themselves
        // instead we'll send out the fact that they wanted to so we can examine
        // that need from the cloud
        //engine.queryURL = collected.queryURL;
        //engine.suggestionURL = collected.suggestionURL;
        engine.icon = collected.icon;

        collected.id = collected.url = collected.url.toString();
        StatisticsReporter.send("update", collected);

        this._update(engine);
      }
    } else {
      this.add(SearchEngine(collected.url,
                            collected.name,
                            collected.queryURL,
                            collected.suggestionURL,
                            collected.icon,
                            "suggest"));
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
    //console.log("getSubmission", id, this.get(id), terms);
    return this.get(id).getSubmission(terms);
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

    for (var i = 0; i < this.engines.length; i++) {
      var engine = this.engines[i];

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

  _query_engine : function _query_engine(engine, terms) {
    var url = engine.getSuggestion(terms);
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
        suggestions.every(function(item) {
          // Break loop if we have more results than we need
          if (results.length >= SearchEngines.maxResults) {
            return false;
          }
          // If the term searched matches the response then ignore it
          // unless this is a match engine i.e. "wikipedia"
          if (engine.type === "match" || terms != item) {
            results.push({ "title" : item });
          }

          return true;
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
    storage.engines = this._engines;
    SearchEnginesCollector.removeListener("engine", this._collector);
    SimpleStorage.removeListener("OverQuota", this._overQuota);
  }

})();


exports.SearchEngines = SearchEngines;
exports.SearchEngine = SearchEngine;
