const util = require('util');
const EventEmitter = require('events');
const net = require('net');
const chalk = require('chalk');

const GsUtil = require('./GsUtil.js');



function GsClient(name, clientSocket) {
    var Log = function() {
        console.log(chalk.grey('GsClient - ' + name) + '\t\t' + Array.prototype.join.call(arguments, '\t\t'));
    }

    var _this = this;
    EventEmitter.call(this);
    this.socket = clientSocket

    this.recvBuffer = new Buffer('');

    this.socket.setKeepAlive(true, 60000);

    this.socketActive = true;
    this.state = {};

    // When we get data from a client, lets do stuff.
    this.socket.on('data', function(data) {
        // Tell our friends
        _this.emit('data', data);

        // Add to our internal buffer.
        _this.recvBuffer = Buffer.concat([_this.recvBuffer, data]);
        var recvString = _this.recvBuffer.toString();

        // If we got a full command this time, let us process them.
        if (recvString.indexOf('\\final\\') > -1) {
            var messages = recvString.split('\\final\\');
            for (var i = 0; i < messages.length; i++) {
                var msg = messages[i];
                if (msg.length > 0) {
                    // Tell our parents we have a command for processing.
                    _this.processCommand(msg);
                }
            }
            // Clear our buffer now.
            _this.recvBuffer = new Buffer('');
        }
    })

    // Connection ova!
    this.socket.on('end', function(err) {
        _this.socketActive = false;
        Log('Socket Closed', _this.socket.remoteAddress);
        _this.emit('close');
    });

    // Oops...
    this.socket.on('error', function(err) {
        Log('Socket Error - ' + err.message);
        _this.socketActive = false;
        _this.emit('close', err);
    })

    // Tell our friends we have a new command.
    this.processCommand = function(data) {
        var gsPacket = GsUtil.processCommand(data);
        this.emit('command.' + gsPacket.query, gsPacket.message);
    }

    // Send data out, safely.
    this.write = function(data) {
        if (this.socketActive) {
            this.socket.write(data);
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
    }

    this.emit('ready');
}

util.inherits(GsClient, EventEmitter);

module.exports = GsClient;
