// yeh
var cluster = require('cluster'),
    util = require('util'),
    crypto = require('crypto'),
    md5 = require('md5'),
    chalk = require('chalk');

const GsUtil = require('../lib/GsUtil');
const GsSocket = require('../lib/GsSocket');

var db = GsUtil.dbPool();

function Log() {
    console.log(GsUtil.Time() + chalk.cyan('ClientManager') + '\t' + Array.prototype.join.call(arguments, '\t'));
}

// Master Process!
if (cluster.isMaster) {
    console.log(GsUtil.Time() + chalk.green('Starting Client Manager (8 Forks)'));
    var playerStates = {}

    var newFork = function() {
        var worker = cluster.fork();
        var pid = worker.process.pid;
        playerStates[pid] = {};

        worker.on('message', function(payload) {
            if (payload.type == 'clientLogin') {
                playerStates[pid][payload.id] = true;
            }
        });

        worker.on('message', function(payload) {
            if (payload.type == 'clientLogout') {
                playerStates[pid][payload.id] = null;
                delete playerStates[pid][payload.id];
            }
        });
    }

    for (var i = 0; i < 8; i++) {
        newFork();
    }

    cluster.on('exit', (worker, code, signal) => {
        var pid = worker.process.pid;
        Log(chalk.red(`Worker ${pid} died!`));
        var playerIds = Object.keys(playerStates[pid]);
        Log('    Setting ' + playerIds.length + ' player(s) offline...');
        if (playerIds.length > 0) {
            var query = 'UPDATE web_users SET game_session = 0 WHERE ';
            for (var i = 0; i < playerIds.length; i++) {
                query += '`id`=' + playerIds[i];
                if ( i + 1 < playerIds.length ) query += ' OR ';
            }
            GsUtil.dbConnection(db, (err, connection) => {
                connection.query(query, function(err, result) {
                    if (err) throw err;
                    Log('   ...OK! (Affected Rows: ' + result.affectedRows + ')');
                    playerStates[pid] = null;
                    delete playerStates[pid];

                    connection.release();
                });
            })
        } else {

        }
	console.log('Starting new fork');
	newFork();
    });

    return;
}

/*
    Child Processies - the SPORKS
*/

// Gamespy Login Server
var server = new GsSocket(chalk.cyan('CM'), 29900);

// When we get a new connection
server.on('newClient', (client) => {

    // Process Login Requests
    client.on('command.login', (payload) => {

        // handle 2142
        if (payload && payload.gamename == 'stella') {
            client.state.clientChallenge = payload['challenge'] || undefined;
            client.state.clientResponse = payload['response'] || undefined;
            if (!payload['authtoken'] || !client.state.clientChallenge || !client.state.clientResponse) { return client.writeError(0, 'Login query missing a variable.') }
            GsUtil.dbConnection(db, (err, connection) => {
                if (err || !connection) { return client.writeError(265, 'The login service is having an issue reaching the database. Please try again in a few minutes.'); }
                connection.query('SELECT t1.web_id, t1.pid, t2.username, t2.password, t2.game_country, t2.email FROM revive_soldiers t1 LEFT JOIN web_users t2 ON t1.web_id=t2.id WHERE t1.fesl_token = ?', [payload['authtoken']], (err, result) => {
                  console.log("was here");
                    if (!result || result.length == 0) { connection.release(); return client.writeError(265, 'The username provided is not registered.') }
                    result = result[0];
                    console.log(result);
                    console.log("oh no");
                    if (!client) {
                        connection.release();
                        return console.log("Client disappeared during login");
                    }
                    client.state.battlelogId = result.id;
                    client.state.plyName = result.username;
                    client.state.plyEmail = result.email;
                    client.state.plyCountry = result.game_country;
                    client.state.plyPid = result.pid;

                    var responseVerify = md5(result.password + Array(49).join(' ') + payload.uniquenick + client.state.clientChallenge + client.state.serverChallenge + result.password);
                    /*if (client.state.clientResponse !== responseVerify) {
                        Log('Login Failure', client.socket.remoteAddress, client.state.plyName, 'Password: ' + result.password)
                        connection.release();
                        return client.writeError(256, 'Incorrect password. Visit www.battlelog.co if you forgot your password.');
                    }*/

                    // Generate a session key
                    var len = client.state.plyName.length;
                    var nameIndex = 0;
                    var session = 0;
                    while(len-- != 0) {
                        session = GsUtil.crcLookup[((client.state.plyName.charCodeAt(nameIndex) ^ session) & 0xff) % 256] ^ (session >>= 8);
                        nameIndex++;
                    }

                    Log('Login Success', client.socket.remoteAddress, client.state.plyName)
                    client.write(util.format('\\lc\\2\\sesskey\\%d\\proof\\%s\\userid\\%d\\profileid\\%d\\uniquenick\\%s\\lt\\%s__\\id\\1\\final\\',
                        session,
                        md5(result.password + Array(49).join(' ') + payload.uniquenick + client.state.serverChallenge + client.state.clientChallenge + result.password),
                        client.state.plyPid, client.state.plyPid,
                        client.state.plyName,
                        GsUtil.bf2Random(22)
                    ));

                    connection.query('UPDATE web_users SET game_session = 1 WHERE id=?', [result.id]);
                    process.send({type: 'clientLogin', id: result.id});
                    client.state.hasLogin = true;
                    connection.release();
                });
            });
            return;
        }

        client.state.clientChallenge = payload['challenge'] || undefined;
        client.state.clientResponse = payload['response'] || undefined;
        if (!payload['uniquenick'] || !client.state.clientChallenge || !client.state.clientResponse) { return client.writeError(0, 'Login query missing a variable.') }

        GsUtil.dbConnection(db, (err, connection) => {
            if (err || !connection) { return client.writeError(265, 'The login service is having an issue reaching the database. Please try again in a few minutes.'); }
            connection.query('SELECT id, pid, username, password, game_country, email FROM web_users WHERE username = ?', [payload['uniquenick']], (err, result) => {
                if (!result || result.length == 0) { connection.release(); return client.writeError(265, 'The username provided is not registered.') }
                result = result[0];

                if (!client) {
                    connection.release();
                    return console.log("Client disappeared during login");
                }
                client.state.battlelogId = result.id;
                client.state.plyName = result.username;
                client.state.plyEmail = result.email;
                client.state.plyCountry = result.game_country;
                client.state.plyPid = result.pid;

                var responseVerify = md5(result.password + Array(49).join(' ') + payload.uniquenick + client.state.clientChallenge + client.state.serverChallenge + result.password);
                if (client.state.clientResponse !== responseVerify) {
                    Log('Login Failure', client.socket.remoteAddress, client.state.plyName, 'Password: ' + result.password)
		            connection.release();
                    return client.writeError(256, 'Incorrect password. Visit www.battlelog.co if you forgot your password.');
                }

                // Generate a session key
                var len = client.state.plyName.length;
                var nameIndex = 0;
                var session = 0;
                while(len-- != 0) {
                    session = GsUtil.crcLookup[((client.state.plyName.charCodeAt(nameIndex) ^ session) & 0xff) % 256] ^ (session >>= 8);
                    nameIndex++;
                }

                Log('Login Success', client.socket.remoteAddress, client.state.plyName)
                client.write(util.format('\\lc\\2\\sesskey\\%d\\proof\\%s\\userid\\%d\\profileid\\%d\\uniquenick\\%s\\lt\\%s__\\id\\1\\final\\',
                    session,
                    md5(result.password + Array(49).join(' ') + payload.uniquenick + client.state.serverChallenge + client.state.clientChallenge + result.password),
                    client.state.plyPid, client.state.plyPid,
                    client.state.plyName,
                    GsUtil.bf2Random(22)
                ));

                connection.query('UPDATE web_users SET game_session = 1 WHERE id=?', [result.id]);
                process.send({type: 'clientLogin', id: result.id});
                client.state.hasLogin = true;
                connection.release();
            });
        })
    })

    /*client.on('command', (name, payload) => {
        Log('Raw Command: ', name, JSON.stringify(payload, true));
    })*/

    client.on('command.getprofile', (payload) => {
        Log('GetProfile',  client.socket.remoteAddress, client.state.plyName);
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
        client.state.profileSent = true;
    });

    client.on('command.updatepro', (payload) => {
        if (!payload.countrycode) { return child.writeError(0, 'Invalid query! No country code specified.'); }
        GsUtil.dbConnection(db, (err, connection) => {
            if (err || !connection) { return client.writeError(265, 'The login service is having an issue reaching the database. Please try again in a few minutes.'); }
            connection.query('UPDATE web_users SET game_country=? WHERE id=?', [payload.countrycode, client.state.battlelogId], function(err, result) {
                Log('UpdateProfile', client.socket.remoteAddress, client.state.plyName);
                connection.release();
            });
        });
    });

    client.on('command.logout', (payload) => {
        client.close();
    })

    client.on('command.newuser', (payload) => {
        client.writeError(516, 'Registration in game is currently unavailable. Please visit battlelog.co to register.');
    });

    client.on('close', () => {
        if (!client.state) return;
        var blId = client.state.battlelogId;
        if (client.state.hasLogin) {
            Log('Logout', client.state.plyName, client.socket.remoteAddress);
            GsUtil.dbConnection(db, (err, connection) => {
                if (err || !connection) { return console.log('Error logging someone out due to DB connection failure... What do?') }
                process.send({type: 'clientLogout', id: blId});
                connection.query('UPDATE web_users SET game_session = 0 WHERE id=?', [blId]);
                connection.release();
            });
        } else {
            //Log('Disconnect', client.socket.remoteAddress);
        }
        client = null;
        delete client;
        server.clients.length
    })

    // Send a challenge
    crypto.randomBytes(5, (err, buf) => {
      var token = buf.toString('hex');
      if (client !== null) {
          client.state.serverChallenge = token;
          client.write(util.format('\\lc\\1\\challenge\\%s\\id\\1\\final\\', token));
      }
    })
});
