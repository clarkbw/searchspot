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

var connector = ios.QueryInterface(chrome.Ci.nsISpeculativeConnect);

// https://developer.mozilla.org/en-US/search?q=nsISpeculativeConnect
exports.speculativeConnect = function speculativeConnect(url) {
  var uri = url;
  if (typeof url === "string") {
    uri = ios.newURI(url, null, null);
  }
  connector.speculativeConnect(uri, null, null);
};
