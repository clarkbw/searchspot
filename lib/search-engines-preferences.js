/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

if (!require("api-utils/xul-app").is("Firefox")) {
  throw new Error([
    "The search engine collector module currently supports only Firefox.  In the future ",
    "we would like it to support other applications, however.  Please see ",
    "https://bugzilla.mozilla.org/show_bug.cgi?id=jetpack-panel-apps ",
    "for more information."
  ].join(""));
}

const { EventEmitter } = require("events"),
      { SearchEngines, DEFAULT_TAG } = require("search-engines"),
      data = require("self").data,
      tabs = require("tabs");

/**
 * Preferences for the search engines
 *
 */
const SearchEnginesPreferences = EventEmitter.compose({
  _emit: EventEmitter.required,
  on: EventEmitter.required,

  constructor : function SearchEnginesPreferences() {
    SearchEngines.on("added", this._onAdded.bind(this));

    /**
     * PageMod object that listens for changes in preferences
     *
     */
    require("page-mod").PageMod({
      include: data.url("preferences/preferences.html"),
      contentScriptWhen: 'end',
      contentScriptFile: [ data.url("js/jquery.js"),
                           data.url("preferences/preferences.js"),
                           data.url("js/bootstrap-transition.js"),
                           data.url("js/bootstrap-scrollspy.js"),
                           data.url("js/bootstrap-button.js")
                           ],
      onAttach: this._onAttach.bind(this)
    });

    require("unload").ensure(this);
  },

  unload: function _destructor(reason) {
    this._removeAllListeners();
    SearchEngines.removeListener("added", this._onAdded);
  },

  _onAttach : function _onAttach(worker) {
    var defaults = SearchEngines.getEnginesByTag(DEFAULT_TAG);
    worker.port.emit("add", DEFAULT_TAG, defaults);

    var tags = SearchEngines.tags;
    for (var i = 0; i < tags.length; i++) {
      var tag = tags[i];
      if (tag == DEFAULT_TAG) {
        continue;
      }
      worker.port.emit("add", tag, SearchEngines.getEnginesByTag(tag));
    }

    worker.port.on("toggle", function(id, active) {
      if (active) {
        SearchEngines.addTagById(DEFAULT_TAG, id);
      } else {
        SearchEngines.removeTagById(DEFAULT_TAG, id);
      }
    });
  },

  _onAdded : function _onAdded(engine) {
    
  },

  open : function open() {
    tabs.open({ url: data.url("preferences/preferences.html") });
  }

})();



exports.SearchEnginesPreferences = SearchEnginesPreferences;
