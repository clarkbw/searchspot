/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

const MAX_RESULTS = 3;

self.port.on("suggestions", function(engine, terms, results) {
  //console.log("port.suggestions", engine, terms, results);
  suggestions(engine, terms, results);
});

// Add the relevant results to this engine
// An engine could already have old results listed so this must clear those out
function suggestions(engine, terms, results) {
  var id = _convertEngineName(engine.id);

  for (var i = 0; i < results.length; i++) {
    // Suggestion Result
    var item = results[i];
    //console.log("suggestions", id, item.title, terms);

    // HTML Node for our result
    var $item = $("#"+id).children(":not(.default)").slice(i, i+1);

    // overwrite the contents with the new suggestion results
    _fillResult($item, item.title, engine.type, terms);
  }

  // count of results this time, we need to clean out other possibly old results
  var count = results.length;

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
 *  <history type="matches" limit="1">
 *  <web type="suggestions" limit="3">
 *  <shopping type="suggestions" limit="3">
 *  <social type="suggestions" limit="3">
 *  <restaurants type="suggestions" limit="3">
 *  <reference type="matches" limit="3">
 *  <preferences>
 * </all-suggestions>
 *
 */
// Called only on initialization and when there are changes to the engines
function setEngines(engines) {
  $("#results").empty();

  engines.forEach(function (engine, i, a) {
    var $engine = createEngine(engine);
    if ($engine) {
      $("#results").append($engine);
    }
  });

  $("#results").append(preferences());

  selectFirst();

  resizePanel();
}

function selectFirst () {
  // set the initial selection class so we have a default option selected
  $("ul:visible:first, .result:visible:first").trigger("mouseover");
}

function resizePanel () {
  // This should send a height/width adjustment to our main window so the panel can be resized
  self.port.emit("resize", { "width" : $("#results").width(), "height" : $("#results").height() });
}

function createEngine (engine) {
  if (engine.type == "suggest") {
    return suggestEngine(engine);
  } else if (engine.type == "match") {
    return matchEngine(engine);
  }
  console.error("createEngine", engine.id, engine.type, engine);
  return null;
}

// This is different from the suggest engine because it doesn't have a default
// search action, instead it always has an exact match
function matchEngine (engine) {
  var id = _convertEngineName(engine.id);
  //console.log("matchEngine", id, engine, engine.name, engine.id);
  return $("<ul/>").attr({ "id" : id, "class" : "engine" })
                   .append(
                      $("<li/>").attr({ "class" : "result" }).
                                 css({ "list-style-image" : "url('" + engine.icon + "')" }).
                                 data({ "type" : "match", "engine" : engine.id, "engine-icon" : engine.icon }),
                      $("<li/>").attr({ "class" : "result" }).data({ "engine" : engine.id }),
                      $("<li/>").attr({ "class" : "result" }).data({ "engine" : engine.id })
                  );
}

function suggestEngine (engine) {
  var id = _convertEngineName(engine.id);
  //console.log("suggestEngine", id, engine, engine.name, engine.id);
  return $("<ul/>").attr({ "id" : id, "class" : "engine" })
                   .append(
                      $("<li/>").attr({ "class" : "result default" }).
                                 css({ "list-style-image" : "url('" + engine.icon + "')" }).
                                 data({ "type" : "suggest", "engine" : engine.id }).
                                 append(
                                    $("<span class='terms'/>"),
                                    $("<span class='search'/>").text(engine.name)
                                 ),
                      $("<li/>").attr({ "class" : "result" }).data({ "engine" : engine.id }),
                      $("<li/>").attr({ "class" : "result" }).data({ "engine" : engine.id }),
                      $("<li/>").attr({ "class" : "result" }).data({ "engine" : engine.id })
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
    result.trigger("mouseover");
    return;
  }
  // Then try the previous UL with an LI
  result = $(".result.selected").parent().next().find(":visible").first();
  if (result.length > 0) {
    result.trigger("mouseover");
    return;
  }
}

self.port.on("previous", function() {
  previous();
});

function previous() {
  var result = $(".result.selected").prev(":visible");
  if (result.length > 0) {
    result.trigger("mouseover");
    return;
  }
  // Then try the previous UL with an LI
  result = $(".result.selected").parent().prev().find(":visible").last();
  if (result.length > 0) {
    result.trigger("mouseover");
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
  var index = text.toLowerCase().indexOf(terms.toLowerCase());
  // the terms could not exist in the text at all
  if (index < 0) {
    return text;
  }
  var pre = text.substring(0, index);
  var mid = text.substring(index, index + terms.length);
  var post = text.substring(index + terms.length, text.length);
  return [].concat(pre, "<strong>", mid, "</strong>", post).join("");
}

// remove any trace of match or suggestion from the result node
function _resetResult($item) {
  jQuery.removeData($item.empty(), "terms");
}

function _fillResult($result, title, type, terms) {
  $result.data({ "type" : type, "terms" : title }).
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

  $("ul").live("mouseover", function() {
    // clear out the initial selection
    $("ul").removeClass("selected");
    $(this).addClass("selected");
  });

  $(".result").live("mouseover", function() {
    // clear out the initial selection
    $(".result").removeClass("selected");
    $(this).addClass("selected");
  });

  $(".result").live("click", function() {
    self.port.emit("click", { type : $(this).data("type"),
                              engine : $(this).data("engine"),
                              terms : $(this).data("terms") } );
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
