function isFinalPlanComplete(room) {
  return Boolean(room.finalTimeAt && room.finalVenue)
}

function getAttendanceSummary(room) {
  const records = (room.attendanceResponses || []).filter((r) => r.planRevision === (room.planRevision || 0))
  const summary = { yes: 0, maybe: 0, no: 0, unanswered: 0, myStatus: '', members: [] }
  ;(room.members || []).forEach((m) => {
    const record = records.find((r) => r.memberId === m.id && ['yes', 'maybe', 'no'].includes(r.status))
    const status = record ? record.status : ''
    summary[status || 'unanswered']++
    summary.members.push({ id: m.id, name: m.name, status,
      label: { yes: '参加', maybe: '待定', no: '不参加' }[status] || '未答复' })
    if (m.id === room.currentMemberId) summary.myStatus = status
  })
  return summary
}

function getRoomState(room) {
  const { hasAnsweredAllDates } = require('./meeting-time')
  const member = (room.members || []).find((m) => m.id === room.currentMemberId)
  const status = room.endedAt ? 'ended' : isFinalPlanComplete(room) ? 'confirmed' : 'deciding'
  const needsInput = status !== 'ended' && (!member || !hasAnsweredAllDates(room, member) ||
    (isFinalPlanComplete(room) && !getAttendanceSummary(room).myStatus))
  return { status, needsInput, label: { ended: '已结束', confirmed: '已确定', deciding: '协商中' }[status] }
}

function buildRepeatDraft(room, today) {
  return { title: room.title || '', category: room.category || 'food', preferenceText: room.preferenceText || '',
    expectedMemberCount: room.expectedMemberCount || 0, durationMinutes: room.durationMinutes || 60,
    retentionHours: room.retentionHours || 720, meetingTime: room.meetingTime || '18:30',
    meetingDate: today, candidateDates: [today] }
}

module.exports = { isFinalPlanComplete, getAttendanceSummary, getRoomState, buildRepeatDraft }
