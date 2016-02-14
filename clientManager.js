// yeh
var net = require('net'),
    util = require('util'),
    cmMessages = require('./clientManager.messages'),
    mysql = require('mysql');
    config = require('./config.json'),
    gspyProcess = require('./lib/gspyProcess');


module.exports = function(db) {
  var cmMessages = require('./clientManager.messages')(db);

  var clientManager = net.createServer();
  clientManager.listen(29900, '0.0.0.0', function(err) {
    console.log(err || 'ClientManager Listening on 29900')
  });

  var processClientManager = function(client, state, data) {
    console.log('Client Manager -> Got message', data, client.remoteAddress);
    var gsPacket = gspyProcess.convertKeyValue(data);
    var message = gsPacket.message;
    var query = gsPacket.query;

    try {
      if (query == 'login') {
        cmMessages.loginResponse(state, message, function(err, resp) {
          if (err) { client.write('\\error\\\\err\\' + err.code+ '\\fatal\\\\errmsg\\' + err.msg + '\\id\1\\final\\"'); return console.log(err); }
          console.log(' -> Writing a login response to the player: ', state.plyName);
          if (client.writable) client.write(resp);
        })
      } else if (query == 'getprofile') {
        cmMessages.profileResponse(state, message, function(err, resp) {
          console.log(' -> writing profile response to the player: ', state.plyName)
          client.write(resp);
        })
      } else if (query == 'logout') {
        if (client) {
          client.destroy();
        }
      }
    } catch(e) {
      console.error(e)
    }
  }

  clientManager.on('connection', function(client) {
    var state = {};
    console.log('New Connection', client.remoteAddress, client.remotePort);
    client.setKeepAlive(true, 60000);

    // On data recieved
    var recBuffer = new Buffer('');
    client.on('data', gspyProcess.onData(client, state, processClientManager, recBuffer));

    cmMessages.serverChallenge(state, function(err, challengeString) {
      console.log('Sending challenge to client.');
      client.write(challengeString);
    })
  });
};

//searchManager.on('connection', onConnect);
