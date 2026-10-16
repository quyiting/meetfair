const assert = require('assert')
let stored
global.wx = { getStorageSync: () => stored, setStorageSync: (_, v) => { stored = v }, showToast() {} }
global.Page = (p) => { global.definition = p }
require('../miniprogram/pages/room/room')
const a = '2099-10-20', b = '2099-10-21'
const room = { id: 'multi', schemaVersion: 2, title: '测试', category: 'food', meetingDate: a, candidateDates: [a, b],
  durationMinutes: 120, meetingTime: '18:30', venues: [], currentMemberId: 'self', currentUserIsOwner: true,
  members: [{ id: 'self', name: '自己', availabilityByDate: { [a]: [{ start: '18:00', end: '21:00' }] } }] }
async function run() {
  stored = [room]
  const page = { ...global.definition, roomId: room.id, data: JSON.parse(JSON.stringify(global.definition.data)), setData(v) { Object.assign(this.data, v) } }
  await page.loadRoom(true)
  assert.strictEqual(page.data.collectionProgress.nextAction, 'time')
  page.openAvailabilityModal()
  assert.strictEqual(page.data.availabilityDate, b, '优先补充尚未答复的日期')
  page.selectAvailabilityDate({ detail: { value: '0' } })
  page.setData({ availabilityDraft: [{ start: '10:00', end: '11:00' }] })
  page.selectAvailabilityDate({ detail: { value: '1' } })
  assert.deepStrictEqual(page.data.availabilityDraft, [])
  await page.markUnavailable()
  assert.strictEqual(stored[0].members[0].availabilityByDate[a][0].start, '18:00')
  assert.deepStrictEqual(stored[0].members[0].availabilityByDate[b], [])
  await page.loadRoom(true)
  assert.strictEqual(page.data.collectionProgress.nextAction, 'invite')
  console.log('multi date page tests: ok')
}
run().catch((e) => { console.error(e); process.exitCode = 1 })
