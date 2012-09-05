// search-engine-pagemod.js
//
// This file scans pages looking for opensearch description urls
// returns an object that can be passed to the system search engine service for
// parsing.
//
// example { site : "http://google.com/path/to/random/search",
// title : "Google Search",
// engine : "/google.xml" }

var links = null, i = null, results = [];

links = document.querySelectorAll("link[rel=search][type='application/opensearchdescription+xml']");
//console.log(links);

//console.log("site", document.URL);
for (i in links) {
  if (links[i] && typeof links[i].getAttribute !== "undefined") {
    var title = links[i].getAttribute("title");
    var href = links[i].getAttribute("href");
    if (title && href) {
      results.push({ site : document.URL, name : title, opensearch : href });
    }
  }

}
if (results.length > 0) {
  self.postMessage(results);
}
