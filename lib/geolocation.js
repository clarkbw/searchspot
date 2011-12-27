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

const xulapp = require("api-utils/xul-app");
const { EventEmitter } = require("events");
const {Cc,Ci} = require("chrome");
const unload = require("unload");
const simpleprefs = require("simple-prefs");
const { Geocode } = require("geocode");

const ALLOW_GEOLOCATION_PREF = "allowGeolocation";

var GeolocationSvc = Cc["@mozilla.org/geolocation;1"].
                     getService(Ci.nsIDOMGeoGeolocation);

// newer versions of Firefox use a different API and have the pref hardcoded (bug 677256)
var GEO_API_V1 = xulapp.versionInRange(xulapp.version, "4", "8.*");

// Here's how you could easily use this Geolocation module
// Register for the "coords" event and then use the coords object for your long/lat
// Don't forget you'll need to set Geolocation.allowed = true; by asking the user
//
//  Geolocation.once("coords", function() {
//    console.log("got coords", Geolocation.coords.latitude, Geolocation.coords.longitude);
//  });

const Geolocation = EventEmitter.compose({
  _emit: EventEmitter.required,
  on: EventEmitter.required,
  once: EventEmitter.required,

  _monitorID : "",

  // Default to just the high accuracy option and only add the others as
  // they are explicitly set by the caller
  _options : {
    enableHighAccuracy : this.enableHighAccuracy
  },

  _enableHighAccuracy : false,
  get enableHighAccuracy() this._enableHighAccuracy,
  set enableHighAccuracy(accuracy) this._enableHighAccuracy = accuracy,

  _maximumAge : 2 * 60 * 1000, // 2 hours
  get maximumAge() this._maximumAge,
  set maximumAge(max) {
    this._maximumAge = max;
    this._options["maximumAge"] = this.maximumAge;
  },

  _timeout : 15 * 1000, // 15 seconds
  get timeout() this._timeout,
  set timeout(timeout) {
    this._timeout = timeout;
    this._options["timeout"] = this.timeout;
  },

  get timestamp() this._timestamp,
  _timestamp : "",

  get coords() this._coords,
  _coords : "",

  get address() this._address,
  _address : null,

  _formatted_address : "",
  get formatted_address() {
    if (this._formatted_address == "") {
      try {
        this._formatted_address = this.address.city + ", " + this.address.region;
      } catch(ignore) {
        this._formatted_address = "";
      }
    }
    return this._formatted_address;
  },

  // It's the callers responsibility to actually put this question up to the user
  // Once this is set location is automatically aquired by the system
  get allowed() simpleprefs.prefs[ALLOW_GEOLOCATION_PREF],
  set allowed(allow) simpleprefs.prefs[ALLOW_GEOLOCATION_PREF] = allow,

  // If the pref changes run the monitor function which will turn on or off as needed
  _onallowed : function(subject) {
    console.log("_onallowed", subject, this.allowed);
    this.monitor();
  },

  constructor : function GeolocationModule() {

    if (GEO_API_V1) {
      var PrefSvc = require("preferences-service");
      for (var [p,v] in Iterator({ "geo.wifi.protocol" : 0, "geo.wifi.uri" : "https://www.google.com/loc/json" })) {
        if (!PrefSvc.isSet(p)) {
          PrefSvc.set(p, v);
        }
      }
    } else {
      Geocode.on("geocode", function(results) {
        this._formatted_address = Geocode.postal_code;
        // emit that we found an address
        this._emit("address");
      }.bind(this));
    }

    unload.ensure(this);

    simpleprefs.on(ALLOW_GEOLOCATION_PREF, this._onallowed.bind(this), this);

  },

  // Sets a position watch, updating the object cache as it changes
  monitor : function monitor_geolocation() {
    //console.log("monitor", this.allowed);
    if (!this.allowed) { this._stopmonitor(); return; }
    //console.log("monitor", "allowed", this._monitorID);
    if (this._monitorID == "") {
      try {
        this._monitorID = GeolocationSvc.getCurrentPosition(this._setposition.bind(this),
                                                            this._onerror.bind(this),
                                                            this._options);
      } catch(error) { console.exception(error); }
    }
  },

  // called every time a new position is found, even if it's not different
  // will emit events for all positions received
  _setposition : function _setposition(position) {
    this._timestamp = position.timestamp;
    this._coords = position.coords;

    // emit the minimal coordinates if that's what callers are looking for
    this._emit("coords", this.coords);

    // the older (better) API gave us the address with the coordinates
    if (GEO_API_V1) {
      this._address = position.address;
      // emit an address lookup
      this._emit("address");

    // the newer v2 API only gives coordinates so we need to lookup the address on our own
    } else {
      Geocode.lookup(position.coords.latitude, position.coords.longitude, true);
    }
  },

  _onerror : function onerror(e) {
    if (e.code == e.PERMISSION_DENIED) {
      console.error("GeoLocation Error: Permission denied");
    } else if (e.code == e.POSITION_UNAVAILABLE) {
      console.error("GeoLocation Error: Position Unavailable");
    } else if (e.code == e.TIMEOUT) {
      console.error("GeoLocation Error: Timeout");
    }
    // XXX We need to have some kind of try again system
    //this._emit("error");
  },

  _stopmonitor : function _stop_monitor() {
    if (this._monitorID != "") {
      GeolocationSvc.clearWatch(this._monitorID);
    }
  },

  unload: function geolocation_unload() {
    simpleprefs.removeListener(ALLOW_GEOLOCATION_PREF, this._onallowed);
    this._stopmonitor();
  },

})();

exports.Geolocation = Geolocation;
