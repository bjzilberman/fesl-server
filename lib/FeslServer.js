const util = require('util');
const EventEmitter = require('events');
const net = require('net');
const chalk = require('chalk');
const tls = require('tls');

const FeslClient = require('./FeslClient');



function FeslServer(name, options) {

    var Log = function() {
            console.log(GsUtil.Time() + chalk.grey('FESL - ' + name) + '\t\t' + Array.prototype.join.call(arguments, '\t\t'));
    }

    var _this = this;
    EventEmitter.call(this);

    this.socket = tls.createServer({
        key: options.tlsKey,
        cert: options.tlsCert,
        secureProtocol: 'SSLv3_method'
    })

    this.clients = [];

    this.socket.listen(options.port, '0.0.0.0', function(err) {
        console.log('Listening on ' + options.port);
        if (err) throw err;
    });

    this.socket.on('clientError', function(exception, socket) {
        console.log(exception);
    })

    this.socket.on('newSession', function(id, data, callback) {
        console.log('New FESL SSL Session');
        callback();
    })

    this.socket.on('OCSPRequest', function(cert, issuer, callback) {
        console.log(cert, issuer);
        callback();
    });

    this.socket.on('secureConnection', function(client) {
        console.log('Socket Secured');

        var feslClient = new FeslClient(name, client);
        _this.clients.push(feslClient);
        _this.emit('newClient', feslClient);
    })
}

util.inherits(FeslServer, EventEmitter);

module.exports = FeslServer;
