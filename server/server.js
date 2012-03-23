
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
  res.render('index.ejs', { layout: false });
});

var engines = null;

function processEngines() {
  engines = {};
  client.zrangebyscore("services", "-inf", "+inf", "WITHSCORES",
                      function (err, ids) {
                        console.log("err", err);
                        console.log("ids", ids);
                        var multi = client.multi();
                        for(var i = 0; i < ids.length; i+=2) {
                          console.log("for.ids[i]", ids[i]);
                          multi.hgetall(ids[i]);
                        }
                        multi.exec(function (err, replies) {
                          console.log("replies", replies);
                          for(var i = 0; i < replies.length; i++) {
                            var item = replies[i], id = ids[i*2], score = ids[i*2+1];
                            console.log("for.item", item, score, engines);
                            engines[id] = item;
                            engines[id].score = score;
                            engines[id].id = id;
                          }
                        });
                      }
  );
}

setInterval(processEngines, 5 * 1000);

app.get('/data', function(req, res){
  res.contentType('json');
  console.log("engines", engines);
  res.send({ "engines": engines });

});


app.post('/service', function(req, res, next){
  console.log(req.body.data);

  var data = JSON.parse(req.body.data);

  data.forEach(function (item) {
    if (item.action == "add") {
      client.zincrby("services", 1, item.url);
  
      client.hmset(item.url,
                  "name", item.name,
                  "icon", item.icon,
                  "suggest", item.suggest,
                  redis.print);
  
      client.zincrby("site" + item.url, 1, item.site, redis.print)
    } else if (item.action == "use") {
      likely = { url : "", suggestions : 0, sindex : 0, engines : 0, eindex : 0, category : "" }
  
      client.incr("suggestions");
      client.zincrby("suggestions.byurl", 1, item.url);
  
      client.hmset(item.url,
                  "name", item.name,
                  "icon", item.icon,
                  "suggest", item.suggest,
                  redis.print);
  
      client.zincrby("site" + item.url, 1, item.site, redis.print)
    }

  });

  res.send("");

  processEngines();
});

app.listen(8080);

