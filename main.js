var exec = require('child_process').fork,
    chalk = require('chalk');

chalk.reset();

var clientManager = exec('./servers/clientManager.js');
var searchProvider = exec('./servers/searchProvider.js');
