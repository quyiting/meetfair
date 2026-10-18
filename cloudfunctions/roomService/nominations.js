function getCandidates(room) {
  const seen = new Set()
  return (room.nominatedVenues || []).concat(room.venues || []).filter((v) => {
    if (seen.has(v.id)) return false
    seen.add(v.id); return true
  }).slice(0, 100)
}

function duplicateNomination(venues, venue) {
  const name = (s) => s.trim().replace(/\s+/g, '').toLowerCase()
  return venues.find((v) => {
    if (name(v.name) !== name(venue.name)) return false
    const dy = (v.latitude - venue.latitude) * 111320
    const dx = (v.longitude - venue.longitude) * 111320 * Math.cos(venue.latitude * Math.PI / 180)
    return Math.hypot(dx, dy) <= 30
  })
}

module.exports = { getCandidates, duplicateNomination }
