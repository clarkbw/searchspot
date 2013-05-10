/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

/*jshint forin:true, noarg:true, noempty:true, eqeqeq:true, bitwise:true,
  strict:true, undef:true, curly:true, browser:true, es5:true,
  indent:2, maxerr:50, devel:true, node:true, boss:true, white:true,
  globalstrict:true, nomen:false, newcap:true*/

"use strict";

var xulapp = require('sdk/system/xul-app');

if (!xulapp.is('Firefox')) {
  throw new Error("The geolocation module is only tested in Firefox.");
}

var chrome = require('chrome'),
    Class = require('sdk/core/heritage').Class,
    EventTarget = require('sdk/event/target').EventTarget,
    emit = require('api-utils/event/core').emit,
    ns = require('sdk/core/namespace').ns;

var Geocode = require('geocode').Geocode;

var namespace = ns();

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
var GeolocationClass = Class({

  ALLOW_GEOLOCATION_PREF : "allowGeolocation",

  // newer versions of Firefox use a different API and have the pref hardcoded (bug 677256)
  GEO_API_V1 : xulapp.versionInRange(xulapp.version, "4", "8.*"),

  'extends' : EventTarget,
  initialize: function initialize(options) {
    var privateAPI = namespace(this);
    options = (options !== undefined) ? options : {};

    privateAPI.GeolocationSvc = chrome.Cc["@mozilla.org/geolocation;1"].getService(chrome.Ci.nsISupports);

    privateAPI.options = {};
    this.enableHighAccuracy = (options && options.enableHighAccuracy !== undefined) ? options.enableHighAccuracy : false;
    this.timeout = (options && options.timeout !== undefined) ? options.timeout : 15 * 1000; // 15 seconds

    EventTarget.prototype.initialize.call(this, options);

    if (this.GEO_API_V1) {
      var PrefSvc = require("preferences-service"),
          values = { "geo.wifi.protocol" : 0, "geo.wifi.uri" : "https://www.google.com/loc/json" };
      Object.keys(values).forEach(function (key) {
        if (!PrefSvc.isSet(key)) {
          PrefSvc.set(key, values[key]);
        }
      });
    } else {
      Geocode.sensor = true;
      Geocode.on("geocode", function (results) {
        namespace(this).formatted_address = Geocode.formatted_address;
        // emit that we found an address
        emit(this, "address", this.formatted_address);
      }.bind(this));
    }

    privateAPI.formatted_address = "";
    privateAPI.position = null;
    privateAPI.allowed = false;

    require("unload").ensure(this);

  /*
   * An unsigned short returned from the watchPosition function is saved here
   * @see https://developer.mozilla.org/en/nsIDOMGeolocation#method_watchPosition
   */
    privateAPI.monitorID = null;
    this.monitor();
  },


  /* Defaults to just the high accuracy option as false
   * Other options can be set by setting their individual values
   * @type {nsIDOMGeoPositionOptions} object
   * @see https://developer.mozilla.org/en/XPCOM_Interface_Reference/NsIDOMGeoPositionOptions
   */


  /*
   * Getter/Setter for the enableHighAccuracy option of the {nsIDOMGeoPositionOptions}
   * @see https://developer.mozilla.org/en/XPCOM_Interface_Reference/NsIDOMGeoPositionOptions
   */
  get enableHighAccuracy() { return namespace(this).enableHighAccuracy; },
  set enableHighAccuracy(enableHighAccuracy) {
    namespace(this).enableHighAccuracy = enableHighAccuracy;
    namespace(this).options.enableHighAccuracy = enableHighAccuracy;
  },

  /*
   * Getter/Setter for the timeout option of the {nsIDOMGeoPositionOptions}
   * @see https://developer.mozilla.org/en/XPCOM_Interface_Reference/NsIDOMGeoPositionOptions
   */
  get timeout() { return namespace(this).timeout; },
  set timeout(timeout) {
    namespace(this).timeout = timeout;
    namespace(this).options.timeout = timeout;
  },

  /*
   * @returns {nsIDOMGeoPosition} The most recently retrieved location. May be null
   * @see https://developer.mozilla.org/en/XPCOM_Interface_Reference/NsIDOMGeoPosition
   * @see https://developer.mozilla.org/en/nsIDOMGeolocation
   */
  get lastPosition() { return namespace(this).GeolocationSvc.lastPosition; },

  /*
   * @returns {nsIDOMGeoPosition} The most recently retrieved location. May be null
   * @see https://developer.mozilla.org/en/XPCOM_Interface_Reference/NsIDOMGeoPosition
   * @type nsIDOMGeoPosition
   */
  get position() { return namespace(this).position; },


  /*
   * Timestampe of the last reading for the position
   * @type DOMTimeStamp
   */
  get timestamp() { return (this.position) ? this.position.timestamp : null; },

  /*
   * Most recently retrieved coordinates
   * @type nsIDOMGeoPositionCoords
   * @see https://developer.mozilla.org/en/XPCOM_Interface_Reference/nsIDOMGeoPositionCoords
   */
  get coords() { return (this.position) ? this.position.coords : null; },

  /*
   * Helper function for most recently retrieved latitude
   * @type String
   * @returns latitud or empty string
   */
  get latitude() { return (this.coords) ? this.coords.latitude : ""; },

  /*
   * Helper function for most recently retrieved longitude
   * @type String
   * @returns longitude or empty string
   */
  get longitude() { return (this.coords) ? this.coords.longitude : ""; },

  /*
   * Private variable
   * Most recently retrieved address from the V1 GEO API
   * @type nsIDOMGeoPositionAddress
   * @see https://developer.mozilla.org/en/XPCOM_Interface_Reference/nsIDOMGeoPositionAddress
   */
  get address() { return namespace(this).address; },

  /*
   * Formatted Address helper that creates a City, Region format useful for geocoding results
   * @returns {String} City, Region format of the address of hte lastPosition
   */
  get formatted_address() {
    return namespace(this).formatted_address;
  },

  // It's the callers responsibility to actually put this question up to the user
  // Once this is set location is automatically aquired by the system
  get allowed() { return namespace(this).allowed; },
  set allowed(allow) {
    namespace(this).allowed = allow;
    // If the pref changes run the monitor function which will turn on or off as needed
    this.monitor();
  },

  /*
   * Sets a position watch, this can be run as the allowed preference changes
   * and it will stop or start monitoring wrt the the allowed preference
   * @see https://developer.mozilla.org/en/nsIDOMGeolocation#method_watchPosition
   */
  // 
  monitor : function monitor_geolocation() {
    if (!this.allowed) { this._stopmonitor(); return; }
    if (namespace(this).monitorID === null) {
      try {
        namespace(this).monitorID = namespace(this).GeolocationSvc.watchPosition(this._setposition.bind(this),
                                                                                 this._onerror.bind(this),
                                                                                 namespace(this).options);
      } catch (error) { console.exception(error); }
    }
  },

  /*
   * This provides the nsIDOMGeoPositionCallback function for our monitor (watchPosition) call
   * Called every time a new position is found, even if it's not different
   * will emit events for all positions received
   * @see https://developer.mozilla.org/en/XPCOM_Interface_Reference/NsIDOMGeoPositionCallback
   * @param {nsIDOMGeoPosition} position The GeoPosition object
   * @see https://developer.mozilla.org/en/XPCOM_Interface_Reference/NsIDOMGeoPosition
   */
  _setposition : function _setposition(position) {
    namespace(this).position = position;

    // emit the minimal coordinates if that's what callers are looking for
    emit(this, "coords", this.coords);

    // the older (better) API gave us the address with the coordinates
    if (this.GEO_API_V1) {
      // no reason to save this, but why not?
      namespace(this).address = position.address;
      namespace(this).formatted_address = position.address.city + ", " + position.address.region;
      // emit an address lookup
      emit(this, "address", this.formatted_address);

    // the newer v2 API only gives coordinates so we need to lookup the address on our own
    } else {
      Geocode.lookup(position.coords.latitude, position.coords.longitude);
    }
  },

  /*
   * This provides the nsIDOMGeoPositionErrorCallback
   * @see https://developer.mozilla.org/en/XPCOM_Interface_Reference/NsIDOMGeoPositionErrorCallback
   * @param {nsIDOMGeoPositionError} e GeoPosition Error object
   * @see https://developer.mozilla.org/en/XPCOM_Interface_Reference/NsIDOMGeoPositionError
   */
  _onerror : function onerror(e) {
    if (e.code === e.PERMISSION_DENIED) {
      console.error("GeoLocation Error: Permission denied");
    } else if (e.code === e.POSITION_UNAVAILABLE) {
      console.debug("GeoLocation Error: Position Unavailable");
    } else if (e.code === e.TIMEOUT) {
      console.debug("GeoLocation Error: Timeout");
    }
  },

  _stopmonitor : function _stop_monitor() {
    var monitorID = namespace(this).monitorID;
    if (monitorID !== null) {
      namespace(this).GeolocationSvc.clearWatch(monitorID);
      namespace(this).monitorID = null;
    }
  },

  unload: function geolocation_unload(reason) {
    this._stopmonitor();

    // disable is the new uninstall
    if (reason === "disable") {
      this.allowed = false;
    }
  }

});

var Geolocation = new GeolocationClass();
exports.Geolocation = Geolocation;
