var mongodb_url = require("./mongodb-vcap").mongodb_url,
    mongoose = require('mongoose'),
    moment = require("moment"),
    SearchEngine = require('./models/searchengine')(mongoose),
    SearchUsage = require('./models/searchusage')(mongoose, SearchEngine);

mongoose.connect(mongodb_url);

var express = require('express'),
    app = express.createServer();

app.configure(function() {
  app.use(express.bodyParser());
  //app.use(express.logger());
  app.set('view engine', 'ejs');
  app.set("view options", { layout: false });
  app.set("port", process.env.VCAP_APP_PORT || 8080);
});

// set this with NODE_ENV="development"
app.configure('development', function(){
    app.use(express.static(__dirname + '/public'));
    app.use(express.errorHandler({ dumpExceptions: true, showStack: true }));
});

// set this with NODE_ENV="production" or vmc env-add appname NODE_ENV="production"
app.configure('production', function(){
  app.use(express.static(__dirname + '/public', { maxAge: ONE_YEAR }));
  app.use(express.errorHandler());
});

app.get('/', function(req, res){
  res.render('index.ejs');
});

app.get('/engine/id/:id', function(req, res){
  res.contentType('json');
  var id = req.param("id");
  if (id) {
    SearchEngine.findOne({ "_id" : id }).sort("used_count", -1).exec(function(err, docs) {
    res.json(docs);
    });
  }
});

// looks for an array of comma separated ids 
app.get('/engine/ids/:ids', function(req, res){
  res.contentType('json');
  var ids = req.param("ids").split(",");
  if (ids) {
    var or = ids.map(function(id) { return { _id : id }; });
    SearchEngine.find({}).or(or).exec(function(err, docs) {
    res.json(docs);
    });
  }
});

app.get('/engine/url/:url', function(req, res){
  res.contentType('json');
  var url = req.param("url");
  if (url) {
    SearchEngine.find({ "url" : url }).sort("used_count", -1).exec(function(err, docs) {
    res.json(docs);
    });
  }
});

/**
 * Sends pushes out all engines, this will get expensive as the number of engines
 * increases.  It's unlikely we'll keep this call around
 * @returns {Object} engines : {Array} of engines, success : true
 */
app.get('/engines', function(req, res){
  res.contentType('json');
  SearchEngine.find({}).sort("used_count", -1).exec(function(err, docs) {
    //console.log("err", err);
    //console.log("docs", docs);
    res.json(docs);
  });
});

app.get('/engines/https', function(req, res){
  res.contentType('json');
  SearchEngine.findHttps(function(err, docs) {
    //console.log("err", err);
    //console.log("docs", docs);
    res.json(docs);
  });
});

app.get('/engines/geo', function(req, res){
  res.contentType('json');
  SearchEngine.findGeoLocation(function(err, docs) {
    //console.log("err", err);
    //console.log("docs", docs);
    res.json(docs);
  });
});

app.get('/usage', function(req, res){
  res.contentType('json');
  // we could also send down all the engines related
  //  SearchUsage.find({}).populate('engine').exec(function(err, docs) {
  var start = moment().subtract('days', 7), end = new Date();
  SearchUsage.find({ "added" : { $gte : start, $lte : end } }).exec(function(err, docs) {
    //console.log("err", err);
    console.log("docs", docs.length);
    res.json(docs);
  });
});

app.post('/service', function(req, res, next){
  //console.dir(req.body.data);

  try {
    var item = JSON.parse(decodeURIComponent(req.body.data)),
        action = item.action,
        data = item.data,
        stats = data.stats;
    var timestamp = Date.now();

    //console.log("action", JSON.stringify(action));
    //console.log("data", JSON.stringify(data));
    if (data) {
      if (action == "use") {
        data = data.engine;

        // stats is an object of objects { id : { id: id, order : #, suggestions : #, index? : # }}
        var count = 0;
        for(var i in stats) {
          //console.log("stats", i, JSON.stringify(stats[i]));
          var stat = stats[i];
          count+= 1;
          //var likely = {"id":"http://www.linkedin.com/search/fpsearch","order":2,"suggestions":1,"index":0};
          SearchUsage.create(stat, function(err, usage) {
            //console.log("SearchUsage.err", err);
            //console.log("SearchUsage.usage", usage);
          });
        }
      }

      SearchEngine.findOrCreate(data, function(err, engine) {
        //console.log("SearchEngine.err", err);
        //console.log("SearchEngine.engine", engine);
        if (action == "use") {
          engine.used_count.$inc();
          engine.save();
          //Model = mongoose.model('SearchEngine', SearchEngine);
          //Model.update({ _id : obj._id }, { $inc : { used_count : 1 } });
        }
      });

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


app.listen(app.settings.port);
console.log("listening on http://" + app.address().address + ":" + app.address().port);
