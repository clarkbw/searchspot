/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/*jshint forin:true, noarg:true, noempty:true, eqeqeq:true, bitwise:true,
  strict:true, undef:true, curly:true, browser:false, es5:true,
  indent:2, maxerr:50, devel:true, node:true, boss:true, white:true,
  globalstrict:true, nomen:false, newcap:true, esnext: true */

'use strict';

var utils = require('utils');
var chrome = require("chrome");
var data = require("self").data;

exports['test addXULStylesheet'] = function (assert, done) {
  var main = require('main');
  main.main();
  var ssuri = utils.newURI(data.url("searchspot-style.css"));
  var sss = chrome.Cc["@mozilla.org/content/style-sheet-service;1"]
                  .getService(chrome.Ci.nsIStyleSheetService);

  assert.equal(sss.sheetRegistered(ssuri, sss.AGENT_SHEET), true, "style sheet is registered");
  done();
};

require('test').run(exports);
