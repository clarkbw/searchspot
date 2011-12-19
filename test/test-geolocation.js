const { Geolocation } = require("geolocation");

exports.test_test_run = function(test) {
  test.pass("Unit test running!");
};

exports.test_allowed = function(test) {
  test.assert(!Geolocation.allowed, "Geolocation shouldn't be allowed by default");
};

exports.test_monitor = function(test) {
  Geolocation.timeout = 5 * 1000;
  Geolocation.once("position", function(position) {
    test.pass("Found position");
    test.done();
  });
  Geolocation.allowed = true;
  test.waitUntilDone(Geolocation.timeout);
};

