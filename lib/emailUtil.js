var config = require('../config.json');
var aws = require('aws-sdk');
aws.config.update(config.aws);
var ses = new aws.SES({apiVersion: '2010-12-01'});
var fromAdr = 'bf2revive@battlelog.co';
var userEmail = ''

module.exports.sendPassword = function(payload)  {
  var to = [payload.email];
  var token = payload.token;
  var emailBody = ' Hello ' + payload.name + ', \
  \n\
  It appears that you or someone has requested a password reset on Battlelog.co for the account associated with the username: ' + payload.name + '\n\
  \n\
  If you did not submit this request, then please just disregard it. \n\
  \n\
  To change your password, click the following link or copy & paste it into the addres bar of your web browser. \n\
  https://battlelog.co/forgotten_pass.php?token=' + token + ' . \n\
  \n\
  \n\
  Youll live buddy, now get back to the fight! \n\
  \n\
  Regards, \n\
  Blue Entertainment LLC. \n\
  www.theblue.co \n\
  www.battlelog.co \n\
  www.revivebf2.com';
  ses.sendEmail( {
   Source: fromAdr,
   Destination: { ToAddresses: to },
   Message: {
       Subject: {
          Data: 'Battlelog.co Password Reset'
       },
       Body: {
           Text: {
               Data: emailBody,
           }
        }
     }
  }, function(err, data) {
      if(err) throw err
          console.log('Email sent:');
          console.log(data);
   });
}

module.exports.sendAccountName = function(payload)  {
  var to = [payload.email];
  var emailBody = ' Hello ' + payload.email + ', \
  \n\
  It appears that you forgot your username for Battlelog.co\'s Battlefield 2142 system.\n\
  \n\
  The account associated with the email is : ' + payload.name + '\n\
  \n\
  If you did not submit this request, then please just disregard it. \n\
  \n\
  Youll live buddy, now get back to the fight! \n\
  \n\
  Regards, \n\
  Revive Network. \n\
  www.battlelog.co \n\
  www.bl2142.co';
  ses.sendEmail( {
   Source: fromAdr,
   Destination: { ToAddresses: to },
   Message: {
       Subject: {
          Data: 'Battlelog.co Account Retrieval'
       },
       Body: {
           Text: {
               Data: emailBody,
           }
        }
     }
  }, function(err, data) {
    if(err) throw err
        console.log('Email sent:');
        console.log(data);
  });
}


module.exports.noAccount = function(payload)  {
  var to = [payload.email];
  var emailBody = ' Hello ' + payload.email + ', \
  \n\
  It appears that you do not have an account at Battlelog.co. \n\
  \n\
  If you did not submit this request, then please just disregard it. \n\
  \n\
  Otherwise, please head over to https://battlelog.co/register.php to get your account today! \n\
  \n\
  Regards, \n\
  Revive Network. \n\
  www.battlelog.co \n\
  www.bl2142.co';
  ses.sendEmail( {
   Source: fromAdr,
   Destination: { ToAddresses: to },
   Message: {
       Subject: {
          Data: 'Battlelog.co Account Retrieval'
       },
       Body: {
           Text: {
               Data: emailBody,
           }
        }
     }
  }, function(err, data) {
    if(err) throw err
        console.log('Email sent:');
        console.log(data);
  });
}
