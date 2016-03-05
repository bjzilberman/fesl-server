const util = require('util');
const EventEmitter = require('events');
const net = require('net');
const chalk = require('chalk');
const tls = require('tls');

const GsClient = require('./GsClient');

var Log = function() {
        console.log(GsUtil.Time() + chalk.grey('GsSocket - ' + name) + '\t\t' + Array.prototype.join.call(arguments, '\t\t'));
}

function GsSocket(name, port, cb) {
    var _this = this;
    EventEmitter.call(this);
    
    var options = {};
    
    if (typeof port !== 'object') {
        options.port = port;
    }
    
    if (options.tls) {
        this.socket = tls.createServer({
            key: options.tlsKey,
            cert: options.tlsCert
        })
    } else {
        this.socket = net.createServer();
    }
    
    this.clients = [];

    this.socket.listen(options.port, '0.0.0.0', function(err) {
        if (err) throw err;
    });

    this.socket.on('connection', function(client) {
        var gsClient = new GsClient(name, client);
        _this.clients.push(gsClient);

        _this.emit('newClient', gsClient);
    })
}

util.inherits(GsSocket, EventEmitter);

module.exports = GsSocket;
