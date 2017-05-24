const GsUtil = require('./GsUtil');

var shardname = process.pid.toString() + '-' + (Math.floor(Math.random() * 8999) + 1000).toString();

var db_log = GsUtil.dbPool();

var insertLog = function(uid, pid, ip, username, log_type, cb) {
    GsUtil.dbConnection(db_log, (err, connection) => {
        if (err) return cb(err)
        if (!connection) return cb(true)
        connection.query('INSERT INTO logs_gamespy_auth (uid, pid, ip, username, log_type, shard) VALUES (?, ?, INET_ATON(?), ?, ?, ?)', [uid, pid, ip, username, log_type, shardname], (err, res) => {
            if (err) console.error(err);
            connection.release();
            if (cb) cb(err, res);
        });
    });
}

module.exports = insertLog;
