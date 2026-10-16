# Time Scheduling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. 用户已选择 A：当前会话直接串行实施，不分派实现任务；最终一次只读独立审查。

**Goal:** 支持最多 3 个候选日期、1／2／3 小时聚会和逐日期答复。

**Architecture:** 先扩展纯时间计算，再扩展云端事务和既有页面；保留单日期旧接口。新日期键是唯一真相，旧 `availability` 仅作为当前日期镜像；不把旧答复复制到新日期。

**Tech Stack:** 原生微信小程序 JavaScript/WXML/WXSS、CloudBase、Node.js assert；无新增依赖。

**Spec:** [time-scheduling](../specs/2026-10-15-time-scheduling-design.md)，共同约束见 [能力图](../../../CAPABILITY-MAP.md)。

## Global Constraints

- 最多 3 个不重复的候选日期；`durationMinutes` 只取 60、120、180，默认 60。
- 每个日期最多 5 段；缺键为未答复、空数组为没空；不跨午夜。
- 至少两人推荐的规则不改；只有 1 人时也能填写。
- 不新增依赖，不批量迁移旧房间，不提交 Git。唯一进度清单为 `tasks/todo.md`。

## Review Focus

1. 闰日和不存在日期不能只用正则放行：TS2。
2. 重叠的可用时段按并集覆盖时长，同一人不重复计数：TS1。
3. 同一日期“没空”不能被当成未答复或有空：TS4、TS5。
4. 两天同一开始时间不能允许旧搜索覆盖：TS6。
5. 旧空数组不代表用户明确答复了新候选日期：TS2、TS4。

---

### TS1：多日期及时长推荐纯计算

**Files:** 修改 `miniprogram/utils/meeting-time.js`；测试 `tests/time-suggestions.test.js`、新增 `tests/multi-date-time.test.js`。

**Interfaces:** 保留 `recommendMeetingTimes(members, date, preferredTime, travelMinutes = 0, now = new Date(), durationMinutes = 60)`；新增 `getDateAvailability(member, date, legacyDate)` 返回数组或 undefined、`hasAnsweredAllDates(room, member)` 返回布尔值、`recommendRoomTimes(room, travelMinutes = 0, now = new Date())` 返回含 date/start/end/count/responded/total 的最多 3 条建议。

- [ ] 写失败测试：在固定 `now` 下，18:00–21:00 与 19:00–22:00 两人选 120 分钟时，19:00–21:00 计 2 人；180 分钟同一开始时只能计 1 人。两段相接／重叠区间按并集覆盖，只计同一个人一次。
- [ ] `node tests/multi-date-time.test.js`，确认因新接口或时长计算缺失而失败。
- [ ] 实施接口，日期之间独立统计；不跨午夜，当天沿用通勤缓冲。全局按人数、接近期望时间、日期和开始时间稳定排序，同日候选去近邻后最多取 3 条。
- [ ] 测试两个日期、只答一天、明确没空、全部没空及旧单日期；运行 `node tests/time-suggestions.test.js` 和 `node tests/multi-date-time.test.js`，均应通过。

### TS2：云端日程输入契约与旧数据归属

**Files:** 新增 `cloudfunctions/roomService/schedule.js`；修改 `cloudfunctions/roomService/index.js`；新增 `tests/cloud-schedule.test.js`。

**Interfaces:** 后端纯函数 `normalizeSchedule(room, today)` 返回 candidateDates/durationMinutes；`getAvailabilityByDate(member, legacyDate)` 固定旧日期归属；`normalizeDateAvailability(ranges)` 校验单日区间。后端不能 import 小程序目录，部署只依赖自身目录。

- [ ] 失败测试断言候选 4 天、重复日期、2027-02-29、未知时长被拒；旧房间缺字段按单日期／60 分钟读取，旧空数组不伪造“已答复”。测试使用固定时钟避免已有旧日期夹具随真实日期失效。
- [ ] `node tests/cloud-schedule.test.js` 确认失败，再实施校验及 create 的可选字段保存；新带日程字段请求检查日期未过去，旧请求／旧房间兼容读取。
- [ ] 迁移只针对正在修改的当前房间，先绑定旧 availability 到原日期，不批量写库。
- [ ] `node tests/cloud-schedule.test.js`、`node tests/claim.test.js` 通过。

### TS3：建房日期和时长表单

**Files:** 修改 `miniprogram/pages/create/create.js`、`create.wxml`、`create.wxss`、`tests/create-room-first.test.js`。

**Interfaces:** 页面保留 meetingDate/meetingTime，新增 candidateDates、durationMinutes 和选日期／移除日期／选时长事件；create 请求只发送规格允许的活动字段及空成员。

- [ ] 测试捕获 create 请求，断言 3 个日期和 120 分钟进入 payload，默认仍一日期／60 分钟；修改日期／时长清除 pendingRoomId，重试未修改表单保留同一 ID。
- [ ] `node tests/create-room-first.test.js` 确认新断言失败，然后实施选择、去重、最多 3 天及至少保留 1 天的表单交互。
- [ ] 同一测试通过；模拟器打开日期和时长选择器，取消不创建房间；新字段不得破坏预计人数选择。

### TS4：按日期保存个人可用时间

**Files:** 修改 `cloudfunctions/roomService/index.js`、`schedule.js`、`miniprogram/utils/store.js`、`tests/cloud-schedule.test.js`。

**Interfaces:** `updateMyAvailability(roomId, availability, date)`；云 action `updateAvailability` 新增可选 date，仅覆盖该成员该日期键；旧省略 date 的调用仍表示当前日期。

- [ ] 测试先存第一天两段、再存第二天空数组，断言第一天不变，第二天已答复但没空；并发两个成员答复都保留。候选外日期、6 段、跨天及非成员提交均拒绝。
- [ ] `node tests/cloud-schedule.test.js` 确认失败；实现事务内身份、日期校验和按键更新，以及本地旧房间同口径保存，云失败不乐观写本地。
- [ ] 上述测试与 `node tests/store.test.js` 通过；当前日期兼容镜像不覆盖其他日期。

### TS5：房间时间协商和填写进度

**Files:** 修改 `miniprogram/pages/room/room.js`、`room.wxml`、`room.wxss`；新增 `tests/multi-date-page.test.js`；修改 `tests/room-progress.test.js`。

**Interfaces:** 使用 TS1 的三个查询函数；时间弹窗按选中的 availabilityDate 读写草稿，显式“这天没空”保存空数组；建议项含 date，进度必须完成全部候选日期才显示已填写。

- [ ] 页面测试：只填第一天时仍提示补时间；两天明确没空也算完成答复；更换弹窗日期不把上一天未保存草稿误存到新日期；只有一人仍可进入表单。
- [ ] `node tests/multi-date-page.test.js` 确认失败；实施日期切换、草稿、保存防连点、逐日人数、部分参与与全没空空态；不自动为每个日期请求地图。
- [ ] `node tests/multi-date-page.test.js`、`node tests/room-progress.test.js`、`node tests/room-preview.test.js` 通过；模拟器验证日期和时长文案。

### TS6：确定日期及拒绝旧日期搜索

**Files:** 修改 `cloudfunctions/roomService/index.js`、`miniprogram/utils/store.js`、`miniprogram/pages/room/room.js`、`tests/room-concurrency.test.js`、`tests/multi-date-page.test.js`。

**Interfaces:** `setMeetingTime(room, time, date)`；`cloudSetVenues` 发送捕获的 meetingDate，保存 meetingSearchDate；服务端 setMeetingTime 仅允许候选日期，setVenues 核对日期、时间及 memberRevision。

- [ ] 失败测试：旧搜索日期 A/18:30，在确定 B/18:30 后提交被拒；界面确定建议时提交的是该条 date，而非上次选中日期。
- [ ] `node tests/room-concurrency.test.js` 和 `node tests/multi-date-page.test.js` 确认失败；实现切换前旧答复归属固定、旧路线清空、搜索日期版本检查，多日期旧客户端缺日期明确拒绝。
- [ ] 两项测试及 `npm test` 通过；对修改 JS 执行 `node --check`，`git diff --check` 无错误。
- [ ] 微信开发者工具验收建房选日期／时长、单人答复、完整和部分交集、选定日期与旧房间。更新 README 对应行为说明；记录云端尚未部署或尚未联调的部分，不提交 Git。
