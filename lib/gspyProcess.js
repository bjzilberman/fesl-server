
module.exports.convertKeyValue = function(msg) {
  var data = msg.split('\\');
  var out = {};
  if (data.length < 2) { return out; }
  out['__query'] = data[1];
  for (var i = 1; i < data.length; i += 2) {
    out[data[i].toLowerCase()] = data[i + 1];
  }
  return {
    message: out,
    query: data[1]
  }
}


module.exports.onData = function(client, state, processCallback, recBuffer) {
  return function(data) {
    recBuffer = Buffer.concat([recBuffer, data]);
    var recString = recBuffer.toString();
    if (recString.indexOf('\\final\\') > -1) {
      var messages = recString.split('\\final\\');
      for (var i = 0; i < messages.length; i++) {
        var msg = messages[i];
        if (msg.length > 0) {
          processCallback(client, state, msg);
        }
      }
    }
  };
}

module.exports.decodePassword = function(pass) {
  pass = pass.replace('_', '=');
  pass = pass.replace('[', '+');
  pass = pass.replace(']', '/');

  return new Buffer(pass, 'base64').toString();
}
