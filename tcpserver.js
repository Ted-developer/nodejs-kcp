var pb = require("./proto_pb")
var protoparser = require("./protoparser")

//================================================ 
var ws = require("nodejs-websocket");
const { wrap } = require("module");
console.log("开始建立连接...")
var server = ws.createServer(function(conn){
    conn.on("binary", function (inStream) {
        var data = Buffer.alloc(0);
        inStream.on("readable", function () {
            var newData = inStream.read();
            if (newData)
                data = Buffer.concat([data, newData], data.length+newData.length)
        })
        inStream.on("end", function () {
            var dataFormat = data.readUInt8(0);
            var msg = data.slice(1, data.length)
            switch(dataFormat) {
                case 0x01: // json
                    console.log('=====develop=====', 'recv json msg | ' + msg.toString());
                    var buf1 = Buffer.alloc(1);
                    buf1.writeUInt8(0x01, 0);

                    var buf2 = Buffer.from('world');
                    conn.sendBinary(Buffer.concat([buf1, buf2], buf2.length + 1));
                    break
                case 0x02: // pb
                    var rsp = protoparser.decode(msg);

                    var buf1 = Buffer.alloc(1);
                    buf1.writeUInt8(0x02, 0);

                    conn.sendBinary(Buffer.concat([buf1, rsp], rsp.length + 1));
                    break
                default:
                    console.error(`unrecognize data format ${dataFormat}`);
                    break
            }
        })
    })
    conn.on("connect", function (code, reason) {
        console.log("建立连接 | " + server.connections.length)
    });
    conn.on("close", function (code, reason) {
        console.log("关闭连接 | " + server.connections.length)
    });
    conn.on("error", function (code, reason) {
        console.log("异常关闭 | " + reason)
    });
}).listen(8082, '192.168.24.41', () => {
    console.log("WebSocket正在监听")
});
console.log("WebSocket建立完毕")