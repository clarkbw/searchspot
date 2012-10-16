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
    PrivateBrowsing = require("private-browsing"),
    fetchImageDataASync = require("utils").fetchImageDataASync;

var getFavicon = function () {
  // Provide the real favicon when it is available
  // In the meantime, return 16x16 blank default, as per "get favicon()" from sdk/tabs/tab-fennec.js.
  return 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAEklEQVQ4jWNgGAWjYBSMAggAAAQQAAF/TXiOAAAAAElFTkSuQmCC';
};
if (require("sdk/system/xul-app").is("Firefox")) {
  getFavicon = require("sdk/io/data").getFaviconURIForLocation;
}

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
    TAG_IMAGE = "Image";

var ATTR_TEMPLATE = "template",
    ATTR_VALUE = "value",
    ATTR_NAME = "name";

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
      this.getEngineByXMLURL(href.toString());

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
    // Force document parsing in case we get a weird response type
    request.overrideMimeType("text/xml");
    request.onreadystatechange = function (aEvt) {
      if (request.readyState === 4) {
        if (request.status === HTTP_OK ||
            request.status === HTTP_LOCAL_FILE) {
          if (request.responseXML) {
            if (collector.isOk) {
              collector._buildEngine(url, request.responseXML);
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
  _buildEngine : function _buildEngine(url, doc) {
    var collector = this,
        engine = this._parse(url, doc),
        href = null;
    try {
      href = URL.URL(engine.icon);
      fetchImageDataASync(href.toString()).then(function (datauri) {
        engine.icon = datauri;
        collector._emit("engine", engine);
      });
    } catch (e) {
      // if there's a problem with our engine icon lets just send this one off
      // without an icon
      collector._emit("engine", engine);
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
  _parse : function _parse(url, doc) {
    var opensearch = { "url" : url, "name" : "", "queryURL" : "",
                       "suggestionURL" : "", "icon" : "" },
        urls = doc.getElementsByTagName("Url"),
        queryObj = null,
        queryMap = function (key) { return (key + "=" + queryObj[key]); };

    for (var i = 0, item; item = urls.item(i); i += 1) {
      //var method = item.getAttribute("method");

      var template = URL.URL(item.getAttribute(ATTR_TEMPLATE)),
          type = item.getAttribute("type"),
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
    } catch (noname) { console.error("engine has no name", noname); }

    try {
      opensearch.icon = doc.getElementsByTagName(TAG_IMAGE).item(0).textContent;
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
  attachTo: ["existing", "top"],
  onAttach: function (worker) {
    worker.on('message', function (data) {
      SearchEnginesCollector.collect(data);
    });
  }
});

exports.SearchEnginesCollector = SearchEnginesCollector;
