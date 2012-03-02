/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

//if (!require("api-utils/xul-app").is("Firefox")) {
//  throw new Error([
//    "The search engine collector module currently supports only Firefox.  In the future ",
//    "we would like it to support other applications, however.  Please see ",
//    "https://bugzilla.mozilla.org/show_bug.cgi?id=jetpack-panel-apps ",
//    "for more information."
//  ].join(""));
//}

const { EventEmitter } = require("events"),
      data = require("self").data,
      URL = require("url"),
      xhr = require("xhr");
      //PrivateBrowsing = require("private-browsing");

const URLTYPE_SEARCH_HTML  = "text/html",
      URLTYPE_SUGGEST_JSON = "application/x-suggestions+json";

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

  constructor : function SearchEnginesCollector() {
    require("unload").ensure(this);
  },

  unload: function _destructor() {
    this._removeAllListeners();
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

    // Do not collect links when the user is in private browsing mode
    //if (PrivateBrowsing.isActive) {
    //  console.log("PrivateBrowsing enabled - not collecting OpenSearch description documents");
    //  return;
    //}

    var results = [];
    for (var i = 0; i < links.length; i++) {
      var link = links[i];

      // site (may) = "http://google.com/search/path/?q="
      var site = URL.URL(link.site);

      // host = "http://google.com/"
      var host = link.site.replace(site.path, "");

      // opensearch URL could be relative so use the host as a base
      var href = URL.URL(link.opensearch, host);

      // emit that we found a URL for anyone who wants to listen
      this._emit("link", host, href);

      // retrieve this engine from the URL
      this.getEngineByXMLURL(href);
    }
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
    var request = new xhr.XMLHttpRequest();
    request.open('GET', url, true);
    //console.log("getEngineByXMLURL.open", url);
    request.onreadystatechange = function (aEvt) {
      if (request.readyState == 4) {
        if (request.status == 200) {
          if (request.responseXML) {
            this._emit("engine", this._parse(url, request.responseXML));
          }
        }
      }
    }.bind(this);
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
    var suggestionURL = "", queryURL = "", icon = "", name = "", method = "";

    var urls = doc.getElementsByTagName("Url");
    for (var i = 0; i < urls.length; i++) {
      method = urls.item(i).getAttribute("method");

      var template = urls.item(i).getAttribute("template");
      var type = urls.item(i).getAttribute("type");
      if (type == URLTYPE_SEARCH_HTML) {
        queryURL = template;
      } else if (type == URLTYPE_SUGGEST_JSON) {
        suggestionURL = template;
      }
    }

    try {
      name = doc.getElementsByTagName("ShortName")[0].textContent;
    } catch(noname) { console.error("engine has no name", noname); }

    try {
      // XXX TODO need to download and base64 this one sometime in the future
      icon = doc.getElementsByTagName("Image")[0].textContent;
    } catch(noicon) { console.error("engine has no icon", noicon); }

    //console.log("parsed", name, queryURL, suggestionURL, icon);
    return { "url" : url, "name" : name, "queryURL" : queryURL, "suggestionURL" : suggestionURL, "icon" : icon };
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
