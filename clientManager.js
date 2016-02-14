// yeh
var util = require('util'),
    //cmMessages = require('./clientManager.messages'),
    mysql = require('mysql');
    config = require('./config.json'),
    GsUtil = require('./lib/GsUtil'),
    crypto = require('crypto'),
    GsSocket = require('./lib/GsSocket'),
    md5 = require('md5'),
    chalk = require('chalk'),
    cluster = require('cluster');

function Log() {
    console.log(chalk.cyan('ClientManager') + ' ' + Array.prototype.join.call(arguments, '    '));
}

if (cluster.isMaster) {
  // Fork workers.
    for (var i = 0; i < 8; i++) {
        cluster.fork();
    }

    cluster.on('exit', (worker, code, signal) => {
        Log(`Worker ${worker.process.pid} died`);
        cluster.fork();
    });

    return;
}

var db = GsUtil.dbConnect();

// Gamespy Login Server
var server = new GsSocket(29900);

// When we get a new connection
server.on('newClient', (client) => {

    // Process Login Requests
    client.on('command.login', (payload) => {
        client.state.clientChallenge = payload['challenge'] || undefined;
        client.state.clientResponse = payload['response'] || undefined;
        if (!payload['uniquenick'] || !client.state.clientChallenge || !client.state.clientResponse) { return client.writeError(0, 'Login query missing a variable.') }

        db.query('SELECT id, pid, username, password, game_country, email FROM web_users WHERE username = ?', [payload['uniquenick']], (err, result) => {
            if (!result || result.length == 0) { return client.writeError(265, 'The username provided is not registered.') }
            result = result[0];

            client.state.plyName = result.username;
            client.state.plyEmail = result.email;
            client.state.plyCountry = result.country;
            client.state.plyPid = result.pid;

            var responseVerify = md5(result.password + Array(49).join(' ') + client.state.plyName + client.state.clientChallenge + client.state.serverChallenge + result.password);
            if (client.state.clientResponse !== responseVerify) {
                Log('Login failure', client.state.plyName, client.socket.remoteAddress)
                return client.writeError(256, 'Incorrect password.');
            }

            // Generate a session key
            var len = client.state.plyName.length;
            var nameIndex = 0;
            var session = 0;
            while(len-- != 0) {
                session = GsUtil.crcLookup[((client.state.plyName.charCodeAt(nameIndex) ^ session) & 0xff) % 256] ^ (session >>= 8);
                nameIndex++;
            }

            Log('Login Success', client.state.plyName, client.socket.remoteAddress)
            client.write(util.format('\\lc\\2\\sesskey\\%d\\proof\\%s\\userid\\%d\\profileid\\%d\\uniquenick\\%s\\lt\\%s__\\id\\1\\final\\',
                session,
                md5(result.password + Array(49).join(' ') + client.state.plyName + client.state.serverChallenge + client.state.clientChallenge + result.password),
                client.state.plyPid, client.state.plyPid,
                client.state.plyName,
                GsUtil.bf2Random(22)
            ));
        });
    })

    client.on('command.getprofile', (payload) => {
        Log('GetProfile', client.state.plyName, client.socket.remoteAddress);
        client.write(util.format('\\pi\\\\profileid\\%d\\nick\\%s\\userid\\%d\\email\\%s\\sig\\%s\\uniquenick\\%s\\pid\\0\\firstname\\\\lastname\\' +
        '\\countrycode\\%s\\birthday\\16844722\\lon\\0.000000\\lat\\0.000000\\loc\\\\id\\%d\\\\final\\',
            client.state.plyPid,
            client.state.plyName,
            client.state.plyPid,
            client.state.plyEmail,
            GsUtil.bf2Random(32),
            client.state.plyName,
            client.state.plyCountry,
            (client.state.profileSent ? 5 : 2)
        ));
        client.state.profileSent = false;
    });

    client.on('command.logout', (payload) => {
        Log('Logout', client.state.plyName, client.socket.remoteAddress);
        client.socket.destroy();
    })

    // Send a challenge
    crypto.randomBytes(5, (err, buf) => {
      var token = buf.toString('hex');
      client.state.serverChallenge = token;
      client.write(util.format('\\lc\\1\\challenge\\%s\\id\\1\\final\\', token));
    })
})

/*
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
          if (err) {  return console.log(err); }
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
*/
//searchManager.on('connection', onConnect);
