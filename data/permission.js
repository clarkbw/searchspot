//permission.js

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
