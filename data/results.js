//results.js

self.port.on("add", function(results) {
  add(results);
});

// Add the relevant results to this engine
// An engine could already have old results listed so this must clear those out
function add(results) {
  // { "name" : name, "type" : type, "terms" : terms, "results" : [ "title" : title, "url" : url ] }
  var id = _convertEngineName(results.name);

  // Keep track of how many results we use from the list
  var count = 0;

  for (var i in results.results) {
    // Suggestion Result
    var item = results.results[i];
    // HTML Node for our result
    var $item = $("#"+id).children(":not(.default)").slice(count, count+1);

    // If the same result already exists in the previous engines skip this suggestion
    // XXX this isn't particularly fast but works
    if ($("#"+id).prevAll().find(".result." + results.type + "[title='" + _convertTitle(item.title) + "']").length > 0) {
      continue;
    }

    // Reset this result node to prep for being set with the new suggestion
    _resetResult($item);

    // At this point we're going to use this suggestion, up our count
    count++;

    // If the same result exists in one of the items below us remove it because this should be more important
    // XXX this isn't particularly fast but works
    $("#"+id).nextAll().find(".result." + results.type + "[title='" + _convertTitle(item.title) + "']").each(function () {
      _resetResult($(this));
    });

    //dump("i: " + i + " : " + $("#"+id).children(":not(.default)").slice(count, count+1).attr("title") + "\n");

    // Actually set the result into our engine
    if (results.type == "suggest") {
      suggest(id, results.name, item.title, results.terms);
    } else if (results.type == "match") {
      match(id, results.name, item.title, results.terms, item.url);
    }

  }

  // Clean out old results from this engine
  while (count < 3) {
    _resetResult($("#"+id).children(":not(.default)").slice(count, count+1));
    count++;
  }

  // This should send a height/width adjustment to our main window so the panel can be resized
  self.port.emit("resize", { "width" : $("#results").width(), "height" : $("#results").height() });
}

self.port.on("setTerms", function(terms) {
  setTerms(terms);
});

// Called often, when new search terms are entered by the user we update
function setTerms(terms) {
  $("#results ul.type li.result.default").each(function () {
    $(this).data({"terms" : terms });
    $(this).find("span.terms").html(highlight(terms, terms));
  });
}

self.port.on("addEngine", function(engine) {
  addEngine(engine);
});

function addEngine(engine) {
  $("#results").append(createEngine(engine));
}

self.port.on("removeEngine", function(engine) {
  removeEngine(engine);
});

function removeEngine(engine) {
  var id = _convertEngineName(engine.name);
  $("#" + id).remove();
}

function createEngine(engine) {
  var id = _convertEngineName(engine.name);
  return $("<ul/>").attr({ "id" : id, "class" : "type" })
                  .append(
                    $("<li/>").attr({ "class" : "result default", "title" : engine.description }).
                               css({ "list-style-image" : "url('" + engine.icon + "')" }).
                               data({ "type" : "suggest", "engine" : engine.name }).
                               append(
                                  $("<span class='engine'/>").text(engine.name),
                                  $("<span class='dash'/>").html(" &mdash; "),
                                  $("<span class='terms'/>"),
                                  $("<span class='search'/>").text("search")
                               ),
                    $("<li/>").attr({ "class" : "result" }).data({ "engine" : engine.name }),
                    $("<li/>").attr({ "class" : "result" }).data({ "engine" : engine.name }),
                    $("<li/>").attr({ "class" : "result" }).data({ "engine" : engine.name })
                  );
}

self.port.on("setEngines", function(engines) {
  setEngines(engines);
});

// Called only on initialization and when there are changes to the engines
function setEngines(engines) {
  $("#results").empty();

  for (var engine in engines) {
    $("#results").append(createEngine(engines[engine]));
  }

  // set the initial selection class so we have a default option selected
  $("ul:first, .result:first").trigger("mouseover");

  // This should send a height/width adjustment to our main window so the panel can be resized
  self.port.emit("resize", { "width" : $("#results").width(), "height" : $("#results").height() });
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

// This hack makes the Yelp HTML results work with real suggestion results
self.port.on("yelp", function(results) {

  // Use the DOM to parse and extract the title information (suggestions)
  var terms = [], count = 3;
  $("<div/>").html(results.results).find("li[title]").each(function () {
    if (count-- <= 0) {
      return;
    }
    var item = $(this).attr("title");

    // Skip the suggestion that is a copy of our user entered terms
    if (results.terms != item) {
      terms.push({ "title" : item, "url" : ""});
    }
  });

  results.results = terms;

  // Send the new results to our add() method for inserting
  add(results);

});


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
  $item.removeClass("match suggest").removeAttr("title").empty();
  jQuery.removeData($item, "type", "terms");
}

// apply a match to the first unused node
function match(id, engine, title, terms, url) {
  var $match = $("#" + id).find(".result:not(.default):not(.match)").first();

  $match.addClass("match").
         attr({"title" : _convertTitle(title), "href" : url}).
         data({ "type" : "match", "terms" : title }).
         append(
            $("<span class='go'/>").text("go"),
            $("<span class='title'/>").html(highlight(title, terms))
          );
}

// apply a suggestion to the first unused node
function suggest(id, engine, title, terms) {
  var $suggest = $("#" + id).find(".result:not(.default):not(.suggest)").first();

  $suggest.addClass("suggest").
           attr({"title" : _convertTitle(title)}).
           data({ "type" : "match", "terms" : title }).
           append(
              $("<span class='search'/>").text("search"),
              $("<span class='terms'/>").html(highlight(title, terms))
            );
}

// utility function to make the engine name into a usable id
// XXX this is not good but works *shrug*
function _convertEngineName(engineName) {
  return engineName.replace(/[\s(\)\.]*/g, "_")
}

// utility function to make the search term into a slightly valid title
// XXX this is not good but works *shrug*
function _convertTitle(title) {
  return title.replace(/[\s(\)\.'"]*/g, "_")
}


$(document).ready(function () {

  // I'm testing with Chrome so we only show debug data in chrome and not our add-on
  if ($.browser.webkit) {
    setEngines([
        { "name" : "Google", "search" : function(terms) { return "http://www.google.com/search?q=" + encodeURIComponent(terms); }, "icon" : "data:image/png;base64,AAABAAEAEBAAAAEAGABoAwAAFgAAACgAAAAQAAAAIAAAAAEAGAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADs9Pt8xetPtu9FsfFNtu%2BTzvb2%2B%2Fne4dFJeBw0egA%2FfAJAfAA8ewBBegAAAAD%2B%2FPtft98Mp%2BwWsfAVsvEbs%2FQeqvF8xO7%2F%2F%2F63yqkxdgM7gwE%2FggM%2BfQA%2BegBDeQDe7PIbotgQufcMufEPtfIPsvAbs%2FQvq%2Bfz%2Bf%2F%2B%2B%2FZKhR05hgBBhQI8hgBAgAI9ewD0%2B%2Fg3pswAtO8Cxf4Kw%2FsJvvYAqupKsNv%2B%2Fv7%2F%2FP5VkSU0iQA7jQA9hgBDgQU%2BfQH%2F%2Ff%2FQ6fM4sM4KsN8AteMCruIqqdbZ7PH8%2Fv%2Fg6Nc%2Fhg05kAA8jAM9iQI%2BhQA%2BgQDQu6b97uv%2F%2F%2F7V8Pqw3eiWz97q8%2Ff%2F%2F%2F%2F7%2FPptpkkqjQE4kwA7kAA5iwI8iAA8hQCOSSKdXjiyflbAkG7u2s%2F%2B%2F%2F39%2F%2F7r8utrqEYtjQE8lgA7kwA7kwA9jwA9igA9hACiWSekVRyeSgiYSBHx6N%2F%2B%2Fv7k7OFRmiYtlAA5lwI7lwI4lAA7kgI9jwE9iwI4iQCoVhWcTxCmb0K%2BooT8%2Fv%2F7%2F%2F%2FJ2r8fdwI1mwA3mQA3mgA8lAE8lAE4jwA9iwE%2BhwGfXifWvqz%2B%2Ff%2F58u%2Fev6Dt4tr%2B%2F%2F2ZuIUsggA7mgM6mAM3lgA5lgA6kQE%2FkwBChwHt4dv%2F%2F%2F728ei1bCi7VAC5XQ7kz7n%2F%2F%2F6bsZkgcB03lQA9lgM7kwA2iQktZToPK4r9%2F%2F%2F9%2F%2F%2FSqYK5UwDKZAS9WALIkFn%2B%2F%2F3%2F%2BP8oKccGGcIRJrERILYFEMwAAuEAAdX%2F%2Ff7%2F%2FP%2B%2BfDvGXQLIZgLEWgLOjlf7%2F%2F%2F%2F%2F%2F9QU90EAPQAAf8DAP0AAfMAAOUDAtr%2F%2F%2F%2F7%2B%2Fu2bCTIYwDPZgDBWQDSr4P%2F%2Fv%2F%2F%2FP5GRuABAPkAA%2FwBAfkDAPAAAesAAN%2F%2F%2B%2Fz%2F%2F%2F64g1C5VwDMYwK8Yg7y5tz8%2Fv%2FV1PYKDOcAAP0DAf4AAf0AAfYEAOwAAuAAAAD%2F%2FPvi28ymXyChTATRrIb8%2F%2F3v8fk6P8MAAdUCAvoAAP0CAP0AAfYAAO4AAACAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACAAQAA" },
        { "name" : "Yelp", "search" : function(terms) { return "http://yelp.com/search?find_desc=" + encodeURIComponent(terms); }, "icon" : "data:image/x-icon;base64,AAABAAEAEBAQAAEABAAoAQAAFgAAACgAAAAQAAAAIAAAAAEABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAbgJqAIoCdgCaAnoAnhKCAKYijgCuLpIAskKeALpSpgC+Yq4AzHy8ANqezgDmvt4A7tLqAPz5+wD///8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAKlRFIoABWAKERERE6ADcKMzzu2hOgAAhERK8REWCWBERE36ERMHMEREvo6iEgY6hEn6Pu0mAzqkz/xjMzoDNwpERERDoAMzAKlERIoAAzMAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD//wAA//8AAP//AADAOQAAgBkAAAAPAAAACQAAAAkAAAAIAAAACAAAAAgAAIAYAADAOAAA//8AAP//AAD//wAA" },
        { "name" : "Amazon", "search" : function(terms) { return "http://www.amazon.com/s/?field-keywords=" + encodeURIComponent(terms); }, "icon" : "data:image/x-icon;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAABGdBTUEAAK/INwWK6QAAABl0RVh0U29mdHdhcmUAQWRvYmUgSW1hZ2VSZWFkeXHJZTwAAAHgSURBVHjalFM9TNtQEP4cB7PwM1RITUXIgsRaYEEVEyKZwhiyZAQyd0BhpFOlIjoBqhjSqVQMoVMLLAjEwECCQJkSkBqJYDOAFOMKFSf28d7DTUxiUDnp/Pzeu/vuu7t3ICKF6SLTMv2/lB0fRWKfjwDm4JJisYh0Oo3fpZLYT0SjSCQS8JAFMADNDZ3NZsnf1taiqVTKi4nGASruk5lkkmTmMB6JUKFQqO+DfX1eABWeQoVR6f7HSdM0obqu48Yw8G1tDT82NsRd1TSbU9BbGPCog8PDj+jLzurFoAVgMh4XxoNDQ6SqKi0tL9eBvAB8zZwymYxYY7EYAoEA8vm82BNTg6XUIs0MeGTZoR1mhXSnwNl4pmAbjU7mcjkKhkL1ynMnntZ4OEw3VyrV8utk7s5TdW++0QXz+1i3P7IK36t+PCfVn1OQOoOA0gXr5DPak+cPXbBK+/T3S69AtY3LJ98vZ1or/iLr+pTuvr59/A6s003UdqZFJF/PCKQ3o5CUznoBST2AfbEF/9iqYEDaIfwj73VJPEfgNTe0tWNYR0uwy9uOW0OkrgHI7z5ADo2C7v48nLV3XHKAT+x/1m1sX58xsBxg8rZJrDYD8DHHp4aJj/MK09sXjPOt46PcCzAACXY8/u34wN0AAAAASUVORK5CYII=" },
        { "name" : "Twitter", "search" : function(terms) { return "http://twitter.com/#!/search/" + encodeURIComponent(terms); }, "icon" : "data:image/x-icon;base64,AAABAAEAEBAAAAEAIABoBAAAFgAAACgAAAAQAAAAIAAAAAEAIAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAAAAD///8A////AP///wD///8A////AP///wD///8A////AP///wD///8A////AP///wD///8A////AP///wD///8A////AP///wD///8A/v7+D/7+/j/+/v5g/v7+YP7+/mD+/v5I/v7+KP///wD///8A////AP///wD///8A////AP///wD+/v4H/v7+UPbv4pHgx47B1K9Y3tWwWN7Ur1je3sKCx+rbuKj+/v5n/v7+GP///wD///8A////AP///wD+/v4Y+fbweM2ycMe2iB7/vI0f/8STIf/KlyL/zJki/8yZIv/LmCL/0ahK5/Hp1JH+/v4Y////AP///wD///8A7OTTaquHN+CujkXPs5ZTv6N6G/+2iB7/xpUh/8yZIv/MmSL/zJki/8yZIv/Kmy738OjUi////wD///8A////AMKtfY7w6+Ef////AP///wD///8A3sqbp8iWIf/MmSL/zJki/8yZIv/MmSL/y5gi/8mePO7+/v4w////AP///wD///8A////AP///wD+/v4H/v7+V9CtWN3KmCL/zJki/8yZIv/MmSL/zJki/8yZIv/JlyH/5tSqp/7+/mD+/v4/////AP///wD///8A+PXvJtGyZdXNnS/3y5gi/8qYIv/LmCL/zJki/8yZIv/MmSL/y5gi/82iPO7LqVfe0byMmf///wD///8A/v7+D/Do1JHKmy73ypci/8KSIP+/jyD/xpQh/8uYIv/MmSL/zJki/8qYIv+/jyD/rIEd/9nKqH7///8A////APPu4TzAlSz3wZEg/7mLH/+sgR3/uZdGz7mLH//JlyH/zJki/8yZIv/GlSH/to0r9eXbxD/Vx6dg////AP7+/h/p38WhtIsq9al/HP+kfyjuybaKgf///wCzjzjlwJAg/8qYIv/JlyH/u4wf/8CkYrn///8A////AP///wDj2sRMnHUa/7meYa7Vx6dg////AP///wD///8A2MmnYK6DHf++jiD/vo4g/62CHf/k2sQ/////AP///wD///8A8OvhH/f07w////8A////AP///wD///8A////AP///wC/p3Cfpnwc/66GKvPg1LZ8////AP///wD///8A////AP///wD///8A////AP///wD///8A////AP///wD///8A////ANXHp2DJtoqByLWKgf///wD///8A////AP///wD///8A////AP///wD///8A////AP///wD///8A////AP///wD///8A////AP///wD///8A////AP///wD///8A////AP///wD///8A////AP///wD///8A////AP///wD///8A////AP///wD///8A////AP///wD///8A//8AAP//AADgPwAAwA8AAIAHAAB4BwAA+AMAAPAAAADgAQAA4AMAAMEDAADPhwAA/48AAP/nAAD//wAA//8AAA==" },
        { "name" : "Wikipedia", "search" : function(terms) { return "http://en.wikipedia.org/w/index.php?title=Special%3ASearch&search=" + encodeURIComponent(terms); }, "icon" : "data:image/x-icon;base64,AAABAAEAEBAQAAEABAAoAQAAFgAAACgAAAAQAAAAIAAAAAEABAAAAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAEAgQAhIOEAMjHyABIR0gA6ejpAGlqaQCpqKkAKCgoAPz9%2FAAZGBkAmJiYANjZ2ABXWFcAent6ALm6uQA8OjwAiIiIiIiIiIiIiI4oiL6IiIiIgzuIV4iIiIhndo53KIiIiB%2FWvXoYiIiIfEZfWBSIiIEGi%2FfoqoiIgzuL84i9iIjpGIoMiEHoiMkos3FojmiLlUipYliEWIF%2BiDe0GoRa7D6GPbjcu1yIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA" },
        { "name" : "Ebay", "search" : function(terms) { return "http://www.ebay.com/sch/i.html?_nkw=" + encodeURIComponent(terms); }, "icon" : "data:image/x-icon;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAABFUlEQVQ4jdWTvUoDQRSFvxUfQMFSyBvYpLGSSWFpncY6lsLWFiupBBtLBRsfQcQ2a782PoCkSrONlUGy5LPYn6wbu4DghcOcYs65595hIpVNamsj9V8ajOeFzgsFLmo+LxTXcWJVX8WyppIgKSVPkQQ/F0u3gSFwBfTqdoPoBYDnxRFcDgA4Z4cbPtazqblZptBgxJ2BtGydv+vbkyahSUGC0zxT7VeZ0DguBXFsRs9AKtzq/amOKA2sTAylzMDKoIM6wfXhcWmcBKd51ukeWq8Qx6V0MmFAuppxdx/OIgB6e/32+SoTUGfdHTxy0CRodtF6jZpW2R2qs/alQNrgYTytR8Cf1Rh08VuNGkECJCtd5L//TN/BEWxoE8dlIQAAAABJRU5ErkJggg==" }
    ]);

    var terms = "rolling stones";
    setTerms(terms);
    add({ "name" : "Google", "type" : "suggest", "terms" : terms, "results" : [ { "title" : "rolling stones band" } ] });
    add({ "name" : "Amazon", "type" : "suggest", "terms" : terms, "results" : [ { "title" : "rolling stones banditas" }, { "title" : "rolling stonsets" }, { "title" : "roling banditas" }   ] });
    add({ "name" : "Yelp", "type" : "match", "terms" : terms, "results" : [ { "title" : "rolling stones", "url" : "http://www.yelp.com/rollingstones" } ] });
    add({ "name" : "Twitter", "type" : "match", "terms" : terms, "results" : [ { "title" : "The Rolling Stones", "url" : "http://twitter.com/#!/rollingstones" } ] });
    add({ "name" : "Wikipedia", "type" : "match", "terms" : terms, "results" : [ { "title" : "The Rolling Stones", "url" : "http://en.wikipedia.org/The_Rolling_Stones" } ] });
  }

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
    self.port.emit("click", { url : $(this).attr("href"),
                              type : $(this).data("type"),
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
