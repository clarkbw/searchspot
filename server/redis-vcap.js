var port = 6379;
var host = "127.0.0.1";
var password = null;

// Check if we're running in the hosted VCAP environment instead of the localhost dev
if (process.env.VCAP_SERVICES){
  var srv = null, credentials = null;
  try {
    srv = JSON.parse(process.env.VCAP_SERVICES);
    credentials = srv["redis-2.2"][0]["credentials"];
    host = credentials.host;
    port = credentials.port;
    password = credentials.password;
  } catch (e) {
    console.log(e);
    console.log(JSON.stringify(srv));
  }
}

var redis = require("redis"),
    client = redis.createClient(port, host);

if (password !== null){
  client.auth(password);
}

client.on("error", function (err) {
  console.error(err);
  console.log("Redis connection error to " + client.host + ":" + client.port);
});

exports.client = client;
