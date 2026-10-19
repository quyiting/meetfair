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
  async function buttons(room, activeSection = 'places', batches = 0) {
    stored = [room]
    const p = { ...global.definition, roomId: room.id, data: JSON.parse(JSON.stringify(global.definition.data)), setData(v) { Object.assign(this.data, v) } }
    await p.loadRoom(true)
    p.data.activeSection = activeSection
    for (let i = 0; i < batches; i++) p.loadMoreRecommendations()
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
    const visible = []
    for (const section of ['places', 'time', 'members']) visible.push(...await buttons(room, section))
    if (count) assert(visible.some((b) => b.bindtap === 'openAvailabilityModal'), `${count} 人已答复后仍须有时间编辑入口`)
    const ended = []
    for (const section of ['places', 'time', 'members']) ended.push(...await buttons({ ...room, endedAt: 1 }, section))
    assert(ended.some((b) => b.bindtap === 'navigateFinalVenue'), `${count} 人已结束仍须能导航到最终地点`)
    const writes = ['openAvailabilityModal', 'openJoinModal', 'openEditMember', 'refreshNearby', 'confirmSelectedVenue', 'toggleVote', 'chooseNominationLocation', 'submitAttendance', 'endCurrentRoom']
    assert(!ended.some((b) => writes.includes(b.bindtap)), `${count} 人已结束必须隐藏协商按钮`)
  }
  const preview = await buttons({ ...base, preview: true, memberCount: 4, currentMemberId: '', currentUserIsOwner: false, endedAt: 1 })
  assert(!preview.some((b) => ['repeatRoom', 'endCurrentRoom', 'openJoinModal'].includes(b.bindtap)))
  const browsing = { ...base, members: ['self', 'friend'].map((id) => ({ id, name: id, latitude: 31, longitude: 121 })),
    venues: Array.from({ length: 19 }, (_, i) => ({ id: 'v' + i, name: '公共地点' + i, category: 'food', latitude: 31 + i / 1000, longitude: 121 })) }
  const places = await buttons(browsing)
  assert.strictEqual(places.filter((b) => b.catchtap === 'openPlace').length, 8, '只渲染首批八个详情入口')
  assert(places.some((b) => b.bindtap === 'loadMoreRecommendations'))
  const secondBatch = await buttons(browsing, 'places', 1)
  assert.strictEqual(secondBatch.filter((b) => b.catchtap === 'openPlace').length, 16)
  const lastBatch = await buttons(browsing, 'places', 2)
  assert.strictEqual(lastBatch.filter((b) => b.catchtap === 'openPlace').length, 19)
  assert(!lastBatch.some((b) => b.bindtap === 'loadMoreRecommendations'), '全部展开后隐藏查看更多')
  assert(!places.some((b) => b.bindtap === 'endCurrentRoom'), '管理操作放到成员标签')
  const times = await buttons(browsing, 'time')
  assert(times.some((b) => b.bindtap === 'openAvailabilityModal'))
  assert(!times.some((b) => b.catchtap === 'openPlace'), '时间标签不渲染地点列表')
  const memberButtons = await buttons(browsing, 'members')
  assert(memberButtons.some((b) => b.bindtap === 'openEditMember'))
  assert(memberButtons.some((b) => b.bindtap === 'endCurrentRoom'))
  require('../miniprogram/pages/place/place')
  const renderPlace = context.$gwx('pages/place/place.wxml')
  const route = { id: '0', minutes: 25, distanceKm: 5.2, geometryComplete: true,
    segments: [{ mode: 'walking', label: '步行到车站', points: [{ latitude: 30, longitude: 120 }, { latitude: 30.1, longitude: 120.1 }] }] }
  for (const state of ['idle', 'loading', 'ready', 'error']) {
    const data = { ...global.definition.data, room: { endedAt: 1 }, venue: { latitude: 30, longitude: 120, travel: [] },
      canPreviewRoute: true, routeOpened: state !== 'idle', routeStatus: state, routeError: '请稍后重试',
      routes: [route, { ...route, id: '1' }], selectedRoute: state === 'ready' ? route : null }
    const nodes = []
    function walk(node) { if (!node || typeof node !== 'object') return; nodes.push(node); (node.children || []).forEach(walk) }
    walk(renderPlace(data, {}))
    const actions = nodes.filter((n) => n.tag === 'wx-button').map((n) => n.attr || {})
    assert(actions.some((a) => a.bindtap === 'openNavigation'), '路线任何状态均保留导航入口')
    assert(!actions.some((a) => a.bindtap === 'toggleVote'), '结束后路线可查看但不投票')
    if (state === 'idle' || state === 'error') assert(actions.some((a) => a.bindtap === 'previewMyRoute'))
    if (state === 'loading') assert(actions.filter((a) => a.bindtap === 'selectRouteMode').every((a) => a.disabled))
    if (state === 'ready') assert.strictEqual(actions.filter((a) => a.bindtap === 'selectRoute').length, 2)
  }
  console.log('native templates: 4 pages compiled; 0/1/2/8-member + ended + preview render passed')
  console.log('native route preview: idle/loading/ready/error + ended navigation render passed')
}
run().catch((e) => { console.error(e); process.exitCode = 1 })
