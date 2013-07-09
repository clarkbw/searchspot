/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const { EventEmitter } = require('sdk/deprecated/events'),
      SimpleStorage = require('sdk/simple-storage'),
      storage = SimpleStorage.storage,
      xhr = require('sdk/net/xhr'),
      timers = require('sdk/timers'),
      simpleprefs = require('sdk/simple-prefs'),

      { inDebugMode } = require('utils');

const ALLOW_STATISTICS_PREF = "allowStatisticsReporting";

const ONE_SECOND = 1 * 1000,
      ONE_MINUTE = ONE_SECOND * 60,
      ONE_HOUR = ONE_MINUTE * 60,
      ONE_DAY = ONE_HOUR * 24;

/**
 * A service for sharing non-private search engine statistics back to our system
 *
 * @see https://search-vcap.mozillalabs.com/
 */
const StatisticsReporter = EventEmitter.compose({
  _emit: EventEmitter.required,
  on: EventEmitter.required,

  _url : "https://search.vcap.mozillalabs.com/service",
  get url() this._url,

  // How long to wait between sending data to our service
  _timeout : ONE_HOUR / 4,
  get timeout() this._timeout,
  set timeout(timeout) {
    this._timeout = timeout;
    this._setTimer();
  },

  // Timeout id for running the service on a setTimeout like call
  _timer : null,
  get timer() this._timer,
  // Setting the timer to null or a new timeout call will reset and clear existing
  // timeouts that are currently running
  set timer(timer) {
    if (this._timer !== null) {
      timers.clearTimeout(this._timer);
    }
    this._timer = timer;
  },

  _debug : function() {
    var self = this;
    inDebugMode().then(function (isDebug) {
      if (isDebug) {
        console.info("using localhost stats service");
        self._url = "http://127.0.0.1:8080/service";
        self._timeout = ONE_SECOND * 5;
        // setting allowed will reset the timer for us
        self.allowed = true;
      }
    });
  },

  // Private variable for holding if the user has authorized us to share statistics
  _allowed : simpleprefs.prefs[ALLOW_STATISTICS_PREF],

  // It's the callers responsibility to actually put this question up to the user
  // Once this is set statistics will begin gathering and automatically sent
  get allowed() this._allowed,
  set allowed(allow) this._allowed = simpleprefs.prefs[ALLOW_STATISTICS_PREF] = allow,

  // Listener for the preference change, this will automatically call the timer to run
  _onallowed : function(subject) {
    this._allowed = simpleprefs.prefs[ALLOW_STATISTICS_PREF];
    this._emit("allowed", this._allowed);
    this._setTimer();
  },

  _stats : [],

  constructor : function StatisticsReporter() {
    this._debug();
    // initialize the local storage if it doesn't exist
    if (!storage.stats) {
      storage.stats = [];
    } else {
      // load up stats that hadn't been sent out yet
      this._stats = storage.stats;
    }

    simpleprefs.on(ALLOW_STATISTICS_PREF, this._onallowed.bind(this), this);

    this._setTimer();

    SimpleStorage.on("OverQuota", this._overQuota.bind(this));
    require('sdk/system/unload').ensure(this);
  },

  _setTimer : function _setTimer() {
    if (this.allowed) {
      this.timer = timers.setInterval(this._run.bind(this), this.timeout);
    } else {
      this.timer = null;
    }
  },

  /**
   * Public API for sending data back to the server
   * @param {String} action   Simple action string that the server understands
   *                          Could be "use", "update", "add", etc
   *
   * @param {Object} data   Arbitrary data object to send to the server
   *
   */
  send : function send(action, engine, stats) {
    // Check that the user has authorized data collection
    if (this.allowed) {
      // push the data onto our stack for sending out later
      var item = { "action" : action, "engine" : JSON.stringify(engine) };
      if (stats) {
        item["stats"] = JSON.stringify(stats);
      }
      this._stats.push(item);
    }
  },

  // Runs the XHR calls to the engines.
  _run : function () {
    //console.log("pre._run", this._stats.length);

    // only run if we have stats to send
    if (this._stats.length <= 0) {
      return;
    }

    //console.log("_run", this._stats.length);

    var tmpstats = this._stats;
    this._stats = [];
    var data = encodeURIComponent(JSON.stringify({ data : tmpstats }));

    this._xhr(this.url, data, function(req) {
      try {
        //console.log(decodeURIComponent(data), req);
      } catch (error) { console.error("xhr error: " + error + "\n"); }
    }.bind(this),
    function(req) {
      // Error contacting the server lets put the data back and wait
      // for the next try to work
      try {
        // other data could have arrived while we were trying so we'll concat
        // this data back with the new stuff
        this._stats.concat(tmpstats);
      } catch (error) { console.error("req error: " + error + "\n", data); }
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
    if (reason === "disable") {
      delete storage.stats;
    } else {
      storage.stats = this._stats;
    }
    this._removeAllListeners();
    simpleprefs.removeListener(ALLOW_STATISTICS_PREF, this._onallowed);
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
