/**
 * 本地 mock：只实现协议所需的最小服务端能力。
 *   HTTP：/api/Global/GetGlobalMeta、/chat_list、/messages
 *   WS  ：socket.io v2, path=/mds2（send message ack + new message 推送）
 * 启动：npm run mock （端口 3100）
 */
const path = require('path');
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');

const PORT = Number(process.env.PORT || 3100);
const SELF = { accountId: 'self-001', fullname: '我', avatar: '' };
const PEER = { accountId: 'peer-001', fullname: '李明', avatar: '' };

function pad(value) {
  return String(value).padStart(2, '0');
}

function now() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(
    d.getMinutes(),
  )}:${pad(d.getSeconds())}.${String(d.getMilliseconds()).padStart(3, '0')}`;
}

let nextId = 1001;
const messages = [];
for (let i = 0; i < 8; i += 1) {
  const sendBySelf = i % 2 === 0;
  messages.push({
    id: String(nextId),
    from: sendBySelf ? SELF.accountId : PEER.accountId,
    to: sendBySelf ? PEER.accountId : SELF.accountId,
    type: 1,
    time: now(),
    msg: { con: sendBySelf ? `第 ${i + 1} 条：我发的消息` : `第 ${i + 1} 条：对方发的消息` },
    uname: sendBySelf ? SELF.fullname : PEER.fullname,
  });
  nextId += 1;
}

const sessions = [
  {
    value: PEER.accountId,
    type: 1,
    name: PEER.fullname,
    logo: '',
    msg: { con: '对方: 第 8 条：对方发的消息' },
    time: now(),
    count: 0,
    from: { id: PEER.accountId, name: PEER.fullname },
    top_info: { isTop: false },
  },
];

const app = express();
app.use(express.json());

app.post('/api/Global/GetGlobalMeta', (req, res) => {
  res.json({
    state: 1,
    data: {
      config: { SERVER_NAME: '', HTTP_SERVER: '', FilePath: '', SocketPolling: false },
      'md.global': { Account: SELF },
    },
  });
});

app.get('/chat_list', (req, res) => res.json(sessions));

app.get('/messages', (req, res) => {
  const num = Number(req.query.num || 20);
  res.json(messages.slice(-num).reverse());
});

// 若已构建，则同源托管 dist（入口 HTML 禁止缓存）
const distDir = path.join(__dirname, '..', 'dist', 'build', 'h5');
const fs = require('fs');
if (fs.existsSync(distDir)) {
  app.use(
    express.static(distDir, {
      index: false,
      setHeaders: (res, filePath) => {
        if (filePath.endsWith('.html')) res.setHeader('Cache-Control', 'no-store');
      },
    }),
  );
  app.get('*', (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.sendFile(path.join(distDir, 'index.html'));
  });
}

const server = http.createServer(app);
const io = socketIo(server, { path: '/mds2' });

io.on('connection', socket => {
  console.log('[mock] connected', socket.id);

  socket.on('send message', (payload, ack) => {
    const record = {
      id: String(nextId),
      waitingId: payload.waitingid,
      from: SELF.accountId,
      to: String(payload.touser || ''),
      type: Number(payload.type) || 1,
      time: now(),
      msg: { con: payload.msg },
      uname: SELF.fullname,
    };
    nextId += 1;
    messages.push(record);

    if (typeof ack === 'function') {
      ack(null, { id: record.id, socket: { time: record.time } });
    }

    // 1.5 秒后模拟对方回复（new message 推送）
    setTimeout(() => {
      const reply = {
        id: String(nextId),
        from: PEER.accountId,
        to: SELF.accountId,
        type: 1,
        time: now(),
        msg: { con: `收到：${payload.msg}` },
        uname: PEER.fullname,
      };
      nextId += 1;
      messages.push(reply);
      io.emit('new message', reply);
    }, 1500);
  });

  socket.on('clear unread', (payload, ack) => {
    if (typeof ack === 'function') ack(null, { ok: true });
  });

  socket.on('current chat', (payload, ack) => {
    if (typeof ack === 'function') ack(null, { ok: true });
  });
});

server.listen(PORT, () => {
  console.log(`[mock] ws demo server: http://127.0.0.1:${PORT}  path=/mds2`);
});
