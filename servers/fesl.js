

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
    })

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
        /*var sendObj = {
            TXN: payload.name
        }
        sendObj[payload.name + '.[]'] = 0*/
        var sendObj = {
            TXN: 'Login',
            lkey: md5(new Date()),
            nuid: 'spencer@sf-n.com',
            displayName: payload.user,
            profileId: 1,
            userId: 1
        }
        client.write('acct', sendObj, 0x80000002)
    });

    client.on('close', function() {
        clearInterval(client.pingInterval);
    })

})
