const assert = require('assert')

let stored = []
let scrolledTo = ''
global.wx = {
  getStorageSync: () => stored,
  setStorageSync: (key, value) => { stored = value },
  pageScrollTo: ({ selector }) => { scrolledTo = selector }
}
global.Page = (definition) => { global.roomPage = definition }
require('../miniprogram/pages/room/room')
const { updateMyAvailability } = require('../miniprogram/utils/store')

const member = (id, availability = []) => ({ id, name: id, latitude: 31, longitude: 121,
  transport: 'transit', availability })
const room = (members, extra = {}) => Object.assign({
  id: 'progress-room', schemaVersion: 2, title: '聚会', category: 'food',
  meetingDate: '2099-10-20', meetingTime: '18:30', members, venues: [], routeMatrix: {},
  votes: {}, currentUserIsOwner: true, currentMemberId: '', expectedMemberCount: 5
}, extra)

async function run() {
  const page = Object.assign({}, global.roomPage, {
    roomId: 'progress-room', data: JSON.parse(JSON.stringify(global.roomPage.data)),
    setData(values) { Object.assign(this.data, values) }
  })
  stored = [room([])]
  await page.loadRoom(true)
  assert(page.data.collectionProgress, '空房间也应显示填写进度')
  assert.strictEqual(page.data.collectionProgress.locationCount, 0)
  assert.strictEqual(page.data.collectionProgress.expectedCount, 5)
  assert.strictEqual(page.data.collectionProgress.remainingCount, 5)
  assert.strictEqual(page.data.collectionProgress.nextAction, 'join')
  page.followProgressAction()
  assert.strictEqual(page.data.showJoinModal, true, '未填位置的房主应能从进度卡进入加入表单')
  page.closeJoinModal()

  stored = [room([member('self')], { currentMemberId: 'self' })]
  await page.loadRoom(true)
  assert.strictEqual(page.data.collectionProgress.locationCount, 1)
  assert.strictEqual(page.data.collectionProgress.timeCount, 0)
  assert.strictEqual(page.data.collectionProgress.nextAction, 'time')
  page.followProgressAction()
  assert.strictEqual(page.data.showAvailabilityModal, true, '只有一人时也应能填写时间')
  page.closeAvailabilityModal()
  await updateMyAvailability('progress-room', [{ start: '18:00', end: '21:00' }])
  await page.loadRoom(true)
  assert.strictEqual(page.data.collectionProgress.timeCount, 1)
  assert.strictEqual(page.data.collectionProgress.nextAction, 'invite')

  stored[0].members.push(member('friend'))
  await page.loadRoom(true)
  assert.strictEqual(page.data.waitingForMembers, false, '预计五人也不能阻止两人开始推荐')
  assert.strictEqual(page.data.collectionProgress.nextAction, 'recommendations')
  assert.deepStrictEqual(page.data.collectionProgress.members, [
    { id: 'self', name: 'self', timeSubmitted: true },
    { id: 'friend', name: 'friend', timeSubmitted: false }
  ])
  page.followProgressAction()
  assert.strictEqual(scrolledTo, '#recommendations-section')
  assert(!JSON.stringify(page.data.collectionProgress).includes('latitude'), '进度数据不包含坐标')

  stored[0].expectedMemberCount = 2
  stored[0].members.push(member('third'))
  await page.loadRoom(true)
  assert.strictEqual(page.data.collectionProgress.remainingCount, 0, '超过预计人数不能显示负数')
  assert.strictEqual(page.data.collectionProgress.locationCount, 3)

  delete stored[0].expectedMemberCount
  await page.loadRoom(true)
  assert.strictEqual(page.data.collectionProgress.expectedCount, 0, '旧房间应按人数不确定处理')
  assert.strictEqual(page.data.collectionProgress.timeCount, 1)

  stored[0].members[0].availability = []
  delete stored[0].members[0].availabilityByDate
  await page.loadRoom(true)
  assert.strictEqual(page.data.collectionProgress.nextAction, 'time', '清空时间后应重新提示填写')
  stored[0].currentMemberId = ''
  await page.loadRoom(true)
  assert.strictEqual(page.data.collectionProgress.nextAction, 'join', '房主不填位置时不能误认为已加入')

  stored = [room([], { preview: true, memberCount: 3, currentUserIsOwner: false })]
  await page.loadRoom(true)
  assert.strictEqual(page.data.collectionProgress, null, '未加入者不可保留上次成员进度明细')
  console.log('room progress tests: ok')
}

run().catch((error) => { console.error(error); process.exitCode = 1 })
