// yeh
var cluster = require('cluster'),
util = require('util'),
crypto = require('crypto'),
md5 = require('md5'),
chalk = require('chalk');
async = require('async');

const GsUtil = require('../lib/GsUtil');
const GsSocket = require('../lib/GsSocket');

var db = GsUtil.dbPool();
var insertLog = require('../lib/GsLog');
var clients = [];

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

    for (var i = 0; i < 1; i++) {
        newFork();
    }

    cluster.on('exit', (worker, code, signal) => {
        var pid = worker.process.pid;
        Log(chalk.red(`Worker ${pid} died!`));
        var playerIds = Object.keys(playerStates[pid]);
        Log('    Setting ' + playerIds.length + ' player(s) offline...');
        if (playerIds.length > 0) {
            var query = 'UPDATE revive_soldiers SET online = 0 WHERE game="stella" AND ';
            for (var i = 0; i < playerIds.length; i++) {
                query += '`pid`=' + playerIds[i];
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
	          if (!client) {
                return console.log("Client disappeared during login");
            }
            if (!payload['authtoken'] || !client.state.clientChallenge || !client.state.clientResponse) { return client.writeError(0, 'Login query missing a variable.') }
            GsUtil.dbConnection(db, (err, connection) => {
              if (!client) {
        		    if (connection) {
                  connection.release();
        			    return console.log("Client disappeared during login");
                } else {
        		      return console.log("Client disappeared during login");
        		    }
            }
            if (err || !connection) { return client.writeError(265, 'The login service is having an issue reaching the database. Please try again in a few minutes.'); }
                connection.query('SELECT t1.web_id, t1.pid, t2.username, t2.password, t2.game_country, t2.email, t2.banned, t2.confirmed_em FROM revive_soldiers t1 LEFT JOIN web_users t2 ON t1.web_id=t2.id WHERE t1.fesl_token = ?', [payload['authtoken']], (err, result) => {
            		    if (!client) {
                      if (connection) {
                			    connection.release();
                			    return console.log("Client disappeared during login");
                      } else {
                			    return console.log("Client disappeared during login");
                			}
                    }
                    if (!result || result.length == 0) { connection.release(); return client.writeError(265, 'The username provided is not registered.') }
                    result = result[0];
                    client.state.battlelogId = result.web_id;
                    client.state.plyName = result.username;
                    client.state.plyEmail = result.email;
                    client.state.plyCountry = result.game_country;
                    client.state.plyPid = result.pid;
                    client.state.confirmed = result.confirmed_em;
                    client.state.banned = result.banned;
                    client.state.ipAddress = client.socket.remoteAddress;
                    clients[client.state.plyPid] = client;
                    clients[client.state.battlelogId] = client;

                    var responseVerify = md5(result.password + Array(49).join(' ') + payload.uniquenick + client.state.clientChallenge + client.state.serverChallenge + result.password);
                    /*if (client.state.clientResponse !== responseVerify) {
                    Log('Login Failure', client.socket.remoteAddress, client.state.plyName, 'Password: ' + result.password)
                    insertLog(client.state.battlelogId, client.state.plyPid, client.state.ipAddress, client.state.username, 'login_failed')
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

                Log('Login Success', client.socket.remoteAddress, client.state.plyName);
                var sendObj = util.format('\\lc\\2\\sesskey\\%d\\proof\\%s\\userid\\%d\\profileid\\%d\\uniquenick\\%s\\lt\\%s__\\id\\1\\final\\',
                session,
                md5(result.password + Array(49).join(' ') + payload.uniquenick + client.state.serverChallenge + client.state.clientChallenge + result.password),
                client.state.plyPid, client.state.plyPid,
                client.state.plyName,
                GsUtil.bf2Random(22)
            );
            client.write(sendObj);



            connection.query('SELECT * FROM revive_friends WHERE uid = ?', [client.state.battlelogId], (err, result) => {
                if (err || !result || result.length == 0) {
                    console.log("No Friends");
                    console.log(err);
                } else {
                    var msg;
                    var friendObj = [];
                    async.each(result, function(result, callback) {
                        if (result['confirmed'] == 1) {
                            console.log("found a friend");
                            connection.query('SELECT pid, online, status, status_msg FROM revive_soldiers WHERE pid = ? AND game = ? LIMIT 1', [result['fid'], "stella"], (err, result) => {
                                if (!result || result.length == 0) {
                                    console.log('no result');
                                } else {
                                    if (result[0]['status'] == 'Offline') {
                                        console.log(result[0]);
                                        msg = '|s|' + result[0]['online'] + '|ss|' + result[0]['status'];
                                        friendObj += util.format('\\bm\\100');
                                        friendObj += util.format('\\f\\%d\\msg\\%s', result[0]['pid'], msg);
                                        friendObj += util.format('\\final\\');
                                        //console.log(sendObj);
                                    } else {
                                        msg = '|s|' + result[0]['online'] + '|ss|' + result[0]['status'] + '|ls|' + result[0]['status_msg'] + '|ip|0|p|0' ;
                                        friendObj += util.format('\\bm\\100');
                                        friendObj += util.format('\\f\\%d\\msg\\%s', result[0]['pid'], msg);
                                        friendObj += util.format('\\final\\');
                                    }
                                }
                                callback();
                            });
                        } else {
                            callback();
                        }
                    }, function(err) {
                        if (err || friendObj.length == 0) {
                            console.log(err);
                            console.log("no friends")
                        } else {
                            console.log("test");
                            console.log(friendObj);
			    if (client) {
				client.write(friendObj);
			    }
                        }
                    });
                }
            });

            connection.query('SELECT * FROM revive_messages WHERE to_uid = ? AND `read` = 0', [client.state.battlelogId], (err, result) => {
                if (!result || result.length == 0) {
                    console.log("No Messages");
                } else {
                    var msgObj = [];
                    async.each(result, function(result, callback) {
                        connection.query('UPDATE revive_messages SET `read` = 1 WHERE id=?', [result.id], (err, msg) => {
                            if (result.msg_type == 1) {
                                console.log("bm 1");
                                msgObj += util.format('\\bm\\%d\\f\\%d\\date\\%d\\msg\\%s\\final\\',
                                result.msg_type, result.from_pid, result.sentDate, result.msg
                            );
                            callback();
                            console.log(msgObj);
                        } else if (result.msg_type == 2) {
			    if (!client) {
                		if (connection) {
                		    connection.release();
                		    return console.log("Client disappeared during login");
                		} else {
                		    return console.log("Client disappeared during login");
                		}
            		    }
                            var msg = result.msg + '|signed|' + md5(result.from_pid.toString() + client.state.plyPid.toString());
                            msgObj += util.format('\\bm\\%d\\f\\%d\\date\\%d\\msg\\%s\\final\\',
                            result.msg_type, result.from_pid, result.sentDate, msg
                        );
                        callback();
                    }
                });
            }, function(err) {
                if (err || msgObj.length == 0) {
                    console.log("no message");
                } else {
                    client.write(msgObj);
                }
            });
        }
    });
    if (result.pid != null) {
        connection.query('UPDATE revive_soldiers SET online = 1, ip = INET_ATON(?) WHERE pid=? AND game=?', [client.state.ipAddress, result.pid, "stella"]);
    }
    process.send({type: 'clientLogin', id: result.pid});
    client.state.hasLogin = true;
    connection.release();
});
});
return;
} else {
    client.state.clientChallenge = payload['challenge'] || undefined;
    client.state.clientResponse = payload['response'] || undefined;
    if (!payload['uniquenick'] || !client.state.clientChallenge || !client.state.clientResponse) { return client.writeError(0, 'Login query missing a variable.') }

    GsUtil.dbConnection(db, (err, connection) => {
        if (err || !connection) { return client.writeError(265, 'The login service is having an issue reaching the database. Please try again in a few minutes.'); }
        connection.query('SELECT id, pid, username, password, game_country, email FROM web_users WHERE username = ?', [payload['uniquenick']], (err, result) => {
            if (!result || result.length == 0) { connection.release(); return client.writeError(265, 'The username provided is not registered.') }
            result = result[0];

            if (!client) {
                if (connection) {
		    connection.release();
		    return console.log("Client disappeared during login");
                } else {
		    return console.log("Client disappeared during login");
		}
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
                return client.writeError(256, 'Incorrect password. Visit https://battlelog.co if you forgot your password.');
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
        connection.query('UPDATE revive_soldiers SET online = 1 WHERE pid=? AND game=?', [result.id, "stella"]);
        process.send({type: 'clientLogin', id: result.id});
        client.state.hasLogin = true;
        connection.release();
    });
})
}
})

/*client.on('command', (name, payload) => {
Log('Raw Command: ', name, JSON.stringify(payload, true));
})*/

client.on('command.status', (payload) => {
    if (!client) {
        return console.log("Client disappeared during status command");
    }
    GsUtil.dbConnection(db, (err, connection) => {
        if (!client || !client.state) {
	    if (connection) {
		return connection.release();
	    } else {
		return;
	    }
	}
        if (payload.statstring != 'Offline') {
            client.state.statusinfo = '|s|1|ss|' + payload.statstring + '|ls|' + payload.locstring + '|ip|0|p|0';
        } else {
            client.state.statusinfo = '|s|0|ss|' + payload.statstring;
        }
        if (err || !connection) { return client.writeError(203, 'The login service is having an issue reaching the database. Please try again in a few minutes.'); }
        connection.query('UPDATE revive_soldiers SET status = ?, status_msg = ? WHERE pid = ? AND game= ?', [payload.statstring, payload.locstring, client.state.plyPid, "stella"], (err, result) => {
            if (!client || !client.state) {
		if (connection) {
		    connection.release();
		    return;
		} else {
		    return;
		}
	    }
            connection.query('SELECT uid from revive_friends WHERE fid = ?', [client.state.plyPid], (err, result) => {
		if (!client || !client.state) {
                    if (connection) {
                	connection.release();
                	return;
                    } else {
                	return;
                    }
            	}
                async.each(result, function(result, callback) {
                    if (clients[result.uid]) {
                        msg = client.state.statusinfo;
                        var friendObj = util.format('\\bm\\100');
                        friendObj += util.format('\\f\\%d\\msg\\%s', client.state.plyPid, msg);
                        friendObj += util.format('\\final\\');
                        clients[result.uid].write(friendObj);
                        //console.log(sendObj);
                    }
                });
            });
        });
        connection.release();
    });
});


client.on('command.bm', (payload) => {
    console.log("bm Command");
    console.log(payload);
    GsUtil.dbConnection(db, (err, connection) => {
        if (err || !connection) { return client.writeError(203, 'The login service is having an issue reaching the database. Please try again in a few minutes.'); }
        connection.query('SELECT web_id from revive_soldiers where pid = ? AND game = ? LIMIT 1', [payload.t, "stella"], (err, result) => {
            if (!result || result.length == 0) { connection.release(); return client.writeError(265, 'Friend does not exist.') }
            result = result[0];
            console.log(result);
            connection.query('INSERT INTO revive_messages (from_pid, from_uid, to_pid, to_uid, msg, msg_type) VALUES (?, ?, ?, ?, ?, ?)', [client.state.plyPid, client.state.battlelogId, payload.t, result.web_id, payload.msg, payload.bm], (err, msg) => {
                if (err) {
                    console.log(err);
                } else if (clients[payload.t]) {
                    var msgObj = util.format('\\bm\\%d\\f\\%d\\date\\%d\\msg\\%s\\final\\',
                    payload.bm, client.state.plyPid, result.sentDate, payload.msg
                );
                clients[payload.t].write(msgObj);
                console.log("message sent successfully");
            }
        });
    });
    connection.release();
});
});

client.on('command.addbuddy', (payload) => {
    console.log("addbuddy Command");
    console.log(payload);
    GsUtil.dbConnection(db, (err, connection) => {
        if (err || !connection) { return client.writeError(203, 'The login service is having an issue reaching the database. Please try again in a few minutes.'); }
        var uid = client.state.battlelogId;
        var pid = client.state.plyPid
        var fid = payload['newprofileid'];
        var sig = md5(pid.toString() + fid.toString());
        var reason = payload['reason'];
        if (client.state.plyPid == fid) { /* handle cannot add friend who is alrdy friend */ }
        connection.query('SELECT web_id, online, status, status_msg, pid from revive_soldiers where pid = ? AND game = ? LIMIT 1', [fid, "stella"], (err, result) => {
            if (err) {
                connection.release();
                console.log(err);
                console.log("failure selecting... dats bad");
                // Hope we don't make it here
            } else {
                if (!result || result.length == 0) {
                  console.log("Friend Not Found");
                } else {
                result = result[0];
                if (payload.reason == "Auto-request") {
                    connection.query('INSERT INTO revive_friends (uid, fid, fid_uid, confirmed) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE confirmed = 1', [uid, fid, result.web_id, 1], (err) => {
                        if (err) {
                            console.log(err);
                            console.log("failure inserting auto request");
                            /* probably look for key already exists */
                        } else {
                            console.log(result);
                            var friendObj = [];
                            if (result.status == 'Offline') {
                                msg = '|s|' + result.online + '|ss|' + result.status;
                                friendObj += util.format('\\bm\\100');
                                friendObj += util.format('\\f\\%d\\msg\\%s', result.pid, msg);
                                friendObj += util.format('\\final\\');
                            } else {
                                msg = '|s|' + result.online + '|ss|' + result.status + '|ls|' + result.status_msg + '|ip|0|p|0' ;
                                friendObj += util.format('\\bm\\100');
                                friendObj += util.format('\\f\\%d\\msg\\%s', result.pid, msg);
                                friendObj += util.format('\\final\\');
                            }
                            console.log(friendObj);
                            client.write(friendObj);
                            console.log("successfully added");
                        }
                    });
                } else {
                    connection.query('INSERT INTO revive_friends (uid, fid, fid_uid, sig) VALUES (?, ?, ?, ?)', [uid, fid, result.web_id, sig], (err) => {
                        if (err) {
                            //console.log(err);
                            console.log("failure inserting");
                            /* probably look for key already exists */
                        } else {
                            console.log("success");
                            console.log(sig);
                            connection.query('INSERT INTO revive_messages (from_pid, from_uid, to_pid, to_uid, msg, msg_type) VALUES (?, ?, ?, ?, ?, ?)', [pid, uid, fid, result.web_id, reason, 2], (err) => {
                                if (err) {
                                    console.log(err);
                                } else if (clients[fid]) {
                                    var date = Math.floor(Date.now() / 1000);
                                    var msg = reason + '|signed|' + sig;
                                    var msgObj = util.format('\\bm\\2\\f\\%d\\date\\%d\\msg\\%s\\final\\',
                                    pid, date, msg
                                );
                                clients[fid].write(msgObj);
                                console.log(msgObj);
                                console.log("live addBuddy sent");
                            }
                        });
                    }
                });
            }
            connection.release();
        }
      }
    });
});
});

client.on('command.delbuddy', (payload) => {
    console.log("delbuddy Command");
    console.log(payload);
    GsUtil.dbConnection(db, (err, connection) => {
        if (err || !connection) { return client.writeError(203, 'The login service is having an issue reaching the database. Please try again in a few minutes.'); }
        var uid = client.state.battlelogId;
        var fid = payload['delprofileid'];
        connection.query('DELETE FROM revive_friends WHERE uid=? AND fid=?', [uid, fid], (err) => {
            connection.query('SELECT * FROM revive_soldiers WHERE pid=? AND game=?', [fid, "stella"], (err, result) => {
                if (!result || result.length == 0) {
                    console.log("Friend wasn't on list");
                } else {
                    result = result[0];
                    connection.query('DELETE FROM revive_friends WHERE uid=? AND fid=?', [result.web_id, client.state.plyPid], (err) => {
                        console.log("Friend Deleted");
                        console.log(result);
                        if (clients[fid]) {
                            var date = Math.floor(Date.now() / 1000);
                            var friendObj = util.format('\\bm\\6');
                            var msg = '|s|0|ss|Offline';
                            friendObj += util.format('\\f\\%d\\date\\%d', client.state.plyPid, date);
                            friendObj += util.format('\\final\\');
                            clients[fid].write(friendObj);
                            console.log(friendObj);
                        }
                    });
                }
            });
            connection.release();
        });
    });
});

client.on('command.authadd', (payload) => {
    console.log("authadd Command");
    console.log(payload);
    GsUtil.dbConnection(db, (err, connection) => {
        if (err || !connection) { return client.writeError(203, 'The login service is having an issue reaching the database. Please try again in a few minutes.'); }
	if (!client) {
	    return;
	}
        var uid = client.state.battlelogId;
        var pid = client.state.plyPid;
        var fid = payload['fromprofileid'];
        var sig = payload['sig'];
        connection.query('UPDATE revive_friends SET confirmed = 1 WHERE sig=?', [sig], (err, result) => {
            if (clients[fid]) {
                var msg = client.state.statusinfo;
                var friendObj = util.format('\\bm\\100');
                friendObj += util.format('\\f\\%d\\msg\\%s', client.state.plyPid, msg);
                friendObj += util.format('\\final\\');
                clients[fid].write(friendObj);
            }
            connection.release();
        });
    });
});

client.on('command.getprofile', (payload) => {
    GsUtil.dbConnection(db, (err, connection) => {
        if (err || !connection) { return client.writeError(203, 'The login service is having an issue reaching the database. Please try again in a few minutes.'); }
        connection.query('SELECT * FROM revive_soldiers WHERE pid = ? AND game= ?', [payload.profileid, "stella"], (err, result) => {
            if (!result || result.length == 0) {
              console.log("was here");
              var sendObj = util.format('\\pi\\\\profileid\\%d\\nick\\%s\\userid\\%d\\email\\%s\\sig\\%s\\uniquenick\\%s\\pid\\%d\\firstname\\\\lastname\\' +
                  '\\countrycode\\%s\\birthday\\16844722\\lon\\0.000000\\lat\\0.000000\\loc\\\\id\\%d\\\\final\\',
                  1000,
                  'NOT A REVIVE USER',
                  1000,
                  'test@gmail.com',
                  GsUtil.bf2Random(32),
                  'NOT A REVIVE USER',
                  1000,
                  'US',
                  payload.id//(client.state.profileSent ? 5 : 2)
              );
              client.write(sendObj);
              console.log(sendObj);
            } else {
                var result = result[0];
                if (!client) {
                	return console.log("Client disappeared during login");
		}

		var sendObj = util.format('\\pi\\\\profileid\\%d\\nick\\%s\\userid\\%d\\email\\%s\\sig\\%s\\uniquenick\\%s\\pid\\%d\\firstname\\\\lastname\\' +
                    '\\countrycode\\%s\\birthday\\16844722\\lon\\0.000000\\lat\\0.000000\\loc\\\\id\\%d\\\\final\\',
                    result.pid,
                    result.nickname,
                    result.pid,
                    result.nickname + '@gmail.com',
                    GsUtil.bf2Random(32),
                    result.nickname,
                    result.pid,
                    client.state.plyCountry,
                    payload.id//(client.state.profileSent ? 5 : 2)
                );
                client.write(sendObj);
                client.state.profileSent = true;
        }
        connection.release();
    });
});

Log('GetProfile',  client.socket.remoteAddress, client.state.plyName);

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
    insertLog(client.state.battlelogId, client.state.plyPid, client.state.ipAddress, client.state.username, 'logout')
    client.close();
})

client.on('command.newuser', (payload) => {
    client.writeError(516, 'Registration in game is currently unavailable. Please visit battlelog.co to register.');
});

client.on('close', (had_error) => {
    if (!client.state) return;
    var pid = client.state.plyPid;
    if (client.state.hasLogin) {
        Log('Logout', client.state.plyName, client.socket.remoteAddress, client.state.plyPid);
        insertLog(client.state.battlelogId, client.state.plyPid, client.state.ipAddress, client.state.username, had_error?'close_error':'close')
        GsUtil.dbConnection(db, (err, connection) => {
            if (err || !connection) { return console.log('Error logging someone out due to DB connection failure... What do?') }
            var msg = '|s|0|ss|Offline';
            connection.query('SELECT uid from revive_friends WHERE fid = ?', [pid], (err, result) => {
                async.each(result, function(result, callback) {
                    if (clients[result.uid]) {
                        var friendObj = util.format('\\bm\\100');
                        friendObj += util.format('\\f\\%d\\msg\\%s', pid, msg);
                        friendObj += util.format('\\final\\');
                        clients[result.uid].write(friendObj);
                        //console.log(sendObj);
                    }
                    callback();
                }, function(err) {
                    process.send({type: 'clientLogout', id: pid});
                    connection.query('UPDATE revive_soldiers SET online = 0, status = ?, status_msg = null WHERE pid=? AND game=?', ["Offline", pid, "stella"]);
                    connection.release();
                });
            });
        });
    } else {
        //Log('Disconnect', client.socket.remoteAddress);
    }
    clients[client.state.battllogId] = null;
    clients[client.state.pldPid] = null;
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
