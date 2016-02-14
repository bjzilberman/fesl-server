var mysql = require('mysql'),
    config = require('./config.json');

var db = mysql.createConnection(config.db);
db.connect(function(err) {
  if (err) {
    return console.error('Error connecting to MySQL: ' + err.stack);
  } else {
    console.log('Connected to MySQL on host', config.db.host)
  }

  var app = {};

  app.db = db;

  var clientManager = require('./clientManager')(db);
  var searchProvider = require('./searchProvider')(db);
});
