const { Geolocation } = require("geolocation");

exports.test_test_run = function(test) {
  test.pass("Unit test running!");
};

exports.test_allowed = function(test) {
  test.assert(!Geolocation.allowed, "Geolocation shouldn't be allowed by default");
};

exports.test_monitor_coordinates = function(test) {
  Geolocation.timeout = 5 * 1000;
  Geolocation.allowed = false;
  Geolocation.once("coords", function(position) {
    test.pass("Found coordinates");
    test.done();
  });
  Geolocation.allowed = true;
  test.waitUntilDone(Geolocation.timeout * 2);
};

exports.test_monitor_address = function(test) {
  Geolocation.timeout = 5 * 1000;
  Geolocation.allowed = false;
  Geolocation.once("address", function(position) {
    test.pass("Found address");
    test.done();
  });
  Geolocation.allowed = true;
  test.waitUntilDone(Geolocation.timeout * 2);
};
