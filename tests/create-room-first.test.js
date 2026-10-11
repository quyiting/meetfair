const assert = require('assert')

let stored = []
let shouldFail = false
let createCalls = 0
let redirect = ''
const requestedIds = []
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
      requestedIds.push(data.room.id)
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
  assert.strictEqual(requestedIds[1], requestedIds[2], '同一表单重试必须沿用相同建房 ID')
  assert.strictEqual(getRooms().length, 1)
  stored = []
  shouldFail = true
  await assert.rejects(cloudCreateRoomStrict({ id: 'direct-fail', members: [], venues: [] }))
  assert.strictEqual(getRooms().length, 0)
  console.log('create room first tests: ok')
}

run().catch((error) => { console.error(error); process.exitCode = 1 })
