// 可选本机验收：node tests/native-template.test.js <微信开发者工具 wcc/lib 目录>
// 不进入 npm test，CI 无需安装微信开发者工具。
const assert = require('assert')
const path = require('path')
const vm = require('vm')
const compiler = process.argv[2]
assert(compiler, '请传入本机微信开发者工具的 wcc/lib 目录')
let stored = []
global.wx = { getStorageSync: () => stored, setStorageSync: (_, v) => { stored = v } }
global.Page = (p) => { global.definition = p }
require('../miniprogram/pages/room/room')
const date = '2099-10-20'
const base = { id: 'render', cloudId: 'ABC234', schemaVersion: 2, title: '界面验收', category: 'food',
  meetingDate: date, meetingTime: '18:30', candidateDates: [date], durationMinutes: 120,
  members: [], venues: [], currentMemberId: 'self', currentUserIsOwner: true }
async function run() {
  const cwd = path.join(__dirname, '../miniprogram')
  const pages = ['create', 'room', 'index', 'place']
  const output = await require(path.join(compiler, 'wcc.js'))({ cwd, files: pages.map((p) => `pages/${p}/${p}.wxml`) })
  await require(path.join(compiler, 'wcsc.js'))({ cwd, files: pages.map((p) => `pages/${p}/${p}.wxss`), pageCount: 4 })
  const context = vm.createContext({ window: {}, console })
  vm.runInContext(output, context)
  const render = context.$gwx('pages/room/room.wxml')
  async function buttons(room) {
    stored = [room]
    const p = { ...global.definition, roomId: room.id, data: JSON.parse(JSON.stringify(global.definition.data)), setData(v) { Object.assign(this.data, v) } }
    await p.loadRoom(true)
    const result = []
    function walk(node) {
      if (!node || typeof node !== 'object') return
      if (node.tag === 'wx-button') result.push(node.attr || {})
      ;(node.children || []).forEach(walk)
    }
    walk(render(p.data, {}))
    return result
  }
  for (const count of [0, 1, 2, 8]) {
    const members = Array.from({ length: count }, (_, i) => ({ id: i ? `friend${i}` : 'self', name: '成员', latitude: 31, longitude: 121, availabilityByDate: { [date]: [] } }))
    const room = { ...base, members, currentMemberId: count ? 'self' : '', finalTimeAt: 1, finalVenue: { id: 'v', name: '公共地点' } }
    const visible = await buttons(room)
    if (count) assert(visible.some((b) => b.bindtap === 'openAvailabilityModal'), `${count} 人已答复后仍须有时间编辑入口`)
    const ended = await buttons({ ...room, endedAt: 1 })
    assert(ended.some((b) => b.bindtap === 'navigateFinalVenue'), `${count} 人已结束仍须能导航到最终地点`)
    const writes = ['openAvailabilityModal', 'openJoinModal', 'openEditMember', 'refreshNearby', 'confirmSelectedVenue', 'toggleVote', 'chooseNominationLocation', 'submitAttendance', 'endCurrentRoom']
    assert(!ended.some((b) => writes.includes(b.bindtap)), `${count} 人已结束必须隐藏协商按钮`)
  }
  const preview = await buttons({ ...base, preview: true, memberCount: 4, currentMemberId: '', currentUserIsOwner: false, endedAt: 1 })
  assert(!preview.some((b) => ['repeatRoom', 'endCurrentRoom', 'openJoinModal'].includes(b.bindtap)))
  console.log('native templates: 4 pages compiled; 0/1/2/8-member + ended + preview render passed')
}
run().catch((e) => { console.error(e); process.exitCode = 1 })
