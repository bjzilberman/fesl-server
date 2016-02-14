const util = require('util');
const EventEmitter = require('events');
const net = require('net');
const chalk = require('chalk');

const GsClient = require('./GsClient');

var Log = function() {
  console.log(chalk.grey('GsSocket') + ' ' + Array.prototype.join.call(arguments, '    '));
}

function GsSocket(port, cb) {
  var _this = this;
  EventEmitter.call(this);
  this.socket = net.createServer();
  this.clients = [];

  this.socket.listen(port, '0.0.0.0', function(err) {
    if (err) throw err;
  });

  this.socket.on('connection', function(client) {
    Log('New connection from ' + client.remoteAddress);;
    var gsClient = new GsClient(client);
    _this.clients.push(gsClient);

    _this.emit('newClient', gsClient);
  })
}

util.inherits(GsSocket, EventEmitter);

module.exports = GsSocket;
