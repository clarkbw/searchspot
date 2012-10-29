/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const xhr = require("xhr");
const { EventEmitter } = require("events");

const GOOGLE_GEOCODING_API = "https://maps.googleapis.com/maps/api/geocode/json";

const Geocode = EventEmitter.compose({
  _emit: EventEmitter.required,
  on: EventEmitter.required,
  once: EventEmitter.required,

  _sensor : false,
  get sensor() this._sensor,
  set sensor(s) this._sensor = s,

  _language : "",
  get language() this._language,
  set language(l) this._language = l,

  _results : "",
  get results() this._results,

  _postal_code : "",
  get postal_code() {
    if (this._postal_code == "") {
      for (var i in this._results) {
        var addr = this._results[i];
        //console.log(i,addr.formatted_address, addr.types);
        if (addr.types && addr.types.join("") == "postal_code") {
          this._postal_code = addr.formatted_address;
          break;
        }
      }
    }
    return this._postal_code;
  },

  constructor : function GeocodeModule() { },

  lookup : function lookup(latitude, longitude, sensor) {
    if (sensor) {
      this._sensor = sensor;
    }
    var url = GOOGLE_GEOCODING_API + "?" + "latlng=" + latitude + "," + longitude + "&" + "sensor=" + this._sensor;
    //console.log(url);
    var req = new xhr.XMLHttpRequest();
    req.open("GET", url);
    req.onreadystatechange = function() {
      if (req.readyState == 4 && req.status == 200) {
        //console.log("req.responseText", req.responseText);
        var response = JSON.parse(req.responseText);
        if (response["status"] == "OK") {
          this._results = response["results"];
          this._emit("geocode", this.results);
        }
      }
    }.bind(this);
    req.send(null);
  }

})();


exports.Geocode = Geocode;
