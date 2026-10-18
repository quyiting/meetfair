const assert = require('assert')
let stored = [{ id: 'r', title: '聚会', category: 'food', schemaVersion: 2, members: [{ id: 'self' }], venues: [],
  currentMemberId: 'self', currentUserIsOwner: true, meetingDate: '2099-10-20', endedAt: 1 }]
let navigated = '', chosen = 0
global.wx = { getStorageSync: () => stored, setStorageSync: (_, v) => { stored = v },
  navigateTo({ url }) { navigated = url }, showToast() {}, chooseLocation() { chosen++ } }
global.Page = (p) => { global.definition = p }
require('../miniprogram/pages/room/room')
async function run() {
  const page = { ...global.definition, roomId: 'r', data: JSON.parse(JSON.stringify(global.definition.data)), setData(v) { Object.assign(this.data, v) } }
  await page.loadRoom(true)
  page.openAvailabilityModal(); assert.strictEqual(page.data.showAvailabilityModal, false)
  page.openJoinModal(); assert.strictEqual(page.data.showJoinModal, false)
  page.chooseNominationLocation(); assert.strictEqual(chosen, 0)
  page.repeatRoom(); assert.strictEqual(navigated, '/pages/create/create?repeatFrom=r')
  delete require.cache[require.resolve('../miniprogram/pages/create/create')]
  require('../miniprogram/pages/create/create')
  const create = { ...global.definition, data: JSON.parse(JSON.stringify(global.definition.data)), setData(v) { Object.assign(this.data, v) } }
  create.onLoad({ repeatFrom: 'r' })
  assert.strictEqual(create.data.title, '聚会')
  assert.notStrictEqual(create.data.meetingDate, '2099-10-20')
  assert.strictEqual(stored.length, 1, '预填不应创建新房间')
  assert.strictEqual(stored[0].endedAt, 1)
  console.log('room management page tests: ok')
}
run().catch((e) => { console.error(e); process.exitCode = 1 })
