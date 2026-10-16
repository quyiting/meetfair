# Final Confirmation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. 用户已选择 A：当前会话直接串行实施，不分派实现任务；最终一次只读独立审查。

**Goal:** 成员明确答复是否参加最终方案，方案变化后重新确认。

**Architecture:** 服务端统一维护方案版本，意向绑定 OpenID 对应成员；前端只提交看到的版本，不自行认定写入成功。复用已确定日期／地点和房间信号。

**Tech Stack:** 原生微信小程序、CloudBase 事务、Node.js assert；无新增依赖。

**Spec:** [final-confirmation](../specs/2026-10-15-final-confirmation-design.md)。依赖时间计划 TS1–TS6。

## Global Constraints

- 状态仅 `yes`、`maybe`、`no`；无当前版本记录为未答复，不等同于待定。
- 最终时间和地点齐全才可答复；重复确定同一方案不能清空意向。
- 保留旧字段、预览隐私规则；不做订阅消息；不提交 Git。

## Review Focus

1. 同一时间首次明确确定，与重复确认已有最终时间不同：FC1。
2. 旧浏览器页面对旧方案作答不能算成同意新方案：FC1。
3. 退出成员和旧版本记录不能凑“全员确认”：FC2。
4. 仅刷新附近不改变已确定方案：FC1。
5. 未提交位置的房主有管理权，但不能冒名答复：FC1、FC3。

---

### FC1：最终方案版本和意向事务

**Files:** 新增 `cloudfunctions/roomService/attendance.js`、`tests/attendance.test.js`；修改 `cloudfunctions/roomService/index.js`、`tests/room-concurrency.test.js`。

**Interfaces:** `reviseFinalPlan(room, changes)` 返回更新后的 room，实际方案变化时 planRevision + 1 并清空旧意向；`setAttendance` 输入 code/status/planRevision，服务端成员身份来自绑定。新建默认 planRevision=0、attendanceResponses=[]。

- [ ] 写失败测试：完整方案 revision=2，成员 yes 保存后可改 maybe/no；改地点／日期／时间后 revision=3 且旧意向不计；同方案重复确定不变。
- [ ] `node tests/attendance.test.js` 确认失败；实施版本更新辅助函数，接入 setMeetingTime、setFinalVenue，并在事务内实现 setAttendance。
- [ ] 测试旧版本答复、非成员、未填位置房主、非法状态、未完整最终方案、过期／已结束均拒绝；投票／推荐刷新不改变 revision；并发方案更新与答复不丢版本保护。
- [ ] `node tests/attendance.test.js`、`node tests/room-concurrency.test.js` 通过；leave 清除该成员意向。旧完整方案缺版本按 0 开始，不从投票推断 yes。

### FC2：客户端意向保存与统计

**Files:** 修改 `miniprogram/utils/store.js`；新增 `miniprogram/utils/room-state.js`、`tests/room-state.test.js`、`tests/attendance-client.test.js`。

**Interfaces:** `setMyAttendance(roomId, status, planRevision)` 返回已保存房间；`getAttendanceSummary(room)` 返回 yes/maybe/no/unanswered/myStatus；`isFinalPlanComplete(room)` 统一判断最终地点、最终时间是否明确确定。后续 room-management 复用这些纯函数。

- [ ] 测试当前成员 3 人，1 人当前版本 yes、1 人旧版本 yes、1 名退出者 no，统计为 yes=1、unanswered=2、no=0；缺字段旧房间均未答复。
- [ ] 定向运行 `node tests/room-state.test.js`、`node tests/attendance-client.test.js` 确认失败，实施新请求及统计；仅成功云响应更新本地，失败保留原状态。
- [ ] 两项测试通过，校验 payload 不包含可伪造的其他成员 ID，保存时捕获当前看到的 planRevision。

### FC3：最终方案卡和重新确认提示

**Files:** 修改 `miniprogram/pages/room/room.js`、`room.wxml`、`room.wxss`；新增 `tests/attendance-page.test.js`；修改 `tests/room-progress.test.js`。

**Interfaces:** 页面使用 FC2 的统计；按钮事件 `submitAttendance(event)` 读取 data-status，防重复提交，失败按服务端信息提示并重新读取；未完整／非成员／已结束不显示答复按钮。

- [ ] 页面失败测试：完整方案显示三按钮及未答复数；旧 revision 更新后重新提示；未填位置房主只有管理入口；未完整时显示补全提示。
- [ ] `node tests/attendance-page.test.js` 确认失败，再实施方案卡起止时间、地点、确认人数及各成员意向；进度卡增加当前方案待确认的下一步，不破坏时间补填优先级。
- [ ] 定向测试和 `npm test` 通过，JS 语法与差异检查通过；模拟器打开三选项、保存中／失败状态及变更提示，旧房间正常。
- [ ] 更新 README，记录单身份与双身份验收边界；不提交 Git。
