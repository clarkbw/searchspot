var MODEL_NAME = "SearchUsage";
module.exports = function(mongoose, SearchEngine) {
  var Schema = mongoose.Schema,
      SearchUsage;

/*
 // SEARCH USAGE PATTERN EXAMPLE
 {"id":"http://www.linkedin.com/search/fpsearch","order":2,"suggestions":1,"index":0};
*/
  SearchUsage = new Schema({
    engine : { type: Schema.ObjectId, ref: 'SearchEngine' },
    order : {
      type : Number,
      required : true
    },
    suggestions : {
      type : Number,
      required : false
    },
    index : {
      type : Number,
      required: false
    },
    added : {
      type : Date,
      default: Date.now,
      required : true,
      index: true
    }
  });

  SearchUsage.statics.create = function create(obj, callback) {
    var SearchUsageModel = mongoose.model(MODEL_NAME, SearchUsage),
        searchusage = null;

    SearchEngine.findOneAndUpdate({'id' : obj.engine.url || obj.engine.id || obj.engine.siteURL },
                                  {},
                                  {upsert : true, sort : {used_count : -1}},
      function(err, engine) {
        console.log("err", err);
        console.log("engine", engine);
        var _model = { engine: engine._id };
        ["order", "suggestions", "index"].forEach(function(index) {
          if (typeof obj[index] !== "undefined") {
            _model[index] = parseInt(obj[index]);
          }
        });
        searchusage = new SearchUsageModel(_model);
        console.log(searchusage);
        searchusage.save(function(err) {
          callback(err, searchusage);
        });
      }
    );

  }

  return mongoose.model(MODEL_NAME, SearchUsage);
}
