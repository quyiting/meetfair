const assert = require('assert')
const { getAttendanceSummary, isFinalPlanComplete } = require('../miniprogram/utils/room-state')
const { getRoomState } = require('../miniprogram/utils/room-state')
const room = { members: [{ id: 'a' }, { id: 'b' }, { id: 'c' }], currentMemberId: 'b', planRevision: 2,
  finalTimeAt: 1, finalVenue: { id: 'v' }, attendanceResponses: [
    { memberId: 'a', status: 'yes', planRevision: 2 }, { memberId: 'b', status: 'yes', planRevision: 1 },
    { memberId: 'gone', status: 'no', planRevision: 2 }
  ] }
assert(isFinalPlanComplete(room))
const stats = getAttendanceSummary(room)
assert.deepStrictEqual([stats.yes, stats.maybe, stats.no, stats.unanswered, stats.myStatus], [1, 0, 0, 2, ''])
assert.strictEqual(getAttendanceSummary({ members: room.members }).unanswered, 3)
assert(!isFinalPlanComplete({ finalVenue: { id: 'v' } }))
assert.strictEqual(getRoomState(room).status, 'confirmed')
assert(getRoomState(room).needsInput)
assert.strictEqual(getRoomState({ ...room, endedAt: 1 }).status, 'ended')
assert(!getRoomState({ ...room, endedAt: 1 }).needsInput)
assert.strictEqual(getRoomState({ members: [] }).status, 'deciding')
console.log('room state tests: ok')
