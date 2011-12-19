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
    "The geolocation module is only tested in Firefox.  In the future ",
    "we would like it to support other applications, however.  Please see ",
    "https://bugzilla.mozilla.org/show_bug.cgi?id=jetpack-panel-apps ",
    "for more information."
  ].join(""));
}

const { EventEmitter } = require("events");
const {Cc,Ci} = require("chrome");
const unload = require("unload");
const PrefSvc = require("preferences-service");
const { jetpackID } = require("@packaging");
const { on : obspref } = require("simple-prefs");

const ADDON_BRANCH = "extensions." + jetpackID + ".";
const ALLOW_GEOLOCATION_PREF = "allowGeolocation";

var GeolocationSvc = Cc["@mozilla.org/geolocation;1"].
                     getService(Ci.nsIDOMGeoGeolocation);


const Geolocation = EventEmitter.compose({
  _emit: EventEmitter.required,
  on: EventEmitter.required,
  once: EventEmitter.required,

  _monitorID : "",

  _enableHighAccuracy : false,
  get enableHighAccuracy() this._enableHighAccuracy,
  set enableHighAccuracy(accuracy) this._enableHighAccuracy = accuracy,

  _maximumAge : 2 * 60 * 1000, // 2 hours
  get maximumAge() this._maximumAge,
  set maximumAge(max) this._maximumAge = max,

  _timeout : 5 * 1000, // 5 seconds
  get timeout() this._timeout,
  set timeout(timeout) this._timeout = timeout,

  get timestamp() this._timestamp,
  _timestamp : "",

  get coords() this._coords,
  _coords : "",

  get address() this._address,
  _address : "",

  // It's the callers responsibility to actually put this question up to the user
  // Once this is set location is automatically aquired by the system
  get allowed() PrefSvc.get(ADDON_BRANCH + ALLOW_GEOLOCATION_PREF, false),
  set allowed(allow) PrefSvc.set(ADDON_BRANCH + ALLOW_GEOLOCATION_PREF, allow),

  constructor : function Geolocation() {

    // This might not be necessary
    for (var [p,v] in Iterator({ "geo.wifi.protocol" : 0, "geo.wifi.uri" : "https://www.google.com/loc/json" })) {
      if (!PrefSvc.isSet(p)) {
        PrefSvc.set(p, v);
      }
    }

    unload.ensure(this);

    // If the pref changes run the monitor function which will turn on or off as needed
    obspref(ALLOW_GEOLOCATION_PREF, function(subject) { this.monitor(); }.bind(this), this);

  },

  //// Returns the current position in a success callback
  //// Also caches position for future queries
  //getCurrentPosition : function getCurrentPosition(onsuccess, onerror) {
  //  if (!this.allowed) { return; }
  //  GeolocationSvc.getCurrentPosition(function (position) { this._onsuccess(position, onsuccess); }, 
  //                                    function (e) { this._onerror(e, onerror); },
  //                                    {enableHighAccuracy : this._enableHighAccuracy,
  //                                     maximumAge : this._maximumAge,
  //                                     timeout: this._timeout});
  //},
  //
  //// Sets a position watch, updating the object cache as it changes
  //watchPosition : function watchPosition(onsuccess, onerror) {
  //  if (!this.allowed) { return; }
  //  if (this._watchID != "") {
  //    this._watchID = GeolocationSvc.getCurrentPosition(function (position) { this._onsuccess(position, onsuccess); }, 
  //                                                      function (e) { this._onerror(e, onerror); },
  //                                                      {enableHighAccuracy : this._enableHighAccuracy,
  //                                                       maximumAge : this._maximumAge,
  //                                                       timeout: this._timeout});
  //  }
  //},

  // Sets a position watch, updating the object cache as it changes
  monitor : function monitor_geolocation() {
    //console.log("monitor", this.allowed);
    if (!this.allowed) { this._stopmonitor(); return; }
    //console.log("monitor", "allowed", this._monitorID);
    if (this._monitorID == "") {
      try {
      this._monitorID = GeolocationSvc.getCurrentPosition(this._setposition.bind(this), 
                                                          this._onerror.bind(this),
                                                          {enableHighAccuracy : this.enableHighAccuracy,
                                                           maximumAge : this.maximumAge,
                                                           timeout: this.timeout});
      } catch(error) { console.exception(error); }
    }
  },

  _setposition : function _setposition(position) {
    //console.log("_setposition", position.address.city, position.address.region);
    this._timestamp = position.timestamp;
    this._coords = position.coords;
    this._address = position.address;
    // called every time a new position is found, even if it's not different
    this._emit("position");
  },

  _onerror : function onerror(e) {
    if (e.code == e.PERMISSION_DENIED) {
      console.error("GeoLocation Error: Permission denied\n");
    } else if (e.code == e.POSITION_UNAVAILABLE) {
      console.error("GeoLocation Error: Position Unavailable\n");
    } else if (e.code == e.TIMEOUT) {
      console.error("GeoLocation Error: Timeout\n");
    }
    this._emit("error");
  },

  _stopmonitor : function _stop_monitor() {
    if (this._monitorID != "") {
      GeolocationSvc.clearWatch(this._monitorID);
    }
  },

  unload: function geolocation_unload() {
    if (this._watchID != "") {
      GeolocationSvc.clearWatch(this._watchID);
    }
    this._stopmonitor();
  },

})();


//function validateOptions(options) {
//  return apiUtils.validateOptions(options, {
//    enableHighAccuracy: {
//      is: ["boolean", "undefined"]
//    },
//    maximumAge: {
//      is: ["number", "undefined"]
//    },
//    timeout: {
//      is: ["number", "undefined"]
//    }
//  });
//}

exports.Geolocation = Geolocation;
