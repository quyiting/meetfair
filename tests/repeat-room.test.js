const assert = require('assert')
const { buildRepeatDraft } = require('../miniprogram/utils/room-state')
const source = { id: 'old', title: '再聚', category: 'coffee', preferenceText: '安静', expectedMemberCount: 4,
  durationMinutes: 120, retentionHours: 24, meetingTime: '19:00', meetingDate: '2020-01-01', candidateDates: ['2020-01-01'],
  members: [{ name: '秘密', latitude: 31 }], votes: { v: ['a'] }, finalVenue: { id: 'v' }, endedAt: 1,
  attendanceResponses: [], cloudId: 'ABC234', nominatedVenues: [{ id: 'v' }] }
const before = JSON.stringify(source)
const draft = buildRepeatDraft(source, '2099-10-20')
assert.deepStrictEqual(Object.keys(draft).sort(), ['title', 'category', 'preferenceText', 'expectedMemberCount', 'durationMinutes', 'retentionHours', 'meetingTime', 'meetingDate', 'candidateDates'].sort())
assert.deepStrictEqual(draft.candidateDates, ['2099-10-20'])
assert.strictEqual(draft.durationMinutes, 120)
assert.strictEqual(JSON.stringify(source), before)
console.log('repeat room tests: ok')
