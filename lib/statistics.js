/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const { Trait } = require('traits'),
      { EventEmitter } = require("events");

const SimpleStorage = require("simple-storage"),
      storage = SimpleStorage.storage,
      xhr = require("xhr"),
      timers = require("timers"),
      simpleprefs = require("simple-prefs");

const ALLOW_STATISTICS_PREF = "allowStatisticsReporting";
const STATISTICS_URL_PREF = "statisticsReportingURL";

const ONE_SECOND = 1 * 1000,
      ONE_MINUTE = ONE_SECOND * 60,
      ONE_HOUR = ONE_MINUTE * 60,
      ONE_DAY = ONE_HOUR * 24;

const StatisticsReporter = EventEmitter.compose({
  _emit: EventEmitter.required,
  on: EventEmitter.required,

  get url() "https://search.vcap.mozillalabs.com/service", // "http://127.0.0.1:8080/service",

  _timer : null,
  get timer() this._timer,
  set timer(timer) {
    if (this.timer !== null) {
      timers.clearTimeout(this.timer);
    }
    this._timer = timer;
  },

  _allowed : false,

  // It's the callers responsibility to actually put this question up to the user
  // Once this is set statistics will begin gathering and automatically sent
  get allowed() this._allowed,
  set allowed(allow) this._allowed = simpleprefs.prefs[ALLOW_STATISTICS_PREF] = allow,

  // If the pref changes run the monitor function which will turn on or off as needed
  _onallowed : function(subject) {
    this._allowed = simpleprefs.prefs[ALLOW_STATISTICS_PREF];
    this._setTimer();
  },

  _stats : [],

  constructor : function StatisticsReporter() {
    if (!storage.stats) {
      storage.stats = [];
    } else {
      this._stats = storage.stats;
    }

    // XXX You don't have a choice just yet
    this.allowed = true;

    simpleprefs.on(ALLOW_STATISTICS_PREF, this._onallowed.bind(this), this);

    this._setTimer();

    SimpleStorage.on("OverQuota", this._overQuota.bind(this));
    require("unload").ensure(this);
  },

  _setTimer : function _setTimer() {
    console.log("_setTimer", this.allowed, this.timer);
    if (this.allowed) {
      this.timer = timers.setInterval(this._run.bind(this), ONE_SECOND * 5);
    } else {
      this.timer = null;
    }
    console.log("_setTimer", this.allowed, this.timer);
  },

  send : function send(action, data) {
    console.log("send", action, this.allowed, this.timer);
    if (this.allowed) {
      console.log("stats", action);
      this._stats.push({ "action" : action, "data" : data });
    }
  },


  // Runs the XHR calls to the engines.
  _run : function () {
    console.log("pre._run", this._stats.length);

    // only run if we have stats to send
    if (this._stats.length <= 0) {
      return;
    }

    console.log("_run", this._stats.length);
    var item = this._stats.pop();
    var data = encodeURIComponent(JSON.stringify(item));

    this._xhr(this.url, data, function(req) {
      try {
        console.log(data, req);
      } catch (error) { console.error("xhr error: " + error + "\n"); }
    }.bind(this),
    function(req) {
      // Error contacting the server lets put the data back and wait
      // for the next try to work
      this._stats = this._stats.concat(JSON.parse(data));
    }.bind(this));

  },

  // Runs an XHR and calls callback with the XHR request that successfully
  // completes.
  _xhr: function (url, data, callback, error) {
      var req = new xhr.XMLHttpRequest();
      req.open('POST', url, true);
      req.setRequestHeader('Content-type',"application/x-www-form-urlencoded");
      //req.setRequestHeader("Connection", "close");
      req.onreadystatechange = function (aEvt) {
        if (req.readyState == 4) {
          if (req.status == 200) {
            console.info('request successful', req.statusText, url);
            callback(req);
          } else if (req.status === 0) {
            console.error('statistics site unreachable', req.status, req.statusText, url);
            error(req);
          } else if (req.status === 500) {
            console.error('statistics site erroring', req.status, req.statusText, url);
            error(req);
          } else {
            console.error('status error', req.status, req.statusText, url);
            error(req);
          }
        }
      };
      req.send("data="+data);
      return req;
  },

  unload : function unload(reason) {
    this.timer = null;
    storage.stats = this._stats;
    SimpleStorage.removeListener("OverQuota", this._overQuota);
  },

  // XXX Totally untested
  _overQuota: function _overQuota() {
    //while (SimpleStorage.quotaUsage > 1) {
    //  storage.engines;
    //}
    console.error("_overQuota");
  }

})();


exports.StatisticsReporter = StatisticsReporter;
