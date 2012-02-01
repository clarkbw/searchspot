// search-engine-pagemod.js
//
// This file scans pages looking for opensearch description urls
// returns an object that can be passed to the system search engine service for
// parsing.
//
// example { site : "http://google.com/path/to/random/search",
// title : "Google Search",
// engine : "/google.xml" }


var links = document.querySelectorAll("link[rel=search][type='application/opensearchdescription+xml']");
//console.log(links);
var results = [];
//console.log("site", document.URL);
for (var i in links) {
  var title = links[i].getAttribute("title");
  //console.log("title", title);
  var href = links[i].getAttribute("href");
  //console.log("href", href);
  results.push({ site : document.URL, name : title, opensearch : href });
}
self.postMessage(results);
