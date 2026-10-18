# Room Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. 用户已选择 A：当前会话直接串行实施，不分派实现任务；最终一次只读独立审查。

**Goal:** 首页区分方案状态和个人待办，房主可手动结束，并安全再次组织。

**Architecture:** endedAt 是不可逆的只读边界，服务端事务拒绝所有协商写操作；查看、退出和删除维持原权限。再约一次通过白名单预填普通建房页，不克隆旧房间。

**Tech Stack:** 原生微信小程序、现有本地记录、CloudBase、Node.js assert；无新服务。

**Spec:** [room-management](../specs/2026-10-15-room-management-design.md)。依赖 TS、FC、VN。

## Global Constraints

- 由房主手动结束；结束不等于删除位置，原 TTL 不变。
- 共享状态与个人待办分离，同一房间可匹配待填写和已确定。
- 再约一次只复用活动白名单，日期默认今天；取消不建房，不复制任何成员信息。
- 不新增跨设备历史找回，不提交 Git。

## Review Focus

1. 结束前发出的旧写请求结束后才进入事务：RM1。
2. 结束后仍须允许成员删除自身位置：RM1。
3. 已确定但当前人未答复，不可误标为未确定：RM2。
4. 原房间已过去日期不能被原样带入再约一次：RM4。
5. 未加入者不能从已结束摘要获取坐标或意向：RM1、RM3。

---

### RM1：结束事务及所有写操作的结束检查

**Files:** 新增 `cloudfunctions/roomService/lifecycle.js`、`tests/room-lifecycle.test.js`；修改 `cloudfunctions/roomService/index.js`、`tests/room-concurrency.test.js`。

**Interfaces:** `assertRoomEditable(doc)` 在事务读后校验有效期和 endedAt；云 action `endRoom` 只接收 code，已结束则返回原 endedAt。只读预览允许增加 endedAt，不扩大其他字段。

- [ ] 失败测试房主可结束、普通成员／未加入者不可、重复结束同一时间戳；模拟结束与旧请求并发，旧请求不能写入。
- [ ] `node tests/room-lifecycle.test.js` 确认失败；实现 endRoom 事务和所有协商写入的事务内 guard：join、issueClaimCode、updateMember、updateAvailability、toggleVote、setVenues、setMeetingTime、setFinalVenue、setAttendance、nominateVenue、removeNomination、setNominationRoutes。
- [ ] 逐 action 参数化测试结束后拒绝；get、leave、delete 继续原权限，leave 清理位置和身份；预览仍不含成员、路线、坐标或意向。
- [ ] `node tests/room-lifecycle.test.js`、`node tests/room-concurrency.test.js`、`node tests/claim.test.js` 通过。

### RM2：首页共享状态和个人待办筛选

**Files:** 修改 `miniprogram/utils/room-state.js`、`miniprogram/pages/index/index.js`、`index.wxml`、`index.wxss`、`tests/room-state.test.js`。

**Interfaces:** `getRoomState(room)` 返回 `{ status: 'deciding'|'confirmed'|'ended', needsInput: boolean }`；复用 FC2 的完整方案判断和 TS1 的全部日期答复判断。首页增加 selectedFilter，状态只依据本机最近同步记录。

- [ ] 失败测试最终方案齐全但未答复时 status=confirmed 且 needsInput=true；endedAt 优先且不再待办；旧房间缺新字段不报错；未加入预览不读取成员坐标。
- [ ] `node tests/room-state.test.js` 确认失败；实现筛选全部／待填写／待决定／已确定／已结束及共享、个人双标签，不将筛选误作互斥生命周期。
- [ ] 测试通过，模拟器检查空筛选结果及返回首页后状态刷新；文案说明缓存状态以打开房间为准。

### RM3：结束只读界面和再次组织入口

**Files:** 修改 `miniprogram/utils/store.js`、`miniprogram/pages/room/room.js`、`room.wxml`、`miniprogram/pages/place/place.js`；新增 `tests/room-management-page.test.js`。

**Interfaces:** `endRoom(roomId)` 成功后保存服务端返回；页面 `endCurrentRoom()` 二次确认，`repeatRoom()` 导航 `/pages/create/create?repeatFrom=<本机房间ID>`。place 的投票也检查结束，导航不受影响。

- [ ] 失败测试取消结束不发请求；成员看不到结束按钮；确认后停止协商按钮，保留导航、复制、再约一次、退出／删除。预览只读，无敏感信息。
- [ ] `node tests/room-management-page.test.js` 确认失败；实现页面和 store，事件处理器也防止 endedAt 后写入，不仅隐藏 UI。
- [ ] 测试通过；模拟器验证结束确认文案明确“仍按原期限删除位置”，表单已打开后收到结束信号不得继续保存；结束后未加入者不能加入。

### RM4：安全预填与独立建房

**Files:** 修改 `miniprogram/pages/create/create.js`、`miniprogram/utils/room-state.js`、`tests/create-room-first.test.js`；新增 `tests/repeat-room.test.js`；修改 `README.md`。

**Interfaces:** `buildRepeatDraft(room, today)` 只返回 title/category/preferenceText/expectedMemberCount/durationMinutes/retentionHours/meetingTime 及 candidateDates=[today]、meetingDate=today；create.onLoad 读取 repeatFrom，校验本机访问身份，只应用白名单。

- [ ] 失败测试源对象放入成员、坐标、绑定、信号、投票、提名、意向、finalVenue、endedAt、旧 ID 和过期时间，断言草稿及新 create payload 都无这些信息；旧日期被今天替代。
- [ ] `node tests/repeat-room.test.js` 确认失败；实施预填，保留普通创建的空成员、云成功才进入、失败重试同一新 ID。取消不创建，新建成功后源对象完全不变。
- [ ] `node tests/repeat-room.test.js`、`node tests/create-room-first.test.js` 和 `npm test` 全部通过；`git diff --check` 和修改 JS 的 `node --check` 通过。
- [ ] 开发者工具按 `tasks/plan.md` 的 7 条场景串联验收，分别记录模拟器、云函数部署、云端和真机结果；README 更新实际完成行为。不提交或推送 Git。
