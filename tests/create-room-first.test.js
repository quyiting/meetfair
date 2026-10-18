const assert = require('assert')

let stored = []
let shouldFail = false
let createCalls = 0
let redirect = ''
const requestedIds = []
const expectedCounts = []
const toasts = []
global.wx = {
  getStorageSync: () => stored,
  setStorageSync: (key, value) => { stored = value },
  showLoading() {}, hideLoading() {},
  showToast(options) { toasts.push(options.title) },
  redirectTo(options) { redirect = options.url },
  cloud: {
    callFunction({ name, data, success, fail }) {
      assert.strictEqual(name, 'roomService', '建房时不应搜索地点')
      assert.strictEqual(data.action, 'create')
      assert.strictEqual(data.room.schemaVersion, 2)
      assert.deepStrictEqual(data.room.members, [])
      assert.deepStrictEqual(data.room.venues, [])
      assert.strictEqual(data.room.candidateDates[0], data.room.meetingDate)
      assert([60, 120, 180].includes(data.room.durationMinutes))
      if (data.room.id === 'planned-room') {
        assert.strictEqual(data.room.candidateDates.length, 3)
        assert.strictEqual(data.room.durationMinutes, 120)
      }
      requestedIds.push(data.room.id)
      expectedCounts.push(data.room.expectedMemberCount)
      createCalls++
      if (shouldFail) fail({ errMsg: 'network unavailable' })
      else success({ result: { ok: true, code: 'ABC234', room: data.room, viewerMemberId: '', isOwner: true } })
    }
  }
}
global.Page = (definition) => { global.createPage = definition }
const { getRooms, cloudCreateRoomStrict } = require('../miniprogram/utils/store')
require('../miniprogram/pages/create/create')

function page() {
  return Object.assign({}, global.createPage, {
    data: JSON.parse(JSON.stringify(global.createPage.data)),
    setData(values) { Object.assign(this.data, values) }
  })
}

async function run() {
  const first = page()
  await first.createRoom()
  assert.strictEqual(createCalls, 1)
  assert.strictEqual(getRooms().length, 1)
  assert.strictEqual(getRooms()[0].cloudId, 'ABC234')
  assert.strictEqual(getRooms()[0].currentMemberId, '')
  assert.strictEqual(redirect, `/pages/room/room?id=${getRooms()[0].id}`)
  assert.strictEqual(expectedCounts[0], 0, '默认预计人数应为不确定')

  const planned = page()
  planned.addCandidateDate({ detail: { value: '2099-10-20' } })
  planned.addCandidateDate({ detail: { value: '2099-10-21' } })
  planned.selectDuration({ detail: { value: '1' } })
  assert.strictEqual(planned.data.candidateDates.length, 3)
  assert.strictEqual(planned.data.durationMinutes, 120)
  planned.selectExpectedMemberCount({ detail: { value: '4' } })
  planned.pendingRoomId = 'planned-room'
  await planned.createRoom()
  assert.strictEqual(expectedCounts[1], 5, '预计人数应随建房请求保存')
  planned.selectExpectedMemberCount({ detail: { value: '0' } })
  assert.strictEqual(planned.pendingRoomId, '', '修改预计人数后应视作新的建房意图')

  stored = []
  redirect = ''
  shouldFail = true
  const failed = page()
  await failed.createRoom()
  assert.strictEqual(getRooms().length, 0, '云端失败不应留下伪房间')
  assert.strictEqual(redirect, '')
  assert.strictEqual(failed.data.creating, false)
  assert(toasts.some((text) => /网络|云服务/.test(text)))
  shouldFail = false
  await failed.createRoom()
  assert.strictEqual(requestedIds[2], requestedIds[3], '同一表单重试必须沿用相同建房 ID')
  assert.strictEqual(getRooms().length, 1)
  stored = []
  shouldFail = true
  await assert.rejects(cloudCreateRoomStrict({ id: 'direct-fail', members: [], venues: [] }))
  assert.strictEqual(getRooms().length, 0)
  console.log('create room first tests: ok')
}

run().catch((error) => { console.error(error); process.exitCode = 1 })
