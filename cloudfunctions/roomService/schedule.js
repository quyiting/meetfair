function validDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return false
  const date = new Date(value + 'T00:00:00Z')
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
}

function normalizeSchedule(room, today) {
  const explicit = room.candidateDates !== undefined || room.durationMinutes !== undefined
  const candidateDates = room.candidateDates === undefined ? [room.meetingDate] : room.candidateDates
  const durationMinutes = room.durationMinutes === undefined ? 60 : room.durationMinutes
  if (!Array.isArray(candidateDates) || !candidateDates.length || candidateDates.length > 3 ||
      new Set(candidateDates).size !== candidateDates.length ||
      candidateDates.some((d) => !validDate(d) || (explicit && today && d < today)) ||
      !candidateDates.includes(room.meetingDate) || ![60, 120, 180].includes(durationMinutes)) throw new Error('候选日期或聚会时长不合法')
  return { candidateDates: candidateDates.slice(), durationMinutes }
}

function normalizeDateAvailability(ranges) {
  if (!Array.isArray(ranges) || ranges.length > 5) throw new Error('可用时间最多 5 段')
  return ranges.map((r) => {
    if (!r || !/^([01]\d|2[0-3]):[0-5]\d$/.test(r.start) ||
        !/^([01]\d|2[0-3]):[0-5]\d$/.test(r.end) || r.start >= r.end) throw new Error('可用时间不合法，不支持跨天')
    return { start: r.start, end: r.end }
  })
}

function getAvailabilityByDate(member, legacyDate) {
  if (member.availabilityByDate) return { ...member.availabilityByDate }
  return member.availability && member.availability.length && validDate(legacyDate)
    ? { [legacyDate]: member.availability } : {}
}

module.exports = { normalizeSchedule, getAvailabilityByDate, normalizeDateAvailability }
