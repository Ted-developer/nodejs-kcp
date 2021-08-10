var pb = require("./proto_pb")
const { v4: uuidv4 } = require('uuid');
var seedrandom = require('seedrandom');

var messageDataTag = {
    clientPre : 0x02,
    clientEnd : 0x03,
    serverPre : 0x28,
    serverEnd : 0x29,
}

var cmdType = {
    common: 'comm_cmd',
    relay : 'relay_cmd',
}

var frameId = 0
var seed = seedrandom().int32()

var decodeReq = function(data) {
    var pre = data.readUInt8(0);
    var pbLength = data.readUIntBE(1, 4);
    var end = data.readUInt8(data.length - 1);

    if (pre == messageDataTag.clientPre && end == messageDataTag.clientEnd) {
        return decodePB(data.slice(5, data.length - 1));
    } else {
        console.error(`unrecognize builder | pre: ${pre}, end: ${end}`);
    }
}

var getFrameBst = function() {
    var bst = new pb.RecvFrameBst();
    
    var frame = new pb.Frame();
    frame.setId(++frameId);

    var frameItem = new pb.FrameItem();
    frameItem.setPlayerId('chentao');
    frameItem.setData("hello");
    frameItem.setTimestamp(new Date().getTime());
    frame.addItems(frameItem);

    var frameExtInfo = new pb.FrameExtInfo();
    seed = frameId == 1? seedrandom().int32() : seed;
    seed = Math.abs(seed)
    frameExtInfo.setSeed(seed);
    frame.setExt(frameExtInfo);
    
    bst.setFrame(frame);

    var wrap1bst = new pb.ServerSendClientBstWrap1();
    wrap1bst.setVersion('1.3.1.1');
    wrap1bst.setSeq(uuidv4());

    var wrap2bst = new pb.ServerSendClientBstWrap2();
    wrap2bst.setType(pb.ServerSendClientBstWrap2Type.E_PUSH_TYPE_RELAY);
    wrap2bst.setMsg(wrap1bst);
    
    wrap2bst.setMsg(bst.serializeBinary());
    wrap1bst.setBody(wrap2bst.serializeBinary());
    return encodeBst(wrap1bst.serializeBinary());
}
// global.getFrameBst = getFrameBst;

var decodePB = function(data) {
    var wrap1 = pb.ClientSendServerReqWrap1.deserializeBinary(data);
    var wrap1cmd = wrap1.getCmd();
    if (wrap1cmd != cmdType.relay && wrap1cmd != cmdType.common) {
        console.error('unrecognize request cmd | ' + wrap1cmd);
        return []
    }

    var wrap2 = pb.ClientSendServerReqWrap2.deserializeBinary(wrap1.getBody());
    var wrap2cmd = wrap2.getCmd();
    var wrap1seq = wrap1.getSeq();

    var wrap1rsp = new pb.ClientSendServerRspWrap1();
    wrap1rsp.setSeq(wrap1seq);
    wrap1rsp.setErrCode(pb.QAppProtoErrCode.EC_OK);
    wrap1rsp.setErrMsg('OK');

    var wrap2rsp = new pb.ClientSendServerRspWrap2();
    var map = {
        [pb.ProtoCmd.E_CMD_START_FRAME_SYNC_REQ]: { // 开始帧同步
            parser : pb.StartFrameSyncReq,
            getRsp : function() {
                global.getFrameBst = getFrameBst;

                var rspBody = new pb.StartFrameSyncRsp();
                return rspBody;
            }, 
        },
        [pb.ProtoCmd.E_CMD_RELAY_SEND_FRAME_REQ]: { // 帧同步协议
            parser : pb.SendFrameReq,
            getRsp : function() {
                var rspBody = new pb.SendFrameRsp();
                return rspBody;
            }, 
        },
        [pb.ProtoCmd.E_CMD_CHECK_LOGIN_REQ]: { // 检查登录
            parser : pb.CheckLoginReq,
            getRsp : function() {
                var rspBody = new pb.CheckLoginRsp();
                return rspBody;
            },
        },
        [pb.ProtoCmd.E_CMD_HEART_BEAT_REQ]: { // 心跳
            parser : pb.HeartBeatReq,
            getRsp : function() {
                var rspBody = new pb.HeartBeatRsp();
                return rspBody;
            },
        },
    }
    if (map[wrap2cmd]) {
        var body = map[wrap2cmd].parser.deserializeBinary(wrap2.getBody());
        console.log('=====develop=====', `recv protobuf msg | ${wrap2cmd}`);
        // todo(chentao) 解析客户端参数字段, 移作他用
    } else {
        console.error("unrecognized cmd | " + wrap2cmd);
    }

    var rspBody = map[wrap2cmd].getRsp();
    wrap2rsp.setBody(rspBody.serializeBinary());
    wrap1rsp.setBody(wrap2rsp.serializeBinary());
    return wrap1rsp.serializeBinary()
    // return encodeRsp(wrap1rsp.serializeBinary());
}

var encodeRsp = function(body) {
    var buf1 = Buffer.alloc(5);
    buf1.writeUInt8(messageDataTag.clientPre, 0);
    buf1.writeUIntLE(body.length, 1, 4);

    var buf2 = Buffer.alloc(1);
    buf2.writeUInt8(messageDataTag.clientEnd, 0);

    return Buffer.concat([buf1, body, buf2], body.length + 6)
}

var encodeBst = function(body) {
    var buf1 = Buffer.alloc(5);
    buf1.writeUInt8(messageDataTag.serverPre, 0);
    buf1.writeUIntLE(body.length, 1, 4);

    var buf2 = Buffer.alloc(1);
    buf2.writeUInt8(messageDataTag.serverEnd, 0);

    return Buffer.concat([buf1, body, buf2], body.length + 6)
}

//================================================
module.exports = {
    // decode: decodeReq,
    decode: decodePB,
}