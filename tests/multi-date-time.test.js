const assert = require('assert')
const { recommendMeetingTimes, getDateAvailability, hasAnsweredAllDates, recommendRoomTimes } = require('../miniprogram/utils/meeting-time')
const now = new Date('2026-10-01T10:00:00+08:00')
const a = '2026-10-20', b = '2026-10-21'
const members = [
  { availability: [{ start: '18:00', end: '21:00' }] },
  { availability: [{ start: '19:00', end: '22:00' }] }
]
const long = recommendMeetingTimes(members, a, '19:00', 0, now, 120)
assert.strictEqual(long[0].end, '21:00')
assert.strictEqual(long[0].count, 2)
assert.strictEqual(recommendMeetingTimes(members, a, '19:00', 0, now, 180)[0].count, 1)
assert.strictEqual(recommendMeetingTimes([{ availability: [
  { start: '18:00', end: '19:00' }, { start: '19:00', end: '21:00' }, { start: '18:30', end: '20:00' }
] }], a, '18:00', 0, now, 180)[0].count, 1)
assert.strictEqual(getDateAvailability(members[0], b, a), undefined)
assert.strictEqual(getDateAvailability({ availability: [] }, a, a), undefined)
const room = { meetingDate: a, candidateDates: [a, b], meetingTime: '19:00', durationMinutes: 120,
  members: [{ availabilityByDate: { [a]: members[0].availability, [b]: [] } },
    { availabilityByDate: { [b]: members[1].availability } }] }
assert(hasAnsweredAllDates(room, room.members[0]))
assert(!hasAnsweredAllDates(room, room.members[1]))
const slots = recommendRoomTimes(room, 0, now)
assert(slots.some((s) => s.date === a && s.responded === 1))
assert(slots.some((s) => s.date === b && s.responded === 2 && s.count === 1))
assert(slots.every((s) => s.total === 2 && s.end <= '23:59'))
assert.deepStrictEqual(recommendRoomTimes({ ...room, members: [{ availabilityByDate: { [a]: [], [b]: [] } }] }, 0, now), [])
assert(recommendRoomTimes({ meetingDate: a, meetingTime: '19:00', members }, 0, now).length)
console.log('multi date time tests: ok')
