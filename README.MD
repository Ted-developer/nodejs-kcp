### 安装node-kcp
```
npm install -g node-gyp

npm install -g nan

node-gyp configure

git clone git@github.com:leenjewel/node-kcp

cd node-kcp

git submodule init

git submodule update

node-gyp build
```

### 安装三方库
```
npm install google-protobuf
npm install uuid
npm install nodejs-websocket
npm install seedrandom
```