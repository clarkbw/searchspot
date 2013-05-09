/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

/*jshint forin:true, noarg:true, noempty:true, eqeqeq:true, bitwise:true,
  strict:true, undef:true, curly:true, browser:true, es5:true,
  indent:2, maxerr:50, devel:true, node:true, boss:true, white:true,
  globalstrict:true, nomen:false, newcap:true*/

/*global */

"use strict";

var chrome = require('chrome');

var Class = require('sdk/core/heritage').Class,
    eventcore = require('sdk/event/core'),
        off = eventcore.off,
        emit = eventcore.emit,
    EventTarget = require('sdk/event/target').EventTarget,
    SystemEvents = require('sdk/system/events'),
    ns = require('sdk/core/namespace').ns;

var URLTYPE_SEARCH_HTML = exports.URLTYPE_SEARCH_HTML = "text/html",
    URLTYPE_SUGGEST_JSON = exports.URLTYPE_SUGGEST_JSON = "application/x-suggestions+json";

var SearchService = chrome.Cc["@mozilla.org/browser/search-service;1"]
                          .getService(chrome.Ci.nsIBrowserSearchService);

var namespace = ns();

// Mapping Search Engine Names to their Suggest URLs
var SuggestMap = {};

/**
 * This is a module for working with the system nsIBrowserSearchService
 *
 * It emits several events for monitoring the state of the current search
 * engines available
 *
 * @event 'changed' is emitted when an engine is removed, added, or the current is changed
 * @event 'removed' is emitted when an engine is removed
 * @event 'added' is emitted when an engine is added
 *
 * @example
 *  BrowserSearchEngines.once("changed", function(engine) {
 *    console.log('got a change event from engine ' + engine.name);
 *  });
 *
 * @see https://developer.mozilla.org/en-US/docs/XPCOM_Interface_Reference/nsIBrowserSearchService
 */
var BrowserSearchEngines = Class({
  extends : EventTarget,
  type : 'BrowserSearchEngines',

  /**
   * Returns the currently active (and visible) search engine
   * May return null if there are no visible search engines
   */
  get currentEngine() {
    if (SearchService.currentEngine !== null) {
      return new SearchEngine(SearchService.currentEngine);
    }
    return null;
  },
  /*
   * Sets the currently active search engine, expects a {SearchEngine} object
   */
  set currentEngine(engine) {
    SearchService.currentEngine = engine.nsISearchEngine;
  },

  /**
   * Returns the default search engine.
   * May return the first visible engine if the default engine is hidden
   * Will return null if there are no visible engines
   */
  get defaultEngine() {
    if (SearchService.defaultEngine !== null) {
      return new SearchEngine(SearchService.defaultEngine);
    }
    return null;
  },

  /**
   * Returns the original default search engine, not necessarily the user set default engine
   * Will always return an engine even if it is not visible
   */
  get originalDefaultEngine() {
    return new SearchEngine(SearchService.originalDefaultEngine);
  },

  initialize : function initialize() {
    SystemEvents.on("browser-search-engine-modified", this._observer.bind(this), true);
    require("unload").ensure(this);
  },

  /**
   * Adds an engine to the Browser list of OpenSearch engines available
   *
   * Engine objects passed to this method are required to have a `name` and `url`.
   * The `method` attribute will be assumed "get" if not specified, the other option is "post"
   * Optional additional attributes are `icon`, `alias`, `description`, and `suggest`
   *
   * @example
   *  BrowserSearchEngines.add({ name : 'DuckDuckGo', url : 'https://duckduckgo.com/?q={searchTerms}'});
   *
   * @param {Object} engine a hash object that represents an engine
   */
  add : function add(engine) {
    SearchService.addEngineWithDetails(engine.name, engine.icon,
                                       engine.alias, engine.description,
                                       engine.method || "get", engine.url);
    if (engine.suggest) {
      this.get(engine.name).addSuggest(engine.suggest);
    }
  },

  /**
   * Removes (or hides) an engine from the Browser list of OpenSearch engines
   *
   * Engines which are installed by default will only be "hidden" and not actually removed
   * User installed engines will be removed from the system via this method
   *
   * @example
   *  BrowserSearchEngines.remove(engine);
   *
   * @param {SearchEngine} engine The search engine object
   */
  remove : function remove(engine) {
    SearchService.removeEngine(engine.nsISearchEngine);
    delete SuggestMap[engine.name];
  },

  /**
   * Returns a search engine by its name or alias
   *
   * Will return null if no engine of that name or alias is found
   *
   * @example
   *  BrowserSearchEngines.get('Google');
   *
   * @param {String} name Name or alias of the search engine
   */
  get : function get(name) {
    var engine = SearchService.getEngineByName(name) || SearchService.getEngineByAlias(name);
    if (engine) {
      return new SearchEngine(engine);
    }
    return null;
  },

  /**
   * Returns an Array of the default SearchEngine objects
   *
   * Default engines may not all be visible
   *
   * @example
   *  BrowserSearchEngines.getDefaults();
   *
   * @returns {Array} of {SearchEngine} objects
   */
  getDefaults : function getDefaults() {
    return SearchService.getDefaultEngines().map(function (e) {
      return new SearchEngine(e);
    });
  },

  /**
   * Returns an Array of the currently visible SearchEngine objects
   *
   * This is the most commonly used function for accessing a users engines
   *
   * @example
   *  BrowserSearchEngines.getVisible();
   *
   * @returns {Array} of {SearchEngine} objects
   */
  getVisible : function getVisible() {
    return SearchService.getVisibleEngines().map(function (e) {
      return new SearchEngine(e);
    });
  },

  _observer : function _observer(event) {
    var subject = event.data,
        engine = new SearchEngine(event.subject); // data = nsISearchEngine

    // This is the removal of a non-default installed engine, defaults are "changed"
    if ("engine-removed" === subject) {
      emit(this, "removed", engine);
      emit(this, "changed", engine);

    // This is the removal of a non-default installed engine, defaults are "changed"
    } else if ("engine-added" === subject) {
      emit(this, "added", engine);
      emit(this, "changed", engine);

    // This is a grab bag of possible events from edits to removal depending on the type of engine
    } else if ("engine-changed" === subject) {

      // removing a default engine only actually hides it, they are not removed
      // which is why we've given a 'changed' event instead of a 'remove'
      if (engine.hidden) {
        emit(this, "removed", engine);
      }

      // This event could just be about the order of the engines changing
      emit(this, "changed", engine);

    // This sets the current engine in use
    } else if ("engine-current" === subject) {
      emit(this, "current", engine);
      emit(this, "changed", engine);
    }
  },

  unload : function unload(reason) {
    SystemEvents.off("browser-search-engine-modified", this._observer);
    off(this);
  }

})();

/**
 * This is an object that maps to the nsISearchEngine system object.
 *
 * This object is mostly used for the getSubmission() function which
 * converts search terms into a URL that can be loaded to get to a search
 * results page for that search engine.
 *
 * @example
 *  SearchEngine.getSubmission("puppies');
 *
 * @see https://developer.mozilla.org/en-US/docs/XPCOM_Interface_Reference/nsISearchEngine
 */
var SearchEngine = Class({

  /**
   * @returns {Boolean} if this Search Engine is the currently active engine
   */
  get isCurrent() {
    return BrowserSearchEngines.currentEngine.isEqualTo(this);
  },

  /**
   * @returns {Boolean} if this Search Engine is the current default engine selected
   */
  get isDefault() {
    return BrowserSearchEngines.defaultEngine.isEqualTo(this);
  },

  get nsISearchEngine() { return namespace(this).engine; },

  initialize : function initialize(nsISearchEngine) {
    namespace(this).engine = nsISearchEngine.QueryInterface(chrome.Ci.nsISearchEngine);
  },

  get alias() { return namespace(this).engine.alias; },
  get description() { return namespace(this).engine.description; },
  get hidden() { return namespace(this).engine.hidden; },
  get iconURI() { return namespace(this).engine.iconURI; },
  get icon() {
    return (namespace(this).engine.iconURI) ? namespace(this).engine.iconURI.spec : null;
  },
  get name() { return namespace(this).engine.name; },
  get searchForm() { return namespace(this).engine.searchForm; },
  get type() { return namespace(this).engine.type; },

  getSubmission : function getSubmission(terms, type) {
    var submission = this.getSubmissionURI(terms, type),
        url = null;
    if (submission) {
      url = submission.uri.spec;
    }
    return url;
  },
  getSubmissionURI : function getSubmissionURI(terms, type) {
    type = type || URLTYPE_SEARCH_HTML;
    var submission = namespace(this).engine.getSubmission(terms, type);
    return submission;
  },
  getSuggestion : function getSuggestion(terms) {
    var url = null;
    // If this is part of our map hack then use that
    if (SuggestMap[this.name]) {
      // Do our own submission engine
      url = SuggestMap[this.name].replace("{searchTerms}", encodeURIComponent(terms));
    } else {
      url = this.getSubmission(terms, URLTYPE_SUGGEST_JSON);
    }
    return url;
  },
  /*
   * Adds parameters to a search engine's submission data
   *
   * Engine objects passed to this method are required to have a `name` and `url`.
   * The `method` attribute will be assumed "get" if not specified, the other option is "post"
   *
   * @example
   *  BrowserSearchEngines.add({ name : 'DuckDuckGo', url : 'https://duckduckgo.com/?q={searchTerms}'});
   *
   * @param {Object} engine a hash object that represents an engine
   */
  addParam : function addParam(params) {
    try {
      namespace(this).engine.addParam(params.name, params.value, params.responseType);
    } catch (ex) { throw (ex); }
  },
  addSuggest: function addSuggest(url) {
    // Map these out because read-only engines will barf at the param addition
    SuggestMap[this.name] = url;
    // XXX Debug Build versions of Firefox display an alert to the user when you try
    //     to use addParam() on a read-only engine.  We'll just ignore official
    //     use from now on and use our own mapping.
    return;

    //try {
    //  this.addParam({"name" : "suggest", "value" : url, "responseType" : URLTYPE_SUGGEST_JSON});
    //} catch (ignore) { }
  },
  supportsResponseType : function supportsResponseType(type) {
    if (type !== URLTYPE_SEARCH_HTML && type !== URLTYPE_SUGGEST_JSON) {
      return false;
    }
    if (SuggestMap[this.name]) {
      return true;
    }
    return namespace(this).engine.supportsResponseType(type);
  },
  toJSON : function toJSON() {
    return { name : this.name,
             icon : this.icon,
             alias : this.alias,
             hidden : this.hidden,
             description: this.description,
             search : this.searchForm
            };
  }
});

exports.BrowserSearchEngines = BrowserSearchEngines;
exports.SearchEngine = SearchEngine;
