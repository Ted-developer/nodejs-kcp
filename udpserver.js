var kcp = require('node-kcp');
var dgram = require('dgram');
var protoparser = require("./protoparser")
var server = dgram.createSocket('udp4');
var clients = {};
var interval = 200;

var output = function(data, size, context) {
    server.send(data, 0, size, context.port, context.address);
};

server.on('error', (err) => {
    console.log(`server error:\n${err.stack}`);
    server.close();
});

server.on('message', (msg, rinfo) => {
    var k = rinfo.address+'_'+rinfo.port;
    if (undefined === clients[k]) {
        var context = {
            address : rinfo.address,
            port : rinfo.port
        };
        var kcpobj = new kcp.KCP(123, context);
        kcpobj.nodelay(0, interval, 0, 0);
        kcpobj.output(output);
        clients[k] = kcpobj;
    }
    var kcpobj = clients[k];
    kcpobj.input(msg);
});

server.on('listening', () => {
    var address = server.address();
    console.log(`server listening ${address.address} : ${address.port}`);
    setInterval(() => {
        for (var k in clients) {
            var kcpobj = clients[k];
        	kcpobj.update(Date.now());
        	var recv = kcpobj.recv();
        	if (recv) {
                var dataFormat = recv.readUInt8(0);
                var msg = recv.slice(1, recv.length)
                switch(dataFormat) {
                    case 0x01: // json
                        console.log('=====develop=====', 'recv json msg | ' + msg.toString());
                        var buf1 = Buffer.alloc(1);
                        buf1.writeUInt8(0x01, 0);

                        var buf2 = Buffer.from('world');
                        kcpobj.send(Buffer.concat([buf1, buf2], buf2.length + 1));
                        break
                    case 0x02: // pb
                        var rsp = protoparser.decode(msg);

                        var buf1 = Buffer.alloc(1);
                        buf1.writeUInt8(0x02, 0);

                        kcpobj.send(Buffer.concat([buf1, rsp], rsp.length + 1));
                        break
                    default:
                        console.error(`unrecognize data format ${dataFormat}`);
                        break
                }
       	 	}
       	}

        // for (var k in clients) {
        //     var kcpobj = clients[k];
        //     global.getFrameBst && kcpobj.send(global.getFrameBst());
       	// }
    }, interval);
});

server.bind(41234);

global.getFrameBst && global.getFrameBst()

