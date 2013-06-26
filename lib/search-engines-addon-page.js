/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

/*jshint forin:true, noarg:true, noempty:true, eqeqeq:true, bitwise:true,
  strict:true, undef:true, curly:true, browser:true, es5:true,
  indent:2, maxerr:50, devel:true, node:true, boss:true, white:true,
  globalstrict:true, nomen:false, newcap:true*/

"use strict";

var Class = require('sdk/core/heritage').Class,
    off = require('sdk/event/core').off,
    EventTarget = require('sdk/event/target').EventTarget,

    SearchEngines = require("search-engines").SearchEngines,
    SearchEnginesCollector = require("search-engines-collector").SearchEnginesCollector,
    StatisticsReporter = require("statistics").StatisticsReporter,
    data = require('sdk/self').data,
    tabs = require('sdk/tabs');

// we only need to import this, we don't need what it exports
require('./addon-page');

var SearchEnginesAddonPage = Class({
  extends : EventTarget,
  URL : data.url("index.html"),

  _targets : [ "defaults.added", "defaults.removed",
               "others.added", "others.removed" ],

  initialize: function initialize() {
    this._targetListeners = {};
    this._targets.forEach(function (target) {
      this._targetListeners[target] = function (engine) {
        if (this._worker !== null) {
          this._worker.port.emit(target, engine);
        }
      }.bind(this);
      SearchEngines.on(target, this._targetListeners[target]);
    }.bind(this));

    SearchEngines.on("defaults.sorted", this._onSorted.bind(this));

    StatisticsReporter.on("allowed", this._onStats.bind(this));
    SearchEnginesCollector.on("allowed", this._onCollect.bind(this));

    this._worker = null;

    /**
     * PageMod object that listens for changes in preferences
     * TODO: https://github.com/clarkbw/searchspot/issues/21
     */
    require('sdk/page-mod').PageMod({
      include: [this.URL, this.URL + "#welcome"],
      contentScriptWhen: 'end',
      attachTo: ["existing", "top"],
      contentScriptFile: [ data.url("js/jquery.min.js"),
                           data.url("js/jquery-ui.min.js"),
                           data.url("js/underscore.min.js"),
                           data.url("js/backbone.min.js"),
                           data.url("js/bootstrap-transition.js"),
                           data.url("js/bootstrap-modal.js"),
                           data.url("js/bootstrap-tooltip.js"),
                           data.url("js/index.js") ],
      onAttach: this._onAttach.bind(this)
    });

    require('sdk/system/unload').ensure(this);
  },

  _onAttach : function _onAttach(worker) {
    this._worker = worker;

    worker.on('detach', function () {
      this._worker = null;
    }.bind(this));

    worker.port.emit("defaults.reset", SearchEngines.defaults.all);

    worker.port.emit("others.reset", SearchEngines.others.all);

    worker.port.emit("preferences",
                     { "stats" : StatisticsReporter.allowed,
                       "collect" : SearchEnginesCollector.allowed });

    worker.port.on("preferences", function (type, value) {
      if (type === "stats") {
        StatisticsReporter.allowed = value;
      } else if (type === "collect") {
        SearchEnginesCollector.allowed  = value;
      }
    });

    worker.port.on("defaults.sort", function (defaults) {
      //console.log("order", JSON.stringify(defaults));
      SearchEngines.defaults.sort(defaults);
    });

    worker.port.on("defaults.remove", function (engine) {
      //console.log("defaults.remove", engine, JSON.stringify(engine));
      SearchEngines.defaults.remove(engine);
    });

    worker.port.on("defaults.add", function (engine) {
      //console.log("order", JSON.stringify(defaults));
      SearchEngines.defaults.add(engine);
    });

    worker.port.on("close-tab", function () {
      var urlWithOutHash = tabs.activeTab.url.split('#')[0];
      if (urlWithOutHash === this.URL) {
        tabs.activeTab.close();
      }
    }.bind(this));

  },

  _onPrefs : function _onPrefs(pref) {
    //console.log("_onPrefs", this._worker);
    if (this._worker !== null) {
      this._worker.port.emit("preferences", pref);
    }
  },

  _onStats : function _onStats(allowed) {
    this._onPrefs({ "stats" : allowed });
  },

  _onCollect : function _onCollect(allowed) {
    this._onPrefs({ "collect" : allowed });
  },

  _onSorted : function _onSorted(order) {
    //console.log("_onSorted", this._worker);
    if (this._worker !== null) {
      this._worker.port.emit("defaults.sorted", order);
    }
  },

  open : function open() {
    var exists = false;
    for (var i = 0, tab; tab = tabs[i]; i += 1) {
      if (tab.url === this.URL) {
        exists = true;
        tab.activate();
        break;
      }
    }
    if (!exists) {
      tabs.open({ url: this.URL });
    }
  },

  unload : function unload(reason) {
    this._worker = null;
    off(this);
    this._targets.forEach(function (target) {
      SearchEngines.removeListener(target, this._targetListeners[target]);
    }.bind(this));
    SearchEngines.removeListener("defaults.sorted", this._onSorted);
    StatisticsReporter.removeListener("allowed", this._onStats);
    SearchEnginesCollector.removeListener("allowed", this._onCollect);
  }

});

exports.SearchEnginesAddonPage = new SearchEnginesAddonPage();
