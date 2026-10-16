function toMinutes(time) {
  if (!/^\d{2}:\d{2}$/.test(String(time || ''))) return null
  const hour = Number(time.slice(0, 2))
  const minute = Number(time.slice(3))
  return hour < 24 && minute < 60 ? hour * 60 + minute : null
}

function toTime(minutes) {
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`
}

function getDateAvailability(member, date, legacyDate) {
  if (member.availabilityByDate && Object.prototype.hasOwnProperty.call(member.availabilityByDate, date)) {
    return member.availabilityByDate[date]
  }
  // 一旦建立日期映射，不再把当前日期镜像当成其他日期的历史答复。
  if (!member.availabilityByDate && date === legacyDate && Array.isArray(member.availability) && member.availability.length) return member.availability
  return undefined
}

function hasAnsweredAllDates(room, member) {
  return (room.candidateDates || [room.meetingDate]).every((date) => Array.isArray(getDateAvailability(member, date, room.meetingDate)))
}

function covers(ranges, start, end) {
  const sorted = ranges.map((r) => [toMinutes(r.start), toMinutes(r.end)])
    .filter(([a, b]) => a !== null && b !== null && a < b).sort((a, b) => a[0] - b[0])
  let cursor = start
  for (const [a, b] of sorted) {
    if (a > cursor) return false
    if (b > cursor) cursor = b
    if (cursor >= end) return true
  }
  return false
}

function daySlots(members, date, preferredTime, travelMinutes, now, durationMinutes) {
  const chinaNow = new Date(now.getTime() + 8 * 3600000)
  const today = chinaNow.toISOString().slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date || '')) || date < today) return []
  const preferred = toMinutes(preferredTime)
  const earliest = date === today
    ? chinaNow.getUTCHours() * 60 + chinaNow.getUTCMinutes() + Math.max(0, travelMinutes) + 10
    : 0
  const respondents = members.filter((member) => Array.isArray(member.availability))
  if (!respondents.length) return []
  const slots = []
  for (let start = 8 * 60; start <= Math.min(22 * 60, 1439 - durationMinutes); start += 30) {
    if (start < earliest) continue
    const end = start + durationMinutes
    const count = respondents.filter((member) => covers(member.availability, start, end)).length
    if (count) slots.push({ start: toTime(start), end: toTime(end), count,
      responded: respondents.length, total: members.length,
      distanceFromPreferred: preferred === null ? 0 : Math.abs(start - preferred) })
  }
  return slots
}

function chooseSlots(slots) {
  slots.sort((a, b) => b.count - a.count || a.distanceFromPreferred - b.distanceFromPreferred ||
    String(a.date || '').localeCompare(String(b.date || '')) || a.start.localeCompare(b.start))
  const chosen = []
  slots.forEach((slot) => {
    if (chosen.length < 3 && chosen.every((item) => item.date !== slot.date || Math.abs(toMinutes(item.start) - toMinutes(slot.start)) >= 60)) {
      chosen.push(slot)
    }
  })
  return chosen
}

function recommendMeetingTimes(members, date, preferredTime, travelMinutes = 0, now = new Date(), durationMinutes = 60) {
  return chooseSlots(daySlots(members.filter((m) => m.availability && m.availability.length), date, preferredTime, travelMinutes, now, durationMinutes))
}

function recommendRoomTimes(room, travelMinutes = 0, now = new Date()) {
  return chooseSlots((room.candidateDates || [room.meetingDate]).flatMap((date) => {
    const members = room.members.map((m) => ({ availability: getDateAvailability(m, date, room.meetingDate) }))
    return daySlots(members, date, room.meetingTime, travelMinutes, now, room.durationMinutes || 60).map((s) => ({ ...s, date }))
  }))
}

module.exports = { recommendMeetingTimes, toMinutes, getDateAvailability, hasAnsweredAllDates, recommendRoomTimes }
