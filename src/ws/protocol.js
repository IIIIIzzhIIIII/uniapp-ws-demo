/**
 * 纯协议常量与载荷构造（无框架依赖）。
 * 对应 docs/ws-protocol.md。
 */

/** 客户端 -> 服务端 */
export const C2S = {
  SEND_MESSAGE: 'send message',
  SEND_GROUP_MESSAGE: 'send group message',
  WITHDRAW_USER: 'withdraw user message',
  WITHDRAW_GROUP: 'withdraw group message',
  CURRENT_CHAT: 'current chat',
  CLEAR_CHAT: 'clear chat',
  OPERATE: 'operate',
  CLEAR_UNREAD: 'clear unread',
  CLEAR_NOTIFICATION: 'clear notification',
  STICKY: 'sticky on top',
  SILENCE: 'silence message',
  SHAKE: 'shake shake',
  GROUP_SHAKE: 'group shake',
};

/** 服务端 -> 客户端 */
export const S2C = {
  NEW_MESSAGE: 'new message',
  NEW_GROUP_MESSAGE: 'new group message',
  NEW_GROUP: 'new group',
  NEW_NOTIFY: 'new notify',
  WITHDRAW_USER: 'new withdraw usermessage',
  WITHDRAW_GROUP: 'new withdraw groupmessage',
  SESSION_REMOVED: 'session removed',
  CLEAR_UNREAD: 'clear unread',
  CLEAR_NOTIFICATION: 'clear notification',
  STICKY: 'new sticky on top',
  SILENCE: 'new silence message',
  SHAKE: 'shake shake',
  GROUP_SHAKE: 'group shake',
  LOGOUT: 'logout message',
};

/** 会话类型 */
export const SESSION_TYPE = { USER: 1, GROUP: 2 };

/** 消息类型 */
export const MESSAGE_TYPE = { TEXT: 1, IMAGE: 2, AUDIO: 3, FILE: 4, CARD: 5, MAP: 6, VIDEO: 7 };

/** 发送文本载荷（人员：touser；群组：togroup） */
export function buildTextPayload({ peerId, isGroup = false, content, waitingId }) {
  const payload = { type: MESSAGE_TYPE.TEXT, msg: content, waitingid: waitingId, atParam: false };
  if (isGroup) payload.togroup = peerId;
  else payload.touser = peerId;
  return payload;
}

/** 从推送消息推导会话 id */
export function resolvePeerId(message, selfAccountId) {
  const from = String(message.from);
  return from === String(selfAccountId) ? String(message.to) : from;
}
