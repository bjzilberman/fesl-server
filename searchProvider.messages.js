var gspyProcess = require('./lib/gspyProcess')
var util = require('util');
var md5 = require('md5');

module.exports = function(db) {
  return {
    nicksResponse: function(state, data, cb) {
      state.plyEmail = data['email'] || undefined;
      state.plyPass = data['pass'] || undefined;
      state.plyPassEnc = data['passenc'] || undefined;
      if (!state.plyEmail || (!state.plyPass && !state.plyPassEnc)) { return cb({code: 0, msg: 'Invalid query!'}) }

      var password = md5(state.plyPass ? state.plyPass : gspyProcess.decodePassword(state.plyPassEnc));
      db.query('SELECT username FROM web_users WHERE email=? AND password=?', [state.plyEmail, password], function(err, response) {
        response = response || [];
        var res = '\\nr\\' + response.length
        for (var i = 0; i < response.length; i++) {
          res += util.format('\\nick\\%s\\uniquenick\\%s', response[i].username, response[i].username);
        }
        res += '\\ndone\\final\\';
        cb(null, res);
      })
    },
    checkResponse: function(state, data, cb) {
      state.plyName = data['nick'] || undefined;
      if (!state.plyName) { return cb({code: 0, msg: 'Invalid query!'}) }
      db.query('SELECT pid FROM web_users WHERE username=?', [state.plyName], function(err, response) {
        if (!response || response.length == 0) { return cb({ code: 256, msg: 'Invalid username. Account does not exist!'}); }
        cb(null, util.format('\\cur\\0\\pid\\%d\\final\\', response[0].pid));
      })
    }
  }
}
