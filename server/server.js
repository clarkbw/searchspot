var client = require("./redis-vcap").client;
var express = require('express'),
    app = express.createServer();

app.use(express.bodyParser());
app.use(express.errorHandler({ showStack: true }));
app.use(express.static(__dirname + '/public'));

app.get('/', function(req, res){
  res.render('index.ejs', { layout: false });
});

app.get('/engines', function(req, res){
  res.contentType('json');

  client.sort("engines:ids",
              "by", "nosort",
              "get", "engines:*->id",
              "get", "engines:*->name",
              "get", "engines:*->siteURL",
              "get", "engines:*->host",
              "get", "engines:*->type",
              "get", "engines:*->baseURL",
              "get", "engines:*->queryURL",
              "get", "engines:*->suggestionURL",
              "get", "engines:*->icon",
              function(err, obj) {
                var engines = {};
                for (var i = 0; obj && i < obj.length; i += 9) {
                  var id = obj[i],
                      name = obj[i+1],
                      siteURL = obj[i+2],
                      host = obj[i+3],
                      type = obj[i+4],
                      baseURL = obj[i+5],
                      queryURL = obj[i+6],
                      suggestionURL = obj[i+7],
                      icon = obj[i+8];
                  //console.log(name, siteURL, host, type, baseURL, queryURL, suggestionURL, icon);
                  engines[id] = { "id": id, "name" : name,
                                  "siteURL" : siteURL, "host" : host,
                                  "type" : type, "baseURL" : baseURL,
                                  "queryURL" : queryURL, "suggestionURL" : suggestionURL,
                                  "icon" : icon };
                }
                res.send({ "engines": engines });
              }
  );
});

app.get('/count/:action', function(req, res){
  res.contentType('json');
  var action = req.param("action");
  if (action) {
    client.zrange("engines:ids:" + action + ":count", 0, -1, "WITHSCORES",
                  function(err, idswithscores) {
                    if (idswithscores) {
                      res.send({ "success" : true, "count" : idswithscores, "action" : action });
                    } else {
                      res.send({ "success" : false, "error" : err });
                    }
                  }
    );
  } else {
    res.send({ "success" : false, "error" : "NO_ACTION" });
  }
});

app.get('/time/:action', function(req, res){
  res.contentType('json');
  var action = req.param("action");
  if (action) {
    client.zrange("engines:ids:" + action + ":by:time", 0, -1, "WITHSCORES",
                  function(err, idswithscores) {
                    if (idswithscores) {
                      res.send({ "success" : true, "count" : idswithscores, "action" : action });
                    } else {
                      res.send({ "success" : false, "error" : err });
                    }
                  }
    );
  } else {
    res.send({ "success" : false, "error" : "NO_ACTION" });
  }
});

app.post('/service', function(req, res, next){
  //console.dir(req.body.data);

  try {
    var item = JSON.parse(decodeURIComponent(req.body.data));
    var timestamp = Date.now();

    console.log("action", JSON.stringify(item.action));
    console.log("data", JSON.stringify(item.data));

    // Save this engine hash
    saveEngine(item.data);

    // Add to complete list of IDs found
    client.sadd("engines:ids", item.data.id);

    client.zadd("engines:ids:" + item.action + ":by:time", timestamp, item.data.id);
    client.zincrby("engines:ids:" + item.action + ":count", 1, item.data.id);
    client.incr("engines:ids:" + item.action + ":total");

    client.zadd("engines:sites:" + item.action + ":by:time", timestamp, item.data.siteURL);
    client.zincrby("engines:sites:" + item.action + ":count", 1, item.data.siteURL);
    client.incr("engines:sites:" + item.action + ":total");

    if (item.data.suggestionURL !== "") {
      client.sadd("engines:ids:has:suggest", item.data.id);
    }

    if (hasGeoLocalExt(item.data)) {
      client.sadd("engines:ids:has:geo", item.data.id);
    }

    if (item.action == "add") {
      console.log("add", item.data.id);
    } else if (item.action == "update") {
      console.log("update", item.data);
    } else if (item.action == "default") {
      console.log("default", item.data.id);
    } else if (item.action == "use") {
      console.log("use", item.data.id);
      //likely = { url : "", suggestions : 0, sindex : 0, engines : 0, eindex : 0, category : "" }
      // here we should also be recording how many suggestions and which one was used
    }

    res.send(JSON.stringify({ success : true }));

  } catch (e) {
    console.log("e", e);
    console.log("req", req);
    console.log("req.body", req.body);
    console.log("req.body.data", req.body.data);
    res.send(JSON.stringify({ success : false, error : e }));
  }

});

// This does a quick regex through the query URL used in a search engine
// to see if it conforms to the Geo Location Extension spec as proposed here
// https://github.com/clarkbw/searchspot/wiki/Modern-Open-Search
function hasGeoLocalExt(data) {
  var reg = /{geo:/g;
  return reg.test(data.queryURL) || reg.test(data.suggestionURL);
}

/*
  {  // SEARCH ENGINE EXAMPLE
    id : "http://example.com/opensearch.xml",
    name : "Example Search",
    siteURL : "http://example.com/index.html",
    host : "http://example.com/",
    type : "suggest",  <-- legacy
    baseURL : "", <-- legacy
    queryURL: "http://example.com/search?q={searchTerms}&geo={geo:name}",
    suggestionURL : "http://example.com/suggestions?q={searchTerms}&geo={geo:name}",
    icon : "http://example.com/favicon.ico"
  }
*/

// This should really be saving different versions of the engine
// but that's a lot of work
function saveEngine(data) {
  client.hmset("engines:" + data.id,
              "id",   data.id,
              "name", data.name,
              "siteURL", data.siteURL,
              "host", data.host,
              "type", data.type,
              "baseURL", data.baseURL,
              "queryURL", data.queryURL,
              "suggestionURL", data.suggestionURL,
              "icon", data.icon);
}

var __port = process.env.VCAP_APP_PORT || 8080
console.log("listening on http://" + require("os").hostname() + ":" + __port + "/");
app.listen(__port);
