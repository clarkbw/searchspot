/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

const MAX_RESULTS = 3;
// hold our stats data, should be reset on setEngines
var stats = {};

function setStat(id, k, v) {
  if (!stats[id]) {
    stats[id] = {};
  }
  stats[id][k] = v;
}

self.port.on("suggestions", function(engine, terms, results) {
  //console.log("port.suggestions", engine, terms, results);
  suggestions(engine, terms, results);
});

// Add the relevant results to this engine
// An engine could already have old results listed so this must clear those out
function suggestions(engine, terms, results) {
  var id = _convertEngineName(engine.id),
      count = results.length;

  // look through the results but only until our max count
  for (var i = 0; i < results.length && i < MAX_RESULTS; i++) {
    // Suggestion Result
    var item = results[i];
    //console.log("suggestions", id, item.title, terms);

    // HTML Node for our result
    var $item = $("#"+id).children(":not(.default)").slice(i, i+1);

    // overwrite the contents with the new suggestion results
    _fillResult($item, item.title, terms);
  }

  setStat(engine.id, "suggestions", Math.min(count, MAX_RESULTS));

  // Clean out old results from this engine
  while (count < MAX_RESULTS) {
    _resetResult($("#"+id).children(":not(.default)").slice(count, count+1));
    count++;
  }

  selectFirst();

  resizePanel();
}

self.port.on("setTerms", function(terms) {
  setTerms(terms);
});

// Called often, when new search terms are entered by the user we update
function setTerms(terms) {
  //console.log("setTerms", terms);
  $("#results ul.engine li.result.default").each(function () {
    $(this).data({"terms" : terms });
    $(this).find("span.terms").text(terms);
  });
}

self.port.on("setEngines", function(engines) {
  setEngines(engines);
});

/*
 * Structure of the results
 *
 * <all-suggestions #results>
 *  <web limit="3">
 *  <shopping limit="3">
 *  <social limit="3">
 *  <local limit="3">
 *  <reference limit="3">
 *  <preferences>
 * </all-suggestions>
 *
 */
// Called only on initialization and when there are changes to the engines
function setEngines(engines) {
  stats = {};
  $("#results").empty();

  engines.forEach(function (engine, i, a) {
    var $engine = createEngine(engine);
    if ($engine) {
      setStat(engine.id, "engine", engine);
      setStat(engine.id, "id", engine.id);
      setStat(engine.id, "order", i);
      $("#results").append($engine);
    }
  });

  $("#results").append(preferences());

  selectFirst();

  resizePanel();
}

function selectFirst () {
  // set the initial selection class so we have a default option selected
  $("ul:visible:first, .result:visible:first").trigger("mouseenter");
}

function resizePanel () {
  // This should send a height/width adjustment to our main window so the panel can be resized
  self.port.emit("resize", { "width" : $("#results").width(), "height" : $("#results").height() });
}

function createEngine (engine) {
  var id = _convertEngineName(engine.id);
  //console.log("suggestEngine", id, engine, engine.name, engine.id);
  return $("<ul/>").attr({ "id" : id, "class" : "engine" })
                   .append(
                      $("<li/>").attr({ "class" : "result default" }).
                                 css({ "list-style-image" : "url('" + engine.icon + "')" }).
                                 data({ "id" : engine.id, "index" : 0 }).
                                 append(
                                    $("<span class='terms'/>"),
                                    $("<span class='search'/>").text(engine.name)
                                 ),
                      $("<li/>").attr({ "class" : "result" }).data({ "id" : engine.id, "index" : 1 }),
                      $("<li/>").attr({ "class" : "result" }).data({ "id" : engine.id, "index" : 2 }),
                      $("<li/>").attr({ "class" : "result" }).data({ "id" : engine.id, "index" : 3 })
                  );
}

function preferences () {
  return $('<ul class="preferences"/>').
            append(
                  $('<li/>').attr({ "id" :"preferences"}).
                             text("Search Preferences...").
                             click(function () {
                                      self.port.emit("preferences");
                                      return false;
                                    }
                              )
                  );
}

self.port.on("next", function() {
  next();
});

function next() {
  var result = $(".result.selected").next(":visible");
   if (result.length > 0) {
    result.trigger("mouseenter");
    return;
  }
  // Then try the previous UL with an LI
  result = $(".result.selected").parent().next().find(":visible").first();
  if (result.length > 0) {
    result.trigger("mouseenter");
    return;
  }
}

self.port.on("previous", function() {
  previous();
});

function previous() {
  var result = $(".result.selected").prev(":visible");
  if (result.length > 0) {
    result.trigger("mouseenter");
    return;
  }
  // Then try the previous UL with an LI
  result = $(".result.selected").parent().prev().find(":visible").last();
  if (result.length > 0) {
    result.trigger("mouseenter");
    return;
  }
}

self.port.on("go", function() {
  go();
});

function go() {
  $(".result.selected").click();
}

// Highlight the text with the terms provided while preserving the case used
// returns <strong>wrappers</strong> around the terms found in the text
function highlight(text, terms) {
  var index = text.toLowerCase().indexOf(terms.toLowerCase()),
      pre, mid, post;
  // the terms could not exist in the text at all
  if (index < 0) {
    return text;
  }
  pre = text.substring(0, index);
  mid = text.substring(index, index + terms.length);
  post = text.substring(index + terms.length, text.length);
  return [pre, "<strong>", mid, "</strong>", post].join("");
}

// remove any terms from the result node
function _resetResult($item) {
  jQuery.removeData($item.empty(), "terms");
}

function _fillResult($result, title, terms) {
  $result.data({ "terms" : title }).
          html($("<span class='terms'/>").html(highlight(title, terms)));
}

// utility function to make the engine name into a usable id
// XXX this is not good but works *shrug*
function _convertEngineName(engineName) {
  return engineName.replace(/[\s\W]+/g, "_")
}

// utility function to make the search term into a slightly valid title
// XXX this is not good but works *shrug*
function _convertTitle(title) {
  return title.replace(/[\s\W]+/g, "_")
}

$(document).ready(function () {

  $("ul").live("mouseenter", function() {
    $("ul").removeClass("selected");
    $(this).addClass("selected");
  });

  $("ul").live("mouseleave", function() {
    $(this).removeClass("selected");
  });

  $(".result").live("mouseenter", function() {
    // remove all other possibly selected results
    $(".result").removeClass("selected");
    $(this).addClass("selected").parent().trigger("mouseenter");
  });

  $(".result").live("mouseleave", function() {
    $(this).removeClass("selected");
  });

  $(".result").live("click", function() {
    var id = $(this).data("id");
    setStat(id, "index",  $(this).data("index"))
    self.port.emit("click", { "id" : id,
                              "terms" : $(this).data("terms"),
                              "stats" : stats } );
    return false;
  });

  $("body").keydown(function(e) {
    if (e.keyCode == 40) {
      next();
    } else if (e.keyCode == 38) {
      previous();
    }
  });
});
