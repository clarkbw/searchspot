var DEFAULT_HOST = "localhost", DEFAULT_PORT = 27017, DEFAULT_DB = "db";

// mostly borrowed from https://github.com/gatesvp/cloudfoundry_node_mongodb/blob/master/app.js.2
if(process.env.VCAP_SERVICES){
  var env = JSON.parse(process.env.VCAP_SERVICES);
  var mongo = env['mongodb-1.8'][0]['credentials'];
}
else{
  var mongo = {
    "hostname":DEFAULT_HOST,
    "port":DEFAULT_PORT,
    "username":"",
    "password":"",
    "name":"",
    "db":DEFAULT_DB
  }
}
var generate_mongodb_url = function(obj){
  obj.hostname = (obj.hostname || DEFAULT_HOST);
  obj.port = (obj.port || DEFAULT_PORT);
  obj.db = (obj.db || DEFAULT_DB);

  if(obj.username && obj.password){
    return "mongodb://" + obj.username + ":" + obj.password + "@" + obj.hostname + ":" + obj.port + "/" + obj.db;
  }
  else{
    return "mongodb://" + obj.hostname + ":" + obj.port + "/" + obj.db;
  }
}

exports.mongodb_url = generate_mongodb_url(mongo);
