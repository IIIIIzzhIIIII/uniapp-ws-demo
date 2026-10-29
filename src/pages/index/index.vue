<template>
  <view class="page">
    <view class="head">
      <text class="title">WS 聊天示例</text>
      <view class="dot" :class="statusClass" />
      <text class="state">{{ statusText }}</text>
    </view>

    <scroll-view class="list" scroll-y :scroll-into-view="intoView">
      <view v-for="item in messages" :key="item.key" :id="'m-' + item.key" class="row" :class="{ mine: item.mine }">
        <view class="bubble" :class="{ mine: item.mine, broken: item.failed }">
          <text class="bubble-text">{{ item.text }}</text>
        </view>
      </view>
      <view v-if="!messages.length" class="empty">还没有消息，发一条试试</view>
    </scroll-view>

    <view class="composer">
      <input v-model="draft" class="input" placeholder="输入消息…" @confirm="send" />
      <view class="send" :class="{ disabled: !draft.trim() }" @click="send">发送</view>
    </view>
  </view>
</template>

<script setup>
import { computed, nextTick, onMounted, ref } from 'vue';
import { createWsChat } from '../../ws/client';

const PEER = { accountId: 'peer-001', name: '李明' };

const status = ref('connecting'); // connecting | online | reconnect | offline
const messages = ref([]);
const draft = ref('');
const intoView = ref('');

let chat = null;

const statusText = computed(
  () =>
    ({ connecting: '连接中…', online: '在线', reconnect: '重连中…', offline: '连接失败' })[status.value] || '',
);

const statusClass = computed(() => ({ warn: status.value === 'reconnect', error: status.value === 'offline' }));

function keyOf(message) {
  return String(message.id || message.waitingId || Math.random().toString(36).slice(2));
}

function pushMessage(raw, options = {}) {
  const key = keyOf(raw);
  if (messages.value.some(item => item.key === key)) return;
  messages.value.push({
    key,
    text: (raw.msg && raw.msg.con) || '',
    mine: options.mine !== undefined ? options.mine : String(raw.from) === 'self-001',
    failed: !!options.failed,
  });
  nextTick(() => {
    const last = messages.value[messages.value.length - 1];
    if (last) intoView.value = `m-${last.key}`;
  });
}

async function loadHistory() {
  try {
    const list = await (await fetch('/messages?accountid=peer-001&page=1&num=20')).json();
    (Array.isArray(list) ? list : []).reverse().forEach(item => pushMessage(item));
  } catch (error) {
    console.warn('历史消息加载失败', error);
  }
}

function connect() {
  chat = createWsChat({
    handlers: {
      onConnect: () => {
        status.value = 'online';
        chat.setCurrentChat({ id: PEER.accountId, type: 1 });
        chat.clearUnread({ type: 1, id: PEER.accountId });
      },
      onDisconnect: () => {
        status.value = 'reconnect';
      },
      onReconnect: () => {
        status.value = 'online';
        loadHistory();
      },
      onReconnectFailed: () => {
        status.value = 'offline';
      },
      onMessage: raw => {
        const mine = String(raw.from) === 'self-001';
        pushMessage(raw, { mine });
        if (!mine) chat.clearUnread({ type: 1, id: PEER.accountId });
      },
      onWithdraw: raw => {
        const target = messages.value.find(item => item.key === String(raw.id));
        if (target) target.text = (raw.msg && raw.msg.con) || '消息已被撤回';
      },
    },
  });
}

async function send() {
  const content = draft.value.trim();
  if (!content || !chat) return;
  if (!chat.isConnected()) {
    status.value = 'offline';
    return;
  }

  const waitingId = `w-${Date.now()}`;
  pushMessage(
    { id: '', waitingId, from: 'self-001', to: PEER.accountId, msg: { con: content } },
    { mine: true },
  );
  draft.value = '';

  try {
    const ack = await chat.sendText({ peerId: PEER.accountId, content, waitingId });
    const target = messages.value.find(item => item.key === waitingId);
    if (target && ack.id) target.key = String(ack.id);
  } catch (error) {
    const target = messages.value.find(item => item.key === waitingId);
    if (target) target.failed = true;
  }
}

onMounted(async () => {
  connect();
  await loadHistory();
});
</script>

<style>
.page {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background-color: #f5f6f8;
}

.head {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 52px;
  padding: 0 16px;
  flex: none;
  background-color: #ffffff;
  border-bottom: 1px solid #eef0f3;
}

.title {
  font-size: 15px;
  font-weight: 600;
}

.dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background-color: #16a34a;
}

.dot.warn {
  background-color: #d97706;
}

.dot.error {
  background-color: #dc2626;
}

.state {
  font-size: 12px;
  color: #8a949e;
}

.list {
  flex: 1;
  height: 0;
  padding: 12px 16px;
}

.row {
  display: flex;
  margin-bottom: 10px;
}

.row.mine {
  justify-content: flex-end;
}

.bubble {
  max-width: 70%;
  padding: 9px 12px;
  border-radius: 10px;
  background-color: #ffffff;
  border: 1px solid #eef0f3;
  font-size: 14px;
  line-height: 1.5;
  word-break: break-word;
}

.bubble.mine {
  background-color: #2f6fed;
  border-color: #2f6fed;
  color: #ffffff;
}

.bubble.broken {
  border-color: #dc2626;
}

.empty {
  padding: 30px 0;
  text-align: center;
  font-size: 13px;
  color: #9aa3ad;
}

.composer {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: none;
  padding: 10px 16px;
  background-color: #ffffff;
  border-top: 1px solid #eef0f3;
}

.input {
  flex: 1;
  height: 36px;
  padding: 0 12px;
  font-size: 14px;
  background-color: #f5f6f8;
  border-radius: 8px;
}

.send {
  height: 36px;
  padding: 0 16px;
  display: flex;
  align-items: center;
  border-radius: 8px;
  background-color: #2f6fed;
  color: #ffffff;
  font-size: 14px;
}

.send.disabled {
  background-color: #b9c6e4;
}
</style>
