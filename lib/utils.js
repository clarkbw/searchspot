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

var imgTools = chrome.Cc["@mozilla.org/image/tools;1"]
                     .getService(chrome.Ci.imgITools);

var NetUtil = chrome.Cu.import("resource://gre/modules/NetUtil.jsm",
                               {}).NetUtil;

var connector = ios.QueryInterface(chrome.Ci.nsISpeculativeConnect);

// https://developer.mozilla.org/en-US/search?q=nsISpeculativeConnect
exports.speculativeConnect = function speculativeConnect(url) {
  var uri = url;
  if (typeof url === "string") {
    uri = ios.newURI(url, null, null);
  }
  connector.speculativeConnect(uri, null, null);
};

/**
 * Reads an image URI synchronously and returns a 16x16 data URI of the image
 * Image URIs can be ICO or other formats and this will decode them and return
 * a PNG version of the image.
 *
 * @param uri {string} The URI to read
 * @param [charset] {string} The character set to use when read the content of
 *        the `uri` given.  By default is set to 'UTF-8'.
 *
 * @returns {string} A base64 data URI of a 16x16 PNG version of the image
 *
 * @example
 *  var datauri = fetchImageDataSync('http://en.wikipedia.org/favicon.ico');
 */
exports.fetchImageDataSync = function fetchImageDataSync(uri, charset) {
  charset = typeof charset === "string" ? charset : "UTF-8";

  var channel = NetUtil.newChannel(uri, charset, null);
  var stream = channel.open();

  var container = {};

  // download and decode what could be an ICO file
  imgTools.decodeImageData(stream, channel.contentType, container);

  stream.close();

  // here we're just mucking with XPCOM
  var wrapped = chrome.Cc["@mozilla.org/supports-interface-pointer;1"]
                      .createInstance(chrome.Ci.nsISupportsInterfacePointer);
  wrapped = container.value;

  // Now scale and encode the image of whatever type into a PNG of size 16
  var PNG = "image/png";
  var istream =  imgTools.encodeScaledImage(wrapped, PNG, 16, 16);

  var bstream = chrome.Cc["@mozilla.org/binaryinputstream;1"]
                      .createInstance(chrome.Ci.nsIBinaryInputStream);

  bstream.setInputStream(istream);

  var outData = "";
  var avail = bstream.available();
  while (avail) {
    outData += bstream.readBytes(avail);
    avail = bstream.available();
  }

  bstream.close();

  return "data:" + PNG + ";base64," + base64.encode(outData);
};
