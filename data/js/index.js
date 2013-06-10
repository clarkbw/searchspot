/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

/*jshint forin:true, noarg:true, noempty:true, eqeqeq:true, bitwise:true,
  strict:true, undef:true, curly:true, browser:true, es5:true,
  indent:2, maxerr:50, devel:true, node:true, boss:true, white:true,
  globalstrict:true, nomen:false, newcap:true*/

/*global self:true, addon:true */

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

var Engine = Backbone.Model.extend({
  hasSuggestions : function () { return !_.isEmpty(this.get("suggestionURL")); },
  isGeo : function () { return (/\{geo:/g).test(this.get("queryURL")); },
  isHttps : function () { return (/^https/).test(this.get("queryURL")); },
  trimUrl : function () {
    var url = this.get("queryURL");
    url = url.replace(/http(s)?:\/\/(www\.)?/, "");
    return url.match(/([a-zA-Z0-9\-\.]+)\//)[0].replace(/\//, "");
  }
});

var PortCollection = Backbone.Collection.extend({
  initialize : function (models, options) {
    Backbone.Model.prototype.initialize.call(this, models, options);
    this.port = options.port;
    ["added", "removed", "sorted", "reset"].forEach(function (target) {
      var newtarget = [this.port, target].join(".");
      addon.port.on(newtarget, this["port_" + target].bind(this), this);
    }.bind(this));
    // Bind the local events to send through the addon port channel
    // for when a user adds or removes an engine we signal that change
    // every add or remove event is followed by a sort event to update the order
    ["add", "remove"].forEach(function (target) {
      var newtarget = [this.port, target].join(".");
      this.bind(target, function () {
        addon.port.emit(newtarget, _.first(arguments));
      }, this);
    }.bind(this));
  },
  port_reset : function (engines) {
    //console.log("port_reset", this.port, engines);
    this.reset(engines.map(function (item) { return new Engine(item); }));
  },
  port_added : function (engine) {
    //console.log("port_add", this.port, engine);
    this.add(new Engine(engine));
  },
  port_removed : function (engine) {
    //console.log("port_remove", this.port, engine);
    this.remove(new Engine(engine));
  },
  port_sorted : function (newOrder) {
    // if this isn't a new sort order stop now so we don't loop events
    if (this.pluck('id').join(",") === newOrder.join(",")) {
      return;
    }
    this.comparator = function (a, b) {
      return newOrder.indexOf(a.get("id")) > newOrder.indexOf(b.get("id"));
    };
    this.sort();
    this.comparator = null;
  }
});

var EngineView = Backbone.View.extend({
  tagName: 'li',
  className: 'engine-view',
  template: _.template($('#engine-template').html()),
  events: {
    'stopped' : 'stopped',
    'added' : 'added',
    'removed' : 'removed'
  },
  // change of the sort order inside a list
  stopped: function (event, index) {
    this.$el.trigger('update-sort', [this.model, index]);
  },
  // new element added to this list
  added: function (event, index, sender) {
    console.log("added");
    this.$el.trigger('update-added', [this.model, index, sender]);
  },
  removed: function (event, index) {
    console.log("removed");
    this.$el.trigger('update-removed', [this.model]);
  },
  render: function () {
    $(this.el).html(this.template(this.model));
    $(this.el).data({'geo' : this.model.isGeo(), 'id' : this.model.get('id')});
    return this;
  }
});

var EngineList = PortCollection.extend({
  model: Engine,
  initialize : function (models, options) {
    PortCollection.prototype.initialize.call(this, models, options);
  }
});

var DefaultEngineList = EngineList.extend({
  comparator: undefined,
  initialize : function (models, options) {
    EngineList.prototype.initialize.call(this, [], { port : "defaults" });
  }
});

var OthersEngineList = EngineList.extend({
  comparator: function (model) {
    return model.get('name').toLowerCase();
  },
  initialize : function (models, options) {
    EngineList.prototype.initialize.call(this, [], { port : "others" });
  }
});

var EngineListView = Backbone.View.extend({
  initialize: function () {
    this.collection.bind('all', this.render, this);
  },
  events: {
    'update-sort': 'updateSort',
    'update-added': 'updateAdded',
    'update-removed': 'updateRemoved'
  },
  // change the position of the model within our list
  updateSort: function (event, model, position) {
    this.collection.remove(model, { silent : true });
    this.collection.add(model, { at : position, silent : true });
    this.render();
    this.sorted();
  },
  // a new engine has been added to the list
  updateAdded : function (event, model, position, sender) {
    console.log("ADD", this.collection.port, position, sender, model.isGeo());
    this.collection.add(model, { at : position });
    this.sorted();
  },
  updateRemoved : function (event, model) {
    console.log("updateRemoved", this.collection.port);
    this.collection.remove(model);
    this.sorted();
  },
  sorted : function () {
    addon.port.emit([this.collection.port, "sort"].join("."),
                    this.collection.pluck('id'));
  },
  render: function () {
    this.$el.children().remove();
    this.collection.each(function (model) {
      this.$el.append(new EngineView({model: model}).render().el);
    }, this);
    return this;
  }
});

var GeoPermissionView = Backbone.View.extend({
  tagName: 'div',
  id : 'geoPermission',
  className: 'geo-permission-view modal fade',
  template: _.template($('#geo-permission-template').html()),
  events: {
    'click .btn.add' : 'add',
    'click .btn.cancel' : 'cancel',
    'hidden' : 'isHidden'
  },
  add : function add() {
    this.defaultslist.add(this.model, { at : this.position });
    this.defaultsview.sorted();
  },
  cancel : function cancel() {
    this.hide();
  },
  isHidden : function isHidden() {
    // this destroys the modal when it hides
    this.remove();
  },
  initialize: function initialize(options) {
    this.defaultslist = options.defaultslist;
    this.defaultsview = options.defaultsview;
    this.position = options.position;
    this.render().show();
  },
  render: function render() {
    $(this.el).html(this.template(this.model));
    $('body').append(this.$el);
    return this;
  },
  show : function () {
    this.$el.modal('show');
  }
});

var Application = Backbone.View.extend({
  initialize: function () {
    this.defaultslist = new DefaultEngineList();
    this.otherslist = new OthersEngineList();

    // enforce the unique relationship on adds to the defaults list
    this.defaultslist.on('add', function (model) {
      this.otherslist.remove(model);
    }.bind(this));

    // enforce the unique relationship on adds to the others list
    this.otherslist.on('add', function (model) {
      this.defaultslist.remove(model);
    }.bind(this));

    this.defaultsview = new EngineListView({collection : this.defaultslist, el : "#defaults"});
    this.othersview = new EngineListView({collection : this.otherslist, el : "#others"});

    this.render();
  },
  render: function () {
    this.defaultsview.render();
    this.othersview.render();
    return this;
  },
});

var PrefsApp = new Application();

addon.port.on("preferences", function (prefs) {
  Object.keys(prefs).forEach(function (type) {
    var value = prefs[type];
    if (value) {
      $("#" + type).attr("checked", "checked");
    } else {
      $("#" + type).removeAttr("checked");
    }
  });
});


$(document).ready(function () {

  $("#stats, #collect").change(function () {
    addon.port.emit("preferences", $(this).attr("id"),
                    "checked" === $(this).attr("checked"));
  });

  $("#defaults, #others").sortable({
    start : function (event, ui) {
      //console.log('start', ui);
      //ui.item.trigger('started', [ui.item.index()]);
    },
    stop: function (event, ui) {
      //console.log("stop", ui, $(ui.item).data('geo'));
      // no parent means it is coming from another list, otherwise it's a within list move
      if ($(ui.item).parent() === null &&
          $(ui.item).data('geo') !== true) { // needs geolocation
        ui.item.trigger('stopped', [ui.item.index()]);
      } else if ($(ui.item).parent() !== null) {
        // when we just want to reorder within a list send the stopped event
        ui.item.trigger('stopped', [ui.item.index()]);
      }
    },
    receive: function (event, ui) {
      //console.log("recieve", $(ui.item).data('id'), ui.item.index(), $(ui.item).parent().attr('id'), ui.sender.attr('id'));
      if (ui.sender.attr('id') === 'others' &&
          $(ui.item).parent().attr('id') === 'defaults') { // an engine dropped into defaults
        if ($(ui.item).data('geo') === true) { // needs geolocation
          var position = ui.item.index();
          // let jQuery UI know that we want to cancel this add and we'll handle it manually
          $("#defaults, #others").sortable("cancel");
          new GeoPermissionView({'model' : PrefsApp.otherslist.get($(ui.item).data('id')),
                                'defaultsview' : PrefsApp.defaultsview,
                                'defaultslist' : PrefsApp.defaultslist, 'position' : position });
        } else {
          // Let the stack know that we want Backbone to make an add happen
          ui.item.trigger('added', [ui.item.index(), ui.sender.attr('id')]);
        }
      } else {
        // Let the stack know that we want Backbone to make an add happen
        ui.item.trigger('added', [ui.item.index(), ui.sender.attr('id')]);
      }
    },
    remove: function (event, ui) {
      //console.log("remove", ui, ui.item.index());
      //ui.item.trigger('removed', [ui, ui.item.index()]);
    },
    connectWith: ".engines",
    cursor : "move"
  }).disableSelection();

  $(".attributes img").on("mouseover", function () {
    $(this).tooltip('show');
  }).on("mouseout", function () {
    $(this).tooltip('hide');
  });

  if (window.location.hash === '#welcome') {
    // wait until the loading / rendering has finished
    window.setTimeout(function () {
      $('html, body').animate({ scrollTop: $("#welcome").offset().top },
                              1000,
                              function () { $("#welcome").fadeTo(1000 * 2, 1.0); });
    }, 1000);
  }

  $(".install-yelp").click(function () {
    new GeoPermissionView({'model' : PrefsApp.otherslist.get('http://www.yelp.com/opensearch'),
                          'defaultsview' : PrefsApp.defaultsview,
                          'defaultslist' : PrefsApp.defaultslist, 'position' : 2 });
  });

  $(".close-tab").click(function () {
    addon.port.emit('close-tab');
  });

  // We only want to continue if we're debugging
  if (window.location.protocol !== "file:") {
    return;
  }

  var defaults = [];
  defaults.push({"id":"http://www.google.com/","name":"Google","siteURL":"http://www.google.com/","host":"http:/www.google.com/","type":"suggest","queryURL":"http://www.google.com/search?q={searchTerms}&ie=utf-8&oe=utf-8&aq=t&rls=org.mozilla:en-US:official&client=firefox-a","suggestionURL":"http://suggestqueries.google.com/complete/search?output=firefox&client=firefox&hl=en-US&q={searchTerms}","icon":"data:image/png;base64,AAABAAEAEBAAAAEAGABoAwAAFgAAACgAAAAQAAAAIAAAAAEAGAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADs9Pt8xetPtu9FsfFNtu%2BTzvb2%2B%2Fne4dFJeBw0egA%2FfAJAfAA8ewBBegAAAAD%2B%2FPtft98Mp%2BwWsfAVsvEbs%2FQeqvF8xO7%2F%2F%2F63yqkxdgM7gwE%2FggM%2BfQA%2BegBDeQDe7PIbotgQufcMufEPtfIPsvAbs%2FQvq%2Bfz%2Bf%2F%2B%2B%2FZKhR05hgBBhQI8hgBAgAI9ewD0%2B%2Fg3pswAtO8Cxf4Kw%2FsJvvYAqupKsNv%2B%2Fv7%2F%2FP5VkSU0iQA7jQA9hgBDgQU%2BfQH%2F%2Ff%2FQ6fM4sM4KsN8AteMCruIqqdbZ7PH8%2Fv%2Fg6Nc%2Fhg05kAA8jAM9iQI%2BhQA%2BgQDQu6b97uv%2F%2F%2F7V8Pqw3eiWz97q8%2Ff%2F%2F%2F%2F7%2FPptpkkqjQE4kwA7kAA5iwI8iAA8hQCOSSKdXjiyflbAkG7u2s%2F%2B%2F%2F39%2F%2F7r8utrqEYtjQE8lgA7kwA7kwA9jwA9igA9hACiWSekVRyeSgiYSBHx6N%2F%2B%2Fv7k7OFRmiYtlAA5lwI7lwI4lAA7kgI9jwE9iwI4iQCoVhWcTxCmb0K%2BooT8%2Fv%2F7%2F%2F%2FJ2r8fdwI1mwA3mQA3mgA8lAE8lAE4jwA9iwE%2BhwGfXifWvqz%2B%2Ff%2F58u%2Fev6Dt4tr%2B%2F%2F2ZuIUsggA7mgM6mAM3lgA5lgA6kQE%2FkwBChwHt4dv%2F%2F%2F728ei1bCi7VAC5XQ7kz7n%2F%2F%2F6bsZkgcB03lQA9lgM7kwA2iQktZToPK4r9%2F%2F%2F9%2F%2F%2FSqYK5UwDKZAS9WALIkFn%2B%2F%2F3%2F%2BP8oKccGGcIRJrERILYFEMwAAuEAAdX%2F%2Ff7%2F%2FP%2B%2BfDvGXQLIZgLEWgLOjlf7%2F%2F%2F%2F%2F%2F9QU90EAPQAAf8DAP0AAfMAAOUDAtr%2F%2F%2F%2F7%2B%2Fu2bCTIYwDPZgDBWQDSr4P%2F%2Fv%2F%2F%2FP5GRuABAPkAA%2FwBAfkDAPAAAesAAN%2F%2F%2B%2Fz%2F%2F%2F64g1C5VwDMYwK8Yg7y5tz8%2Fv%2FV1PYKDOcAAP0DAf4AAf0AAfYEAOwAAuAAAAD%2F%2FPvi28ymXyChTATRrIb8%2F%2F3v8fk6P8MAAdUCAvoAAP0CAP0AAfYAAO4AAACAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACAAQAA"});
  defaults.push({"id":"http://d2lo25i6d3q8zm.cloudfront.net/browser-plugins/AmazonSearchSuggestionsOSD.Firefox.xml","name":"Amazon.com","siteURL":"http://d2lo25i6d3q8zm.cloudfront.net/browser-plugins/AmazonSearchSuggestionsOSD.Firefox.xml","host":"http://d2lo25i6d3q8zm.cloudfront.net","type":"suggest","queryURL":"http://www.amazon.com/exec/obidos/external-search/?field-keywords={searchTerms}&mode=blended&tag=mozilla-20&sourceid=Mozilla-search","suggestionURL":"http://completion.amazon.com/search/complete?method=completion&q={searchTerms}&search-alias=aps&client=amzn-search-suggestions/9fe582406fb5106f343a84083d78795713c12d68&mkt=1","icon":"data:image/x-icon;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAABGdBTUEAAK/INwWK6QAAABl0RVh0U29mdHdhcmUAQWRvYmUgSW1hZ2VSZWFkeXHJZTwAAAHgSURBVHjalFM9TNtQEP4cB7PwM1RITUXIgsRaYEEVEyKZwhiyZAQyd0BhpFOlIjoBqhjSqVQMoVMLLAjEwECCQJkSkBqJYDOAFOMKFSf28d7DTUxiUDnp/Pzeu/vuu7t3ICKF6SLTMv2/lB0fRWKfjwDm4JJisYh0Oo3fpZLYT0SjSCQS8JAFMADNDZ3NZsnf1taiqVTKi4nGASruk5lkkmTmMB6JUKFQqO+DfX1eABWeQoVR6f7HSdM0obqu48Yw8G1tDT82NsRd1TSbU9BbGPCog8PDj+jLzurFoAVgMh4XxoNDQ6SqKi0tL9eBvAB8zZwymYxYY7EYAoEA8vm82BNTg6XUIs0MeGTZoR1mhXSnwNl4pmAbjU7mcjkKhkL1ynMnntZ4OEw3VyrV8utk7s5TdW++0QXz+1i3P7IK36t+PCfVn1OQOoOA0gXr5DPak+cPXbBK+/T3S69AtY3LJ98vZ1or/iLr+pTuvr59/A6s003UdqZFJF/PCKQ3o5CUznoBST2AfbEF/9iqYEDaIfwj73VJPEfgNTe0tWNYR0uwy9uOW0OkrgHI7z5ADo2C7v48nLV3XHKAT+x/1m1sX58xsBxg8rZJrDYD8DHHp4aJj/MK09sXjPOt46PcCzAACXY8/u34wN0AAAAASUVORK5CYII="});
  defaults.push({"id":"http://www.linkedin.com/search/fpsearch","name":"LinkedIn","siteURL":"http://www.linkedin.com/search/fpsearch","host":"http://www.linkedin.com","type":"suggest","queryURL":"http://www.linkedin.com/search/fpsearch?keywords={searchTerms}","suggestionURL":"http://www.linkedin.com/ta/federator?query={searchTerms}&types=mynetwork,company,group,sitefeature,skill","icon":"http://static01.linkedin.com/scds/common/u/img/favicon_v3.ico"});
  defaults.push({"id":"http://en.wikipedia.org/w/opensearch_desc.php","name":"Wikipedia (en)","siteURL":"http://en.wikipedia.org/w/opensearch_desc.php","host":"http://en.wikipedia.org","type":"match","queryURL":"http://en.wikipedia.org/w/index.php?title=Special:Search&search={searchTerms}","suggestionURL":"http://en.wikipedia.org/w/api.php?action=opensearch&search={searchTerms}&namespace=0","icon":"http://en.wikipedia.org/favicon.ico"});

  var others = [];
  others.push({"id":"http://www.yelp.com/search.xml","name":"Yelp","siteURL":"http://www.yelp.com/search.xml","host":"http://www.yelp.com","type":"suggest","queryURL":"http://www.yelp.com/search?ns=1&find_desc={searchTerms}&find_loc={geo:name}","suggestionURL":"http://www.yelp.com/search_suggest?prefix={searchTerms}&loc={geo:name}","icon":"data:image/x-icon;base64,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AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsQCQEAEhsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsMAQAAAAAMGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbDgAAAAAAAAwbGxsbGxoFCxsbGxsbGxsbGxsbGxsbGxsXAQAAAAAADBsbGxsbBQAACRsbGxsbGxsbGxsbGxsbGxsVAAAAAAAMGxsbGw4AAAAACRsbGxsbGxsbGxsbGxsbGxsPAAAAAAwbGxsYAQAAAAAAEhsbGxsbGxsbGxsbGxsbGxsPAAAADBsbGwcAAAAAAAACGxsbGxsbGxsbGxsbGxsbGxsJAAAMGxsSAAAAAAAAAAMbGxsbGxsbGxsWDBQbGxsbGxsKBhUbGwEAAAAAAgoTGxsbGxsbGxsbGwMAAAEJEhobGxsbGxsbBwACChUbGxsbGxsbGxsbGxsbAAAAAAAAAAcSGxsbGxsbFRcbGxsbGxsbGxsbGxsbGxsAAAAAAAAAAAAbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGwAAAAAAAAAABRsbGxsbFBAYGxsbGxsbGxsbGxsbGxsbAwAAAAABChUbGxsbGxYAAAACBw4WGxsbGxsbGxsbGxsLAAAFDxsbGxsbGxsbFwEAAAAAAAABDBsbGxsbGxsbGxkNERsbGxsbGwsAEhsbDwAAAAAAAAAFGxsbGxsbGxsbGxsbGxsbGxsQAAAHGxsbCwAAAAAAABAbGxsbGxsbGxsbGxsbGxsbGgEAAAUbGxsbAwAAAAAFGxsbGxsbGxsbGxsbGxsbGxsHAAAABRsbGxsXAQAAARcbGxsbGxsbGxsbGxsbGxsbEgAAAAAJGxsbGxsTAAEVGxsbGxsbGxsbGxsbGxsbGxgBAAAAAAwbGxsbGxsVFxsbGxsbGxsbGxsbGxsbGxsbAwAAAAAADBsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGwkAAAAAAAAMGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsOAAAAAAAAAAwbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGwIAAAAAAAAADBsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbFwgBAAAAAAAMGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsRCgQAAREbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxv////////////wf///wH///4B8f/+AfD//wHgf/+BwD//wcA//+GAP+PxgH/gP4P/4A/P/+AP///gD4//4B8A/+D/AD/j8YA//+HAP//B4H//weB//4Hw//8B+f//Af///gH///wB///8Af///AH///+B//////////////////w=="});
  others.push({"id":"http://search.yahoo.com/","name":"Yahoo","siteURL":"http://search.yahoo.com/","host":"http:/search.yahoo.com/","type":"suggest","queryURL":"http://search.yahoo.com/search?p={searchTerms}&ei=UTF-8&fr=moz35","suggestionURL":"http://ff.search.yahoo.com/gossip?output=fxjson&command={searchTerms}","icon":"data:image/x-icon;base64,AAABAAEAEBAQAAEABAAoAQAAFgAAACgAAAAQAAAAIAAAAAEABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAbgJqAIoCdgCaAnoAnhKCAKYijgCuLpIAskKeALpSpgC+Yq4AzHy8ANqezgDmvt4A7tLqAPz5+wD///8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAKlRFIoABWAKERERE6ADcKMzzu2hOgAAhERK8REWCWBERE36ERMHMEREvo6iEgY6hEn6Pu0mAzqkz/xjMzoDNwpERERDoAMzAKlERIoAAzMAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD//wAA//8AAP//AADAOQAAgBkAAAAPAAAACQAAAAkAAAAIAAAACAAAAAgAAIAYAADAOAAA//8AAP//AAD//wAA"});
  others.push({"id":"http://www.bing.com/search","name":"Bing","siteURL":"http://www.bing.com/search","host":"http://www.bing.com","type":"suggest","queryURL":"http://www.bing.com/search?q={searchTerms}&form=MOZSBR&pc=MOZI","suggestionURL":"http://api.bing.com/osjson.aspx?query={searchTerms}&form=OSDJAS","icon":"data:image/x-icon;base64,AAABAAEAEBAAAAEAGABoAwAAFgAAACgAAAAQAAAAIAAAAAEAGAAAAAAAAAAAABMLAAATCwAAAAAAAAAAAAAVpv8Vpv8Vpv8Vpv8Vpv8Vpv8Vpv8Vpv8Vpv8Vpv8Vpv8Vpv8Vpv8Vpv8Vpv8Vpv8Vpv8Vpv8Vpv8Vpv8Vpv8Vpv8Vpv8Vpv8Vpv8Vpv8Vpv8Vpv8Vpv8Vpv8Vpv8Vpv8Vpv8Vpv8Vpv8Vpv8ysf97zf+24//F6f/F6f/F6f+K0/9QvP8Vpv8Vpv8Vpv8Vpv8Vpv8Vpv8krP+Z2P/////////w+f/F6f/F6f/i9P/////////T7v9Bt/8Vpv8Vpv8Vpv8Vpv/T7v/////w+f97zf8Vpv8Vpv8Vpv8Vpv9QvP/T7v/////w+f9Bt/8Vpv8Vpv97zf////////9QvP8Vpv8Vpv8Vpv8Vpv8Vpv8Vpv8krP/i9P/////i9P8Vpv8Vpv+24//////i9P8Vpv8Vpv8Vpv8Vpv8Vpv8Vpv8Vpv8Vpv+K0/////////8Vpv8Vpv/F6f////////8krP8Vpv8Vpv8Vpv8Vpv8Vpv8Vpv8Vpv+n3v/////w+f8Vpv8Vpv/F6f////////+n3v8krP8Vpv8Vpv8Vpv8Vpv8Vpv9tx/////////+Z2P8Vpv8Vpv/F6f/////////////i9P+K0/9QvP9QvP9tx//F6f////////+n3v8Vpv8Vpv8Vpv/F6f/////T7v+Z2P/i9P////////////////////+24/9QvP8Vpv8Vpv8Vpv8Vpv/F6f/////F6f8Vpv8Vpv8krP9QvP9QvP9Bt/8Vpv8Vpv8Vpv8Vpv8Vpv8Vpv8Vpv/F6f/////F6f8Vpv8Vpv8Vpv8Vpv8Vpv8Vpv8Vpv8Vpv8Vpv8Vpv8Vpv8Vpv8Vpv9Bt/9QvP9Bt/8Vpv8Vpv8Vpv8Vpv8Vpv8Vpv8Vpv8Vpv8Vpv8Vpv8Vpv8Vpv8Vpv8Vpv8Vpv8Vpv8Vpv8Vpv8Vpv8Vpv8Vpv8Vpv8Vpv8Vpv8Vpv8Vpv8Vpv8Vpv8Vpv8Vpv8Vpv8Vpv8Vpv8Vpv8Vpv8Vpv8Vpv8Vpv8Vpv8Vpv8Vpv8Vpv8Vpv8Vpv8AAHBsAABhdAAAbiAAAHJ0AABsaQAAdGkAACBDAABlbgAAUEEAAEVYAAAuQwAAOy4AAEU7AABBVAAAQ00AAC5W"});
  others.push({"id":"http://search.ebay.com/","name":"eBay","siteURL":"http://search.ebay.com/","host":"http:/search.ebay.com/","type":"suggest","queryURL":"http://rover.ebay.com/rover/1/711-47294-18009-3/4?mpre=http://shop.ebay.com/?_nkw={searchTerms}","suggestionURL":"http://anywhere.ebay.com/services/suggest/?s=0&q={searchTerms}","icon":"data:image/x-icon;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAABFUlEQVQ4jdWTvUoDQRSFvxUfQMFSyBvYpLGSSWFpncY6lsLWFiupBBtLBRsfQcQ2a782PoCkSrONlUGy5LPYn6wbu4DghcOcYs65595hIpVNamsj9V8ajOeFzgsFLmo+LxTXcWJVX8WyppIgKSVPkQQ/F0u3gSFwBfTqdoPoBYDnxRFcDgA4Z4cbPtazqblZptBgxJ2BtGydv+vbkyahSUGC0zxT7VeZ0DguBXFsRs9AKtzq/amOKA2sTAylzMDKoIM6wfXhcWmcBKd51ukeWq8Qx6V0MmFAuppxdx/OIgB6e/32+SoTUGfdHTxy0CRodtF6jZpW2R2qs/alQNrgYTytR8Cf1Rh08VuNGkECJCtd5L//TN/BEWxoE8dlIQAAAABJRU5ErkJggg=="});
  others.push({"id":"https://twitter.com/search/","name":"Twitter","siteURL":"https://twitter.com/search/","host":"https://twitter.com","type":"suggest","queryURL":"https://twitter.com/search/{searchTerms}?partner=Firefox&source=desktop-search","suggestionURL":"","icon":"data:image/x-icon;base64,AAABAAEAEBAAAAEAIABoBAAAFgAAACgAAAAQAAAAIAAAAAEAIAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAAAAD///8A////AP///wD///8A////AP///wD///8A////AP///wD///8A////AP///wD///8A////AP///wD///8A////AP///wD///8A/v7+D/7+/j/+/v5g/v7+YP7+/mD+/v5I/v7+KP///wD///8A////AP///wD///8A////AP///wD+/v4H/v7+UPbv4pHgx47B1K9Y3tWwWN7Ur1je3sKCx+rbuKj+/v5n/v7+GP///wD///8A////AP///wD+/v4Y+fbweM2ycMe2iB7/vI0f/8STIf/KlyL/zJki/8yZIv/LmCL/0ahK5/Hp1JH+/v4Y////AP///wD///8A7OTTaquHN+CujkXPs5ZTv6N6G/+2iB7/xpUh/8yZIv/MmSL/zJki/8yZIv/Kmy738OjUi////wD///8A////AMKtfY7w6+Ef////AP///wD///8A3sqbp8iWIf/MmSL/zJki/8yZIv/MmSL/y5gi/8mePO7+/v4w////AP///wD///8A////AP///wD+/v4H/v7+V9CtWN3KmCL/zJki/8yZIv/MmSL/zJki/8yZIv/JlyH/5tSqp/7+/mD+/v4/////AP///wD///8A+PXvJtGyZdXNnS/3y5gi/8qYIv/LmCL/zJki/8yZIv/MmSL/y5gi/82iPO7LqVfe0byMmf///wD///8A/v7+D/Do1JHKmy73ypci/8KSIP+/jyD/xpQh/8uYIv/MmSL/zJki/8qYIv+/jyD/rIEd/9nKqH7///8A////APPu4TzAlSz3wZEg/7mLH/+sgR3/uZdGz7mLH//JlyH/zJki/8yZIv/GlSH/to0r9eXbxD/Vx6dg////AP7+/h/p38WhtIsq9al/HP+kfyjuybaKgf///wCzjzjlwJAg/8qYIv/JlyH/u4wf/8CkYrn///8A////AP///wDj2sRMnHUa/7meYa7Vx6dg////AP///wD///8A2MmnYK6DHf++jiD/vo4g/62CHf/k2sQ/////AP///wD///8A8OvhH/f07w////8A////AP///wD///8A////AP///wC/p3Cfpnwc/66GKvPg1LZ8////AP///wD///8A////AP///wD///8A////AP///wD///8A////AP///wD///8A////ANXHp2DJtoqByLWKgf///wD///8A////AP///wD///8A////AP///wD///8A////AP///wD///8A////AP///wD///8A////AP///wD///8A////AP///wD///8A////AP///wD///8A////AP///wD///8A////AP///wD///8A////AP///wD///8A////AP///wD///8A//8AAP//AADgPwAAwA8AAIAHAAB4BwAA+AMAAPAAAADgAQAA4AMAAMEDAADPhwAA/48AAP/nAAD//wAA//8AAA=="});
  others.push({"id":"http://duckduckgo.com/opensearch_ssl.xml","name":"DuckDuckGo","siteURL":"http://duckduckgo.com/opensearch_ssl.xml","host":"http://duckduckgo.com","type":"suggest","queryURL":"https://duckduckgo.com/?q={searchTerms}","suggestionURL":"","icon":"http://duckduckgo.com/favicon.ico"});
  others.push({"id":"http://www.bing.com/search","name":"Bing","siteURL":"http://www.bing.com/search","host":"http://www.bing.com","type":"suggest","queryURL":"http://www.bing.com/search?q={searchTerms}&form=MOZSBR&pc=MOZI","suggestionURL":"http://api.bing.com/osjson.aspx?query={searchTerms}&form=OSDJAS","icon":"data:image/x-icon;base64,AAABAAEAEBAAAAEAGABoAwAAFgAAACgAAAAQAAAAIAAAAAEAGAAAAAAAAAAAABMLAAATCwAAAAAAAAAAAAAVpv8Vpv8Vpv8Vpv8Vpv8Vpv8Vpv8Vpv8Vpv8Vpv8Vpv8Vpv8Vpv8Vpv8Vpv8Vpv8Vpv8Vpv8Vpv8Vpv8Vpv8Vpv8Vpv8Vpv8Vpv8Vpv8Vpv8Vpv8Vpv8Vpv8Vpv8Vpv8Vpv8Vpv8Vpv8Vpv8ysf97zf+24//F6f/F6f/F6f+K0/9QvP8Vpv8Vpv8Vpv8Vpv8Vpv8Vpv8krP+Z2P/////////w+f/F6f/F6f/i9P/////////T7v9Bt/8Vpv8Vpv8Vpv8Vpv/T7v/////w+f97zf8Vpv8Vpv8Vpv8Vpv9QvP/T7v/////w+f9Bt/8Vpv8Vpv97zf////////9QvP8Vpv8Vpv8Vpv8Vpv8Vpv8Vpv8krP/i9P/////i9P8Vpv8Vpv+24//////i9P8Vpv8Vpv8Vpv8Vpv8Vpv8Vpv8Vpv8Vpv+K0/////////8Vpv8Vpv/F6f////////8krP8Vpv8Vpv8Vpv8Vpv8Vpv8Vpv8Vpv+n3v/////w+f8Vpv8Vpv/F6f////////+n3v8krP8Vpv8Vpv8Vpv8Vpv8Vpv9tx/////////+Z2P8Vpv8Vpv/F6f/////////////i9P+K0/9QvP9QvP9tx//F6f////////+n3v8Vpv8Vpv8Vpv/F6f/////T7v+Z2P/i9P////////////////////+24/9QvP8Vpv8Vpv8Vpv8Vpv/F6f/////F6f8Vpv8Vpv8krP9QvP9QvP9Bt/8Vpv8Vpv8Vpv8Vpv8Vpv8Vpv8Vpv/F6f/////F6f8Vpv8Vpv8Vpv8Vpv8Vpv8Vpv8Vpv8Vpv8Vpv8Vpv8Vpv8Vpv8Vpv9Bt/9QvP9Bt/8Vpv8Vpv8Vpv8Vpv8Vpv8Vpv8Vpv8Vpv8Vpv8Vpv8Vpv8Vpv8Vpv8Vpv8Vpv8Vpv8Vpv8Vpv8Vpv8Vpv8Vpv8Vpv8Vpv8Vpv8Vpv8Vpv8Vpv8Vpv8Vpv8Vpv8Vpv8Vpv8Vpv8Vpv8Vpv8Vpv8Vpv8Vpv8Vpv8Vpv8Vpv8Vpv8Vpv8Vpv8AAHBsAABhdAAAbiAAAHJ0AABsaQAAdGkAACBDAABlbgAAUEEAAEVYAAAuQwAAOy4AAEU7AABBVAAAQ00AAC5W"});
  others.push({"id":"https://github.com/opensearch.xml","name":"GitHub","siteURL":"https://github.com/opensearch.xml","host":"https://github.com","type":"suggest","queryURL":"http://github.com/search","suggestionURL":"","icon":"data:image/x-icon;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAGXRFWHRTb2Z0d2FyZQBBZG9iZSBJ\nbWFnZVJlYWR5ccllPAAAAVpJREFUeNqM0s0rRGEUx/F7x0RKxob4A6bZKBYWFkLZqIkkC7FUsrCw\noCxsZcN/IFmIP4E9ZWnyurBR3krZeH8b1/dMv5vTpDue+szzzL33nJ5znieIoihIGCGmMIt0+ctS\nbIUETbhHEbm/EqSD5PGOC2TwgHo04xaPv9tIHhbUoPUMXjAcx4aln9BKDcYxgRR20IJNDKEO69hC\nFie2JnYx3sGYJcQ5jrU2PTjEDbpwpeeXWPZN3NOLnLb8hm1UoaBAG3P6btR26pt4rblDDarRs6KO\nMh7fmr/idZxgAW3Y0H/r/IqCfYKU5o/yB1b7kY5tGp04Uwmh++5Vcx59PoGNWtV3pznQXK2SbLf7\n6s8kVv09yLpGRro0SwoawIgrt1fNzPtT2FVd/WjVCdiL9qQb5k8ho3Ia8eTKea50TeMd2LZOXQmf\nmP9PrL/K3RjURTrAmk4lMcGPAAMAEvmJGW+ZZPAAAAAASUVORK5CYII="});

  PrefsApp.defaultslist.reset(defaults);
  PrefsApp.otherslist.reset(others);
});

