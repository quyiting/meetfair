const { cloudCreateRoomStrict, cloudErrorText } = require('../../utils/store')
const { getRoom } = require('../../utils/store')
const { buildRepeatDraft } = require('../../utils/room-state')

const categories = [
  { id: 'food', icon: '🍜', label: '吃饭' },
  { id: 'cinema', icon: '🎬', label: '看电影' },
  { id: 'coffee', icon: '☕', label: '喝咖啡' },
  { id: 'fun', icon: '🎲', label: '玩一玩' }
]

function todayText() {
  const now = new Date()
  const pad = (value) => String(value).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

Page({
  data: {
    title: '周末一起见个面', categories, activeCategory: 'food', preferenceText: '',
    meetingDate: todayText(), meetingTime: '18:30', minDate: todayText(),
    candidateDates: [todayText()], durationMinutes: 60, durationIndex: 0,
    durationOptions: ['1 小时', '2 小时', '3 小时'],
    expectedMemberOptions: [{ value: 0, label: '不确定' }].concat(
      [2, 3, 4, 5, 6, 7, 8].map((value) => ({ value, label: `${value} 人（含自己）` }))),
    expectedMemberIndex: 0,
    retentionOptions: [
      { hours: 1, label: '1 小时' }, { hours: 24, label: '1 天' },
      { hours: 168, label: '7 天' }, { hours: 720, label: '30 天' }
    ],
    retentionIndex: 3, creating: false
  },
  onLoad(options) {
    if (!options || !options.repeatFrom) return
    const room = getRoom(options.repeatFrom)
    if (!room || room.preview || !(room.currentUserIsOwner || (room.members || []).some((m) => m.id === room.currentMemberId))) return
    const draft = buildRepeatDraft(room, todayText())
    this.setData({ ...draft, activeCategory: draft.category,
      durationIndex: [60, 120, 180].indexOf(draft.durationMinutes),
      retentionIndex: Math.max(0, this.data.retentionOptions.findIndex((r) => r.hours === draft.retentionHours)),
      expectedMemberIndex: Math.max(0, this.data.expectedMemberOptions.findIndex((o) => o.value === draft.expectedMemberCount)) })
    this.pendingRoomId = ''
  },
  setTitle(event) { this.pendingRoomId = ''; this.setData({ title: event.detail.value }) },
  selectCategory(event) { this.pendingRoomId = ''; this.setData({ activeCategory: event.currentTarget.dataset.id }) },
  setPreferenceText(event) { this.pendingRoomId = ''; this.setData({ preferenceText: event.detail.value.slice(0, 60) }) },
  selectMeetingDate(event) {
    const date = event.detail.value
    const dates = [date].concat(this.data.candidateDates.slice(1).filter((d) => d !== date))
    this.pendingRoomId = ''; this.setData({ meetingDate: date, candidateDates: dates })
  },
  addCandidateDate(event) {
    const date = event.detail.value
    if (this.data.candidateDates.includes(date)) return
    if (this.data.candidateDates.length >= 3) return wx.showToast({ title: '最多选择 3 个日期', icon: 'none' })
    this.pendingRoomId = ''; this.setData({ candidateDates: this.data.candidateDates.concat(date) })
  },
  removeCandidateDate(event) {
    if (this.data.candidateDates.length <= 1) return
    const dates = this.data.candidateDates.filter((d) => d !== event.currentTarget.dataset.date)
    this.pendingRoomId = ''; this.setData({ candidateDates: dates, meetingDate: dates[0] })
  },
  selectDuration(event) {
    const index = Number(event.detail.value)
    if (![0, 1, 2].includes(index)) return
    this.pendingRoomId = ''; this.setData({ durationIndex: index, durationMinutes: (index + 1) * 60 })
  },
  selectMeetingTime(event) { this.pendingRoomId = ''; this.setData({ meetingTime: event.detail.value }) },
  selectRetention(event) { this.pendingRoomId = ''; this.setData({ retentionIndex: Number(event.detail.value) }) },
  selectExpectedMemberCount(event) {
    const index = Number(event.detail.value)
    if (!Number.isInteger(index) || !this.data.expectedMemberOptions[index]) return
    this.pendingRoomId = ''
    this.setData({ expectedMemberIndex: index })
  },
  createRoom() {
    if (this.data.creating) return
    const title = this.data.title.trim()
    if (!title) {
      wx.showToast({ title: '给这次聚会起个名字吧', icon: 'none' })
      return
    }
    const retentionHours = this.data.retentionOptions[this.data.retentionIndex].hours
    const room = {
      id: this.pendingRoomId || (this.pendingRoomId = `room-${Date.now()}`), schemaVersion: 2, title,
      category: this.data.activeCategory, preferenceText: this.data.preferenceText.trim(),
      transport: 'mixed', dateText: `${this.data.meetingDate} ${this.data.meetingTime}`,
      meetingDate: this.data.meetingDate, meetingTime: this.data.meetingTime,
      candidateDates: this.data.candidateDates.slice(), durationMinutes: this.data.durationMinutes,
      meetingSearchTime: this.data.meetingTime, retentionHours,
      expectedMemberCount: this.data.expectedMemberOptions[this.data.expectedMemberIndex].value,
      members: [], venues: [], routeMatrix: {}, createdAt: Date.now()
    }
    this.setData({ creating: true })
    wx.showLoading({ title: '正在创建聚会' })
    return cloudCreateRoomStrict(room).then((savedRoom) => {
      wx.hideLoading()
      wx.redirectTo({ url: `/pages/room/room?id=${savedRoom.id}` })
    }).catch((error) => {
      wx.hideLoading()
      this.setData({ creating: false })
      wx.showToast({ title: cloudErrorText(error), icon: 'none', duration: 3000 })
    })
  }
})
