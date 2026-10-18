const assert = require('assert')
let stored = [{ id: 'r', cloudId: 'ABC234', currentMemberId: 'self', members: [{ id: 'self' }], planRevision: 2 }]
let failed = true, payload
global.wx = { getStorageSync: () => stored, setStorageSync: (_, v) => { stored = v }, cloud: {
  callFunction({ data, success }) {
    payload = data
    success({ result: failed ? { ok: false, message: '方案已更新' } : { ok: true, code: 'ABC234', viewerMemberId: 'self', room: { ...stored[0], attendanceResponses: [{ memberId: 'self', status: 'yes', planRevision: 2 }] } } })
  }
} }
async function run() {
  const { setMyAttendance } = require('../miniprogram/utils/store')
  await assert.rejects(setMyAttendance('r', 'yes', 2))
  assert.strictEqual(stored[0].attendanceResponses, undefined)
  failed = false
  await setMyAttendance('r', 'yes', 2)
  assert.strictEqual(payload.memberId, undefined)
  assert.strictEqual(payload.planRevision, 2)
  assert.strictEqual(stored[0].attendanceResponses[0].status, 'yes')
  console.log('attendance client tests: ok')
}
run().catch((e) => { console.error(e); process.exitCode = 1 })
