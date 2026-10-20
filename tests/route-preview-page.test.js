const assert = require('assert')
let stored = [{ id: 'r', category: 'food', meetingDate: '2099-10-20', meetingTime: '18:30', currentMemberId: 'self',
  members: [{ id: 'self', name: '我', latitude: 30.2, longitude: 120.1, transport: 'transit', approximate: true },
    { id: 'friend', name: '朋友', latitude: 30.3, longitude: 120.2, transport: 'walking' }],
  venues: [{ id: 'v', name: '测试公共地点', latitude: 30.4, longitude: 120.3, category: 'food' }] }]
const calls = []
global.wx = { getStorageSync: () => stored, setStorageSync: (_, value) => { stored = value }, setNavigationBarTitle() {},
  cloud: { callFunction(request) { calls.push(request) } }, openLocation() {} }
global.Page = (p) => { global.definition = p }
require('../miniprogram/pages/place/place')
const route = { id: '0', minutes: 25, distanceKm: 5.2, geometryComplete: true,
  segments: [{ mode: 'transit', label: '测试公交', points: [{ latitude: 30.2, longitude: 120.1 }, { latitude: 30.4, longitude: 120.3 }] }] }
const page = () => ({ ...global.definition, data: JSON.parse(JSON.stringify(global.definition.data)), roomId: 'r', venueId: 'v',
  setData(values) { Object.assign(this.data, values) } })
async function run() {
  const p = page()
  p.loadData()
  assert(p.data.canPreviewRoute && p.data.approximateStart)
  assert.strictEqual(calls.length, 0, '打开详情不自动增加路线请求')
  const pending = p.previewMyRoute()
  assert.strictEqual(p.data.routeStatus, 'loading')
  await p.previewMyRoute()
  assert.strictEqual(calls.length, 1, '连续点击合并')
  assert.deepStrictEqual(Object.keys(calls[0].data).sort(), ['action', 'destination', 'mode', 'origin'])
  assert.deepStrictEqual(calls[0].data.origin, { latitude: 30.2, longitude: 120.1 }, '只发送自己的坐标，不附带其他成员信息')
  calls[0].success({ result: { ok: true, provider: 'tencent', routes: [route, { ...route, id: '1', minutes: 30 }] } })
  await pending
  assert.strictEqual(p.data.routeStatus, 'ready')
  assert.strictEqual(p.data.routeSourceLabel, '腾讯位置服务', '展示实际路线数据来源')
  assert.strictEqual(p.data.polylines.length, 1)
  assert.strictEqual(p.data.markers.length, 2, '预览仅显示自身出发点和目的地')
  p.selectRoute({ currentTarget: { dataset: { index: 1 } } })
  assert.strictEqual(p.data.selectedRoute.minutes, 30)
  assert.strictEqual(calls.length, 1, '切换备选方案无需请求地图')
  const walking = p.selectRouteMode({ currentTarget: { dataset: { mode: 'walking' } } })
  calls[1].fail({ errMsg: 'timeout' })
  await walking
  assert.strictEqual(p.data.routeStatus, 'error')
  assert.deepStrictEqual(p.data.polylines, [], '失败后不能留下上一交通方式的路线')
  assert.strictEqual(p.data.selectedRoute, null)
  const outdated = p.previewMyRoute()
  stored[0].members[0].latitude = 30.5
  p.loadData()
  calls[2].success({ result: { ok: true, routes: [route] } })
  await outdated
  assert.strictEqual(p.data.routeStatus, 'idle')
  assert.deepStrictEqual(p.data.polylines, [], '起点改变后拒绝旧结果')
  const closing = p.previewMyRoute()
  p.onUnload()
  calls[3].success({ result: { ok: true, routes: [route] } })
  await closing
  assert.strictEqual(p.data.selectedRoute, null, '离开页面后忽略晚到结果')
  stored[0].currentMemberId = ''
  const visitor = page()
  visitor.loadData()
  await visitor.previewMyRoute()
  assert(!visitor.data.canPreviewRoute)
  assert.strictEqual(calls.length, 4)
  stored = []
  p.loadData()
  assert.strictEqual(p.data.venue, null, '房间不可用时清理旧路线与地点')
  console.log('route preview page tests: ok')
}
run().catch((e) => { console.error(e); process.exitCode = 1 })
