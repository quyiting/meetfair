const assert = require('assert')
async function run() {
  const venue = { id: 'v', name: '公共地点', category: 'food', latitude: 31, longitude: 121 }
  const h = require('./helpers/room-cloud')({ id: 'r', schemaVersion: 2, meetingDate: '2099-10-20', meetingTime: '18:30',
    members: [{ id: 'self' }, { id: 'friend' }, { id: 'unclaimed' }], venues: [venue], memberRevision: 0 })
  h.as('guest')
  assert(!(await h.call('endRoom')).ok)
  h.as('owner')
  assert((await h.call('endRoom')).ok)
  const endedAt = h.doc.room.endedAt
  assert(endedAt)
  assert((await h.call('endRoom')).ok)
  assert.strictEqual(h.doc.room.endedAt, endedAt)
  for (const action of ['join', 'issueClaimCode', 'updateMember', 'updateAvailability', 'toggleVote', 'setVenues',
    'setMeetingTime', 'setFinalVenue', 'setAttendance', 'nominateVenue', 'removeNomination', 'setNominationRoutes']) {
    const result = await h.call(action, { memberId: 'unclaimed', venueId: 'v', venue,
      availability: [], time: '19:00', status: 'yes', planRevision: 0, venues: [venue],
      memberRevision: 0, meetingDate: '2099-10-20', meetingTime: '18:30' })
    assert.strictEqual(result.ok, false, `${action} 结束后必须拒绝`)
    assert.match(result.message, /已结束/, `${action} 应因结束状态而拒绝，而不是非法参数造成假阳性`)
  }
  assert((await h.call('get')).ok)
  h.as('stranger')
  const preview = await h.call('get')
  assert(preview.room.endedAt)
  assert.deepStrictEqual(preview.room.members, [])
  h.as('guest')
  assert((await h.call('leave')).ok, '结束后仍可退出清除个人数据')
  assert(!h.doc.memberBindings.some((b) => b.openid === 'guest'))
  const racing = require('./helpers/room-cloud')({ id: 'race', schemaVersion: 2, meetingDate: '2099-10-20',
    meetingTime: '18:30', members: [{ id: 'self' }], venues: [] })
  const [end, late] = await Promise.all([racing.call('endRoom'), racing.call('updateAvailability', { availability: [] })])
  assert(end.ok)
  assert.strictEqual(late.ok, false, '结束先进入事务时，随后旧页面请求不能写入')
  assert(!racing.doc.room.members[0].availabilityByDate)
  console.log('room lifecycle tests: ok')
}
run().catch((e) => { console.error(e); process.exitCode = 1 })
