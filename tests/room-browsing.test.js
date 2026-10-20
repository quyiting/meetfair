const assert = require('assert')
let stored = [], cloudCalls = 0, scrollTarget = ''
global.wx = { getStorageSync: () => stored, setStorageSync: (_, v) => { stored = v },
  cloud: { callFunction() { cloudCalls++ } }, pageScrollTo({ selector }) { scrollTarget = selector } }
global.Page = (p) => { global.definition = p }
require('../miniprogram/pages/room/room')
const date = '2099-10-20'
const members = ['self', 'friend'].map((id) => ({ id, name: id, latitude: 30, longitude: 120, transport: 'walking', availabilityByDate: { [date]: [] } }))
const venues = Array.from({ length: 19 }, (_, i) => ({ id: 'v' + i, name: '公共地点' + i,
  latitude: 30 + i / 1000, longitude: 120, category: i < 10 ? 'food' : 'coffee', address: '公共测试地址' }))
async function run() {
  stored = [{ id: 'browse-room', schemaVersion: 2, meetingDate: date, meetingTime: '18:30', category: 'food', members,
    venues, currentMemberId: 'self', currentUserIsOwner: true, votes: { v0: ['self'] } }]
  const p = { ...global.definition, roomId: 'browse-room', data: JSON.parse(JSON.stringify(global.definition.data)),
    setData(v, callback) { Object.assign(this.data, v); if (callback) callback() } }
  await p.loadRoom(true)
  assert(Array.isArray(p.data.visibleRecommendations), '提供分批展示的候选列表')
  assert.strictEqual(p.data.visibleRecommendations.length, 8, '首屏不能渲染全部候选')
  assert.strictEqual(p.data.recommendations.length, 19)
  const rank = p.data.recommendations.map((v) => v.id)
  p.loadMoreRecommendations()
  assert.deepStrictEqual(p.data.visibleRecommendations.map((v) => v.id), rank.slice(0, 16), '分批展示保持全局排序')
  p.selectVenue({ currentTarget: { dataset: { id: rank[12] } } })
  await p.loadRoom(true)
  assert.strictEqual(p.data.visibleRecommendations.length, 16, '投票或重新同步不应收起已展开列表')
  assert.strictEqual(p.data.selectedVenueId, rank[12])
  p.selectSection({ currentTarget: { dataset: { id: 'time' } } })
  p.selectSection({ currentTarget: { dataset: { id: 'members' } } })
  p.selectSection({ currentTarget: { dataset: { id: 'places' } } })
  assert.strictEqual(p.data.visibleRecommendations.length, 16)
  assert.strictEqual(p.data.selectedVenueId, rank[12], '切换标签保留选中地点')
  p.loadMoreRecommendations(); p.loadMoreRecommendations()
  assert.strictEqual(p.data.visibleRecommendations.length, 19, '尾批不能重复或超过总数')
  await p.selectGoal({ currentTarget: { dataset: { id: 'total' } } })
  assert.strictEqual(p.data.visibleRecommendations.length, 8, '更换排序回到首批')
  assert.strictEqual(p.data.selectedVenueId, rank[12], '排序不撤销选中')
  assert.strictEqual(p.data.visibleRecommendations[0].metricLabel, '全员总通勤')
  await p.selectCategory({ currentTarget: { dataset: { id: 'coffee' } } })
  assert.strictEqual(p.data.recommendations.length, 9)
  assert.strictEqual(p.data.visibleRecommendations.length, 8)
  assert(p.data.visibleRecommendations.every((v) => v.category === 'coffee'))
  assert.strictEqual(p.data.visibleRecommendations[0].estimateLabel, '含估算')
  assert.strictEqual(stored[0].votes.v0[0], 'self', '浏览筛选不改变共享投票')
  p.data.collectionProgress.nextAction = 'recommendations'
  p.data.activeSection = 'members'
  p.followProgressAction()
  assert.strictEqual(p.data.activeSection, 'places', '快捷跳转需先显示目标标签')
  assert.strictEqual(scrollTarget, '#recommendations-section')
  assert.strictEqual(cloudCalls, 0, '展开列表与切换标签不得查询地图或写入云端')
  stored[0].venues = []
  await p.loadRoom(true)
  assert.deepStrictEqual(p.data.visibleRecommendations, [], '清空候选不能残留上一批')
  assert.strictEqual(p.data.selectedVenueId, '')
  console.log('room browsing tests: ok')
}
run().catch((e) => { console.error(e); process.exitCode = 1 })
