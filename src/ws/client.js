/**
 * WebSocket 聊天客户端（无框架依赖）。
 * 协议细节见 docs/ws-protocol.md，本文件只做“连接 + 收发 + 状态回调”。
 */
import io from 'socket.io-client';
import { buildTextPayload, C2S, resolvePeerId, S2C } from './protocol';

/**
 * @param {Object} options
 * @param {string} [options.url] 连接地址（空=同源）
 * @param {string} [options.path='/mds2']
 * @param {string} [options.pssId] 跨域时用 query 鉴权
 * @param {string[]} [options.transports]
 * @param {Object} [options.handlers] 事件回调
 */
export function createWsChat(options = {}) {
  const {
    url,
    path = '/mds2',
    pssId = '',
    transports = ['websocket'],
    handlers = {},
  } = options;

  const socket = io.connect(url || undefined, {
    path,
    reconnectionAttempts: 100,
    reconnectionDelay: 1000,
    timeout: 15000,
    query: pssId ? { pss_id: pssId } : {},
    transports,
  });

  socket.on('connect', () => handlers.onConnect && handlers.onConnect());
  socket.on('disconnect', reason => handlers.onDisconnect && handlers.onDisconnect(reason));
  socket.on('reconnecting', attempt => handlers.onReconnecting && handlers.onReconnecting(attempt));
  socket.on('reconnect', () => handlers.onReconnect && handlers.onReconnect());
  socket.on('reconnect_failed', () => handlers.onReconnectFailed && handlers.onReconnectFailed());
  socket.on('error', error => {
    if (error && error.code === 'parser error') return;
    handlers.onError && handlers.onError(error);
  });

  socket.on(S2C.NEW_MESSAGE, message => handlers.onMessage && handlers.onMessage(message));
  socket.on(S2C.NEW_GROUP_MESSAGE, message => handlers.onMessage && handlers.onMessage(message, true));
  socket.on(S2C.WITHDRAW_USER, message => handlers.onWithdraw && handlers.onWithdraw(message, false));
  socket.on(S2C.WITHDRAW_GROUP, message => handlers.onWithdraw && handlers.onWithdraw(message, true));
  socket.on(S2C.CLEAR_UNREAD, payload => handlers.onClearUnread && handlers.onClearUnread(payload));
  socket.on(S2C.LOGOUT, payload => handlers.onLogout && handlers.onLogout(payload));

  return {
    isConnected: () => !!(socket && socket.connected),

    /**
     * 发送文本；resolve 到 ack 数据，reject 到服务端错误
     * @returns {Promise<{id:string, socket:Object}>}
     */
    sendText({ peerId, isGroup = false, content, waitingId }) {
      return new Promise((resolve, reject) => {
        if (!socket || !socket.connected) {
          reject(new Error('连接已断开'));
          return;
        }
        const payload = buildTextPayload({ peerId, isGroup, content, waitingId });
        socket.emit(isGroup ? C2S.SEND_GROUP_MESSAGE : C2S.SEND_MESSAGE, payload, (err, data) => {
          if (err) reject(err);
          else resolve(data || {});
        });
      });
    },

    /** 打开会话：告知服务端当前会话，同步多端 */
    setCurrentChat({ id, type }) {
      if (socket && socket.connected) {
        socket.emit(C2S.CURRENT_CHAT, { id, value: id, type }, () => {});
      }
    },

    /** 关闭当前会话 */
    clearChat() {
      if (socket && socket.connected) socket.emit(C2S.CLEAR_CHAT, {}, () => {});
    },

    /** 清除未读（type 1 人员 / 2 群组） */
    clearUnread({ type, id }) {
      if (socket && socket.connected) socket.emit(C2S.CLEAR_UNREAD, { type, id }, () => {});
    },

    /** 用连接实例推导会话 id（from===self ? to : from） */
    peerOf(message, selfAccountId) {
      return resolvePeerId(message, selfAccountId);
    },

    close() {
      if (!socket) return;
      socket.removeAllListeners();
      socket.disconnect();
    },
  };
}
