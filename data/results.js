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

    // Reset this result node to prep for being set with the new suggestion
    _resetResult($item);

    // Actually set the result into our engine
    if (engine.type == "suggest") {
      suggest(id, item.title, terms);
    } else if (engine.type == "match") {
      match(id, item.title, terms);
    }

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

  // Manually add in a history object to catch the history results
  $("#results").append(createEngine({ "id" : "history", "name" : "History", "icon" : "data:image/icon;base64,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",
                                      "type" : "match" }));

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
  $item.removeClass("match suggest").empty();
  jQuery.removeData($item, "terms");
}

// apply a match to the first unused node
function match(id, title, terms) {
  var $match = $("#" + id).find(".result:not(.default):not(.match)").first();

  $match.addClass("match").
         data({ "type" : "match", "terms" : title }).
         append($("<span class='terms'/>").html(highlight(title, terms))).
         css({ "list-style-image" : "url('" + $match.data("engine-icon") + "')" });
}

// apply a suggestion to the first unused node
function suggest(id, title, terms) {
  var $suggest = $("#" + id).find(".result:not(.default):not(.suggest)").first();

  $suggest.addClass("suggest").
           data({ "type" : "suggest", "terms" : title }).
           append($("<span class='terms'/>").html(highlight(title, terms)));
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
