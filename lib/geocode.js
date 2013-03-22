/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

/*jshint forin:true, noarg:true, noempty:true, eqeqeq:true, bitwise:true,
  strict:true, undef:true, curly:true, browser:true, es5:true,
  indent:2, maxerr:50, devel:true, node:true, boss:true, white:true,
  globalstrict:true, nomen:false, newcap:true*/

"use strict";

if (!require('sdk/system/xul-app').is('Firefox')) {
  throw new Error("The geocode module is only tested in Firefox.");
}

var Class = require('sdk/core/heritage').Class,
    xhr = require('sdk/net/xhr'),
    EventTarget = require('sdk/event/target').EventTarget,
    emit = require('api-utils/event/core').emit,
    ns = require('sdk/core/namespace').ns;

var namespace = ns();

var GeocodeClass = Class({
  GOOGLE_GEOCODING_API : "https://maps.googleapis.com/maps/api/geocode/json",
  'extends' : EventTarget,
  initialize: function initialize(options) {
    options = (options !== undefined) ? options : {};
    namespace(this).sensor = (options.sensor !== undefined) ? options.sensor : false;
    namespace(this).language = (options.language !== undefined) ? options.language : null;
    namespace(this).results = [];
    namespace(this).postal_code = "";
    namespace(this).req = new xhr.XMLHttpRequest();
    EventTarget.prototype.initialize.call(this, options);
  },

  get sensor() { return namespace(this).sensor; },
  set sensor(sensor) {
    namespace(this).sensor = sensor;
  },

  /*
   * Formatted address is of the type 'postal_code' from the geocode results
   */
  get formatted_address() {
    if (namespace(this).results && namespace(this).postal_code === "") {
      namespace(this).results.some(function (addr) {
        if (addr.types && addr.types.join("") === 'postal_code') {
          namespace(this).postal_code = addr.formatted_address;
          return true;
        }
        return false;
      }.bind(this));
    }
    return namespace(this).postal_code;
  },

  lookup : function lookup(latitude, longitude) {
    var url = this.GOOGLE_GEOCODING_API + "?" + "latlng=" + latitude + "," + longitude + "&" + "sensor=" + namespace(this).sensor,
      self = this;
    namespace(this).req.open("GET", url);
    namespace(this).req.onreadystatechange = function () {
      var response = null;
      if (this.readyState === 4 && this.status === 200) {
        try {
          response = JSON.parse(this.responseText);
          if (response.status && response.status === "OK") {
            namespace(self).results = response.results;
            namespace(self).postal_code = "";
            emit(self, "geocode", response.results);
          }
        } catch (ignore) {}
      }
    };
    namespace(this).req.send(null);
  }
});

var Geocode = new GeocodeClass();
exports.Geocode = Geocode;
