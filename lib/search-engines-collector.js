/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const { EventEmitter } = require("events"),
      data = require("self").data,
      URL = require("url"),
      querystring = require("querystring"),
      xhr = require("xhr"),
      simpleprefs = require("simple-prefs"),
      PrivateBrowsing = require("private-browsing");

const ALLOW_COLLECT_PREF = "allowSearchEngineCollector";

const URLTYPE_SEARCH_HTML  = "text/html",
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
 *  - "engine"  engine {Object} e.g. { "url" : url, "name" : name, "queryURL" : queryURL, "suggestionURL" : suggestionURL, "icon" : icon }
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
const SearchEnginesCollector = EventEmitter.compose({
  _emit: EventEmitter.required,
  on: EventEmitter.required,

  _allowed : simpleprefs.prefs[ALLOW_COLLECT_PREF],
  get allowed() this._allowed,
  set allowed(allow) this._allowed = simpleprefs.prefs[ALLOW_COLLECT_PREF] = allow,

  get isOk() {
    // Do not collect links when the user is in private browsing mode
    if (PrivateBrowsing.isActive) {
      console.log("PrivateBrowsing enabled - not collecting OpenSearch description documents");
    }
    if (!this._allowed) {
      console.log("Search Engines Collector is not enabled - not collecting OpenSearch description documents");
    }
    return (!PrivateBrowsing.isActive && this._allowed);
  },
  _onallowed : function(subject) {
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

    links.forEach(function(link, i, a) {
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
      if (request.readyState == 4) {
        if (request.status == 200 || request.status == 0) {
          if (request.responseXML) {
            if (collector.isOk) {
              collector._emit("engine", collector._parse(url, request.responseXML));
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
        urls = doc.getElementsByTagName("Url");

    for (var i = 0; i < urls.length; i++) {
      //var method = urls.item(i).getAttribute("method");

      var template = URL.URL(urls.item(i).getAttribute("template")),
          type = urls.item(i).getAttribute("type"),
          params = urls.item(i).getElementsByTagName("Param"),
          [ path, query ] = template.path.split("?"),
          queryObj = querystring.parse(query);

      // add all the param elements into the query object
      for (var j = 0; j < params.length; j++) {
        queryObj[params.item(i).getAttribute("name")]  = params.item(i).getAttribute("value");
      }

      // remove the original path from our template and make this a string now
      template = template.toString().replace(template.path, "");

      // add back the path with query string
      template += path + "?" + Object.keys(queryObj).map(function(key) {
                                                          return (key + "=" + queryObj[key]);
                                                         }).join("&");

      if (URLTYPE_SEARCH_HTML == type) {
        opensearch["queryURL"] = template;
      } else if (URLTYPE_SUGGEST_JSON == type) {
        opensearch["suggestionURL"] = template;
      }
    }

    try {
      opensearch["name"] = doc.getElementsByTagName("ShortName").item(0).textContent;
    } catch(noname) { console.error("engine has no name", noname); }

    try {
      // XXX TODO need to download and base64 this one sometime in the future
      // XXX Or need to use a service like http://www.google.com/s2/favicons?domain=www.cnn.com
      opensearch["icon"] = doc.getElementsByTagName("Image").item(0).textContent;
    } catch(noicon) {
      // try the favicon of the current tab as our fallback
      opensearch["icon"] = require("tabs").activeTab.favicon;
      console.error("engine has no icon", noicon);
      }

    //console.log("opensearch", JSON.stringify(opensearch));
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
 * Calls `SearchEnginesCollector.collect(data)` on postMessage data passed back via worker
 *
 */
require("page-mod").PageMod({
  include: "*",
  contentScriptWhen: 'end',
  contentScriptFile: data.url("search-engines-collector-pagemod.js"),
  onAttach: function(worker) {
    worker.on('message', function(data) {
      //console.log("PageMod", data);
      SearchEnginesCollector.collect(data);
    });
  }
});

exports.SearchEnginesCollector = SearchEnginesCollector;
