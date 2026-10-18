# Venue Nominations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. 用户已选择 A：当前会话直接串行实施，不分派实现任务；最终一次只读独立审查。

**Goal:** 成员提名地点进入统一比较与投票，并在推荐刷新时保留。

**Architecture:** 提名单独持久化，地图搜索仅更新自动候选；前后端各自使用部署边界内的候选合并函数。先保存提名，再计算路线；无路线保留估算，不撤销成功提名。

**Tech Stack:** 微信地图选点、现有地图云函数、CloudBase、Node.js assert；无新增供应商／依赖。

**Spec:** [venue-nominations](../specs/2026-10-15-venue-nominations-design.md)。按 TS、FC 完成后执行。

## Global Constraints

- 最多 8 个提名，总候选最多 100，优先保留提名；同规范化名称且 30 米内视为重复。
- 身份和提名 ID 由服务端决定；非提名者／房主不能删除；最终地点不能直接删除。
- 不伪造价格、评分或营业时间；不提交 Git；不修改真实聚会作验收。

## Review Focus

1. 同品牌不同分店不能仅按名称合并：VN1。
2. 请求传入 source/manual 或伪造 proposer 不能覆盖他人：VN1。
3. 地图选点取消、失败和云保存失败不能留下本地幽灵候选：VN3。
4. 刷新开始后新提名仍应保留，投票不应回滚：VN1、VN4。
5. 超过一屏候选时，手动提名不可被数量裁剪丢弃：VN2。

---

### VN1：服务端提名和删除权限

**Files:** 新增 `cloudfunctions/roomService/nominations.js`、`tests/nominations.test.js`；修改 `cloudfunctions/roomService/index.js`、`tests/room-concurrency.test.js`。

**Interfaces:** 后端 `getCandidates(room)` 返回去重、总数不超过 100 的候选视图；`nominateVenue` 输入 code/venue；`removeNomination` 输入 code/venueId。独立保存 nominatedVenues，服务端生成 manual 前缀 ID、提名成员 ID、source='manual' 和未知价格／评分。

- [ ] 失败测试：1 人可提名，重复名字 30 米内返回原 ID；同品牌距离 1 公里保留两店；8 个以外新提名拒绝；客户端伪造 ID/proposer/rating 无法生效。
- [ ] `node tests/nominations.test.js` 确认失败，实施坐标、名称、类别校验及事务去重、归属检查；默认 nominatedVenues=[]。
- [ ] 测试房主／本人可删未最终选中提名，其他人不可；最终地点删除拒绝；删提名清理其路线／投票；leave 擦除提名者个人标识，保留公共地点由房主管理。
- [ ] 并发提名＋setVenues 后二者均保留；投票和 setFinalVenue 在服务端查询合并视图。运行 `node tests/nominations.test.js`、`node tests/room-concurrency.test.js`。

### VN2：统一候选合并与客户端调用

**Files:** 新增 `miniprogram/utils/candidates.js`、`tests/candidates.test.js`；修改 `miniprogram/utils/recommend.js`、`miniprogram/utils/store.js`、`tests/store.test.js`。

**Interfaces:** `getRoomCandidates(room)` 输出提名优先、ID 去重且最多 100；`nominateVenue(roomId, venue)`、`removeNomination(roomId, venueId)` 保存返回的服务端房间。recommendVenues 和 routeCandidates 都使用合并视图。

- [ ] 失败测试：100 个自动候选＋8 个提名仍输出 100 且 8 个提名全部在；同 ID 不重复；旧无提名房间顺序不变；提名可按原公平目标排序。
- [ ] `node tests/candidates.test.js` 确认失败，实施合并、推荐接入和 store 调用；不扩大地图请求量，不把客户端整份 nominatedVenues 随刷新提交。
- [ ] `node tests/candidates.test.js`、`node tests/recommend.test.js`、`node tests/store.test.js` 通过；保存失败本地不增加候选。

### VN3：提名表单和独立保存

**Files:** 修改 `miniprogram/pages/room/room.js`、`room.wxml`、`room.wxss`；新增 `tests/nominations-page.test.js`。

**Interfaces:** `chooseNominationLocation()` 调用 wx.chooseLocation，仅填本地草稿；`submitNomination()` 确认名称／类别后保存；成功后重载房间，不把获取路线成功作为保存成功的条件。

- [ ] 页面测试地图取消、授权失败、空名称、非法坐标、双击保存和云失败；断言没有新增本地候选，没有把用户未确认的选点发出。
- [ ] `node tests/nominations-page.test.js` 确认失败，再实施等待成员区域也可提名、草稿确认和成员来源标注，删除只显示给有权限者。
- [ ] 测试通过；模拟器验证选择／取消公共地点、确认草稿及保存状态；单人只展示提名内容，不展示多人公平结果。

### VN4：推荐、详情、投票和路线串联

**Files:** 修改 `miniprogram/pages/room/room.js`、`miniprogram/pages/place/place.js`、`cloudfunctions/roomService/index.js`、`tests/nominations-page.test.js`、`tests/room-concurrency.test.js`。

**Interfaces:** room 的最终地点选择、place 的详情和投票定位统一使用候选视图。`setNominationRoutes` 只接受 code/venueId/memberRevision/meetingDate/meetingTime/routes，在事务内核对当前提名及版本，合并而非覆盖其他地点路线。

- [ ] 失败测试：提名成功后路线失败仍可投票、查看、导航、选为最终地点；刷新附近后提名投票不丢；搜索期间新提名不被覆盖。
- [ ] 增加旧日期／成员路线晚到被拒测试；实现只查询提名所需路线并以专用 action 合并，无可用路线继续显示估算。
- [ ] 定向测试和 `npm test` 通过，语法、差异和模板编译通过；模拟器验证提名候选详情、来源及管理按钮。
- [ ] 更新 README，明确手动提名未知价格／评分和估算路线，不提交 Git。
