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

// utility function to remove the ability to select the text of the suggestions
// http://stackoverflow.com/questions/2700000/how-to-disable-text-selection-using-jquery
(function($){
    $.fn.disableSelection = function() {
        return this
                 .attr('unselectable', 'on')
                 .css('user-select', 'none')
                 .on('selectstart', false);
    };
})($);

var Suggestion = Backbone.Model.extend({
  defaults: {
    "focus" : false,
    "suggestion" : "",
    "terms" : ""
  },
  focus : function focus(options) {
    options = options || {}
    this.set("focus", true, options);
    if (this.has("suggestion")) {
      return this;
    } else { // without a suggestion to offer we want to ignore this
      return null;
    }
  },
  blur : function blur(options) {
    options = options || {}
    this.set("focus", false, options);
    return this;
  }
});

var Suggestions = Backbone.Collection.extend({
  model : Suggestion,
  initialize : function Suggestions() {
    this.on("change:focus", this.onFocus, this);
  },
  onFocus : function onFocus(model, value, options) {
    // ensure no other suggestions are keeping focus
    if (value) {
      this.where({focus:true}).forEach(function(m) {
        if (model != m) {
          m.blur();
        }
      });
    }
  },
  getFocus : function getFocus() {
    return this.where({focus:true})[0];
  },
  blur : function blur() {
    this.where({focus:true}).forEach(function(s) {
      s.blur();
    });
    return this;
  },
  focusNext : function focusNext() {
    var infocus = this.getFocus(),
        index = -1,
        next = null;

    // if nothing is focused lets focus the first item and return
    if (infocus == null) {
      return this.first().focus();
    }

    index = this.indexOf(infocus)+1;

    if (index <= this.length) {
      next = this.at(index);
    }

    if (next) {
      return next.focus();
    }

    // we might be returning null here if nextfocus didn't exist
    return next;

  },
  focusPrevious : function focusPrevious() {
    var infocus = this.getFocus(),
        index = -1,
        previous = null;

    // if nothing is focused lets focus the last item and return
    if (infocus == null) {
      return this.last().focus();
    }

    index = this.indexOf(infocus) - 1;

    if (index <= this.length) {
      previous = this.at(index);
    }

    // now lets focus the previous item
    if (previous) {
      return previous.focus();
    }

    // we might be returning null here if previous didn't exist
    return previous;
  },
  getLast : function getLast() {
    var index = this.length - 1,
        previous = null;
    // we have to loop up through suggestions that are invalid
    while(index >= 0) {
      previous = this.at(index);
      if (previous && previous.has("suggestion")) {
        return previous;
        break;
      }
      index -= 1;
    }
    return previous;
  },
  focusLast : function focusLast() {
    var last = this.getLast();
    if (last != null) {
      last.focus();
    }
    return last;
  }
});

var Engine = Backbone.Model.extend({
  defaults: {
    "focus" : false
  },
  initialize : function Engine() {
    // Only 1 default plus 3 suggestions allowed; we'll be reusing these models
    this.suggestions = new Suggestions([new Suggestion(), new Suggestion(), new Suggestion(), new Suggestion()]);
    this.suggestions.on("selected", this.onSuggestionsSelected, this);

    // initialize the focus
    this.on("change:focus", this.onFocus, this);
  },
  focus : function focus(options) {
    options = options || {};
    this.set("focus", true, options);
    if (typeof options.last == "undefined") {
      return this.suggestions.first();
    }
    return this.suggestions.getLast();
  },
  blur : function blur(options) {
    options = options || {};
    this.set("focus", false, options);
    return this;
  },
  getFocus : function getFocus() {
    return this.suggestions.getFocus();
  },
  focusNext : function focusNext() {
    return this.suggestions.focusNext();
  },
  focusPrevious : function focusPrevious() {
    return this.suggestions.focusPrevious();
  },
  setTerms : function setTerms(terms) {
    this.suggestions.first().set({ "suggestion" : terms, "terms" : terms });
  },
  // the engine has received or lost focus
  onFocus : function onFocus(model, value, options) {
    // if we have gained focus
    if (value) {
      //console.log(model.get("name"), "gained focus", this.get("name"));
      // set our new focus to the last item
      if (typeof options.last != "undefined") {
        this.suggestions.focusLast();
      // set our focus to the first item
      } else {
        this.suggestions.first().focus();
      }
    // if we've lost focus clear out any things that think they still have it
    } else {
      //console.log(model.get("name"), "lost focus")
      this.suggestions.blur();
    }

  },
  onSuggestionsSelected : function onSuggestionsSelected(model, evt) {
    var terms = model.get("suggestion"),
        id = this.get("id");
    setStat(id, "index",  this.suggestions.indexOf(model));
    self.port.emit("click", { "id" : id,
                              "terms" : terms,
                              "stats" : stats,
                              "tab" : (evt != null && (evt.which == 2 || (evt.metaKey || evt.ctrlKey))) } );
  }
});

var Engines = Backbone.Collection.extend({
  model : Engine,
  initialize : function Engines(models, options) {
    self.port.on("engines.reset", this.onEngines.bind(this), this);
    self.port.on("terms.reset", this.onTerms.bind(this), this);
    self.port.on("suggestions", this.onSuggestions.bind(this), this);
    this.on("change:focus", this.onFocus, this);
  },
  onFocus : function onFocus(model, value, options) {
    // ensure only 1 engine has focus
    if (value) {
      this.where({focus:true}).forEach(function(m) {
        if (model != m) {
          //console.log("blur -", m.get("name"));
          m.blur();
        }
      });
    }
  },
  // returns null if no other (next) engines or suggestions can be focused
  focusNext : function() {
    var engine = this.getFocus(),
        suggestion = engine.getFocus(),
        next = engine.focusNext(),
        index = -1,
        other = null;

    // no suggestions to focus move on to other engine
    if (next == null) {
      index = this.indexOf(engine) + 1;
      if (index <= this.length) {
        other = this.at(index);
      }
      //console.log("next.engine", this.indexOf(engine) + 1, (other)? other.get("name") : other);
      if (other != null) {
        return other.focus();
      } else { // hold our focus on the last engine
        return engine.focus({ last : true });
      }
    }
    return next;
  },
  focusPrevious : function() {
    var engine = this.getFocus(),
        suggestion = engine.getFocus(),
        previous = engine.focusPrevious(),
        index = -1,
        other = null;

    if (previous == null) {
      index = this.indexOf(engine) - 1;
      if (index <= this.length) {
        other = this.at(index);
      }
      if (other != null) { // if there's an engine previous to us focus it
        return other.focus({ last : true });
      } else { // otherwise hold the focus on this first engine
        return engine.focus();
      }
    }
    return previous;
  },
  getFocus : function getFocus() {
    return this.where({focus:true}).pop();
  },
  onEngines : function onEngines(engines) {
    stats = {};
    this.reset(engines.map(function(engine, i) {
      setStat(engine.id, "id", engine.id);
      setStat(engine.id, "order", i);
      return new Engine(engine);
    }));
    this.first().focus();
  },
  onTerms : function onTerms(terms) {
    this.models.forEach(function(engine) { engine.setTerms(terms); });
    try { this.first().focus(); } catch (ignore) { /* sometimes the list hasn't fully initialized yet */ }
  },
  onSuggestions : function onSuggestions(engine, terms, results) {
    // update the (possibly) new search terms for all engines
    var _engine = this.get(engine.id);
    if (_engine) {
      _engine.setTerms(terms);
      // reset the suggestions for the engine with results
      _engine.suggestions.rest().forEach(function(suggestion, i) {
        if (typeof results[i] != "undefined") {
          suggestion.set({ "suggestion" : results[i], "terms" : terms });
        } else {
          suggestion.clear();
        }
      });
      // reset the focus
      this.first().focus();
      setStat(engine.id, "suggestions", Math.min(results.length, MAX_RESULTS));
    }

  },
  comparator : undefined
});

var SuggestionView = Backbone.View.extend({
  tagName: 'li',
  className: 'suggestion',
  initialize : function SuggestionView() {
    this.model.on("change:suggestion", this.render, this);
    this.model.on("change:focus", this.onFocus, this);
  },
  events: {
    "click" : "onClick"
  },
  onClick : function onClick(evt) {
    this.model.trigger("selected", this.model, evt);
  },
  onFocus : function onFocus(model, value, options) {
    if (value) {
      $("."+this.className).removeClass("focused");
      this.$el.toggleClass("focused");
    }
  },
  render : function() {
    var suggestion = this.model.get("suggestion"),
        terms = this.model.get("terms");
    if (!suggestion) {
      $(this.el).empty();
    } else {
      $(this.el).html(this._highlight(suggestion, terms));
    }

    if (this.model.hasChanged("suggestion")) {
      self.port.emit("resize", { "width" : $("#results").width(), "height" : $("#results").height() });
    }
    return this;
  },
  // Highlight the text with the terms provided while preserving the case used
  // returns <strong>wrappers</strong> around the terms found in the text
  _highlight : function (text, terms) {
    var index = text.toLowerCase().indexOf(terms.toLowerCase()),
        pre, mid, post;
    // the terms could not exist in the text at all
    if (index < 0) {
      return text;
    }
    pre = text.substring(0, index);
    mid = text.substring(index, index + terms.length);
    post = text.substring(index + terms.length, text.length);
    return [pre, "<span class='match'>", mid, "</span>", post].join("");
  },
});

var EngineView = Backbone.View.extend({
  tagName: 'ul',
  className: 'engine',
  template: _.template($('#engine-template').html()),
  initialize : function EngineView() {
    this.model.on("change:focus", this.onFocus.bind(this), this);
    // initialize our suggestion views
    this.suggestions = this.model.suggestions.map(function(suggestion) { return new SuggestionView({model:suggestion}); });
  },
  onFocus : function onFocus(model, value, options) {
    if (value) {
      $("."+this.className).removeClass("focused");
      this.$el.addClass("focused");
    }
  },
  // only run once
  render : function() {
    this.$el.html(this.template(this.model.toJSON()));
    this.suggestions.forEach(function(suggestion, i) {
      var $el = suggestion.render().$el;
      if (i == 0) {
        $el.addClass("default");
      }
      this.$el.append($el.disableSelection());
    }.bind(this));
    self.port.emit("resize", { "width" : $("#results").width(), "height" : $("#results").height() });
    return this;
  }
});

var EngineListView = Backbone.View.extend({
  el : "#engines",
  initialize: function EngineListView() {
    this.collection.bind('reset', this.render, this);
    $("body").bind('keydown', this.onKeyPress.bind(this));
    self.port.on("next", this.goNext.bind(this), this);
    self.port.on("previous", this.goPrevious.bind(this), this);
    self.port.on("go", this.goSearch.bind(this), this);
  },
  onKeyPress : function onKeyPress(evt) {
    if (evt.keyCode == 40) { // down
      this.goNext();
    } else if (evt.keyCode == 38) { // up
      this.goPrevious();
    } else if (evt.keyCode == 13) {
      this.goSearch();
    }
  },
  goNext : function goNext() {
    var focused = this.collection.focusNext();
    if (focused != null && focused.has("suggestion")) {
      self.port.emit("terms", focused.get("suggestion"));
    }
  },
  goPrevious : function goPrevious() {
    var focused = this.collection.focusPrevious();
    if (focused != null && focused.has("suggestion")) {
      self.port.emit("terms", focused.get("suggestion"));
    }
  },
  goSearch : function goSearch() {
    var engine = this.collection.getFocus(),
        suggestion = engine.getFocus();
    suggestion.trigger("selected", suggestion, null);
  },
  render: function render() {
    this.$el.children().remove();
    this.collection.each(function(model) {
      var engine = new EngineView({model: model, id : model.id.replace(/[\s\W]+/g, "_") });
      this.$el.append(engine.render().$el.disableSelection());
    }, this);
    self.port.emit("resize", { "width" : $("#results").width(), "height" : $("#results").height() });
    return this;
  }
});

var engines = new Engines();

$(document).ready(function () {

  var elv = new EngineListView({collection:engines});

  $("#preferences").click(function() {
    self.port.emit("preferences");
  });

  $(".engine").live("mouseover", function() {
    $(".engine").removeClass("focused");
    $(this).addClass("focused");
  });

  $(".suggestion").live("mouseover", function() {
    // remove all other possibly selected results
    $(".suggestion").removeClass("focused");
    $(this).addClass("focused").parent().trigger("mouseenter");
  });

  // We only want to continue if we're debugging
  if (window.location.protocol != "file:") {
    return;
  }

  //window.setTimeout(function() { elv.goSearch(); }, 7 * 1000);

  var test_engines = [{"id":"https://www.google.com/","name":"Google","siteURL":"https://www.google.com/","host":"https:/www.google.com/","queryURL":"https://www.google.com/search?q={searchTerms}&ie=utf-8&oe=utf-8&aq=t&rls=org.mozilla:en-US:official&client=firefox-a","suggestionURL":"https://www.google.com/complete/search?client=firefox&q={searchTerms}","icon":"data:image/png;base64,AAABAAEAEBAAAAEAGABoAwAAFgAAACgAAAAQAAAAIAAAAAEAGAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADs9Pt8xetPtu9FsfFNtu%2BTzvb2%2B%2Fne4dFJeBw0egA%2FfAJAfAA8ewBBegAAAAD%2B%2FPtft98Mp%2BwWsfAVsvEbs%2FQeqvF8xO7%2F%2F%2F63yqkxdgM7gwE%2FggM%2BfQA%2BegBDeQDe7PIbotgQufcMufEPtfIPsvAbs%2FQvq%2Bfz%2Bf%2F%2B%2B%2FZKhR05hgBBhQI8hgBAgAI9ewD0%2B%2Fg3pswAtO8Cxf4Kw%2FsJvvYAqupKsNv%2B%2Fv7%2F%2FP5VkSU0iQA7jQA9hgBDgQU%2BfQH%2F%2Ff%2FQ6fM4sM4KsN8AteMCruIqqdbZ7PH8%2Fv%2Fg6Nc%2Fhg05kAA8jAM9iQI%2BhQA%2BgQDQu6b97uv%2F%2F%2F7V8Pqw3eiWz97q8%2Ff%2F%2F%2F%2F7%2FPptpkkqjQE4kwA7kAA5iwI8iAA8hQCOSSKdXjiyflbAkG7u2s%2F%2B%2F%2F39%2F%2F7r8utrqEYtjQE8lgA7kwA7kwA9jwA9igA9hACiWSekVRyeSgiYSBHx6N%2F%2B%2Fv7k7OFRmiYtlAA5lwI7lwI4lAA7kgI9jwE9iwI4iQCoVhWcTxCmb0K%2BooT8%2Fv%2F7%2F%2F%2FJ2r8fdwI1mwA3mQA3mgA8lAE8lAE4jwA9iwE%2BhwGfXifWvqz%2B%2Ff%2F58u%2Fev6Dt4tr%2B%2F%2F2ZuIUsggA7mgM6mAM3lgA5lgA6kQE%2FkwBChwHt4dv%2F%2F%2F728ei1bCi7VAC5XQ7kz7n%2F%2F%2F6bsZkgcB03lQA9lgM7kwA2iQktZToPK4r9%2F%2F%2F9%2F%2F%2FSqYK5UwDKZAS9WALIkFn%2B%2F%2F3%2F%2BP8oKccGGcIRJrERILYFEMwAAuEAAdX%2F%2Ff7%2F%2FP%2B%2BfDvGXQLIZgLEWgLOjlf7%2F%2F%2F%2F%2F%2F9QU90EAPQAAf8DAP0AAfMAAOUDAtr%2F%2F%2F%2F7%2B%2Fu2bCTIYwDPZgDBWQDSr4P%2F%2Fv%2F%2F%2FP5GRuABAPkAA%2FwBAfkDAPAAAesAAN%2F%2F%2B%2Fz%2F%2F%2F64g1C5VwDMYwK8Yg7y5tz8%2Fv%2FV1PYKDOcAAP0DAf4AAf0AAfYEAOwAAuAAAAD%2F%2FPvi28ymXyChTATRrIb8%2F%2F3v8fk6P8MAAdUCAvoAAP0CAP0AAfYAAO4AAACAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACAAQAA"},{"id":"http://d2lo25i6d3q8zm.cloudfront.net/browser-plugins/AmazonSearchSuggestionsOSD.Firefox.xml","name":"Amazon.com","siteURL":"http://d2lo25i6d3q8zm.cloudfront.net/browser-plugins/AmazonSearchSuggestionsOSD.Firefox.xml","host":"http://d2lo25i6d3q8zm.cloudfront.net","queryURL":"http://www.amazon.com/exec/obidos/external-search/?field-keywords={searchTerms}&mode=blended&tag=mozilla-20&sourceid=Mozilla-search","suggestionURL":"http://completion.amazon.com/search/complete?method=completion&search-alias=aps&mkt=1&q={searchTerms}","icon":"data:image/x-icon;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAABGdBTUEAAK/INwWK6QAAABl0RVh0U29mdHdhcmUAQWRvYmUgSW1hZ2VSZWFkeXHJZTwAAAHgSURBVHjalFM9TNtQEP4cB7PwM1RITUXIgsRaYEEVEyKZwhiyZAQyd0BhpFOlIjoBqhjSqVQMoVMLLAjEwECCQJkSkBqJYDOAFOMKFSf28d7DTUxiUDnp/Pzeu/vuu7t3ICKF6SLTMv2/lB0fRWKfjwDm4JJisYh0Oo3fpZLYT0SjSCQS8JAFMADNDZ3NZsnf1taiqVTKi4nGASruk5lkkmTmMB6JUKFQqO+DfX1eABWeQoVR6f7HSdM0obqu48Yw8G1tDT82NsRd1TSbU9BbGPCog8PDj+jLzurFoAVgMh4XxoNDQ6SqKi0tL9eBvAB8zZwymYxYY7EYAoEA8vm82BNTg6XUIs0MeGTZoR1mhXSnwNl4pmAbjU7mcjkKhkL1ynMnntZ4OEw3VyrV8utk7s5TdW++0QXz+1i3P7IK36t+PCfVn1OQOoOA0gXr5DPak+cPXbBK+/T3S69AtY3LJ98vZ1or/iLr+pTuvr59/A6s003UdqZFJF/PCKQ3o5CUznoBST2AfbEF/9iqYEDaIfwj73VJPEfgNTe0tWNYR0uwy9uOW0OkrgHI7z5ADo2C7v48nLV3XHKAT+x/1m1sX58xsBxg8rZJrDYD8DHHp4aJj/MK09sXjPOt46PcCzAACXY8/u34wN0AAAAASUVORK5CYII="},{"id":"http://en.wikipedia.org/w/opensearch_desc.php","name":"Wikipedia (en)","siteURL":"http://en.wikipedia.org/w/opensearch_desc.php","host":"http://en.wikipedia.org","queryURL":"http://en.wikipedia.org/wiki/Special:Search?search={searchTerms}&sourceid=Mozilla-search","suggestionURL":"http://en.wikipedia.org/w/api.php?action=opensearch&search={searchTerms}","icon":"data:image/x-icon;base64,AAABAAEAEBAQAAEABAAoAQAAFgAAACgAAAAQAAAAIAAAAAEABAAAAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAEAgQAhIOEAMjHyABIR0gA6ejpAGlqaQCpqKkAKCgoAPz9%2FAAZGBkAmJiYANjZ2ABXWFcAent6ALm6uQA8OjwAiIiIiIiIiIiIiI4oiL6IiIiIgzuIV4iIiIhndo53KIiIiB%2FWvXoYiIiIfEZfWBSIiIEGi%2FfoqoiIgzuL84i9iIjpGIoMiEHoiMkos3FojmiLlUipYliEWIF%2BiDe0GoRa7D6GPbjcu1yIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"}];
  engines.onEngines(test_engines);

  engines.onTerms("ram");

  var test_suggestion_wiki =  { "engine" : {"id":"http://en.wikipedia.org/w/opensearch_desc.php","name":"Wikipedia (en)","siteURL":"http://en.wikipedia.org/w/opensearch_desc.php","host":"http://en.wikipedia.org","queryURL":"http://en.wikipedia.org/wiki/Special:Search?search={searchTerms}&sourceid=Mozilla-search","suggestionURL":"http://en.wikipedia.org/w/api.php?action=opensearch&search={searchTerms}","icon":"data:image/x-icon;base64,AAABAAEAEBAQAAEABAAoAQAAFgAAACgAAAAQAAAAIAAAAAEABAAAAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAEAgQAhIOEAMjHyABIR0gA6ejpAGlqaQCpqKkAKCgoAPz9%2FAAZGBkAmJiYANjZ2ABXWFcAent6ALm6uQA8OjwAiIiIiIiIiIiIiI4oiL6IiIiIgzuIV4iIiIhndo53KIiIiB%2FWvXoYiIiIfEZfWBSIiIEGi%2FfoqoiIgzuL84i9iIjpGIoMiEHoiMkos3FojmiLlUipYliEWIF%2BiDe0GoRa7D6GPbjcu1yIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"}, "term" : "ram", "results" : ["RAM", "Ramen","Rammstein","Rambo","Ramen Noodles","Ramekins"] };

  window.setTimeout(function() {   engines.onSuggestions(test_suggestion_wiki.engine, test_suggestion_wiki.term, test_suggestion_wiki.results); }, 1 * 900);

  var test_suggestion_amazon = { "engine" : {"id":"http://d2lo25i6d3q8zm.cloudfront.net/browser-plugins/AmazonSearchSuggestionsOSD.Firefox.xml","name":"Amazon.com","siteURL":"http://d2lo25i6d3q8zm.cloudfront.net/browser-plugins/AmazonSearchSuggestionsOSD.Firefox.xml","host":"http://d2lo25i6d3q8zm.cloudfront.net","queryURL":"http://www.amazon.com/exec/obidos/external-search/?field-keywords={searchTerms}&mode=blended&tag=mozilla-20&sourceid=Mozilla-search","suggestionURL":"http://completion.amazon.com/search/complete?method=completion&search-alias=aps&mkt=1&q={searchTerms}","icon":"data:image/x-icon;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAABGdBTUEAAK/INwWK6QAAABl0RVh0U29mdHdhcmUAQWRvYmUgSW1hZ2VSZWFkeXHJZTwAAAHgSURBVHjalFM9TNtQEP4cB7PwM1RITUXIgsRaYEEVEyKZwhiyZAQyd0BhpFOlIjoBqhjSqVQMoVMLLAjEwECCQJkSkBqJYDOAFOMKFSf28d7DTUxiUDnp/Pzeu/vuu7t3ICKF6SLTMv2/lB0fRWKfjwDm4JJisYh0Oo3fpZLYT0SjSCQS8JAFMADNDZ3NZsnf1taiqVTKi4nGASruk5lkkmTmMB6JUKFQqO+DfX1eABWeQoVR6f7HSdM0obqu48Yw8G1tDT82NsRd1TSbU9BbGPCog8PDj+jLzurFoAVgMh4XxoNDQ6SqKi0tL9eBvAB8zZwymYxYY7EYAoEA8vm82BNTg6XUIs0MeGTZoR1mhXSnwNl4pmAbjU7mcjkKhkL1ynMnntZ4OEw3VyrV8utk7s5TdW++0QXz+1i3P7IK36t+PCfVn1OQOoOA0gXr5DPak+cPXbBK+/T3S69AtY3LJ98vZ1or/iLr+pTuvr59/A6s003UdqZFJF/PCKQ3o5CUznoBST2AfbEF/9iqYEDaIfwj73VJPEfgNTe0tWNYR0uwy9uOW0OkrgHI7z5ADo2C7v48nLV3XHKAT+x/1m1sX58xsBxg8rZJrDYD8DHHp4aJj/MK09sXjPOt46PcCzAACXY8/u34wN0AAAAASUVORK5CYII="}, "term" : "ram", "results" : [] }; //"ramen","rammstein","rambo","ramen noodles","ramekins","ram mount","ramones","rambo knife","ramps"
  engines.onSuggestions(test_suggestion_amazon.engine, test_suggestion_amazon.term, test_suggestion_amazon.results);
  var test_suggestion_google = { "engine" : {"id":"https://www.google.com/","name":"Google","siteURL":"https://www.google.com/","host":"https:/www.google.com/","queryURL":"https://www.google.com/search?q={searchTerms}&ie=utf-8&oe=utf-8&aq=t&rls=org.mozilla:en-US:official&client=firefox-a","suggestionURL":"https://www.google.com/complete/search?client=firefox&q={searchTerms}","icon":"data:image/png;base64,AAABAAEAEBAAAAEAGABoAwAAFgAAACgAAAAQAAAAIAAAAAEAGAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADs9Pt8xetPtu9FsfFNtu%2BTzvb2%2B%2Fne4dFJeBw0egA%2FfAJAfAA8ewBBegAAAAD%2B%2FPtft98Mp%2BwWsfAVsvEbs%2FQeqvF8xO7%2F%2F%2F63yqkxdgM7gwE%2FggM%2BfQA%2BegBDeQDe7PIbotgQufcMufEPtfIPsvAbs%2FQvq%2Bfz%2Bf%2F%2B%2B%2FZKhR05hgBBhQI8hgBAgAI9ewD0%2B%2Fg3pswAtO8Cxf4Kw%2FsJvvYAqupKsNv%2B%2Fv7%2F%2FP5VkSU0iQA7jQA9hgBDgQU%2BfQH%2F%2Ff%2FQ6fM4sM4KsN8AteMCruIqqdbZ7PH8%2Fv%2Fg6Nc%2Fhg05kAA8jAM9iQI%2BhQA%2BgQDQu6b97uv%2F%2F%2F7V8Pqw3eiWz97q8%2Ff%2F%2F%2F%2F7%2FPptpkkqjQE4kwA7kAA5iwI8iAA8hQCOSSKdXjiyflbAkG7u2s%2F%2B%2F%2F39%2F%2F7r8utrqEYtjQE8lgA7kwA7kwA9jwA9igA9hACiWSekVRyeSgiYSBHx6N%2F%2B%2Fv7k7OFRmiYtlAA5lwI7lwI4lAA7kgI9jwE9iwI4iQCoVhWcTxCmb0K%2BooT8%2Fv%2F7%2F%2F%2FJ2r8fdwI1mwA3mQA3mgA8lAE8lAE4jwA9iwE%2BhwGfXifWvqz%2B%2Ff%2F58u%2Fev6Dt4tr%2B%2F%2F2ZuIUsggA7mgM6mAM3lgA5lgA6kQE%2FkwBChwHt4dv%2F%2F%2F728ei1bCi7VAC5XQ7kz7n%2F%2F%2F6bsZkgcB03lQA9lgM7kwA2iQktZToPK4r9%2F%2F%2F9%2F%2F%2FSqYK5UwDKZAS9WALIkFn%2B%2F%2F3%2F%2BP8oKccGGcIRJrERILYFEMwAAuEAAdX%2F%2Ff7%2F%2FP%2B%2BfDvGXQLIZgLEWgLOjlf7%2F%2F%2F%2F%2F%2F9QU90EAPQAAf8DAP0AAfMAAOUDAtr%2F%2F%2F%2F7%2B%2Fu2bCTIYwDPZgDBWQDSr4P%2F%2Fv%2F%2F%2FP5GRuABAPkAA%2FwBAfkDAPAAAesAAN%2F%2F%2B%2Fz%2F%2F%2F64g1C5VwDMYwK8Yg7y5tz8%2Fv%2FV1PYKDOcAAP0DAf4AAf0AAfYEAOwAAuAAAAD%2F%2FPvi28ymXyChTATRrIb8%2F%2F3v8fk6P8MAAdUCAvoAAP0CAP0AAfYAAO4AAACAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACAAQAA"}, "term" : "ram", "results" : ["ramadan","ramadan 2012","rampart"] };

  window.setTimeout(function() { engines.onSuggestions(test_suggestion_google.engine, test_suggestion_google.term, test_suggestion_google.results); }, 1 * 1000);

});
