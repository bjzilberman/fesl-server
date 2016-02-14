var exec = require('child_process').fork,
    chalk = require('chalk');

console.log(chalk.green('Starting Client Manager (8 forks)'));
var clientManager = exec('./clientManager');
