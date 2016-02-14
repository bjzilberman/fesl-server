var crypto = require('crypto'),
util = require('util'),
md5 = require('md5'),
mysql = require('mysql');




function generateProof(password, plyName, challenge_a, challenge_b) {
  return md5(password + Array(49).join(' ') + plyName + challenge_a + challenge_b + password);
}

module.exports = function(db) {
  return {
    serverChallenge: function(state, cb) {
      crypto.randomBytes(5, function(err, buf) {
        var token = buf.toString('hex');
        state.serverChallenge = token;
        console.log('Server Challenge Token', token);
        cb(null, util.format('\\lc\\1\\challenge\\%s\\id\\1\\final\\', token));
      })
    },
    loginResponse: function(state, data, cb) {
      state.plyName = data['uniquenick'] || undefined;
      state.clientChallenge = data['challenge'] || undefined;
      state.clientResponse = data['response'] || undefined;
      if (!state.plyName || !state.clientChallenge || !state.clientResponse) { return cb({code: 0, msg: 'Login query missing a variable.'}) }

      db.query('SELECT id, pid, username, password, game_country, email FROM web_users WHERE username = ?', [state.plyName], function(err, result) {
        if (!result || result.length == 0) { return cb({code: 265, msg: 'The username provided is not registered.'}) }
        result = result[0];
        var testPassword = result.password;

        state.plyName = result.username;
        state.plyEmail = result.email;
        state.plyCountry = result.country;
        state.plyPid = result.pid;

        if (state.clientResponse !== generateProof(result.password, state.plyName, state.clientChallenge, state.serverChallenge)) {
          return cb({ code: 265, msg: 'The password provided is incorrect.'});
        }

        var len = state.plyName.length;
        var nameIndex = 0;
        var session = 0;
        while(len-- != 0) {
          session = crcLookup[((state.plyName.charCodeAt(nameIndex) ^ session) & 0xff) % 256] ^ (session >>= 8);
          nameIndex++;
        }

        var proofValue = generateProof(result.password, state.plyName, state.serverChallenge, state.clientChallenge);

        var response = util.format('\\lc\\2\\sesskey\\%d\\proof\\%s\\userid\\%d\\profileid\\%d\\uniquenick\\%s\\lt\\%s__\\id\\1\\final\\',
            session,
            proofValue,
            state.plyPid, state.plyPid,
            state.plyName,
            GsUtil.bf2Random(22)
        );

        cb(null, response);
      });
    },
    profileResponse: function(state, data, cb) {
      var response = util.format('\\pi\\\\profileid\\%d\\nick\\%s\\userid\\%d\\email\\%s\\sig\\%s\\uniquenick\\%s\\pid\\0\\firstname\\\\lastname\\' +
      '\\countrycode\\%s\\birthday\\16844722\\lon\\0.000000\\lat\\0.000000\\loc\\\\id\\%d\\\\final\\',
      state.plyPid,
      state.plyName,
      state.plyPid,
      state.plyEmail,
      bf2Random(32),
      state.plyName,
      state.plyCountry,
      (state.profileSent ? 5 : 2));

      cb(null, response);
      state.profileSent = true;
    }
  }
}
