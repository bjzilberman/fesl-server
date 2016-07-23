// yeh
var cluster = require('cluster'),
    util = require('util'),
    crypto = require('crypto'),
    md5 = require('md5'),
    fs = require('fs'),
    tls = require('tls'),
    chalk = require('chalk'),
    dateFormat = require('dateformat');

const GsUtil = require('../lib/GsUtil');
const emailUtil = require('../lib/emailUtil');
const FeslServer = require('../lib/FeslServer');

function Log() {
    console.log(GsUtil.Time() + chalk.green('FESL') + '\t\t' + Array.prototype.join.call(arguments, '\t'));
}

if (cluster.isMaster) {
    console.log(GsUtil.Time() + chalk.green('Starting FESL (8 Forks)'));
    var playerStates = {};

    var newFork = function() {
        var worker = cluster.fork();
    }

    for (var i = 0; i < 1; i++) {
        newFork();
    }

    cluster.on('exit', function(worker, code, signal) {
        var pid = worker.process.pid;
        Log(chalk.red('Worker ' + pid + ' died!'));
        newFork();
    });

    return;
}

var db = GsUtil.dbPool();

// Gamespy Search Provider Server
var server = new FeslServer(chalk.magenta('FE'), {
    port: 18300,
    tlsKey: fs.readFileSync('ssl/fesl_key.pem'),
    tlsCert: fs.readFileSync('ssl/fesl_publickey.crt')
});

// When we get a new connection
server.on('newClient', function (client) {
    Log('New FESL Client?!')

    client.state.lkey = md5(new Date());

    client.write('fsys', {
        TXN: 'Hello',
        'domainPartition.domain': 'eagames',
        messengerIp: 'messaging.ea.com',
        messengerPort: '13505',
        'domainPartition.subDomain': 'bf2142',
        'activityTimeoutSecs': '0',
        'curTime': dateFormat(new Date(), 'mmm-dd-  yy '),
        theaterIp: 'bf2142-pc.theater.ea.com',
        theaterPort: '18305'
    }, 0x80000001)

    var memCheck = function() {
        if (!client) return;
        client.write('fsys', {
            TXN: 'MemCheck',
            'memcheck.[]': 0,
            type: 0,
            salt: Math.floor(Date.now()/1000)
        }, 0x80000000);
    };

    client.pingInterval = setInterval(memCheck, 10000);
    memCheck();

    client.on('acct.Login', function(payload, type2) {
        client.state.username = payload.name;
        if (payload.encryptedInfo) {
          const decipher = crypto.createDecipher('aes192', 'b@ttlel0g_bf2142');
          var decrypted = decipher.update(payload.encryptedInfo, 'hex', 'utf8');
          decrypted += decipher.final('utf8');
          var result = {};
          decrypted.split('|').forEach(function(x){
              var arr = x.split('=');
              arr[1] && (result[arr[0]] = arr[1]);
          });
          payload.name = result.username;
          payload.password = result.password;
        }

        GsUtil.dbConnection(db, (err, connection) => {
            if (err || !connection) { console.log(err); return connection.release() }
            connection.query('SELECT id, pid, username, password, game_country, email, banned FROM web_users WHERE username = ? OR username_16 = ?', [payload['name'], payload['name']], (err, result) => {
                if (!result || result.length == 0) {
                    connection.release();
                    return client.write('acct', {
                        TXN: 'Login',
                        'localizedMessage':'The username was was not found in the database.',
                        'errorContainer.[]': 0,
                        'errorCode':101
                    }, type2);
                    // write output error here
                } else {
                    result = result[0];
                    var password_16 = result.password.substr(0, result.password.length - 16);
                    if (md5(payload.password) !== result.password && payload.password !== password_16 && payload.password !== result.password) {
                      connection.release();
                      return client.write('acct', {
                          TXN: 'Login',
                          'localizedMessage':'The password was not correct.',
                          'errorContainer.[]': 0,
                          'errorCode':101
                      }, type2);
                    } else if (result.banned == 1) {
                      connection.release();
                      return client.write('acct', {
                          TXN: 'Login',
                          'localizedMessage':'The username has been banned.',
                          'errorContainer.[]': 0,
                          'errorCode':103,
                      }, type2);
                    } else {
                        connection.release();
                        const cipher = crypto.createCipher('aes192', 'b@ttlel0g_bf2142');
                        var encryptedLoginInfo = cipher.update('password=' + result.password + '|username=' + result.username, 'utf8', 'hex');
                        encryptedLoginInfo += cipher.final('hex');
                        client.state.pid = result.id;
                        var sendObj = {
                            TXN: payload.name
                        }
                        sendObj[payload.name + '.[]'] = 0;
                        if (payload.returnEncryptedInfo = 1) {
                            sendObj['encryptedLoginInfo'] = encryptedLoginInfo;
                        }
                        console.log(sendObj);
                        client.write('acct', sendObj, type2)
                    }
                }
            });
        });

    });

    client.on('subs.GetEntitlementByBundle', function(payload, type2) {
        client.write('subs', {
            TXN: 'GetEntitlementByBundle',
            'EntitlementByBundle.[]': 0
        }, type2)
    });

    client.on('dobj.GetObjectInventory', function(payload, type2) {
        client.write('dobj', {
            TXN: 'GetObjectInventory',
            'ObjectInventory.[]': 0
        }, type2)
    });

    client.on('acct.GetSubAccounts', function(payload, type2) {

      GsUtil.dbConnection(db, (err, connection) => {
          if (err || !connection) { console.log(err); return connection.release() }
          connection.query('SELECT pid, nickname FROM revive_soldiers WHERE web_id = ? AND game = ? AND deleted != 1', [client.state.pid, 'stella'], (err, result) => {
              var sendObj = {
                  TXN: 'GetSubAccounts',
                  'subAccounts.[]': 0
              }
              if (!result || result.length == 0) {
                  // Then ignore this loop
              } else {
                  for (var i = 0; i < result.length; i++) {
                    subAccount = "subAccounts." + i;
                    sendObj[subAccount] = result[i].nickname;
                    sendObj['subAccounts.[]'] = sendObj['subAccounts.[]'] + 1;
                  }
              }
              connection.release();
              client.write('acct', sendObj, type2);
          });
      });
    });

    client.on('acct.AddSubAccount', function(payload, type2) {
      GsUtil.dbConnection(db, (err, connection) => {
          if (err || !connection) { console.log(err); return connection.release() }
          connection.query('INSERT INTO revive_soldiers (web_id, nickname, game) values (?, ?, ?)', [client.state.pid, payload.name, 'stella'], (err, result) => {
              if (err) {
                  // write output error here
                  connection.release();
              } else {
                var sendObj = {
                    TXN: 'AddSubAccount'
                }
                client.write('acct', sendObj, type2);
                connection.release();
              }

          });
      });
    });

    client.on('acct.DisableSubAccount', function(payload, type2) {
      GsUtil.dbConnection(db, (err, connection) => {
        var hashedName = md5(payload.name + new Date());
        var time_deleted = Date.now();
        if (err || !connection) { console.log(err); return connection.release() }
        connection.query('UPDATE revive_soldiers SET nickname = ?, deleted = 1, deleted_name = ? where nickname = ? AND game = ?', [hashedName, payload.name, payload.name, 'stella'], (err, result) => {
            if (err) {
                // write output error here
                connection.release();
            } else {
              var sendObj = {
                  TXN: 'DisableSubAccount'
              }
                client.write('acct', sendObj, type2);
                connection.release();
            }
        });
      });
    });

    client.on('acct.SendAccountName', function(payload, type2) {
      GsUtil.dbConnection(db, (err, connection) => {
        var hashedName = md5(payload.name + new Date());
        var time_deleted = Date.now();
        var sendObj = {
            TXN: 'SendAccountName'
        }
        client.write('acct', sendObj, type2);
        if (err || !connection) { console.log(err); return connection.release() }
        connection.query('SELECT username FROM web_users where email = ?', [payload.email], (err, result) => {
            if (err) {
                // write output error here
                connection.release();
            } else {
              connection.release();
            }
        });
      });
    });

    client.on('acct.SendPassword', function(payload, type2) {
      GsUtil.dbConnection(db, (err, connection) => {
        var hashedName = md5(payload.name + new Date());
        var time_deleted = Date.now();
        var sendObj = {
            TXN: 'SendPassword'
        };
        var token = GsUtil.bf2Random(50);
        var emailInfo = [];
        client.write('acct', sendObj, type2);
        if (err || !connection) { console.log(err); return connection.release() }
        connection.query('SELECT id, email FROM web_users where username = ?', [payload.name], (err, result) => {
          if (err) {
            console.log(err);
            connection.release();
          } else {
            var result = result[0];
            connection.query('UPDATE web_users SET fpass_token = ? where username = ?', [token, payload.name], (err) => {
                if (err) {
                    console.log(err);
                    connection.release();
                } else {
                  emailInfo['email'] = result.email;
                  emailInfo['name'] = payload.name;
                  emailInfo['id'] = result.id;
                  emailInfo['token'] = token;
                  emailUtil.sendPassword(emailInfo);
                  connection.release();
                }
            });
          }
        });
      });
    });

    client.on('acct.GetTos', function(payload, type2) {
        var tos = 'dG9zPSLvu79OT1RJQ0U6JTBkJTBhQWNjb3VudCBDcmVhdGlvbnMgaW4gZ2FtZSBoYXZlIGJlZW4gZGlzYWJs'
        tos += 'ZWQuICUwZCUwYSAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgJTBkJTBhICAg'
        tos += 'ICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgJTBkJTBhICAgICAgICAgICAgICAgICAg'
        tos += 'ICAgICAgICAgICAgICAgICAgICAgICAgICAgJTBkJTBhICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAg'
        tos += 'ICAgICAgICAgICAgJTBkJTBhICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgJTBk'
        tos += 'JTBhUGxlYXNlIGdvIHRvIGh0dHBzOi8vYmF0dGxlbG9nLmNvIHRvIHNpZ24gdXAgZm9yIGEgbmV3IGFjY291bnQu'
        tos += 'IFlvdSBjYW4gdGhlbiBsb2dpbiB0byB0aGUgZ2FtZSB3aXRoIHlvdXIgYWNjb3VudCBjcmVhdGVkIGR1cmluZyB0'
        tos += 'aGUgcmVnaXN0cmF0aW9uIHByb2Nlc3MuICUwZCUwYSAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAg'
        tos += 'ICAgICAgICAgICAgJTBkJTBhICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgJTBk'
        tos += 'JTBhICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgJTBkJTBhICAgICAgICAgICAg'
        tos += 'ICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICUwZCUwYVdlIHJlY29tbWVuZCB5b3UgdXNl'
        tos += 'IHRoZSBCYXR0bGVsb2cuY28gTGF1bmNoZXIgZm9yIHRoZSBiZXN0IGV4cGVyaWVuY2UuIg=='
        client.write('acct', {
            data: tos,
            decodedSize: 775,
            size: 1036
        }, type2)
    });

    client.on('acct.GetCountryList', function(payload, type2) {
        var tos = 'dG9zPSLvu79OT1RJQ0U6JTBkJTBhQWNjb3VudCBDcmVhdGlvbnMgaW4gZ2FtZSBoYXZlIGJlZW4gZGlzYWJs'
        tos += 'ZWQuICUwZCUwYSAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgJTBkJTBhICAg'
        tos += 'ICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgJTBkJTBhICAgICAgICAgICAgICAgICAg'
        tos += 'ICAgICAgICAgICAgICAgICAgICAgICAgICAgJTBkJTBhICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAg'
        tos += 'ICAgICAgICAgICAgJTBkJTBhICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgJTBk'
        tos += 'JTBhUGxlYXNlIGdvIHRvIGh0dHBzOi8vYmF0dGxlbG9nLmNvIHRvIHNpZ24gdXAgZm9yIGEgbmV3IGFjY291bnQu'
        tos += 'IFlvdSBjYW4gdGhlbiBsb2dpbiB0byB0aGUgZ2FtZSB3aXRoIHlvdXIgYWNjb3VudCBjcmVhdGVkIGR1cmluZyB0'
        tos += 'aGUgcmVnaXN0cmF0aW9uIHByb2Nlc3MuICUwZCUwYSAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAg'
        tos += 'ICAgICAgICAgICAgJTBkJTBhICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgJTBk'
        tos += 'JTBhICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgJTBkJTBhICAgICAgICAgICAg'
        tos += 'ICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICUwZCUwYVdlIHJlY29tbWVuZCB5b3UgdXNl'
        tos += 'IHRoZSBCYXR0bGVsb2cuY28gTGF1bmNoZXIgZm9yIHRoZSBiZXN0IGV4cGVyaWVuY2UuIg=='
        client.write('acct', {
          data: tos,
          decodedSize: 775,
          size: 1036
        }, type2)
    });

    client.on('acct.LoginSubAccount', function(payload, type2) {
      client.state.gspid = payload.name;
        client.write('acct', {
            TXN: 'LoginSubAccount',
            lkey: client.state.lkey,
            userId: 1,
            profileId: 1
        }, type2)
    });

    client.on('acct.GetAccount', function(payload, type2) {
        client.write('acct', {
            TXN: 'GetAccount',
            nuid: client.state.username + '@example.com',
            DOBDay: 1,
            DOBMonth: 1,
            DOBYear: 1980,
            userId: 1,
            globalOptin: 0,
            thidPartyOptin: 0,
            language: 'en',
            country: 'US'
        }, type2);
    })

    client.on('acct.GameSpyPreAuth', function(payload, type2) {
        var challenge = GsUtil.bf2Random(7, 'abcdefghijklmnopqrstuvwxyz');
        var ticket = GsUtil.bf2Random(90, '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ');
        GsUtil.dbConnection(db, (err, connection) => {
            if (err || !connection) { console.log(err); return connection.release() }
            connection.query('UPDATE revive_soldiers SET fesl_token = ? WHERE nickname= ? AND game = "stella"', [ticket, unescape(client.state.gspid)], (err, result) => {
                client.write('acct', {
                    TXN: 'GameSpyPreAuth',
                    challenge: challenge,
                    ticket: ticket
                }, type2);
                connection.release();
            });
        });
    });

    client.on('close', function() {
        clearInterval(client.pingInterval);
    })

})
