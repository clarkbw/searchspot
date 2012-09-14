/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

/*jshint forin:true, noarg:true, noempty:true, eqeqeq:true, bitwise:true,
  strict:true, undef:true, curly:true, browser:true, es5:true,
  indent:2, maxerr:50, devel:true, node:true, boss:true, white:true,
  globalstrict:true, nomen:false, newcap:true*/

/*global $:true, self:true, addon:true */

"use strict";

// catch debug running the panel HTML directly from a browser
if (typeof self === "undefined") {
  self = {};
}

if (typeof self.port === "undefined") {
  self.port = { on : function (signal, callback) { },
                emit : function (signal, objects) { }
              };
}

if (typeof addon === "undefined") {
  var addon = self;
}

function setEngine(engine) {
  $(".icon").attr("src", engine.icon);
  $(".name").text(engine.name);
  $("#url").text(engine.queryURL.replace(/http(s)?:\/\/(www\.)?/, "")
                                .match(/([a-zA-Z0-9\-\.]+)\//)[0]
                                .replace(/\//, ""));
}

addon.port.on("engine", function (engine) {
  setEngine(engine);
});

$(document).ready(function () {

  $("#ok").click(function () {
    addon.port.emit("click", "ok");
    return false;
  });

  $("#not").click(function () {
    addon.port.emit("click", "not");
    return false;
  });

  addon.port.emit("resize", { "width" : $("body").width(),
                              "height" : $("body").height() });

});
