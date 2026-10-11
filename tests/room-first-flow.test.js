const assert = require('assert')
const fs = require('fs')
const path = require('path')

const member = (id, name, latitude) => ({ id, name, shortName: name[0], color: '#3675ff',
  latitude, longitude: 121, locationName: '测试位置', transport: 'transit', budget: 100 })
let stored = []
let searchCalls = 0
let failSearch = true
let failSave = false
let savedVenueCalls = 0
let joinedMembers = []
const toasts = []
global.wx = {
  getStorageSync: () => stored,
  setStorageSync: (key, value) => { stored = value },
  showLoading() {}, hideLoading() {}, showToast(options) { toasts.push(options.title) },
  cloud: {
    callFunction({ name, data, success }) {
      if (name === 'venueService') {
        if (data.action === 'routes') return success({ result: { ok: true, routeMatrix: {} } })
        searchCalls++
        if (failSearch) return success({ result: { ok: false, message: '模拟地图限流' } })
        return success({ result: { ok: true, venues: [{ id: 'place-1', name: '测试餐厅', category: 'food',
          latitude: 31.05, longitude: 121.05, address: '测试地址' }], source: { label: '测试来源' } } })
      }
      assert.strictEqual(name, 'roomService')
      if (data.action === 'join') {
        const autoRecommendNow = joinedMembers.length === 1
        joinedMembers = joinedMembers.concat(member('self', '房主', 31.1))
        return success({ result: { ok: true, code: 'ABC234', viewerMemberId: 'self', isOwner: true,
          autoRecommendNow,
          room: Object.assign({}, stored[0], { members: joinedMembers, memberRevision: joinedMembers.length,
            currentMemberId: undefined }), signalId: 'signal-owner' } })
      }
      if (data.action === 'updateMember') {
        return success({ result: { ok: true, code: 'ABC234', viewerMemberId: 'self', isOwner: true,
          room: Object.assign({}, stored[0], { memberRevision: stored[0].memberRevision + 1,
            members: stored[0].members.map((item) => item.id === 'self'
              ? Object.assign({}, item, data.member, { id: 'self' }) : item) }) } })
      }
      assert.strictEqual(data.action, 'setVenues')
      savedVenueCalls++
      if (failSave) return success({ result: { ok: false, message: '成员已变化，请重新搜索地点' } })
      return success({ result: { ok: true, code: 'ABC234', viewerMemberId: 'self', isOwner: true,
        room: Object.assign({}, stored[0], { venues: data.venues,
          venueMemberRevision: data.memberRevision, venueSource: data.venueSource }) } })
    }
  }
}
global.Page = (definition) => { global.roomPage = definition }
require('../miniprogram/pages/room/room')

function page() {
  return Object.assign({}, global.roomPage, {
    roomId: 'room-v2', data: JSON.parse(JSON.stringify(global.roomPage.data)),
    setData(values, callback) { Object.assign(this.data, values); if (callback) callback() },
    startWatch() {}
  })
}

function room(members) {
  return { id: 'room-v2', cloudId: 'ABC234', schemaVersion: 2, title: '先建房', category: 'food',
    dateText: '2026-10-12 18:30', meetingDate: '2026-10-12', meetingTime: '18:30',
    currentUserIsOwner: true, currentMemberId: '', members, venues: [], routeMatrix: {},
    memberRevision: members.length, venueMemberRevision: 0, votes: {} }
}

function tapInsideDialog(page, dialogIndex, closeHandler) {
  const wxml = fs.readFileSync(path.join(__dirname, '../miniprogram/pages/room/room.wxml'), 'utf8')
  const bindings = Array.from(wxml.matchAll(/<view class="modal-dialog" catchtap="([^"]*)">/g), (match) => match[1])
  const handler = bindings[dialogIndex]
  if (handler) {
    assert.strictEqual(typeof page[handler], 'function', '弹层内容的事件处理器必须存在')
    page[handler]()
  } else {
    page[closeHandler]()
  }
}

async function run() {
  const form = page()
  form.openJoinModal()
  tapInsideDialog(form, 0, 'closeJoinModal')
  assert.strictEqual(form.data.showJoinModal, true, '点击姓名或位置表单不能关闭加入弹窗')
  form.setData({ showAvailabilityModal: true })
  tapInsideDialog(form, 1, 'closeAvailabilityModal')
  assert.strictEqual(form.data.showAvailabilityModal, true, '点击可用时间表单不能关闭弹窗')

  const current = page()
  stored = [room([])]
  await current.loadRoom(true)
  assert.strictEqual(current.data.point, null)
  assert.deepStrictEqual(current.data.markers, [])
  assert.strictEqual(searchCalls, 0)
  assert.strictEqual(current.onShareAppMessage().path, '/pages/room/room?id=ABC234')
  await current.refreshNearby()
  assert.strictEqual(searchCalls, 0, '空房间不应搜索地图')

  joinedMembers = [member('friend', '朋友', 31)]
  stored = [room(joinedMembers)]
  await current.loadRoom(true)
  assert.strictEqual(current.data.point, null)
  assert.strictEqual(searchCalls, 0, '只有一人时不应自动搜索')
  current.setData({ joinName: '房主', joinLatitude: 31.1, joinLongitude: 121,
    joinLocationName: '测试位置' })
  await current.submitJoin()
  assert.strictEqual(stored[0].members.length, 2, '搜索失败不能回滚已加入成员')
  assert.strictEqual(searchCalls, 1, '第二人加入后只尝试一次首次推荐')
  assert(toasts.includes('模拟地图限流'))
  assert.strictEqual(current.data.waitingForMembers, false)

  failSearch = false
  await current.refreshNearby()
  assert.strictEqual(searchCalls, 2)
  assert.strictEqual(stored[0].venues.length, 1)
  assert.strictEqual(savedVenueCalls, 1)

  stored[0].members.push(member('third', '第三人', 31.2))
  stored[0].memberRevision++
  await current.loadRoom(true)
  assert.strictEqual(searchCalls, 2, '第三人加入只标记待更新')
  assert.strictEqual(current.data.recommendationsStale, true)
  const previousVenues = JSON.stringify(stored[0].venues)
  failSave = true
  await current.refreshNearby()
  assert.strictEqual(JSON.stringify(stored[0].venues), previousVenues, '过期版本失败不能在本地留下新地点')
  assert(toasts.some((text) => /成员已变化/.test(text)))

  failSave = false
  joinedMembers = [member('friend', '朋友', 31), member('second', '第二人', 31.1)]
  stored = [room(joinedMembers)]
  const third = page()
  await third.loadRoom(true)
  third.setData({ joinName: '第三人', joinLatitude: 31.2, joinLongitude: 121,
    joinLocationName: '测试位置' })
  const searchBeforeThird = searchCalls
  await third.submitJoin()
  assert.strictEqual(stored[0].members.length, 3)
  assert.strictEqual(searchCalls, searchBeforeThird, '第三人加入不能自动重复搜索')
  third.openEditMember()
  third.setData({ joinName: '已编辑' })
  await third.submitJoin()
  assert.strictEqual(searchCalls, searchBeforeThird, '编辑成员后只标记待更新')
  console.log('room first flow tests: ok')
}

run().catch((error) => { console.error(error); process.exitCode = 1 })
