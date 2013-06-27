/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

 /*jshint esnext:true, node:true, newcap:false */

"use strict";

var { Loader } = require('sdk/test/loader');

var chrome = require("chrome");
var data = require('sdk/self').data;

exports['test addXULStylesheet'] = function (assert) {
  var loader = new Loader(module),
      utils = loader.require("./utils");

  var ssurl = data.url("searchspot-style.css");
  utils.addXULStylesheet(ssurl);

  var ssuri = utils.newURI(ssurl);
  var sss = chrome.Cc["@mozilla.org/content/style-sheet-service;1"]
                  .getService(chrome.Ci.nsIStyleSheetService);

  assert.ok(sss.sheetRegistered(ssuri, sss.AGENT_SHEET), "style sheet is registered");

  loader.unload();
  assert.ok(!sss.sheetRegistered(ssuri, sss.AGENT_SHEET), "style sheet is no longer registered");
};

require('test').run(exports);
