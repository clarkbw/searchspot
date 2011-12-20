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
    "The geocode module is only tested in Firefox.  In the future ",
    "we would like it to support other applications, however.  Please see ",
    "https://bugzilla.mozilla.org/show_bug.cgi?id=jetpack-panel-apps ",
    "for more information."
  ].join(""));
}

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

  lookup : function lookup(latitude, longitude, sensor) {
    if (sensor) {
      this._sensor = sensor;
    }
    var url = GOOGLE_GEOCODING_API + "?" + "latlng=" + latitude + "," + longitude + "&" + "sensor=" + this._sensor;
    console.log(url);
    var req = new xhr.XMLHttpRequest();
    req.open("GET", url);
    req.onreadystatechange = function() {
      if (req.readyState == 4 && req.status == 200) {
        console.log("req.responseText", req.responseText);
        this._results = JSON.parse(req.responseText);
        this._emit("geocode", this.results);
      }
    }.bind(this);
    req.send(null);
  }

})();


exports.Geocode = Geocode;
