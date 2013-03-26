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

var BrowserSearchEngines = Class({
  extends : EventTarget,
  type : 'BrowserSearchEngines',

  initialize : function initialize() {
    SystemEvents.on("browser-search-engine-modified", this._observer);
    require("unload").ensure(this);
  },

  add : function add(engine) {
    SearchService.addEngineWithDetails(engine.name, engine.icon, engine.alias, engine.description, engine.method, engine.url);
    if (engine.suggest) {
      this.get(engine.name).addSuggest(engine.suggest);
    }
    
  },

  remove : function remove(engine) {
    SearchService.removeEngine(engine.nsISearchEngine);
    delete SuggestMap[engine.name];
  },

  get : function get(name) {
    var engine = SearchService.getEngineByName(name) || SearchService.getEngineByAlias(name);
    if (engine) {
      return new SearchEngine(engine);
    }
    return null;
  },

  getDefaults : function getDefaults() {
    return SearchService.getDefaultEngines().map(function (e) {
      return new SearchEngine(e);
    });
  },

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

    // This is the removal of a non-default installed engine, defaults are "changed"
    } else if ("engine-added" === subject) {
      emit(this, "added", engine);

    // This is a grab bag of possible events from edits to removal depending on the type of engine
    } else if ("engine-changed" === subject) {

      // removing a default engine only actually hides it, they are not removed
      if (engine.hidden) {
        emit(this, "removed", engine);
      }
      //dump("name: " + engine.name + "\n");
      //dump("description: " + engine.description + "\n");

    // This sets the current engine in use
    } else if ("engine-current" === subject) {
      emit(this, "current", engine);
    }
  },

  unload : function unload(reason) {
    SystemEvents.off("browser-search-engine-modified", this._observer);
    off(this);
  }

})();

var SearchEngine = Class({

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

  _getSubmission : function _getSubmission(terms, type) {
    var submission = namespace(this).engine.getSubmission(terms, type),
        url = null;
    if (!submission) {
      return null;
    }
    url = submission.uri.spec;
    return url;
  },

  getSubmission : function getSubmission(terms) {
    return this._getSubmission(terms, URLTYPE_SEARCH_HTML);
  },
  getSuggestion : function getSuggestion(terms) {
    var url = null;
    // If this is part of our map hack then use that
    if (SuggestMap[this.name]) {
      // Do our own submission engine
      url = SuggestMap[this.name].replace("{searchTerms}", encodeURIComponent(terms));
    } else {
      url = this._getSubmission(terms, URLTYPE_SUGGEST_JSON);
    }
    return url;
  },
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
             description: this.description,
             search : this.searchForm
            };
  }
});

exports.BrowserSearchEngines = BrowserSearchEngines;
exports.SearchEngine = SearchEngine;
