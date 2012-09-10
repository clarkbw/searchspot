/* This Source Code Form is subject to the terms of the Mozilla Public
* License, v. 2.0. If a copy of the MPL was not distributed with this
* file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/*jshint forin:true, noarg:true, noempty:true, eqeqeq:true, bitwise:true,
  strict:true, undef:true, curly:true, browser:true, es5:true,
  indent:2, maxerr:50, devel:true, node:true, boss:true, white:true,
  globalstrict:true, nomen:true, newcap:true*/

/*global self:false */

//"use strict";

var rel = "search",
    type = "application/opensearchdescription+xml",
    nodeName = "LINK",
    selector = nodeName + "[rel='" + rel + "'][type='" + type + "']",
    links = document.querySelectorAll(selector),
    title = null,
    href = null,
    results = [];

for (var i = 0, link; link = links[i]; i += 1) {
  if (link.nodeName === nodeName && link.rel === rel && link.type === type) {
    title = link.getAttribute("title");
    href = link.getAttribute("href");
    if (title !== null && href !== null) {
      results.push({ site : document.URL, name : title, opensearch : href });
    }
  }
}

if (results.length > 0) {
  self.postMessage(results);
}
