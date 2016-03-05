

// yeh
var cluster = require('cluster'),
    util = require('util'),
    crypto = require('crypto'),
    md5 = require('md5'),
    fs = require('fs'),
    chalk = require('chalk');

const GsUtil = require('../lib/GsUtil');
const GsSocket = require('../lib/GsSocket');

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

    cluster.on('exit', (worker, code, signal) => {
        var pid = worker.process.pid;
        Log(chalk.red(`Worker ${pid} died!`));
        newFork();
    });

    return;
}

var db = GsUtil.dbPool();

// Gamespy Search Provider Server
var server = new GsSocket(chalk.magenta('FE'), {
    port: 18300,
    tls: true,
    tlsKey: fs.readFileSync('ssl/private.key'),
    tlsCert: fs.readFileSync('ssl/public.crt')
});

// When we get a new connection
server.on('newClient', (client) => {
    Log('New FESL Client?!')
})
