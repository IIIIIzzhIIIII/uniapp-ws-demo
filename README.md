# uniapp-ws-demo

空白 uni-app H5 项目：按**纯协议文档**实现人员消息的 WebSocket 收发，不依赖任何业务页面代码。

## 文件

```
uniapp-ws-demo
├── docs/ws-protocol.md   纯协议文档（从 pd-openweb 源码提取，与框架无关）
├── src
│   ├── ws/protocol.js    事件名/枚举/载荷构造（无框架依赖）
│   ├── ws/client.js      socket.io v2 连接、发送、状态回调（无 Vue 依赖）
│   └── pages/index/index.vue  最小聊天界面（历史、发送、实时接收）
└── mock/server.js        本地最小服务端（HTTP + socket.io path=/mds2）
```

## 运行

```bash
npm install
npm run mock        # 终端 1：本地服务，http://127.0.0.1:3100，ws path=/mds2
npm run dev:h5      # 终端 2：开发服务器 http://127.0.0.1:5180（已代理 /mds2 与接口）
```

打开 `http://127.0.0.1:5180/`：会自动加载历史消息，发送后约 1.5 秒收到「对方」的实时回复。

生产构建与同源预览：

```bash
npm run build:h5
node mock/server.js   # 访问 http://127.0.0.1:3100/
```

## 对接真实服务端

`client.js` 的 `createWsChat` 支持传入：

```js
createWsChat({
  url: 'https://your-host',      // 空 = 同源
  path: '/mds2',
  pssId: '<md_pss_id>',          // 跨域时用 query 鉴权
  transports: ['websocket'],     // 服务端要求降级时 ['polling','websocket']
  handlers: { onConnect, onDisconnect, onMessage, ... },
});
```

消息体字段、事件名、ack 约定、会话/消息类型枚举与注意事项全部见 [docs/ws-protocol.md](./docs/ws-protocol.md)。
