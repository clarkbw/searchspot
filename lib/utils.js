/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

/*jshint forin:true, noarg:true, noempty:true, eqeqeq:true, bitwise:true,
  strict:true, undef:true, curly:true, browser:true, es5:true,
  indent:2, maxerr:50, devel:true, node:true, boss:true, white:true,
  globalstrict:true, nomen:false, newcap:true*/

/*global */

"use strict";

var chrome = require("chrome");
var ios = chrome.Cc['@mozilla.org/network/io-service;1']
                .getService(chrome.Ci.nsIIOService);

var base64 = require("api-utils/base64");

var defer = require('api-utils/promise').defer;

var imgTools = chrome.Cc["@mozilla.org/image/tools;1"]
                     .getService(chrome.Ci.imgITools);

var NetUtil = chrome.Cu.import("resource://gre/modules/NetUtil.jsm",
                               {}).NetUtil;

var connector = null;
try {
  connector = ios.QueryInterface(chrome.Ci.nsISpeculativeConnect);
} catch (olderFirefoxVersion) { }

// https://developer.mozilla.org/en-US/search?q=nsISpeculativeConnect
exports.speculativeConnect = function speculativeConnect(url) {
  if (connector === null) {
    // older versions of Firefox don't have nsISpeculativeConnect
    return;
  }
  var uri = url;
  if (typeof url === "string") {
    try {
      uri = ios.newURI(url, null, null);
    } catch (ignore) {
      return;
    }
  }
  try {
    connector.speculativeConnect(uri, null, null);
  } catch (ignore) { }
};

/**
 * Open a channel asynchronously for the URI given and returning a promise.
 *
 * This was borrowed from the "api-utils/url/io" module.  I needed an alternate
 * version that would return both the contentType and data from the image.  I'm
 * not going to export this as a reusable module.
 */
function readAsync(uri) {
  var channel = NetUtil.newChannel(uri, null, null);

  var deferred = defer(),
      promise = deferred.promise,
      resolve = deferred.resolve,
      reject = deferred.reject;

  NetUtil.asyncFetch(channel, function (stream, result) {
    if (chrome.components.isSuccessCode(result)) {
      var count = stream.available();
      var data = NetUtil.readInputStreamToString(stream, count);

      resolve({ contentType : channel.contentType, data : data });
    } else {
      reject("Failed to read: '" + uri + "' (Error Code: " + result + ")");
    }
  });

  return promise;
}

/**
 * Reads an image URI asynchronously and returns a promise of a value that
 * will resolve to a 16x16 data URI of the image.
 *
 * Image URIs can be ICO or other formats and this will decode them and return
 * a PNG version of the image.
 *
 * @param uri {string} The URI to read
 *
 * @returns {string} A base64 data URI of a 16x16 PNG version of the image
 *
 * @example
 *  fetchImageDataASync('http://en.wikipedia.org/favicon.ico').
 *                then(function (datauri) { });
 */
exports.fetchImageDataASync = function fetchImageDataASync(uri) {
  var container = {},
      stream = chrome.Cc["@mozilla.org/io/string-input-stream;1"]
                     .createInstance(chrome.Ci.nsIStringInputStream),
      wrapped = chrome.Cc["@mozilla.org/supports-interface-pointer;1"]
                      .createInstance(chrome.Ci.nsISupportsInterfacePointer),
      bstream = chrome.Cc["@mozilla.org/binaryinputstream;1"]
                      .createInstance(chrome.Ci.nsIBinaryInputStream),
      PNG = "image/png";

  return readAsync(uri).then(function (fetch) {
    var data = fetch.data,
        contentType = fetch.contentType,
        istream,
        outData = "";

    // Thanks to BenB via stack overflow for this one!
    // http://stackoverflow.com/questions/8775932/
    if ("data" in stream) { // Gecko 1.9 or newer
      stream.data = data;
    } else { // 1.8 or older
      stream.setData(data, data.length);
    }

    // decode what could be an ICO file
    imgTools.decodeImageData(stream, contentType, container);

    // mucking with XPCOM pointers
    wrapped = container.value;

    // Scale and encode the image of whatever type into a PNG of size 16
    istream =  imgTools.encodeScaledImage(wrapped, PNG, 16, 16);

    bstream.setInputStream(istream);

    for (var avail = bstream.available(); avail; avail = bstream.available()) {
      outData += bstream.readBytes(avail);
    }

    bstream.close();

    return ("data:" + PNG + ";base64," + base64.encode(outData));
  });
};

exports.fixedEncodeURIComponent = function (str) {
  var encoded = encodeURIComponent((str + ""));
  return encoded.replace(/%20/g, "+").replace(/[!'()*]/g, escape);
}
