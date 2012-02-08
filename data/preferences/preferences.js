//preferences.js

var defaults = [];

self.port.on("add", function(tag, engines) {

  if (tag == "_default") {
    defaults = engines;
    return;
  }

  $("ul.nav").append(
                     $("<li/>").append(
                                       $("<a/>").attr({ "href" : "#" + tag }).text(tag)
                                       )
                     );

  var $choices = $("<div class='row engines'/>");

  engines.forEach(function (engine, index, array) {

    var active = defaults.some(function (e, i, a) {
      return e.id == engine.id;
    });

    $choices.append(
      //$("<div class='span2 engine'/>").append(
        $("<button class='btn span3' data-toggle='button'/>").
              append($("<span class='engine'/>").text(engine.name).
                      css({ "background-image" : "url(" + engine.icon + ")"})
                    ).
              click(function () {
                $(this).button("toggle");
                //console.log("self.port.emit", engine.id, $(this).hasClass("active"));
                self.port.emit("toggle", engine.id, $(this).hasClass("active"));
              }).
              button((active)? "toggle" : "reset")
      //)
    );
  });

  $(".container.sections").append(
                                  $("<section/>").attr({ "id" : tag }).append(
                                                                            $("<h3/>").text(tag),
                                                                            $choices
                                                                            )
                                  );
});

$(document).ready(function () {
  
  var engines = {
    "_default" : [ { "name" : "Google.com", "id" : "google.com/search" }, { "name" : "Amazon.com", "id" : "amazon.com/search" },
                   { "name" : "Twitter.com", "id" : "twitter.com/search" }, { "name" : "Wikipedia (en)", "id" : "en.wikipedia.org/search" },
                   { "name" : "Yelp.com", "id" : "yelp.com/search" } ],
    "web" : [ { "name" : "Google.com", "id" : "google.com/search" }, { "name" : "Yahoo.com", "id" : "yahoo.com/search" }, { "name" : "Bing.com", "id" : "bing.com/search" } ],
    "shopping" : [ { "name" : "Amazon.com", "id" : "amazon.com/search" }, { "name" : "Ebay", "id" : "ebay.com/search" } ],
    "social" : [ { "name" : "Twitter.com", "id" : "twitter.com/search" }, { "name" : "Facebook.com", "id" : "facebook.com/search" } ],
    "reference" : [ { "name" : "Wikipedia (en)", "id" : "en.wikipedia.org/search" } ],
    "restaurants" : [ { "name" : "Yelp.com", "id" : "yelp.com/search" } ]
  };

});

