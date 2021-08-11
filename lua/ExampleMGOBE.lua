local Socket = CS.WBFramework.Sockets.Socket;
local rapidjson = require('rapidjson')
local pb = require "pb"
-- ========================================================= 
local metaclass = {}

local DataFormat = {
    json = 1,
    pb = 2,
}

function metaclass:enter(gameObj)
    self.gameObj = gameObj;
    UIUtil.FindButton(gameObj.transform, "Scroll View/Viewport/Grid/Back").onClick:AddListener(function()
        ExampleSwitcher:switchExample(ExampleSwitcher.example_main);
    end);
    UIUtil.FindButton(gameObj.transform, "Scroll View/Viewport/Grid/BtnInit").onClick:AddListener(function()
        local wsUrl = "192.168.24.41:8082"
        local kcpUrl = "192.168.24.41:41234"

        self.socket0 = Socket(0, false, wsUrl)
        self.socket1 = Socket(1, true, kcpUrl)

        self.socket0:OnEvent('connect', function(e)
            print('===[Game]=== ', 'tcp | connect | ' .. e.Msg)
        end)
        self.socket0:OnEvent('message', function(e)
            self:onMessage(e)
        end)
        self.socket0:OnEvent('connectError', function(e)
            print('===[Game]=== ', 'tcp | connectError | ' .. e.Msg)
        end)
        self.socket0:OnEvent('connectClose', function(e)
            print('===[Game]=== ', 'tcp | connectClose | ' .. e.Msg)
        end)

        self.socket1:OnEvent('connect', function(e)
            print('===[Game]=== ', 'kcp | connect | ' .. e.Msg)
        end)
        self.socket1:OnEvent('message', function(e)
            self:onMessage(e)
        end)
        self.socket1:OnEvent('connectError', function(e)
            print('===[Game]=== ', 'kcp | connectError | ' .. e.Msg)
        end)
        self.socket1:OnEvent('connectClose', function(e)
            print('===[Game]=== ', 'kcp | connectClose | ' .. e.Msg)
        end)

        self.socket0:ConnectSocketTask("");
        self.socket1:ConnectSocketTask("");
    end)
    UIUtil.FindButton(gameObj.transform, "Scroll View/Viewport/Grid/BtnSendJson0").onClick:AddListener(function()
        self:sendJson(self.socket0)
    end)
    UIUtil.FindButton(gameObj.transform, "Scroll View/Viewport/Grid/BtnSendPb0").onClick:AddListener(function()
        self:sendPb(self.socket0)
    end)
    UIUtil.FindButton(gameObj.transform, "Scroll View/Viewport/Grid/BtnSendJson1").onClick:AddListener(function()
        self:sendJson(self.socket1)
    end)
    UIUtil.FindButton(gameObj.transform, "Scroll View/Viewport/Grid/BtnSendPb1").onClick:AddListener(function()
        self:sendPb(self.socket1)
    end)

    local asset = game.assetmgr.load_asset_sync("Config/proto.bytes", typeof(CS.UnityEngine.TextAsset))
    assert(pb.load(asset.bytes))
end

function metaclass:onMessage(e) 
    local dataFormat = string.byte(e.Data, 1, 1)
    local body = string.sub(e.Data, 2)
    if dataFormat == DataFormat.json then 
        print('===[Game]=== ', 'kcp | message | json | ' .. body)
    elseif  dataFormat == DataFormat.pb then 
        local rspWrap1 = pb.decode("com.unity.mgobe.ClientSendServerRspWrap1", body)
        local rspWrap2 = pb.decode("com.unity.mgobe.ClientSendServerRspWrap2", rspWrap1.Body)
        local rspBody = pb.decode("com.unity.mgobe.StartFrameSyncRsp", rspWrap2.Body)
        print(wb.serpent.block(rspWrap1))
        print(wb.serpent.block(rspWrap2))
        print(wb.serpent.block(rspBody))
    end
end

function metaclass:sendJson(socket)
    local jsonStr = rapidjson.encode({
        code = 0,
        msg = 'ok',
        data = {
            version = '1.0.0',
            text = 'hello',
        },
    })
    local onfailed = function() 
        print('===[Game]=== ', 'tcp SendJson Failed')
    end
    local onsuccess = function() 
        print('===[Game]=== ', 'tcp SendJson Success')
    end
    socket:Send(self:packJsonBody(jsonStr), onfailed, onsuccess)
end

function metaclass:sendPb(socket)
    local data = {}
    local byteData = pb.encode("com.unity.mgobe.StartFrameSyncReq", data)

    local wrap2 = {
        Cmd = 2012,
        Body = pb.tohex(byteData),
    }
    local byteWrap2 = pb.encode("com.unity.mgobe.ClientSendServerReqWrap2", wrap2)

    local wrap1 = {
        Cmd = 'relay_cmd',
        Seq = 'uuid-unique', -- todo(chentao) export guid class
        Body = byteWrap2,
    }
    
    local byteWrap1 = pb.encode("com.unity.mgobe.ClientSendServerReqWrap1", wrap1)
    local output = assert(pb.decode("com.unity.mgobe.ClientSendServerReqWrap1", byteWrap1))
    print(wb.serpent.block(output))
    
    local onfailed = function() 
        print('===[Game]=== ', 'tcp SendPb Failed')
    end
    local onsuccess = function() 
        print('===[Game]=== ', 'tcp SendPb Success')
    end
    socket:Send(self:packPbBody(byteWrap1), onfailed, onsuccess)
end

function metaclass:packJsonBody(body)
    -- todo(chentao) 避免重新创建字符串的开销
    return string.char(0x01) .. body
end

function metaclass:packPbBody(body)
    -- todo(chentao) 避免重新创建字符串的开销
    return string.char(0x02) .. body
end

function metaclass:leave()
    CS.UnityEngine.GameObject.Destroy(self.gameObj);

    if self.socket0 then 
        self.socket0:DestroySocketTask()
    end

    if self.socket1 then 
        self.socket1:DestroySocketTask()
    end
end

return metaclass