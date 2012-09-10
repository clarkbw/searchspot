/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

/*jshint forin:true, noarg:true, noempty:true, eqeqeq:true, bitwise:true,
  strict:true, undef:true, curly:true, browser:true, es5:true,
  indent:2, maxerr:50, devel:true, node:true, boss:true, white:true,
  globalstrict:true, nomen:false, newcap:true*/

/*global */

"use strict";

var EventEmitter = require("events").EventEmitter,
    URL = require("url"),
    querystring = require("querystring"),
    xhr = require("xhr"),
    simpleprefs = require("simple-prefs"),
    getFavicon = require("api-utils/utils/data").getFaviconURIForLocation,
    PrivateBrowsing = require("private-browsing");

var ALLOW_COLLECT_PREF = "allowSearchEngineCollector";

var URLTYPE_SEARCH_HTML  = "text/html",
    URLTYPE_SUGGEST_JSON = "application/x-suggestions+json",
    URLTYPE_SUGGEST_XML = "application/x-suggestions+xml",
    URLTYPE_OPENSEARCH_DESCRIPTION = "application/opensearchdescription+xml";

/**
 * A service for watching pages for OpenSearch description documents
 *  Links URLs are fetched, parsed, and objects emitted
 *
 * @see http://en.wikipedia.org/wiki/OpenSearch
 * @see http://www.opensearch.org/
 *
 * Emits two notifications for OpenSearch elements found:
 *
 *  - "href"    host {String}, href {String}
 *  - "engine"  engine {Object} e.g. { "url" : url, "name" : name,
 *                                     "queryURL" : queryURL,
 *                                     "suggestionURL" : suggestionURL,
 *                                     "icon" : icon }
 *
 * @example
 *      SearchEnginesCollector.on("engine", function(engine) {
 *          console.log(engine);
 *       });
 *
 * @example
 *      SearchEnginesCollector.on("href", function(host, href) {
 *           console.log("host", host, "href", href);
 *      });
 *
 */
var SearchEnginesCollector = EventEmitter.compose({
  _emit: EventEmitter.required,
  on: EventEmitter.required,

  _allowed : simpleprefs.prefs[ALLOW_COLLECT_PREF],
  get allowed() { return this._allowed; },
  set allowed(allow) {
    this._allowed = simpleprefs.prefs[ALLOW_COLLECT_PREF] = allow;
  },

  get isOk() {
    // Do not collect links when the user is in private browsing mode
    if (PrivateBrowsing.isActive) {
      console.debug("PrivateBrowsing enabled - not collecting search engines");
    }
    if (!this._allowed) {
      console.debug("Search Engines Collector is not enabled");
    }
    return (!PrivateBrowsing.isActive && this._allowed);
  },

  _onallowed : function _onallowed(subject) {
    this._allowed = simpleprefs.prefs[ALLOW_COLLECT_PREF];
    this._emit("allowed", this._allowed);
  },

  constructor : function SearchEnginesCollector() {
    simpleprefs.on(ALLOW_COLLECT_PREF, this._onallowed.bind(this), this);
    require("unload").ensure(this);
  },

  unload: function _destructor() {
    this._removeAllListeners();
    simpleprefs.removeListener(ALLOW_COLLECT_PREF, this._onallowed);
  },

  /**
   * Receives <link> elements from the PageMod
   *
   * **Note** Will not continue if `PrivateBrowsing.isActive` returns true to
   * avoid collecting OpenSearch description documents while the users is in
   * private browsing mode.
   *
   * @param   links       {Array}
   *          an array of link objects
   *          where objects are { site : document.URL,
   *                              name : <link title>,
   *                              opensearch : <link href> }
   *
   * emits the "link" event
   *
   */
  collect : function collect(links) {
    if (!this.isOk) {
      return null;
    }

    links.forEach(function (link, i, a) {
      // site (may) = "http://google.com/search/path/?q="
      var site = URL.URL(link.site);

      // host = "http://google.com/"
      var host = link.site.replace(site.path, "");

      // opensearch URL could be relative so use the host as a base
      // example: href="/search.xml"
      var href = URL.URL(link.opensearch, host);

      // emit that we found a URL for anyone who wants to listen
      this._emit("link", host, href);

      // retrieve this engine from the URL
      this.getEngineByXMLURL(href);

    }.bind(this));

    return links;
  },

  /**
   * Retrieves and parses OpenSearch engine XML descriptors
   *
   * @param   url       {String}
   *          Absolute URL pointing to an OpenSearch XML file
   *
   * emits the "engine" event
   *
   */
  getEngineByXMLURL : function getEngineByXMLURL(url) {
    var request = new xhr.XMLHttpRequest(),
        collector = this;

    request.open('GET', url, true);
    //console.log("getEngineByXMLURL.open", url);
    request.onreadystatechange = function (aEvt) {
      if (request.readyState === 4) {
        if (request.status === 200 || request.status === 0) {
          if (request.responseXML) {
            if (collector.isOk) {
              collector._emit("engine",
                              collector._parse(url, request.responseXML));
            }
          }
        }
      }
    };
    request.send(null);
  },


  /**
   * Lightweight parsing of an XML OpenSearch description document
   *
   * @param   url       {String}
   *          Absolute URL pointing to an OpenSearch XML file
   *
   * @param   doc       {Object}
   *          XML document object from request.responseXML xhr call
   *
   * @returns {Object}
   *          { "url", "name", "queryURL", "suggestionURL", "icon" }
   *
   */
  _parse : function _parse(url, doc) {
    var opensearch = { "url" : url, "name" : "", "queryURL" : "",
                       "suggestionURL" : "", "icon" : "" },
        urls = doc.getElementsByTagName("Url"),
        queryObj = null,
        queryMap = function (key) { return (key + "=" + queryObj[key]); };

    for (var i = 0, item; item = urls.item(i); i += 1) {
      //var method = item.getAttribute("method");

      var template = URL.URL(item.getAttribute("template")),
          type = item.getAttribute("type"),
          params = item.getElementsByTagName("Param"),
          split = template.path.split("?"),
          path = split[0],
          query = split[1];

      queryObj = querystring.parse(query);

      for (var j = 0, param; param = params.item(j); j += 1) {
        queryObj[param.getAttribute("name")]  = param.getAttribute("value");
      }

      // remove the original path from our template and make this a string now
      template = template.toString().replace(template.path, "");

      // add back the path with query string
      template += path + "?" + Object.keys(queryObj).map(queryMap).join("&");

      if (URLTYPE_SEARCH_HTML === type) {
        opensearch.queryURL = template;
      } else if (URLTYPE_SUGGEST_JSON === type) {
        opensearch.suggestionURL = template;
      }
    }

    try {
      opensearch.name = doc.getElementsByTagName("ShortName").item(0).textContent;
    } catch (noname) { console.error("engine has no name", noname); }

    try {
      opensearch.icon = doc.getElementsByTagName("Image").item(0).textContent;
    } catch (noicon) {
      // try to get the favicon using the Favicon service
      // falls back to the default icon if none is found
      opensearch.icon = getFavicon(url);
    }

    return opensearch;
  }

})();


/**
 * PageMod object that queries all pages for <link> element references
 *
 * @example
 *        <link rel="search"
 *              type="application/opensearchdescription+xml"
 *              href="http://example.com/comment-search.xml"
 *              title="Comments search" />
 *
 * Calls `SearchEnginesCollector.collect(data)` on postMessage
 *  data passed back via worker
 *
 */
require("page-mod").PageMod({
  include: "*",
  contentScriptWhen: 'end',
  contentScriptFile: require("self").data.url("search-engines-collector-pagemod.js"),
  onAttach: function (worker) {
    worker.on('message', function (data) {
      SearchEnginesCollector.collect(data);
    });
  }
});

exports.SearchEnginesCollector = SearchEnginesCollector;
