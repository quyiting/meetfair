const assert = require('assert')
let stored = [{ id: 'r', schemaVersion: 2, title: '测试', category: 'food', members: [{ id: 'self', name: '自己', availability: [{ start: '18:00', end: '21:00' }] }],
  venues: [], currentMemberId: 'self', meetingDate: '2099-10-20', meetingTime: '18:30', finalTimeAt: 1,
  finalVenue: { id: 'v', name: '地点' }, planRevision: 2, cloudId: 'ABC234' }]
global.wx = { getStorageSync: () => stored, setStorageSync: (_, v) => { stored = v }, showToast() {}, cloud: {
  callFunction({ data, success }) { success({ result: { ok: true, code: 'ABC234', viewerMemberId: 'self', room: {
    ...stored[0], attendanceResponses: [{ memberId: 'self', status: data.status, planRevision: data.planRevision }]
  } } }) }
} }
global.Page = (p) => { global.definition = p }
require('../miniprogram/pages/room/room')
async function run() {
  const page = { ...global.definition, roomId: 'r', data: JSON.parse(JSON.stringify(global.definition.data)), setData(v) { Object.assign(this.data, v) } }
  await page.loadRoom(true)
  assert.strictEqual(page.data.finalPlanComplete, true)
  assert.strictEqual(page.data.collectionProgress.nextAction, 'attendance')
  await page.submitAttendance({ currentTarget: { dataset: { status: 'yes' } } })
  assert.strictEqual(page.data.attendanceSummary.myStatus, 'yes')
  stored[0].planRevision++
  await page.loadRoom(true)
  assert.strictEqual(page.data.attendanceSummary.myStatus, '')
  assert.strictEqual(page.data.planUpdated, true, '方案版本变化应明确提示重新确认')
  stored[0].currentMemberId = ''
  await page.loadRoom(true)
  assert.strictEqual(page.data.isMember, false)
  console.log('attendance page tests: ok')
}
run().catch((e) => { console.error(e); process.exitCode = 1 })
