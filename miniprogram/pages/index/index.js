const { getRooms, getRoom, createRoom, decodeRoom, cloudGetRoom, cloudErrorText } = require('../../utils/store')
const { CATEGORY_LABELS, TRANSPORT_LABELS } = require('../../utils/constants')
const { getRoomState } = require('../../utils/room-state')

// 6 位短码（云端聚会码）；更短的才可能是本地长码，用长度即可区分
const SHORT_CODE_PATTERN = /^[23456789ABCDEFGHKMNPQRSTUVWXYZ]{6}$/

Page({
  data: {
    rooms: [],
    selectedFilter: 'all', allRooms: [],
    filters: [{ id: 'all', label: '全部' }, { id: 'needsInput', label: '待填写' }, { id: 'deciding', label: '协商中' }, { id: 'confirmed', label: '已确定' }, { id: 'ended', label: '已结束' }],
    showJoinCodeModal: false,
    joinCode: '',
    joining: false
  },
  onShow() {
    const rooms = getRooms().map((room) => Object.assign({}, room, {
      categoryLabel: CATEGORY_LABELS[room.category],
      transportLabel: TRANSPORT_LABELS[room.transport],
      memberCount: room.preview ? room.memberCount : room.members.length,
      roomState: getRoomState(room)
    }))
    this.setData({ allRooms: rooms })
    this.applyFilter()
  },
  selectFilter(event) { this.setData({ selectedFilter: event.currentTarget.dataset.id }); this.applyFilter() },
  applyFilter() {
    const filter = this.data.selectedFilter
    this.setData({ rooms: this.data.allRooms.filter((r) => filter === 'all' ||
      (filter === 'needsInput' ? r.roomState.needsInput : r.roomState.status === filter)) })
  },
  goCreate() {
    wx.navigateTo({ url: '/pages/create/create' })
  },
  openRoom(event) {
    wx.navigateTo({ url: `/pages/room/room?id=${event.currentTarget.dataset.id}` })
  },
  openJoinCodeModal() {
    this.setData({ showJoinCodeModal: true, joinCode: '', joining: false })
  },
  closeJoinCodeModal() {
    this.setData({ showJoinCodeModal: false, joinCode: '', joining: false })
  },
  noop() {},
  setJoinCode(event) {
    this.setData({ joinCode: event.detail.value })
  },
  pasteJoinCode() {
    wx.getClipboardData({
      success: (result) => {
        const text = (result.data || '').trim()
        if (!text) {
          wx.showToast({ title: '剪贴板是空的', icon: 'none' })
          return
        }
        this.setData({ joinCode: text })
      },
      fail: () => wx.showToast({ title: '无法读取剪贴板', icon: 'none' })
    })
  },
  async submitJoinCode() {
    if (this.data.joining) return
    const raw = this.data.joinCode.trim()
    if (!raw) {
      wx.showToast({ title: '请输入聚会码', icon: 'none' })
      return
    }
    this.setData({ joining: true })
    let room = null
    if (SHORT_CODE_PATTERN.test(raw.toUpperCase())) {
      wx.showLoading({ title: '正在查找聚会' })
      let lookupError = null
      room = await cloudGetRoom(raw, (error) => { lookupError = error })
      wx.hideLoading()
      if (!room) {
        this.setData({ joining: false })
        wx.showToast({ title: cloudErrorText(lookupError || {}), icon: 'none' })
        return
      }
    } else {
      // 兼容早期分享出去的本地长码
      room = decodeRoom(raw.toLowerCase())
      if (!room) {
        this.setData({ joining: false })
        wx.showToast({ title: '聚会码无效，请确认已完整复制', icon: 'none' })
        return
      }
    }
    if (getRoom(room.id)) {
      const { updateRoom } = require('../../utils/store')
      updateRoom(room)
    } else {
      createRoom(room)
    }
    this.setData({ joining: false })
    this.closeJoinCodeModal()
    wx.showToast({ title: '已找到聚会', icon: 'success' })
    wx.navigateTo({ url: `/pages/room/room?id=${room.id}` })
  },
  onShareAppMessage() {
    return {
      title: '约在哪：一起找个大家都顺路的地方吧',
      path: '/pages/index/index'
    }
  }
})
