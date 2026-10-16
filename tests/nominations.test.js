const assert = require('assert')
const venue = { name: '测试咖啡', address: '测试路', latitude: 31, longitude: 121, category: 'coffee', rating: 5, price: 1, proposerId: 'forged', id: 'fake' }
async function run() {
  const h = require('./helpers/room-cloud')({ id: 'r', schemaVersion: 2, meetingDate: '2099-10-20', meetingTime: '18:30',
    members: [{ id: 'self' }], venues: [], memberRevision: 0 })
  const first = await h.call('nominateVenue', { venue })
  assert(first.ok)
  const nomination = h.doc.room.nominatedVenues[0]
  assert(nomination.id.startsWith('manual-'))
  assert.strictEqual(nomination.proposerId, 'self')
  assert.strictEqual(nomination.rating, null)
  assert.strictEqual(nomination.price, null)
  assert((await h.call('nominateVenue', { venue: { ...venue, name: ' 测试咖啡 ' } })).ok)
  assert.strictEqual(h.doc.room.nominatedVenues.length, 1)
  assert((await h.call('nominateVenue', { venue: { ...venue, longitude: 121.02 } })).ok)
  assert.strictEqual(h.doc.room.nominatedVenues.length, 2, '不同分店不合并')
  h.doc.room.members.push({ id: 'friend' })
  h.as('guest')
  assert(!(await h.call('removeNomination', { venueId: nomination.id })).ok)
  assert((await h.call('toggleVote', { venueId: nomination.id })).ok)
  assert((await h.call('setVenues', { venues: [], memberRevision: 0, meetingDate: '2099-10-20', meetingTime: '18:30' })).ok)
  assert.strictEqual(h.doc.room.nominatedVenues.length, 2)
  assert.deepStrictEqual(h.doc.room.votes[nomination.id], ['friend'])
  assert(!(await h.call('setNominationRoutes', { venueId: nomination.id, memberRevision: 0, meetingDate: '2099-10-21', meetingTime: '18:30', routes: {} })).ok)
  h.as('owner')
  assert((await h.call('setFinalVenue', { venueId: nomination.id })).ok)
  assert(!(await h.call('removeNomination', { venueId: nomination.id })).ok)
  for (let i = 2; i < 8; i++) assert((await h.call('nominateVenue', { venue: { ...venue, name: `地点${i}` } })).ok)
  assert(!(await h.call('nominateVenue', { venue: { ...venue, name: '第九个' } })).ok)
  assert(!(await h.call('nominateVenue', { venue: { ...venue, latitude: 999 } })).ok)
  const removable = h.doc.room.nominatedVenues[1].id
  h.doc.room.votes[removable] = ['friend']
  h.doc.room.routeMatrix[removable] = { friend: { minutes: 12 } }
  assert((await h.call('removeNomination', { venueId: removable })).ok)
  assert(!h.doc.room.votes[removable])
  assert(!h.doc.room.routeMatrix[removable])
  const count = h.doc.room.nominatedVenues.length
  const [nominated, refreshed] = await Promise.all([
    h.call('nominateVenue', { venue: { ...venue, name: '并发提名' } }),
    h.call('setVenues', { venues: [], memberRevision: 0, meetingDate: '2099-10-20', meetingTime: '18:30' })
  ])
  assert(nominated.ok && refreshed.ok)
  assert.strictEqual(h.doc.room.nominatedVenues.length, count + 1)
  console.log('nominations tests: ok')
}
run().catch((e) => { console.error(e); process.exitCode = 1 })
