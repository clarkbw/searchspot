/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

self.port.on("engine", function(engine) {
  setEngine(engine);
});

function setEngine(engine) {
  $(".icon").attr("src", engine.icon);
  $(".name").text(engine.name);
  $("#url").text(engine.queryURL.replace(/http(s)?:\/\/(www\.)?/,"").match(/([a-zA-Z0-9\-\.]+)\//)[0].replace(/\//,""));
}

$(document).ready(function () {

  $("#ok").click(function() {
    self.port.emit("click", "ok" );
    return false;
  });

  $("#not").click(function() {
    self.port.emit("click", "not" );
    return false;
  });

  self.port.emit("resize", { "width" : $("body").width(), "height" : $("body").height() });

});
