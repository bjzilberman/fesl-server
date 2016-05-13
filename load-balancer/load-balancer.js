var ToFrom_Hex = require('convert-hex');
var Colors = require('colors');

var dgram = require('dgram');
var fs = require('fs');

var Adapter = "ALL";
var udpPort = process.env.UDPPORT || 27900;
var str_udpPort = udpPort.toString();

var debug = 0;
var debug_verbosity = 0;
var debug_info = 1;
var server = dgram.createSocket('udp4');
//console.log(process.argv.length());
if (process.argv.length <= 2)
{
	console.log("Note: use -help or --help for additional help.");
	server.bind(udpPort);
} else if (process.argv.length == 3)
{
	if ( (process.argv[2] == "-help") || (process.argv[2] == "--help") )
	{
		console.log("Load-balancer help");
		console.log("-------------------");
		console.log("parameters: [ip] [options]");
		console.log("");
		console.log("Options:");
		console.log("Enable debugging (1 v required, each additional v = increase in verbosity): -dv[v]");
		return;
	} else
	{
		Adapter = process.argv[2];
		server.bind(udpPort, process.argv[2]);
	};
} else if (process.argv.length == 4)
{
	Adapter = process.argv[2];
	server.bind(udpPort,process.argv[2]);
	if (process.argv[3].substr(0,1) == "-")
	{
		if (process.argv[3].substr(1,1) == "d")
		{
			debug = 1;
			if (process.argv[3].substr(2,1) == "v")
			{
				debug_verbosity += 1;
				debug_info = 1;
			};
		};
	};
};

server.on('listening', function()
{
	if (Adapter == "ALL")
	{
  		console.log('Load-balancer server bound to ' + Adapter.bold.green + " adapters on port " + str_udpPort.bold.blue);
  	} else
  	{
  		console.log('Load-balancer server bound to:' + Adapter.bold.green + " on port " + str_udpPort.bold.blue);
  	};

  	if (debug == 1)
  	{
  		console.log("Debugging: " + "ENABLED".bold.red);
  		if (debug_info = 1)
  		{	
  			console.log("Debug verbosity level: " + "INFO".bold.green);
  		};

  		console.log("");	//Just for an extra line break so when debug info does come in, it's not all jammed together.
  	}
});

server.on('message', function(msg, info)
{
	if (debug == 1)
	{
		if (debug_info == 1)
		{
			Object.keys(info).forEach(function(key)
			{
	  			var val = info[key];
	  			console.log(key.toString() + ":" + val.toString());
			});
		};
	};

	//console.log("Login-server list request from " + info.keys());

	var ByteArray = ToByteArray(1, msg.toString());
	console.log("Message:" + msg);
	var message = ToFrom_Hex.bytesToHex(ByteArray);
	console.log("Bytes:" + ByteArray);
	console.log("Bytes (Hex):" + message);

	if (message.substring(0, 2) == "09")
	{
		//var reply = [
		//0xFE, 0xFD, 0x09, 0x00, 0x00, 0x00, 0x00,
		//Now the padding...
		//	0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00
		//];
		//var reply = "FEFD0900000000";
		//var padding = "0000000000000000000000";
		//reply = reply + padding;
		//var reply = "FEFD09000000000000000000000000000000";
		//server.send(ToFrom_Hex.hexToBytes(new Buffer(reply)));

		var reply = new Buffer([
			0xFE, 0xFD, 0x09, 0x00, 0x00, 0x00, 0x00,
				0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00
		]);
		server.send(reply, 0, reply.length, info.port, info.address);
	};
});

server.on('error', function(){
  // handle error
});


function ToByteArray(ENCODING, data)
{
    var unsigned = function (val)
    {
    	return val >>> 0;
    };
    //var ENCODING = 1;

    //var toArray = function (data)
    //{
        var d = [];

        for (var i = 0; i < data.length; i++)
        {
            var x = data.charCodeAt(i);

            for (var a = 0; a < ENCODING; a++)
            {
                d.push(unsigned(x) & 255);
                x = x >> 8;
            };
        };

        return d;
    //};

    /** /
    if (!String.prototype.toByteArray)
    {
        String.prototype.toByteArray = function ()
        {
            ///<summary>
            /// UTF8 string to byte array
            ///	</summary> 
            ENCODING = 1;
            return toArray(this);
        };
    }

    if (!String.prototype.toUnicodeByteArray)
    {
        String.prototype.toUnicodeByteArray = function ()
        {
            ///<summary>
            /// Unicode string to byte array
            ///	</summary> 
            ENCODING = 2;
            return toArray(this);
        };
    }

    if (!String.prototype.toUTF32ByteArray)
    {
        String.prototype.toUTF32ByteArray = function ()
        {
            ///<summary>
            /// UTF32 string to byte array
            ///	</summary> 
            ENCODING = 4;
            return toArray(this);
        };
    }
    /**/

};