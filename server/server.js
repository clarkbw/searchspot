
var redis = require("redis"),
    client = redis.createClient();

client.on("error", function (err) {
  console.log("Redis connection error to " + client.host + ":" + client.port + " - " + err);
});

var express = require('express'),
    app = express.createServer();

app.use(express.bodyParser());
app.use(express.errorHandler({ showStack: true }));

app.get('/', function(req, res){
  res.render('index.ejs', { layout: false, engines : [
        ['Google', 30],
        ['Amazon', 13],
        ['Bing', 12],
        ['Yahoo', 7],
        ['LinkedIn', 2]
      ] });
});

app.post('/service', function(req, res, next){
  console.log(req.body);

  client.zincrby("services", 1, req.body.url);

  client.hmset(req.body.url,
              "name", req.body.name,
              "icon", req.body.icon,
              "suggest", req.body.suggest,
              redis.print);

  client.hmset(req.body.url,
              "name", req.body.name,
              "icon", req.body.icon,
              "suggest", req.body.suggest,
              redis.print);


  client.zincrby("site" + req.body.url, 1, req.body.site, redis.print)

  res.send("");
});

app.post('/use', function(req, res, next){
  console.log(req.body);

  likely = { url : "", suggestions : 0, sindex : 0, engines : 0, eindex : 0, category : "" }

  client.incr("suggestions");
  client.zincrby("suggestions.byurl", 1, req.body.url);

  client.hmset(req.body.url,
              "name", req.body.name,
              "icon", req.body.icon,
              "suggest", req.body.suggest,
              redis.print);

  client.zincrby("site" + req.body.url, 1, req.body.site, redis.print)

  res.send("");
});

app.listen(8080);

