/* This Source Code Form is subject to the terms of the Mozilla Public
* License, v. 2.0. If a copy of the MPL was not distributed with this
* file, You can obtain one at http://mozilla.org/MPL/2.0/. */
"use strict";

const { Geolocation } = require("geolocation");

exports.test_allowed = function(test) {
  test.assert(!Geolocation.allowed, "Geolocation shouldn't be allowed by default");
};

exports.test_monitor_coordinates_and_address = function(test) {
  Geolocation.timeout = 5 * 1000;
  Geolocation.allowed = false;
  Geolocation.once("coords", function(position) {
    test.pass("Found coordinates");
  });
  Geolocation.once("address", function() {
    test.pass("Found address");
    test.done();
  });
  Geolocation.allowed = true;
  test.waitUntilDone(Geolocation.timeout * 2);
};
