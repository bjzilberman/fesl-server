var exec = require('child_process').fork,
    chalk = require('chalk');

chalk.reset();

var fesl = exec('./servers/fesl.js');
var clientManager = exec('./servers/clientManager.js');
