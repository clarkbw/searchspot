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
    var item = JSON.parse(decodeURIComponent(req.body.data)),
        action = item.action,
        data = item.data,
        stats = data.stats;
    var timestamp = Date.now();

    console.log("action", JSON.stringify(action));
    console.log("data", JSON.stringify(data));
    if (data) {
      if (action == "use") {
        data = data.engine;

        // stats is an object of objects { id : { id: id, order : #, suggestions : #, index? : # }}
        var count = 0;
        for(var i in stats) {
          console.log("stats", i, JSON.stringify(stats[i]));
          var stat = stats[i];
          count+= 1;
          var likely = {"id":"http://www.linkedin.com/search/fpsearch","order":2,"suggestions":1,"index":0};

          // most common position of engines by id
          client.zadd("suggestions:ids:" + stat.order + ":order", 1, stat.id, reply);

          // avg number of suggestions across all engines
          client.zadd("suggestions:number:of:suggestions", 1, stat.suggestions, reply);

          // avg number of suggestions per engine
          client.zadd("suggestions:by:id:" + stat.id + ":count", 1, stat.suggestions, reply);

          if (stat.index) {
            // most commonly used suggestion index
            client.zadd("suggestions:index:of:suggestions", 1, stat.index, reply);

            // most commonly used suggestion index by id
            client.zadd("suggestions:by:id:" + stat.id + ":index", 1, stat.index, reply);
          }
        }
        // add up the total number of suggestion engine being displayed
        client.zadd("suggestions:number:of:engines", 1, count, reply);
      }

      // Save this engine hash
      saveEngine(data);

      // Add to complete list of IDs found
      client.sadd("engines:ids", data.id, reply);

      client.zadd("engines:ids:" + action + ":by:time", timestamp, data.id, reply);
      client.zincrby("engines:ids:" + action + ":count", 1, data.id, reply);
      client.incr("engines:ids:" + action + ":total", reply);

      client.zadd("engines:sites:" + action + ":by:time", timestamp, data.siteURL, reply);
      client.zincrby("engines:sites:" + action + ":count", 1, data.siteURL, reply);
      client.incr("engines:sites:" + action + ":total", reply);

      if (data.suggestionURL !== "") {
        client.sadd("engines:ids:has:suggest", data.id, reply);
      }

      if (hasGeoLocalExt(data)) {
        client.sadd("engines:ids:has:geo", data.id, reply);
      }

      res.send(JSON.stringify({ success : true }));
    } else {
      res.send(JSON.stringify({ success : false }));
    }

  } catch (e) {
    console.log("e", e);
    console.log(JSON.stringify(item));
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
  if (data) {
    client.hmset("engines:" + data.id,
                "id",   data.id,
                "name", data.name,
                "siteURL", data.siteURL,
                "host", data.host,
                "type", data.type,
                "baseURL", data.baseURL,
                "queryURL", data.queryURL,
                "suggestionURL", data.suggestionURL,
                "icon", data.icon,
                reply);
  }
}

// default callback function for redis
function reply(err, replies) {
  if (err) {
    console.error(err);
  }
}

var __port = process.env.VCAP_APP_PORT || 8080
console.log("listening on http://" + require("os").hostname() + ":" + __port + "/");
app.listen(__port);
