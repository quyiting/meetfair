function getRoomCandidates(room) {
  const seen = new Set()
  return (room.nominatedVenues || []).concat(room.venues || []).filter((v) => {
    if (seen.has(v.id)) return false
    seen.add(v.id); return true
  }).slice(0, 100)
}

module.exports = { getRoomCandidates }
