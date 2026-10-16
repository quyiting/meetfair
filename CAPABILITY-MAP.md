# 聚会协作完善：第 2、3、4、6 项

日期：2026-10-15，更新于 2026-10-16。模块范围、顺序、规格和实施计划已由用户确认；按 A 方式串行实施。开发阶段暂不提交，2026-10-16 用户随后授权完善 README 并提交。

## 目标与约束

在现有原生微信小程序和 CloudBase 房间协作上完善时间协商、方案确认、地点提名、聚会管理。保留第 1 项尚未提交的预计人数与填写进度功能。不接入美团、点评或其他新服务，不增加依赖，不改推荐的公平目标，不自动复制成员位置。

| 稳定模块 ID | 对应项 | 责任 | 依赖 | 规格 |
|---|---|---|---|---|
| time-scheduling | 2 | 多日期、聚会时长、按日期填写可用时间 | 现有房间、成员及填写进度 | [时间协商](docs/superpowers/specs/2026-10-15-time-scheduling-design.md) |
| final-confirmation | 3 | 方案版本、成员参加意向、变更后重新确认 | time-scheduling | [最终确认](docs/superpowers/specs/2026-10-15-final-confirmation-design.md) |
| venue-nominations | 4 | 成员选点提名、参与比较与投票、刷新时保留 | time-scheduling、现有候选地点流程 | [地点提名](docs/superpowers/specs/2026-10-15-venue-nominations-design.md) |
| room-management | 6 | 首页状态、房主结束聚会、再次组织 | 上述三个模块 | [聚会管理](docs/superpowers/specs/2026-10-15-room-management-design.md) |

实施顺序：time-scheduling → final-confirmation → venue-nominations → room-management。先逐模块审阅规格、形成实施计划，再按薄切片开发、测试；全部完成后在已打开的微信开发者工具验收串联流程。

实施计划入口：[执行索引](tasks/plan.md)；任务进度唯一记录在 [任务清单](tasks/todo.md)。本地实施及一次只读终审已完成，实际验收边界见 [验证记录](tasks/verification-2026-10-15.md)。

## 共同技术与代码约定

- `miniprogram/pages/create/`：建房与再次组织的预填表单。
- `miniprogram/pages/room/`：进度、时间、候选、确认和管理交互。
- `miniprogram/pages/place/`：地点详情、投票、导航。
- `miniprogram/pages/index/`：本机聚会记录和状态。
- `miniprogram/utils/store.js`：本地持久化、云函数调用；`meeting-time.js`、`recommend.js`：纯计算。
- `cloudfunctions/roomService/`：可信身份、参数校验、事务、房间信号；不把写库权限开放给小程序端。
- `tests/`：沿用 Node.js `assert`，纯计算直接运行；页面测试只替代微信运行时边界，服务端测试只替代 CloudBase SDK 边界。
- 沿用 CommonJS、两空格、无分号、现有字段命名和页面样式。例如 `return { ok: false, message: '请先加入聚会' }`；服务端根据 OpenID 查成员身份，不能信任客户端提交的成员 ID。

## 通用验收与边界

- 自动化：`npm test`；语法：对改动的每个 JS 文件执行 `node --check <文件路径>`；差异：`git diff --check`。
- 仓库没有独立 `build` 或 `lint` 命令，不编造验证结果。使用本机微信开发者工具编译 WXML/WXSS，并检查模拟器里的实际显示、入口和错误状态。
- 每项先写失败测试，实施后单项回归，再跑全套测试；测试覆盖权限、非法输入、并发与旧房间回退，不删测试来换取通过。
- 任何新增房间字段均为可选；读取旧数据时补默认，不批量改写现存房间。保留旧分享码、预览隐私规则和房间 TTL。
- 日期按中国时间解释，校验真实日历日期，不能只匹配字符串形状。服务端限制日期数、时段数、时长、地点数以及用户可修改的字段。
- 云端写入都在事务中读取当前状态再决定；失败不以本地成功掩盖，不覆盖他人刚完成的操作。
- 不记录真实位置、房间码、OpenID 或密钥到新增日志；不把现有生产聚会改成验收数据。
- 云函数部署、云端联调、模拟器验证、真机验证分开记录。未部署或缺少第二个微信身份时，明确剩余验收，不把本地替身测试说成跨设备成功。
- 不自动部署生产环境、不删除既有聚会，不提交或推送 Git。云端端到端验收涉及部署时，先明确目标环境和测试数据范围。
- 当前选择：复用已有房间和信号，按边界增加小型工具模块；不新建独立日程、聊天或账号系统。避免为四项功能整体重写房间页和存储层。
