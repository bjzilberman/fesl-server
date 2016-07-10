

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
    tlsKey: fs.readFileSync('ssl/good_key.pem'),
    tlsCert: fs.readFileSync('ssl/good_public.crt')
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


        GsUtil.dbConnection(db, (err, connection) => {
            if (err || !connection) { console.log(err); return connection.release() }
            connection.query('SELECT id, pid, username, password, game_country, email FROM web_users WHERE username = ?', [payload['name']], (err, result) => {
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
                    if (md5(payload.password) !== result.password) {
                        connection.release();
                        return client.write('acct', {
                            TXN: 'Login',
                            'localizedMessage':'The password was not correct.',
                            'errorContainer.[]': 0,
                            'errorCode':101
                        }, type2);
                    } else {
                        client.state.pid = result.id;
                        var sendObj = {
                            TXN: payload.name
                        }
                        sendObj[payload.name + '.[]'] = 0
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
          connection.query('SELECT pid, nickname FROM revive_soldiers WHERE web_id = ? AND game = ?', [client.state.pid, 'stella'], (err, result) => {
              if (!result || result.length == 0) {
                console.log("no soldiers")
                  // write output error here
              } else {
                  var sendObj = {
                      TXN: 'GetSubAccounts',
                      'subAccounts.[]': 1
                  }
                  for (var i = 0; i < result.length; i++) {
                    subAccount = "subAccounts." + i;
                    sendObj[subAccount] = result[i].nickname;
                  }
              }
              console.log(JSON.stringify(sendObj));
              client.write('acct', sendObj, type2)
          });
      });
    });

    client.on('acct.LoginSubAccount', function(payload, type2) {
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
            connection.query('UPDATE revive_soldiers SET fesl_token = ? WHERE web_id = ? AND game = "stella"', [ticket, client.state.pid], (err, result) => {
                connection.release();
                client.write('acct', {
                    TXN: 'GameSpyPreAuth',
                    challenge: challenge,
                    ticket: ticket
                }, type2);
            });
        });
    });

    client.on('close', function() {
        clearInterval(client.pingInterval);
    })

})
