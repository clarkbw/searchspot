/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

$(document).ready(function () {

  $("#ok").click(function() {
    self.port.emit("click", "ok" );
    return false;
  });

  $("#not").click(function() {
    self.port.emit("click", "not" );
    return false;
  });

  $("#not").mouseover(function() {
    $("#otherwise").addClass("scary");
  }).mouseout(function() {
    $("#otherwise").removeClass("scary");
  });

  self.port.emit("resize", { "width" : $("body").width(), "height" : $("body").height() });

});
