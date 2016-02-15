// yeh
var cluster = require('cluster'),
    util = require('util'),
    crypto = require('crypto'),
    md5 = require('md5'),
    chalk = require('chalk');

const GsUtil = require('../lib/GsUtil');
const GsSocket = require('../lib/GsSocket');

function Log() {
    console.log(chalk.magenta('SearchProvider') + '\t\t' + Array.prototype.join.call(arguments, '\t\t'));
}

if (cluster.isMaster) {
    console.log(chalk.green('Starting Search Provider (8 Forks)'));
    var playerStates = {};

    var newFork = function() {
        var worker = cluster.fork();
    }

    for (var i = 0; i < 8; i++) {
        newFork();
    }

    cluster.on('exit', (worker, code, signal) => {
        var pid = worker.process.pid;
        Log(chalk.red(`Worker ${pid} died!`));
        newFork();
    });

    return;
}

var db = GsUtil.dbConnect();

// Gamespy Search Provider Server
var server = new GsSocket(chalk.magenta('SP'), 29901);

// When we get a new connection
server.on('newClient', (client) => {
    // Get player names for an email address
    client.on('command.nicks', (payload) => {
        if (!payload.email || (!payload.pass && !payload.passenc)) { return child.writeError(0, 'Invalid query!'); }
        Log('Nicks\t', client.socket.remoteAddress, payload.email);
        var pass = md5(payload.pass || GsUtil.decodePassword(payload.passenc))
        db.query('SELECT username FROM web_users WHERE email=? AND password=?', [payload.email, pass], function(err, resp) {
            resp = resp || [];
            var out = '\\nr\\' + resp.length;
            for (var i = 0; i < resp.length; i++) out += util.format('\\nick\\%s\\uniquenick\\%s', resp[i].username, resp[i].username);
            out += '\\ndone\\final\\';
            client.write(out);
        })
    })

    // Get PID for player
    client.on('command.check', (payload) => {
        if (!payload.nick) { return child.writeError(0, 'Invalid query!'); }
        Log('Check\t', client.socket.remoteAddress, payload.nick);
        db.query('SELECT pid FROM web_users WHERE username=?', [payload.nick], function(err, response) {
            if (!response || response.length == 0) { client.writeError(256, 'Invalid username. Account does not exist!'); }
            client.write(util.format('\\cur\\0\\pid\\%d\\final\\', response[0].pid));
        });
    });
})
