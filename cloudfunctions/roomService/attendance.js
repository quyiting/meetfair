function reviseFinalPlan(room, changes) {
  const next = { ...room, ...changes }
  const changed = next.meetingDate !== room.meetingDate || next.meetingTime !== room.meetingTime ||
    Boolean(next.finalTimeAt) !== Boolean(room.finalTimeAt) ||
    JSON.stringify(next.finalVenue || null) !== JSON.stringify(room.finalVenue || null)
  return changed ? { ...next, planRevision: (room.planRevision || 0) + 1, attendanceResponses: [] } : next
}

module.exports = { reviseFinalPlan }
