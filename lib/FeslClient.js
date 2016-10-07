const util = require('util');
const EventEmitter = require('events');
const net = require('net');
const chalk = require('chalk');

const GsUtil = require('./GsUtil.js');



function FeslClient(name, clientSocket) {
    var Log = function() {
        console.log(chalk.grey('FeslClient - ' + name) + '\t\t' + Array.prototype.join.call(arguments, '\t\t'));
    }

    var _this = this;
    EventEmitter.call(this);
    this.socket = clientSocket

    this.recvBuffer = new Buffer('');

    this.socketActive = true;
    this.state = {};

    this.counter = 0;

    // When we get data from a client, lets do stuff.
    this.socket.on('data', function(data) {
        // Tell our friends
        var payloadType = data.toString('utf8', 0, 4);
        var payloadId = data.readUIntBE(4, 4);
        var payloadLen = data.readUIntBE(8, 4);

        var payload = GsUtil.processFesl(data.slice(12).toString());
        // console.log('RECV (' + payloadType + ', ' + payloadId.toString(16) + '):\n', payload)

        _this.emit(payloadType, payload);
        _this.emit(payloadType + '.' + payload['TXN'], payload, payloadId);
    })

    // Connection ova!
    this.socket.on('end', function(err) {
        console.log('ended');
        if (_this.socketActive) {
            _this.socketActive = false;
            _this.emit('close');
        }
    });

    // Oops...
    this.socket.on('error', function(err) {
        console.log('error');
        if (_this.socketActive) {
            _this.socketActive = false;
            _this.emit('close', err);
        }
    })



    // Send data out, safely.
    this.write = function(type, payload, type2) {
        if (this.socketActive) {

            var payloadEncoded = GsUtil.serializeFesl(payload);
            var len = payloadEncoded.length + 12;
            var buff = new Buffer(len);
            buff.write(type);

            //if((type2 & 0x00ffffff) == 1) this.counter = 0;  // packets so that I don't need
            //this.counter++;                                  // to modify my code if I add/remove one ea_send
            //type2 = (type2 & 0xff000000) | this.counter;

            buff.writeUIntBE(type2, 4, 4);
            buff.writeUIntBE(len, 8, 4);
            buff.write(payloadEncoded, 12);

            console.log('SENDING (' + type + ', ' + type2.toString(16) + '):\n', payloadEncoded)

            this.socket.write(buff);
        }
    }

    // Apply Band-Aid.
    this.writeError = function(code, message) {
        // Handy for informing the user they're a piece of shit.
        this.write(('\\error\\\\err\\' + code+ '\\fatal\\\\errmsg\\' + message + '\\id\1\\final\\"'))
    }

    this.close = function() {
        this.socket.destroy();
        this.emit('close');
        this.socketActive = false;
    }

    this.emit('ready');
}

util.inherits(FeslClient, EventEmitter);

module.exports = FeslClient;
