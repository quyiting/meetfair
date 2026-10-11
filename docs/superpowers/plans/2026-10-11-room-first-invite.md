# 先建房后收集位置 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 发起人无须提供任何位置即可创建并分享 6 位码云端房间，成员各自加入并提交位置，第二人加入后自动尝试首次推荐。

**Architecture:** 新房间使用 `schemaVersion: 2`、空 `members` 和独立 `owner` 身份；旧房间沿用既有数据模型。建房与地点搜索拆开：云端建房成功后才能进入可分享房间，第二位加入者触发一次搜索，后续变化由已加入成员按需更新。

**Tech Stack:** 原生微信小程序 JavaScript、微信云函数 `wx-server-sdk`、Node.js 20 内置 `assert` 测试。

**Spec:** `docs/superpowers/specs/2026-10-11-room-first-invite-design.md`

## Global Constraints

- 本次仅修改当前工作区；用户要求改完暂不提交 Git，不创建提交或推送。
- 新房间只有云端创建成功才保存本地并允许分享；旧本地长码仍能打开。
- 创建时允许零成员、零地点；推荐至少需要两名已提交合法位置的成员，成员上限仍为 8。
- 只有发起人和已绑定成员能更新新房间推荐；旧房间仍仅发起人能更新；非成员预览不得返回坐标。
- 首次达到两人时由第二位加入者自动尝试一次；此后成员变化只标记待更新，任何已加入成员可手动更新。
- 复用现有地图云函数、推荐算法和小程序分享路径；不新增第三方依赖、不更改云数据库集合。

## Review Focus

- 朋友先于发起人提交位置：发起人的 `viewerMemberId` 必须仍为空，不能变成朋友的成员 ID；Task 1 测试。
- 创建请求重试或云端失败：同一客户端房间 ID 只生成一个码，失败不留本地伪云房间；Task 1、2 测试。
- 第二人与第三人接近同时加入：过期版本的搜索结果不能覆盖新成员数据；Task 3、4 测试。
- 地图搜索失败、限流或返回空数组：加入身份保留，并可从房间重试；Task 4 测试。
- 未加入者或旧房间普通成员发起地点更新：服务端应拒绝，且预览响应不泄露成员坐标；Task 1、3 测试。

---

### Task 1: 云端支持空房间和未加入的发起人

**Files:**
- Modify: `cloudfunctions/roomService/index.js`
- Test: `tests/claim.test.js`

**Interfaces:**
- Consumes: 现有 `roomService.main({ action: 'create' | 'get' | 'join', ... })` 和 `memberBindings`。
- Produces: `create` 接受 `room.schemaVersion === 2` 且 `members: []`、`venues: []`；返回 `viewerMemberId: ''`、`isOwner: true`；`get` 对未加入的发起人返回完整房间，对其他未加入者仍返回预览。

- [ ] **Step 1: 写失败测试。** 在 `tests/claim.test.js` 用 `schemaVersion: 2`、零成员、零地点创建房间；断言 `created.room.members.length === 0`、`created.viewerMemberId === ''`、`created.signalId` 非空，重复创建的 `code === created.code`。朋友先 `join` 后断言发起人的 `get.viewerMemberId === ''`，发起人自行 `join` 得到不同成员 ID；其他未加入者的 `get.room.preview === true` 且响应 JSON 不包含 `latitude`。另测发起人未加入也能删除；旧房间断言保持不变。
- [ ] **Step 2: 运行 `node tests/claim.test.js`。** 预期新增空房间创建或身份断言失败。
- [ ] **Step 3: 修改 `roomService.createRoom(room, openid)`、`getViewerMemberId(doc, openid)` 和 `main` 的 `create/get` 分支。** 仅 `schemaVersion: 2` 允许空成员；保存 `memberBindings: []` 和 owner 信号；旧房间发起人首成员回退仅在非 v2 生效；`get` 对 owner 可返回完整房间和空成员身份，其他非成员保持预览。为 v2 创建请求校验日期时间格式，旧格式创建行为不变。
- [ ] **Step 4: 再运行 `node tests/claim.test.js`。** 预期新旧房间身份、幂等与预览测试均通过。

### Task 2: 创建页先创建云端房间，不再预填成员

**Files:**
- Modify: `miniprogram/pages/create/create.js`
- Modify: `miniprogram/pages/create/create.wxml`
- Modify: `miniprogram/pages/create/create.wxss`
- Modify: `miniprogram/utils/store.js`
- Create: `tests/create-room-first.test.js`
- Modify: `package.json`

**Interfaces:**
- Consumes: Task 1 的 v2 `roomService.create` 请求/响应。
- Produces: `cloudCreateRoomStrict(room)` → `Promise<Room>`，云端成功后写本地并返回包含 `cloudId` 的房间；失败时拒绝 Promise 且不写本地。旧 `cloudCreateRoom(room)` 维持供旧本地房间重试同步。

- [ ] **Step 1: 写失败测试。** `tests/create-room-first.test.js` 模拟小程序页面：默认创建时断言云端请求的 `room.schemaVersion === 2`、`room.members` 和 `room.venues` 均为空；成功时 `getRooms().length === 1` 且跳转房间；失败时 `getRooms().length === 0`、没有跳转、没有地点搜索请求。加入 `npm test`。
- [ ] **Step 2: 运行 `node tests/create-room-first.test.js`。** 预期当前“至少添加 1 位朋友”校验导致失败。
- [ ] **Step 3: 实现 `cloudCreateRoomStrict(room)` 并改创建页。** 保留标题、类别、时间、可选偏好、保留期限；删除成员表单、地图调用和本地回退路径；按钮文案改为“创建聚会并邀请”；请求成功后进入房间，失败保留表单并展示 `cloudErrorText(error)`。
- [ ] **Step 4: 运行 `node tests/create-room-first.test.js`、`node tests/store.test.js`。** 预期均通过，旧长码编解码行为不变。

### Task 3: 新房间允许已加入成员更新推荐

**Files:**
- Modify: `cloudfunctions/roomService/index.js`
- Test: `tests/room-concurrency.test.js`

**Interfaces:**
- Consumes: Task 1 的 `schemaVersion: 2`、成员绑定和现有 `setVenues` 请求字段 `memberRevision`、`meetingTime`、`venues`、`routeMatrix`。
- Produces: v2 房间仅 owner 或绑定成员且 `members.length >= 2` 可 `setVenues`；旧房间仍仅 owner 可更新；原有过期版本和时间校验不变。

- [ ] **Step 1: 写失败测试。** 在 `tests/room-concurrency.test.js` 构造 v2 双成员房间：绑定普通成员的 `setVenues.ok === true`；未加入者、一名成员的 v2 房间、旧房间普通成员以及过期 `memberRevision` 的 `setVenues.ok === false`。
- [ ] **Step 2: 运行 `node tests/room-concurrency.test.js`。** 预期 v2 普通成员更新断言失败。
- [ ] **Step 3: 只调整 `roomService.main` 的 `setVenues` 授权和双成员检查。** 事务前后都以云端文档的 owner/绑定为准，不能信任客户端传入的成员 ID；保留数据、版本与时间验证。
- [ ] **Step 4: 再运行 `node tests/room-concurrency.test.js`。** 预期新授权与旧房间回归测试通过。

### Task 4: 房间等待、链接邀请和首次自动推荐

**Files:**
- Modify: `miniprogram/pages/room/room.js`
- Modify: `miniprogram/pages/room/room.wxml`
- Modify: `miniprogram/pages/room/room.wxss`
- Modify: `miniprogram/pages/index/index.wxml`
- Test: `tests/room-preview.test.js`
- Create: `tests/room-first-flow.test.js`
- Modify: `package.json`
- Modify: `README.md`

**Interfaces:**
- Consumes: Task 2 的空成员本地房间、Task 3 的 v2 成员更新权限、现有 `getNearbyVenues`/`getRouteMatrix`/`cloudSetVenues`。
- Produces: `room.js` 的 `loadRoom(localOnly)` 对 v2 的 0～1 人进入等待状态，`refreshNearby()` 在不足两人时直接返回；`submitJoin()` 在新房间由第 2 人加入成功后调用一次 `refreshNearby()`；房间的 `onShareAppMessage()` 继续输出 `/pages/room/room?id=<cloudId>`。

- [ ] **Step 1: 写失败测试。** 扩展 `tests/room-preview.test.js`：未加入发起人的完整空房间满足 `page.data.isMember === false`。新建 `tests/room-first-flow.test.js`：0～1 人时 `point === null`、`markers.length === 0`、搜索调用次数为 0；`onShareAppMessage().path === '/pages/room/room?id=ABC234'`；第二人加入后搜索次数为 1，失败时本地成员仍为 2 且能手动重试；第三人加入或编辑成员不增加自动搜索次数；过期版本返回错误后旧地点不落库。加入 `npm test`。
- [ ] **Step 2: 运行 `node tests/room-preview.test.js` 和 `node tests/room-first-flow.test.js`。** 预期新增等待状态和自动搜索断言失败。
- [ ] **Step 3: 实现 v2 等待与推荐流程。** 房间页复用加入表单，给未加入发起人和预览访客分别显示“填写我的位置”；0～1 人隐藏地图、地点列表和时间建议，显示人数进度与可见的 `open-type="share"` 按钮；两人后由已加入成员显示生成/更新入口；移除 v2 发起人因成员变化而自动刷新地点的旧行为；第二人加入成功后启动首次搜索，失败仅提示并保留可重试入口。旧房间页面行为不变。
- [ ] **Step 4: 更新首页引导与 README。** 首页强调“先创建并分享，成员自己提交位置”，文档说明云端建房、推荐触发规则与旧长码兼容。
- [ ] **Step 5: 运行 `node tests/room-preview.test.js`、`node tests/room-first-flow.test.js`、`npm test`。** 预期全部通过。

### Task 5: 全量验证与交付

**Files:** 无额外产品代码文件；只修复前四项验证发现的范围内问题。

**Interfaces:** 保持 Task 1～4 的数据契约和旧房间兼容。

- [ ] **Step 1: 运行 `npm test`。** 预期退出码 0；测试中用于验证拒绝路径的错误日志不算失败。
- [ ] **Step 2: 运行 `find miniprogram cloudfunctions tests -name '*.js' -print0 | xargs -0 -n1 node --check`。** 预期退出码 0。
- [ ] **Step 3: 运行 `git diff --check` 并检查 `git status --short`。** 预期无格式错误，改动仅涉及本计划文件；保留全部改动为未提交状态。
- [ ] **Step 4: 交付时明确说明云函数 `roomService` 需重新部署，微信开发者工具及两台真机的分享、授权和推荐链路尚需用户验收；不要把本地测试表述为真机通过。**
