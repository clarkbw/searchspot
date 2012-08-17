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
      { SearchEngines } = require("search-engines"),
      data = require("self").data,
      tabs = require("tabs");

/**
 * Preferences for the search engines
 *
 */
const SearchEnginesPreferences = EventEmitter.compose({
  _emit: EventEmitter.required,
  on: EventEmitter.required,

  _targets : [ "defaults.added", "defaults.removed", "others.added", "others.added" ],
  _targetListeners : {},

  constructor : function SearchEnginesPreferences() {
    this._targets.forEach(function(target) {
      this._targetListeners[target] = function(engine) {
        console.log(target, engine.name);
        if (this._worker != null) {
          this._worker.port.emit(target, engine);
        }
      }.bind(this);
      SearchEngines.on(target, this._targetListeners[target]);
    }.bind(this));

    SearchEngines.on("defaults.sorted", this._onSorted.bind(this));

    /**
     * PageMod object that listens for changes in preferences
     *
     */
    require("page-mod").PageMod({
      include: data.url("preferences/preferences.html"),
      contentScriptWhen: 'end',
      contentScriptFile: [ data.url("js/jquery.js"),
                           data.url("js/jquery-ui-1.8.21.custom.min.js"),
                           data.url("preferences/preferences.js") ],
      onAttach: this._onAttach.bind(this)
    });

    require("unload").ensure(this);
  },

  unload: function _destructor(reason) {
    this._removeAllListeners();
    this._targets.forEach(function(target) {
      SearchEngines.removeListener(target, this._targetListeners[target]);
    }.bind(this));
    SearchEngines.removeListener("defaults.sorted", this._onSorted);
  },

  _worker : null,

  _onAttach : function _onAttach(worker) {
    this._worker = worker;

    worker.on('detach', function () {
      this._worker = null;
    }.bind(this));

    worker.port.emit("init", "defaults", SearchEngines.defaults.all);

    worker.port.emit("init", "others", SearchEngines.others.all);

    worker.port.on("defaults.sort", function(defaults) {
      //console.log("order", JSON.stringify(defaults));
      SearchEngines.defaults.sort(defaults);
    });

    worker.port.on("defaults.remove", function(engine) {
      //console.log("defaults.remove", engine, JSON.stringify(engine));
      SearchEngines.defaults.remove(engine);
    });

    worker.port.on("defaults.add", function(engine) {
      //console.log("order", JSON.stringify(defaults));
      SearchEngines.defaults.add(engine);
    });

  },

  _onSorted : function _onSorted(order) {
    if (this._worker != null) {
      this._worker.port.emit("defaults.sorted", order);
    }
  },

  open : function open() {
    var exists = false,
        url = data.url("preferences/preferences.html");
    for each (var tab in tabs) {
      if (tab.url == url) {
        tab.activate();
        exists = true;
        break;
      }
    }
    if (!exists) {
      tabs.open({ url: url });
    }
  }

})();



exports.SearchEnginesPreferences = SearchEnginesPreferences;
