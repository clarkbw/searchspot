/* ***** BEGIN LICENSE BLOCK *****
 * Version: MPL 1.1/GPL 2.0/LGPL 2.1
 *
 * The contents of this file are subject to the Mozilla Public License Version
 * 1.1 (the "License"); you may not use this file except in compliance with
 * the License. You may obtain a copy of the License at
 * http://www.mozilla.org/MPL/
 *
 * Software distributed under the License is distributed on an "AS IS" basis,
 * WITHOUT WARRANTY OF ANY KIND, either express or implied. See the License
 * for the specific language governing rights and limitations under the
 * License.
 *
 * The Original Code is Jetpack.
 *
 * The Initial Developer of the Original Code is Mozilla.
 * Portions created by the Initial Developer are Copyright (C) 2010
 * the Initial Developer. All Rights Reserved.
 *
 * Contributor(s):
 *   Bryan Clark <clarkbw>
 *
 * Alternatively, the contents of this file may be used under the terms of
 * either the GNU General Public License Version 2 or later (the "GPL"), or
 * the GNU Lesser General Public License Version 2.1 or later (the "LGPL"),
 * in which case the provisions of the GPL or the LGPL are applicable instead
 * of those above. If you wish to allow use of your version of this file only
 * under the terms of either the GPL or the LGPL, and not to allow others to
 * use your version of this file under the terms of the MPL, indicate your
 * decision by deleting the provisions above and replace them with the notice
 * and other provisions required by the GPL or the LGPL. If you do not delete
 * the provisions above, a recipient may use your version of this file under
 * the terms of any one of the MPL, the GPL or the LGPL.
 *
 * ***** END LICENSE BLOCK ***** */

"use strict";

if (!require("api-utils/xul-app").is("Firefox")) {
  throw new Error([
    "The search engine module currently supports only Firefox.  In the future ",
    "we would like it to support other applications, however.  Please see ",
    "https://bugzilla.mozilla.org/show_bug.cgi?id=jetpack-panel-apps ",
    "for more information."
  ].join(""));
}

const { Cc, Ci } = require("chrome");
const { Trait } = require('traits');
const { EventEmitter } = require("events");
const ObserverService = require("observer-service");

const URLTYPE_SEARCH_HTML  = "text/html",
      URLTYPE_SUGGEST_JSON = "application/x-suggestions+json";

var SearchService = Cc["@mozilla.org/browser/search-service;1"].
                    getService(Ci.nsIBrowserSearchService);

// Mapping Search Engine Names to their Suggest URLs
var SuggestMap = {};

const BrowserSearchEngines = EventEmitter.compose({
  _emit: EventEmitter.required,
  on: EventEmitter.required,

  constructor : function BrowserSearchEngines() {
    ObserverService.add("browser-search-engine-modified", this._observer, this);
    require("unload").when(function () { ObserverService.remove("browser-search-engine-modified", this._observer.bind(this)); }.bind(this));
  },

  add : function add(engine) {
    SearchService.addEngineWithDetails(engine.name, engine.icon, engine.alias, engine.description, engine.method, engine.url);
    if (engine.suggest) {
      this.get(engine.name).addSuggest(engine.suggest);
    }
    
  },

  remove : function remove(engine) {
    SearchService.removeEngine(engine.nsISearchEngine);
  },

  get : function get(name) {
    var engine = SearchService.getEngineByName(name) || SearchService.getEngineByAlias(name);
    if (engine) {
      return SearchEngine(engine);
    }
    return null;
  },

  getDefaults : function getDefaults() {
    var engines = [];
    for each (let engine in SearchService.getDefaultEngines()) {
      engines.push(SearchEngine(engine));
    }
    return engines;
  },

  getVisible : function getVisible() {
    var engines = [];
    for each (let engine in SearchService.getVisibleEngines()) {
      engines.push(SearchEngine(engine));
    }
    return engines;
  },

  // WTF? this should be (subject, data) but that's not what we're getting
  _observer : function _observer(data, subject) {
    var engine = SearchEngine(data); // data = nsISearchEngine

    // This is the removal of a non-default installed engine, defaults are "changed"
    if ("engine-removed" == subject) {
      this._emit("removed", engine);

    // This is the removal of a non-default installed engine, defaults are "changed"
    } else if ("engine-added" == subject) {
      this._emit("added", engine)

    // This is a grab bag of possible events from edits to removal depending on the type of engine
    } else if ("engine-changed" == subject) {

        // removing a default engine only actually hides it, they are not removed
        if (engine.hidden) {
          this._emit("removed", engine);
        }
      //dump("name: " + engine.name + "\n");
      //dump("description: " + engine.description + "\n");

    // This sets the current engine in use
    } else if ("engine-current" == subject) {
      this._emit("current", engine);
    }
  }

})();

const SearchEngine = Trait.compose({
  _engine : null,
  get nsISearchEngine() this._engine,

  constructor: function SearchEngine(nsISearchEngine) {
    this._engine = nsISearchEngine.QueryInterface(Ci.nsISearchEngine);
  },

  get alias() this._engine.alias,
  get description() this._engine.description,
  get hidden() this._engine.hidden,
  get iconURI() this._engine.iconURI,
  get icon() {
    return (this._engine.iconURI)? this._engine.iconURI.spec : null;
  },
  get name() this._engine.name,
  get searchForm() this._engine.searchForm,
  get type() this._engine.type,

  _getSubmission : function _getSubmission(terms, location, type) {
    var submission = this._engine.getSubmission(terms, type), url = null;
    if (!submission) {
      return null;
    }
    url = submission.uri.spec;
    // We accept location searches so we need to replace the location param with the location given
    if (location) {
      url = url.replace("{searchLocation}", encodeURIComponent(location));
    }
    return url;
  },

  getSubmission : function getSubmission(terms, location) {
    return this._getSubmission(terms, location, URLTYPE_SEARCH_HTML)
  },
  getSuggestion : function getSuggestion(terms, location) {
    var url = null;
    // If this is part of our map hack then use that
    if (SuggestMap[this.name]) {
      // Do our own submission engine
      url = SuggestMap[this.name].replace("{searchTerms}", encodeURIComponent(terms));
      url = url.replace("{searchLocation}", encodeURIComponent(location));
    } else {
      url = this._getSubmission(terms, location, URLTYPE_SUGGEST_JSON);
    }
    return url;
  },
  addParam : function addParam(params) {
    try {
      this._engine.addParam(params.name, params.value, params.responseType);
    } catch(ex) { throw(ex); }
  },
  addSuggest: function addSuggest(url) {
    try {
      this.addParam({"name" : "suggest", "value" : url, "responseType" : URLTYPE_SUGGEST_JSON});
    } catch (ignore) {
      // Map these out because read-only engines will barf at the param addition
      SuggestMap[this.name] = url;
    }
  },
  supportsResponseType : function supportsResponseType(type) {
    return this._engine.supportsResponseType(type);
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
