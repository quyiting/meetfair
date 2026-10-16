const assert = require('assert')
const { normalizeSchedule, getAvailabilityByDate, normalizeDateAvailability } = require('../cloudfunctions/roomService/schedule')
const room = { meetingDate: '2026-10-20', candidateDates: ['2026-10-20', '2026-10-21'], durationMinutes: 120 }
assert.deepStrictEqual(normalizeSchedule(room, '2026-10-15'), { candidateDates: room.candidateDates, durationMinutes: 120 })
for (const change of [
  { candidateDates: ['2026-10-20', '2026-10-20'] },
  { candidateDates: ['2027-02-29'] }, { candidateDates: [] },
  { candidateDates: ['2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23'] },
  { durationMinutes: 90 }, { candidateDates: ['2026-10-01'] }
]) assert.throws(() => normalizeSchedule({ ...room, ...change }, '2026-10-15'))
assert.deepStrictEqual(normalizeSchedule({ meetingDate: '2026-01-01' }, '2026-10-15'), { candidateDates: ['2026-01-01'], durationMinutes: 60 })
assert.deepStrictEqual(getAvailabilityByDate({ availability: [] }, room.meetingDate), {})
const ranges = [{ start: '18:00', end: '21:00' }]
assert.deepStrictEqual(getAvailabilityByDate({ availability: ranges }, room.meetingDate), { [room.meetingDate]: ranges })
assert.deepStrictEqual(normalizeDateAvailability([]), [])
for (const ranges of [null, [{ start: '23:00', end: '01:00' }], Array(6).fill({ start: '18:00', end: '19:00' })]) {
  assert.throws(() => normalizeDateAvailability(ranges))
}
async function run() {
  const h = require('./helpers/room-cloud')({ ...room, schemaVersion: 2, members: [
    { id: 'self', availability: ranges }, { id: 'friend' }
  ], venues: [], memberRevision: 0, meetingTime: '18:30' })
  assert((await h.call('updateAvailability', { date: room.candidateDates[1], availability: [] })).ok)
  assert.deepStrictEqual(h.doc.room.members[0].availabilityByDate, { [room.meetingDate]: ranges, [room.candidateDates[1]]: [] })
  const first = h.call('updateAvailability', { date: room.meetingDate, availability: [] })
  h.as('guest')
  const second = h.call('updateAvailability', { date: room.candidateDates[1], availability: ranges })
  assert((await first).ok); assert((await second).ok)
  assert.deepStrictEqual(h.doc.room.members[0].availabilityByDate[room.meetingDate], [])
  assert.deepStrictEqual(h.doc.room.members[1].availabilityByDate[room.candidateDates[1]], ranges)
  assert(!(await h.call('updateAvailability', { date: '2099-01-01', availability: [] })).ok)
  h.as('stranger')
  assert(!(await h.call('updateAvailability', { availability: ranges })).ok)
  h.as('owner')
  h.doc.room.routeMatrix = { v: { self: { minutes: 20 } } }
  assert((await h.call('setMeetingTime', { date: room.candidateDates[1], time: '18:30' })).ok)
  assert.deepStrictEqual(h.doc.room.routeMatrix, {}, '切换日期必须清除旧路线，而不是空对象合并')
  assert.strictEqual(h.doc.room.meetingDate, room.candidateDates[1])
  assert(!(await h.call('setVenues', { memberRevision: 0, meetingTime: '18:30', meetingDate: room.meetingDate, venues: [] })).ok)
  assert(!(await h.call('setVenues', { memberRevision: 0, meetingTime: '18:30', venues: [] })).ok)
  console.log('cloud schedule tests: ok')
}
run().catch((error) => { console.error(error); process.exitCode = 1 })
