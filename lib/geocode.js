/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

if (!require("sdk/system/xul-app").is("Firefox")) {
  throw new Error("The geocode module is only tested in Firefox.");
}

var Class = require('sdk/core/heritage').Class;
var xhr = require("sdk/net/xhr");
var EventTarget = require('sdk/event/target').EventTarget;
var emit = require('api-utils/event/core').emit;
//var ns = require('sdk/namespace');

var GeocodeClass = Class({
  GOOGLE_GEOCODING_API : "https://maps.googleapis.com/maps/api/geocode/json",
  'extends' : EventTarget,
  initialize: function initialize(options) {
    this.sensor = (options && options.sensor !== undefined) ? options.sensor : null;
    this.language = (options && options.language !== undefined) ? options.language : null;
    this.results = [];
    this.postal_code = "";
    this.req = new xhr.XMLHttpRequest();
    EventTarget.prototype.initialize.call(this, options);
  },

  setPostalCode : function setPostalCode() {
    this.postal_code = "";
    var self = this;
    if (this.results) {
      this.results.some(function (addr) {
        if (addr.types && addr.types.join("") === "postal_code") {
          self.postal_code = addr.formatted_address;
          return true;
        }
        return false;
      });
    }
  },

  lookup : function lookup(latitude, longitude) {
    var url = this.GOOGLE_GEOCODING_API + "?" + "latlng=" + latitude + "," + longitude + "&" + "sensor=" + this.sensor,
      self = this;
    console.log(url);
    this.req.open("GET", url);
    this.req.onreadystatechange = function() {
      var response = null;
      if (this.readyState == 4 && this.status == 200) {
        console.log("req.responseText", this.responseText);
        try {
          response = JSON.parse(this.responseText);
          if (response.status && response.status === "OK") {
            self.results = response.results;
            self.setPostalCode();
            emit(self, "geocode", response.results);
          }
        } catch (ignore) {}
      }
    }.bind(this);
    this.req.send(null);
  }
});

var Geocode = new GeocodeClass();
exports.Geocode = Geocode;
