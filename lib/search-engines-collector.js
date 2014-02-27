/*! This Source Code Form is subject to the terms of the Mozilla Public
* License, v. 2.0. If a copy of the MPL was not distributed with this
* file, You can obtain one at http://mozilla.org/MPL/2.0/.
*/

/*jshint forin:true, noarg:true, noempty:true, eqeqeq:true, bitwise:true,
strict:true, undef:true, unused:true, curly:true, browser:true, white:true,
moz:true, esnext:true, indent:2, maxerr:50, devel:true, node:true, boss:true,
globalstrict:true, nomen:false, newcap:false */

"use strict";

var URL = require('sdk/url'),
    querystring = require('sdk/querystring'),
    xhr = require('sdk/net/xhr'),
    simpleprefs = require('sdk/simple-prefs'),
    getFavicon = require('sdk/io/data').getFaviconURIForLocation,
    PrivateBrowsing = require('sdk/private-browsing'),
    Class = require('sdk/core/heritage').Class,
    ns = require('sdk/core/namespace').ns,
    eventcore = require('sdk/event/core'),
        off = eventcore.off,
        emit = eventcore.emit,
    EventTarget = require('sdk/event/target').EventTarget,
    fetchImageDataASync = require('utils').fetchImageDataASync;

var ALLOW_COLLECT_PREF = "allowSearchEngineCollector";

var HTTP_OK                    = 200,
    HTTP_LOCAL_FILE            = 0,
    // These are for future use in tracking backoff errors
    HTTP_INTERNAL_SERVER_ERROR = 500,
    HTTP_BAD_GATEWAY           = 502,
    HTTP_SERVICE_UNAVAILABLE   = 503;

var URLTYPE_SEARCH_HTML  = "text/html",
    URLTYPE_SUGGEST_JSON = "application/x-suggestions+json",
    URLTYPE_SUGGEST_XML = "application/x-suggestions+xml",
    URLTYPE_OPENSEARCH_DESCRIPTION = "application/opensearchdescription+xml";

var TAG_PARAM = "Param",
    TAG_SHORT_NAME = "ShortName",
    TAG_URL = "Url",
    TAG_IMAGE = "Image";

var ATTR_TEMPLATE = "template",
    ATTR_VALUE = "value",
    ATTR_NAME = "name",
    ATTR_TYPE = "type",
    ATTR_HEIGHT = "height",
    ATTR_WIDTH = "width";

var namespace = ns();

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
var SearchEnginesCollector = Class({
  extends : EventTarget,

  get allowed() { return namespace(this).allowed; },
  set allowed(allow) {
    console.debug("Search Engines Collector is allowed == " + allow);
    namespace(this).allowed = simpleprefs.prefs[ALLOW_COLLECT_PREF] = allow;
  },

  get isOk() {
    return namespace(this).allowed;
  },

  _onallowed : function _onallowed() {
    namespace(this).allowed = simpleprefs.prefs[ALLOW_COLLECT_PREF];
    emit(this, "allowed", namespace(this).allowed);
  },

  initialize : function SearchEnginesCollector() {
    namespace(this).allowed = simpleprefs.prefs[ALLOW_COLLECT_PREF];
    simpleprefs.on(ALLOW_COLLECT_PREF, this._onallowed.bind(this), this);
    require('sdk/system/unload').ensure(this);
  },

  unload: function _destructor() {
    off(this);
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

    links.forEach(function (link) {
      // site (may) = "http://google.com/search/path/?q="
      var site = URL.URL(link.site);

      // host = "http://google.com/"
      var host = link.site.replace(site.path, "");

      // opensearch URL could be relative so use the host as a base
      // example: href="/search.xml"
      var href = URL.URL(link.opensearch, host);

      // emit that we found a URL for anyone who wants to listen
      emit(this, "link", host, href);

      // retrieve this engine from the URL
      this.getEngineByXMLURL(href.toString(), host);

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
  getEngineByXMLURL : function getEngineByXMLURL(url, host) {
    var request = new xhr.XMLHttpRequest(),
        collector = this;

    request.open('GET', url, true);
    // Force document parsing in case we get a weird response type
    request.overrideMimeType("text/xml");
    request.onreadystatechange = function () {
      if (request.readyState === 4) {
        if (request.status === HTTP_OK ||
            request.status === HTTP_LOCAL_FILE) {
          if (request.responseXML) {
            if (collector.isOk) {
              collector._buildEngine(url, host, request.responseXML);
            }
          }
        }
      }
    };
    request.send(null);
  },

  /**
   * Wraps up the Async download of the Open Search image
   */
  _buildEngine : function _buildEngine(url, host, doc) {
    var collector = this,
        engine = this._parse(url, host, doc),
        href = null;
    try {
      if (engine !== null) {
        href = new URL.URL(engine.icon);
        fetchImageDataASync(href.toString()).then(function (datauri) {
          engine.icon = datauri;
          emit(collector, "engine", engine);
        });
      }
    } catch (e) {
      // if there's a problem with our engine icon lets just send this one off
      // without an icon
      emit(collector, "engine", engine);
    }
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
  _parse : function _parse(url, host, doc) {
    var opensearch = { "url" : url, "name" : "", "queryURL" : "",
                       "suggestionURL" : "", "icon" : "" },
        i = 0, item = null,
        urls = doc.getElementsByTagName(TAG_URL),
        imgs = doc.getElementsByTagName(TAG_IMAGE),
        queryObj = null,
        queryMap = function (key) { return (key + "=" + queryObj[key]); };

    if (doc.getElementsByTagName("OpenSearchDescription").length !== 1) {
      return null;
    }

    for (i = 0, item = null; item = urls.item(i); i += 1) {
      //var method = item.getAttribute("method");

      var template = new URL.URL(item.getAttribute(ATTR_TEMPLATE), host),
          type = item.getAttribute(ATTR_TYPE),
          params = item.getElementsByTagName(TAG_PARAM),
          split = template.path.split("?"),
          path = split[0],
          query = split[1];

      queryObj = querystring.parse(query);

      for (var j = 0, p; p = params.item(j); j += 1) {
        queryObj[p.getAttribute(ATTR_NAME)] = p.getAttribute(ATTR_VALUE);
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
      opensearch.name = doc.getElementsByTagName(TAG_SHORT_NAME)
                           .item(0).textContent;
    } catch (noname) { console.log("engine has no name", url); }

    try {
      for (i = 0, item = null; item = imgs.item(i); i += 1) {
        if (item.getAttribute(ATTR_HEIGHT) === "16" &&
            item.getAttribute(ATTR_WIDTH) === "16") {
          opensearch.icon = item.textContent;
        }
      }
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
require('sdk/page-mod').PageMod({
  include: "*",
  contentScriptWhen: 'end',
  contentScriptFile: require('sdk/self').data.url("search-engines-collector-pagemod.js"),
  attachTo: ["existing", "top"],
  onAttach: function (worker) {
    // don't attach to private browsing windows
    if (!PrivateBrowsing.isPrivate(worker)) {
      worker.on('message', function (data) {
        SearchEnginesCollector.collect(data);
      });
    }
  }
});

exports.SearchEnginesCollector = SearchEnginesCollector;
