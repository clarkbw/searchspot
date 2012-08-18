/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const xulapp = require("api-utils/xul-app");

if (!xulapp.is("Firefox")) {
  throw new Error([
    "The geolocation module is only tested in Firefox.  In the future ",
    "we would like it to support other applications, however.  Please see ",
    "https://bugzilla.mozilla.org/show_bug.cgi?id=jetpack-panel-apps ",
    "for more information."
  ].join(""));
}

const { EventEmitter } = require("events");
const { Cc, Ci } = require("chrome");
const simpleprefs = require("simple-prefs");
const { Geocode } = require("geocode");

const ALLOW_GEOLOCATION_PREF = "allowGeolocation";

var GeolocationSvc = Cc["@mozilla.org/geolocation;1"].
                     getService(Ci.nsIDOMGeoGeolocation);

// newer versions of Firefox use a different API and have the pref hardcoded (bug 677256)
var GEO_API_V1 = xulapp.versionInRange(xulapp.version, "4", "8.*");

/**
 * This object is for watching a users GeoLocation
 * It emit several events for coordinates and will use the geocode module for
 * gathering addresses as well
 *
 * Here's how you could easily use this Geolocation module:
 *
 * Register for the "coords" event which is emitted when a users coordinates are located
 *
 * @example
 *  Geolocation.once("coords", function(coords) {
 *    console.log("got coords", coords.latitude, coords.longitude);
 *    // or
 *    console.log("got coords", Geolocation.coords.latitude, Geolocation.coords.longitude);
 *  });
 *
 * Alternatively you could register for the "address" event
 *
 * @example
 *  Geolocation.once("address", function(formatted_address) {
 *    console.log("got address", formatted_address);
 *    // or
 *    console.log("got asddress", Geolocation.formatted_address);
 *  });
 *
 * Or if you want to just poll for the most recent location you could use
 * @example
 *  var position = Geolocation.lastPosition;
 *
 * @see https://developer.mozilla.org/en/nsIDOMGeolocation
 * @see https://developer.mozilla.org/en/Using_geolocation
 */
const Geolocation = EventEmitter.compose({
  _emit: EventEmitter.required,
  on: EventEmitter.required,
  once: EventEmitter.required,

  /*
   * An unsigned short returned from the watchPosition function is saved here
   * @see https://developer.mozilla.org/en/nsIDOMGeolocation#method_watchPosition
   */
  _monitorID : null,

  /* Defaults to just the high accuracy option as false
   * Other options can be set by setting their individual values
   * @type {nsIDOMGeoPositionOptions} object
   * @see https://developer.mozilla.org/en/XPCOM_Interface_Reference/NsIDOMGeoPositionOptions
   */
  _options : {
    enableHighAccuracy : this.enableHighAccuracy
  },

  /*
   * Getter/Setter for the enableHighAccuracy option of the {nsIDOMGeoPositionOptions}
   * @see https://developer.mozilla.org/en/XPCOM_Interface_Reference/NsIDOMGeoPositionOptions
   */
  _enableHighAccuracy : false,
  get enableHighAccuracy() this._enableHighAccuracy,
  set enableHighAccuracy(accuracy) this._enableHighAccuracy = accuracy,

  /*
   * Getter/Setter for the timeout option of the {nsIDOMGeoPositionOptions}
   * @see https://developer.mozilla.org/en/XPCOM_Interface_Reference/NsIDOMGeoPositionOptions
   */
  _timeout : 15 * 1000, // 15 seconds
  get timeout() this._timeout,
  set timeout(timeout) {
    this._timeout = timeout;
    this._options["timeout"] = this.timeout;
  },

  /*
   * @returns {nsIDOMGeoPosition} The most recently retrieved location. May be null
   * @see https://developer.mozilla.org/en/XPCOM_Interface_Reference/NsIDOMGeoPosition
   * @see https://developer.mozilla.org/en/nsIDOMGeolocation
   */
  get lastPosition() GeolocationSvc.lastPosition,

  /*
   * Timestampe of the last reading for the position
   * @type DOMTimeStamp
   */
  get timestamp() this._timestamp,
  _timestamp : "",

  /*
   * Most recently retrieved coordinates
   * @type nsIDOMGeoPositionCoords
   * @see https://developer.mozilla.org/en/XPCOM_Interface_Reference/nsIDOMGeoPositionCoords
   */
  get coords() this._coords,
  _coords : "",

  /*
   * Private variable
   * Most recently retrieved address from the V1 GEO API
   * @type nsIDOMGeoPositionAddress
   * @see https://developer.mozilla.org/en/XPCOM_Interface_Reference/nsIDOMGeoPositionAddress
   */
  _address : null,

  /*
   * Formatted Address helper that creates a City, Region format useful for geocoding results
   * @returns {String} City, Region format of the address of hte lastPosition
   */
  _formatted_address : "",
  get formatted_address() {
    if (this._formatted_address == "") {
      try {
        this._formatted_address = this._address.city + ", " + this._address.region;
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
    //console.log("_onallowed", subject, this.allowed);
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
        this._emit("address", this.formatted_address);
      }.bind(this));
    }

    require("unload").ensure(this);

    simpleprefs.on(ALLOW_GEOLOCATION_PREF, this._onallowed.bind(this), this);

    this.monitor();
  },

  /*
   * Sets a position watch, this can be run as the allowed preference changes
   * and it will stop or start monitoring wrt the the allowed preference
   * @see https://developer.mozilla.org/en/nsIDOMGeolocation#method_watchPosition
   */
  // 
  monitor : function monitor_geolocation() {
    //console.log("monitor", this.allowed);
    if (!this.allowed) { this._stopmonitor(); return; }
    //console.log("monitor", "allowed", this._monitorID);
    if (this._monitorID === null) {
      try {
        this._monitorID = GeolocationSvc.watchPosition(this._setposition.bind(this),
                                                       this._onerror.bind(this),
                                                       this._options);
      } catch(error) { console.exception(error); }
    }
  },

  /*
   * This provides the nsIDOMGeoPositionCallback function for our monitor (watchPosition) call
   * @see https://developer.mozilla.org/en/XPCOM_Interface_Reference/NsIDOMGeoPositionCallback
   * @param {nsIDOMGeoPosition} position The GeoPosition object
   * @see https://developer.mozilla.org/en/XPCOM_Interface_Reference/NsIDOMGeoPosition
   */
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
      this._emit("address", this.formatted_address);

    // the newer v2 API only gives coordinates so we need to lookup the address on our own
    } else {
      Geocode.lookup(position.coords.latitude, position.coords.longitude, true);
    }
  },

  /*
   * This provides the nsIDOMGeoPositionErrorCallback
   * @see https://developer.mozilla.org/en/XPCOM_Interface_Reference/NsIDOMGeoPositionErrorCallback
   * @param {nsIDOMGeoPositionError} e GeoPosition Error object
   * @see https://developer.mozilla.org/en/XPCOM_Interface_Reference/NsIDOMGeoPositionError
   */
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
    if (this._monitorID !== null) {
      GeolocationSvc.clearWatch(this._monitorID);
    }
  },

  unload: function geolocation_unload(reason) {
    simpleprefs.removeListener(ALLOW_GEOLOCATION_PREF, this._onallowed);
    this._stopmonitor();

    // disable is the new uninstall
    if (reason == "disable") {
      this.allowed = false;
    }
  }

})();

exports.Geolocation = Geolocation;
