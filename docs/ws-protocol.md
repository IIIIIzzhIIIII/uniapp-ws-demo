# 人员消息 WebSocket 协议（原生协议文档）

> 本文只描述协议本身，从 `pd-openweb` 源码的 socket 使用处提取（`src/socket/connection.js`、`src/pages/chat/utils/socket.js`、`src/pages/chat/utils/socketEvent.js`、`src/pages/chat/redux/actions.js`）。
> 不依赖任何前端框架或页面代码，可直接被任意技术栈（uni-app / 浏览器 / Node / 移动端）实现。

---

## 1. 传输层

- 协议：socket.io **v2 客户端**（服务端为 socket.io v2，握手协议 `EIO=3`）
- 连接地址：服务端下发的 `SERVER_NAME`（为空表示同源）
- 路径：`path: '/mds2'`（部署在子路径时前面拼 `__customSubPath__`）
- 传输：默认 `['websocket']`；服务端要求降级时用 `['polling', 'websocket']`
- 鉴权：
  - 同域：握手自动携带 `md_pss_id` Cookie
  - 跨域/iframe/localhost：通过 query 传 `pss_id`

```js
io.connect(serverName, {
  path: '/mds2',
  reconnectionAttempts: 100,
  timeout: 15000,
  query: { pss_id },              // 无则传 {}
  transports: ['websocket'],      // 或 ['polling','websocket']
});
```

连接生命周期事件：`connect` / `disconnect` / `reconnecting` / `reconnect` / `reconnect_failed` / `error`。
`error` 中 `code === 'parser error'` 属正常噪音，忽略即可。

---

## 2. 消息载荷通用结构

实时推送与发送使用的消息体（服务端 → 客户端）：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | string | 服务端消息 id |
| `waitingId` / `waitingid` | string | 客户端提交时的临时 id，用于幂等/对账 |
| `from` | string | 发送人 accountId |
| `to` | string | 接收人 accountId；群组消息为 groupId |
| `type` | number | 消息类型，见 §4.2 |
| `time` | string | `YYYY-MM-DD HH:mm:ss.SSS` |
| `msg.con` | string | 文本内容（可能含 HTML 实体） |
| `msg.files` | object\|null | `{ key, url, name, size, thumbs{web_1,...}, isEmotion }` |
| `uname` / `logo` | string | 推送消息附加的发送人姓名与头像 |
| `groupname` / `avatar` | string | 群组消息附加的群名称与群头像 |
| `iswd` | bool | 是否被撤回 |
| `sysType` | number | 1 成功提示 / 2 错误提示 |
| `refer` | object | 引用消息：`{ msgid, msg, msgdetail, type, time, iswd }` |
| `card` | object | 卡片：`{ md, title, entityid, extra }` |

**会话 id 推导**：`peerId = from === selfAccountId ? to : from`；群组事件 `to` 即 groupId。

---

## 3. 客户端 → 服务端

### 3.1 发送消息

| 事件 | 参数 | 回调（ack） |
| --- | --- | --- |
| `send message` | `{ type:1, msg, waitingid, touser, atParam:false, refer? }` | `(err, data)` |
| `send group message` | `{ type:1, msg, waitingid, togroup, atParam:false }` | `(err, data)` |

- `msg`：文本内容
- `waitingid`：客户端生成的唯一 id（uuid），用于把本地乐观消息与服务端消息对上
- `touser`：对方 accountId；`togroup`：群组 id
- `atParam`：@ 参数，无则 `false`（原实现发送前会删除该字段）

ack 成功返回：

```json
{
  "id": "17932615458398",
  "socket": {
    "id": "17932615458398",
    "waitingId": "<uuid>",
    "from": "<selfAccountId>",
    "uname": "发送人姓名",
    "logo": "https://...",
    "to": "file-transfer",
    "type": 1,
    "time": "2026-10-29 16:12:25.839",
    "msg": { "con": "..." }
  }
}
```

ack 失败：第一参非空（如 `{ error: 'not my contract' }`），此时应把本地消息标记为发送失败并允许重发。

### 3.2 撤回

| 事件 | 参数 |
| --- | --- |
| `withdraw user message` | `{ messageId, touser, time, adminid? }` |
| `withdraw group message` | `{ messageId, groupid, time, adminid? }` |

### 3.3 会话状态与同步

| 事件 | 参数 | 说明 |
| --- | --- | --- |
| `current chat` | `{ id, value, type }` | 当前打开会话（多端同步） |
| `clear chat` | `{}` | 关闭会话 |
| `operate` | `{ contact:{id,type}, isopen, isclose }` | 会话窗口开/关 |
| `clear unread` | `{ type:1|2, id }` | 清除人员/群组未读 |
| `clear notification` | `{ type:'system'|'post'|..., value:0, clear:true }` | 清除通知类未读 |
| `clear all unread` | `{}` | 清除全部未读 |
| `remove session` | `{ id, type }` | 删除最近会话 |
| `sticky on top` | `{ value, isTop }` | 置顶 |
| `silence message` | `{ value, isSilent }` | 免打扰 |

### 3.4 其他

| 事件 | 参数 | 说明 |
| --- | --- | --- |
| `shake shake` | `{ aid }` | 个人抖动 |
| `group shake` | `{ gid, msg? }` | 群组 @ 抖动 |
| `voice as read` | `{ ... }` | 语音消息标记已读 |
| `upload token` | `{ ... }` | 获取上传 token（回调返回 `{ token, key }`） |

---

## 4. 服务端 → 客户端

### 4.1 人员消息

| 事件 | 载荷 | 处理 |
| --- | --- | --- |
| `new message` | §2 消息体 | 按 `peerId` 归类；自己发的消息也要处理（多端同步） |
| `new withdraw usermessage` | `{ id, from, to, msg{con} }` | 对应消息 `iswd=true`，改写文案 |
| `shake shake` | `{ aid }` | 对方抖你 |

### 4.2 群组消息

| 事件 | 载荷 | 处理 |
| --- | --- | --- |
| `new group message` | §2 消息体（`to`=groupId，附 `groupname/avatar`） | 归到 groupId 会话 |
| `new group` | `{ id, name, logo, admins[], isPost, isPush }` | 新建群组会话 |
| `group member added` | `{ id, users[] }` | 群成员数变化 |
| `group member removed` | `{ id }` | 群成员数变化 |
| `removed from group` | `{ id }` | 自己被移除/群解散，删除会话 |
| `can add member` | `{ gid, can }` | 是否允许拉人 |
| `group admin added` | `{ gid, addAid }` | 自己成为管理员 |
| `group admin removed` | `{ gid, removedAid }` | 自己被取消管理员 |
| `new withdraw groupmessage` | `{ gid, id, msg{con} }` | 群消息撤回 |
| `group shake` | `{ gid, msg{msgid,time}, id }` | 群里 @ 我 |
| `set group notice` | `{ gid, isPush }` | 群免打扰设置回执 |

### 4.3 通知与其他

| 事件 | 载荷 | 处理 |
| --- | --- | --- |
| `new notify` | `{ dtype, type, name?, msg, weak?, isSilent? }` | 系统/应用/工作流通知计数 |
| `session removed` | `{ id, type }` | 删除会话 |
| `clear unread` | `{ id, type? }` | 未读归零（多端同步） |
| `clear notification` | `{ type }` | 通知未读归零 |
| `clear all unread` | `{}` | 全部未读归零 |
| `operate` | `{ contact, isopen, isclose }` | 其他窗口打开/关闭会话 |
| `new sticky on top` | `{ value, top_info{isTop,time} }` | 置顶变化 |
| `new silence message` | `{ value, isSilent, showBadge? }` | 免打扰变化 |
| `logout message` | `{ sessionId }` | 会话失效（sessionId 与本地一致时跳登录） |

---

## 5. 枚举

### 5.1 会话类型（`type`）

| 值 | 含义 | 会话 id 形态 |
| --- | --- | --- |
| 1 | 人员（1 对 1） | 对方 accountId |
| 2 | 群组 | groupId |
| 3 | 系统 | `system` |
| 4 | 动态 | `post` |
| 5 | 日程 | `calendar` |
| 6 | 任务 | `task` |
| 7 | 知识 | `knowledge` |
| 8 | 人事 | `hr` |
| 9 | 应用 | `worksheet` |
| 10 | 工作流 | `workflow` |

### 5.2 消息类型（`type`）

| 值 | 含义 | 说明 |
| --- | --- | --- |
| 1 | 文本 | `msg.con` |
| 2 | 图片/表情 | `msg.files` |
| 3 | 语音 | `msg.files` + 时长 |
| 4 | 文件 | `msg.files` |
| 5 | 卡片 | `card` |
| 6 | 位置 | 经纬度/地址 |
| 7 | 短视频 | `msg.files` |

### 5.3 群组动作（`new group` 相关业务字段）

`RENAME / ADD_MEMBER / ADD_MEMBERS / REMOVE_MEMBER / ADD_ADMIN / REMOVE_ADMIN / EXIT_GROUP / CLOSE_GROUP / DELETE / UPDATE_AVATAR / UPDATE_DESC / FORBID_SPEAK / FORBID_INVITE / VERIFY / TROUBLE_FREE`

### 5.4 通知 dtype（`new notify.dtype` → 会话 id）

| dtype | 会话 id | 类型 |
| --- | --- | --- |
| 0 | `post` | 动态 |
| 1 | `system` | 系统 |
| 2 | `calendar` | 日程 |
| 3 | `task` | 任务 |
| 4 | `knowledge` | 知识 |
| 5 | `hr` | 人事 |
| 6 | `worksheet` | 应用 |
| 7 | `workflow` | 工作流 |

---

## 6. 发送与接收时序（人员消息）

```
客户端                                  服务端
  |  emit 'send message' {waitingid,...}   |
  | -------------------------------------> |
  |                                        | 落库，生成 id/time
  | <------------------------------------- | ack(err, {id, socket{time,...}})
  |  用 waitingid 替换本地消息，回填时间    |
  |                                        |
  | <------------------------------------- | emit 'new message'（多端/对方）
  |  按 peerId 追加气泡、更新未读与摘要     |
```

要点：

1. 先本地插入（`sending=true`），收到 ack 再改为服务端 `id/time`；ack 失败置 `failed=true`，可重发。
2. `new message` 与 ack 可能同时到达，**按 `id` 去重**。
3. 未读数 = 非自己、且该会话不是当前会话时 +1；打开会话时发 `clear unread`。
4. 会话摘要格式：自己发 `我: xxx`，别人发 `姓名: xxx`；`file-transfer` 会话例外，不加前缀。

---

## 7. 重连语义

| 触发 | 处理 |
| --- | --- |
| `disconnect` | 状态置「重连中」；`navigator.onLine === false` 时置「失败」 |
| `reconnecting` | 可临时把 transports 降级为 `['polling']` |
| `reconnect` | 重新拉取会话列表与当前会话历史；重发 `current chat` |
| `reconnect_failed` | 置「连接失败」，提示刷新 |
| `error`（parser error） | 忽略 |
| `logout message` | 会话失效，跳转登录 |

---

## 8. 实现约定（与服务端无关的通用约束）

1. `time` 均为服务端本地时区的 `YYYY-MM-DD HH:mm:ss.SSS`，客户端只做展示格式化。
2. `msg.con` 可能含 HTML 实体，展示前需解码；渲染时必须转义/白名单，防 XSS。
3. 群消息气泡需展示发送人（`uname`/`logo`），人员消息可省略发送人。
4. 历史接口按时间**倒序**返回，渲染前先 `reverse()`；上滑翻页用 `sincetime`。
5. 撤回不删除消息行，只置 `iswd=true` 并改写文案。
6. 连接实例全局唯一，重复创建会导致重复推送。
