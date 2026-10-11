const { cloudCreateRoomStrict, cloudErrorText } = require('../../utils/store')

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
    retentionOptions: [
      { hours: 1, label: '1 小时' }, { hours: 24, label: '1 天' },
      { hours: 168, label: '7 天' }, { hours: 720, label: '30 天' }
    ],
    retentionIndex: 3, creating: false
  },
  setTitle(event) { this.pendingRoomId = ''; this.setData({ title: event.detail.value }) },
  selectCategory(event) { this.pendingRoomId = ''; this.setData({ activeCategory: event.currentTarget.dataset.id }) },
  setPreferenceText(event) { this.pendingRoomId = ''; this.setData({ preferenceText: event.detail.value.slice(0, 60) }) },
  selectMeetingDate(event) { this.pendingRoomId = ''; this.setData({ meetingDate: event.detail.value }) },
  selectMeetingTime(event) { this.pendingRoomId = ''; this.setData({ meetingTime: event.detail.value }) },
  selectRetention(event) { this.pendingRoomId = ''; this.setData({ retentionIndex: Number(event.detail.value) }) },
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
      meetingSearchTime: this.data.meetingTime, retentionHours,
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
