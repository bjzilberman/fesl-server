
module.exports = function(db) {
  var searchProvider = net.createServer();
  searchManager.listen(29901, '0.0.0.0', function(err) {
    console.log(err || 'Listening on 29901')
  });


};



// yeh
var net = require('net'),
    util = require('util'),
    cmMessages = require('./clientManager.messages'),
    mysql = require('mysql');
    config = require('./config.json'),
    gspyProcess = require('./lib/gspyProcess');


module.exports = function(db) {
  var cmMessages = require('./searchProvider.messages')(db);

  var searchProvider = net.createServer();
  searchProvider.listen(29901, '0.0.0.0', function(err) {
    console.log(err || 'ClientManager Listening on 29900')
  });

  var processSearchProvider = function(client, state, data) {
    console.log('Client Manager -> Got message', data, client.remoteAddress);
    var gsPacket = gspyProcess.convertKeyValue(data);
    var message = gsPacket.message;
    var query = gsPacket.query;

    if (query == 'nicks') {
      cmMessages.nicksResponse(state, message, function(err, resp) {
        if (err) { return console.log(err); }
        console.log(' -> Writing a nicks response to the player: ', state.plyEmail);
        client.write(resp);
      })
    } else if (query == 'check') {
      cmMessages.checkResponse(state, message, function(err, resp) {
        if (err) { return console.log(err); }
        console.log(' -> writing check response to the player: ', state.plyName)
        client.write(resp);
      })
    }
  }

  searchProvider.on('connection', function(client) {
    var state = {};
    console.log('Search Provider - New Connection', client.remoteAddress, client.remotePort);
    client.setKeepAlive(true, 60000);

    // On data recieved
    var recBuffer = new Buffer('');
    client.on('data', gspyProcess.onData(client, state, processSearchProvider, recBuffer));
  });
};

//searchManager.on('connection', onConnect);
