const assert = require('assert')
let stored = [{ id: 'r', schemaVersion: 2, cloudId: 'ABC234', title: '测试', category: 'food', meetingDate: '2099-10-20', meetingTime: '18:30',
  members: [{ id: 'self', name: '我' }], venues: [], currentMemberId: 'self' }]
let chooseResult, requests = 0
global.wx = { getStorageSync: () => stored, setStorageSync: (_, v) => { stored = v }, showToast() {},
  chooseLocation({ success, fail }) { chooseResult ? success(chooseResult) : fail({ errMsg: 'cancel' }) }, cloud: {
    callFunction({ success }) { requests++; success({ result: { ok: false, message: '保存失败' } }) }
  } }
global.Page = (p) => { global.definition = p }
require('../miniprogram/pages/room/room')
async function run() {
  const page = { ...global.definition, roomId: 'r', data: JSON.parse(JSON.stringify(global.definition.data)), setData(v) { Object.assign(this.data, v) } }
  await page.loadRoom(true)
  page.chooseNominationLocation()
  assert.strictEqual(page.data.nominationDraft, null)
  chooseResult = { name: '咖啡店', address: '测试路', latitude: 31, longitude: 121 }
  page.chooseNominationLocation()
  assert.strictEqual(requests, 0, '选择位置不应自动保存')
  assert.strictEqual(page.data.nominationDraft.name, '咖啡店')
  await page.submitNomination()
  assert.strictEqual(requests, 1)
  assert(!stored[0].nominatedVenues, '保存失败不能留下幽灵候选')
  assert.strictEqual(page.data.nominationSaving, false)
  page.closeNomination()
  assert.strictEqual(page.data.nominationDraft, null)
  console.log('nominations page tests: ok')
}
run().catch((e) => { console.error(e); process.exitCode = 1 })
