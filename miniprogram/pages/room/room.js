const { getRoom, updateRoom, encodeRoom, addMemberToRoom, updateMyMember, updateMyAvailability, setMeetingTime, cloudCreateRoom, cloudGetRoom, cloudErrorText, cloudIssueClaimCode, cloudToggleVote, cloudSetVenues, setFinalVenue, cloudLeaveRoom, cloudDeleteRoom } = require('../../utils/store')
const { midpoint, candidateOrigins, routeCandidates, recommendVenues, explainTopRecommendation } = require('../../utils/recommend')
const { recommendRoomTimes, getDateAvailability, hasAnsweredAllDates } = require('../../utils/meeting-time')
const { getAttendanceSummary, isFinalPlanComplete } = require('../../utils/room-state')
const { setMyAttendance } = require('../../utils/store')
const { nominateVenue, removeNomination, setNominationRoutes } = require('../../utils/store')
const { getRoomCandidates } = require('../../utils/candidates')
const { endRoom } = require('../../utils/store')
const { prepareMemberLocation } = require('../../utils/privacy')
const { CATEGORY_LABELS, TRANSPORT_LABELS } = require('../../utils/constants')
const { getNearbyVenues, getRouteMatrix } = require('../../utils/venue-service')

const memberColors = ['#3675ff', '#fa6e52', '#8d6bff', '#20b891', '#e19a35', '#e85b98', '#4895d8', '#74829d']
const budgets = [
  { value: 0, label: '不限' },
  { value: 50, label: '¥50' },
  { value: 100, label: '¥100' },
  { value: 150, label: '¥150' },
  { value: 200, label: '¥200+' }
]

const SHORT_CODE_PATTERN = /^[23456789ABCDEFGHKMNPQRSTUVWXYZ]{6}$/

Page({
  data: {
    room: null,
    loadError: '',
    syncingRoom: false,
    point: null,
    recommendations: [],
    topRecommendationReason: '',
    recommendationsStale: false,
    refreshingNearby: false,
    timeSuggestions: [],
    timeResponded: 0,
    collectionProgress: null,
    finalPlanComplete: false, attendanceSummary: null, attendanceSaving: false, finalEndTime: '', planUpdated: false,
    nominationDraft: null, nominationSaving: false, nominatedVenues: [], nominationCategoryIndex: 0,
    endingRoom: false,
    nominationCategories: [{ id: 'food', label: '吃饭' }, { id: 'cinema', label: '电影' }, { id: 'coffee', label: '咖啡' }, { id: 'fun', label: '娱乐' }],
    showAvailabilityModal: false,
    availabilityDraft: [],
    availabilityStart: '18:00',
    availabilityEnd: '21:00',
    availabilitySaving: false,
    availabilityDate: '', availabilityDates: [], availabilityDateIndex: 0, dateResponses: [],
    activeCategory: 'all',
    activeGoal: 'max',
    goals: [
      { id: 'max', label: '照顾最远的人' },
      { id: 'total', label: '全员总时间最短' },
      { id: 'equal', label: '大家时间最接近' }
    ],
    goalDescription: '优先让最远的一位朋友少走路',
    selectedVenueId: '',
    markers: [],
    categories: [
      { id: 'all', label: '全部' },
      { id: 'food', label: '吃饭' },
      { id: 'cinema', label: '电影' },
      { id: 'coffee', label: '咖啡' },
      { id: 'fun', label: '娱乐' }
    ],
    showJoinModal: false,
    editingMember: false,
    editLocationChanged: false,
    editOriginalApproximate: false,
    joinName: '',
    joinClaimCode: '',
    joinLocationName: '',
    joinLatitude: null,
    joinLongitude: null,
    codePreview: '',
    codeLabel: '聚会码',
    joinTransport: 'transit',
    joinBudget: 100,
    joinApproximate: false,
    budgets,
    isMember: false,
    waitingForMembers: false,
    joinSubmitting: false
  },
  onLoad(options) {
    this.roomId = options.id
  },
  onShow() {
    this.pageVisible = true
    if (this.roomId) this.loadRoom().then(() => this.startWatch())
  },
  onHide() {
    this.pageVisible = false
    this.closeWatch()
  },
  onUnload() {
    this.pageVisible = false
    this.closeWatch()
  },
  closeWatch() {
    if (this.roomWatcher) this.roomWatcher.close()
    this.roomWatcher = null
    this.watchedSignalId = ''
    this.lastSignalVersion = ''
  },
  startWatch() {
    const room = getRoom(this.roomId)
    if (!this.pageVisible || !room || !room.signalId || !wx.cloud || !wx.cloud.database) return
    if (this.watchedSignalId === room.signalId) return
    this.closeWatch()
    this.watchedSignalId = room.signalId
    try {
      this.roomWatcher = wx.cloud.database().collection('roomSignals').where({ _id: room.signalId }).watch({
        onChange: (snapshot) => {
          const signal = snapshot.docs && snapshot.docs[0]
          if (!signal) {
            if (this.lastSignalVersion) {
              this.closeWatch()
              wx.showToast({ title: '聚会已删除', icon: 'none' })
              wx.reLaunch({ url: '/pages/index/index' })
            }
            return
          }
          if (signal.version === this.lastSignalVersion) return
          this.lastSignalVersion = signal.version
          this.loadRoom()
        },
        onError: (error) => {
          console.warn('[room] 实时同步不可用:', error)
          this.closeWatch()
        }
      })
    } catch (error) {
      console.warn('[room] 实时同步不可用:', error)
      this.closeWatch()
    }
  },
  onPullDownRefresh() {
    Promise.resolve(this.loadRoom()).then(
      () => wx.stopPullDownRefresh(),
      () => wx.stopPullDownRefresh()
    )
  },
  async loadRoom(localOnly) {
    const previousRoom = this.data.room
    let room = getRoom(this.roomId)
    const cloudCode = (room && room.cloudId) || (SHORT_CODE_PATTERN.test(String(this.roomId || '').toUpperCase()) ? this.roomId : '')
    if (cloudCode && !localOnly) {
      this.setData({ room: null, point: null, recommendations: [], markers: [], collectionProgress: null, loadError: '' })
      let lookupError = null
      const cloudRoom = await cloudGetRoom(cloudCode, (error) => { lookupError = error })
      if (!cloudRoom) {
        this.setData({ loadError: cloudErrorText(lookupError || {}) })
        return
      }
      room = cloudRoom
    }
    if (room) {
      updateRoom(room)
      this.roomId = room.id
    }
    if (!room) {
      this.setData({ loadError: '聚会不存在或已删除' })
      return
    }
    this.setData({ loadError: '' })
    if (room.endedAt) this.setData({ showJoinModal: false, showAvailabilityModal: false, nominationDraft: null })
    if (room.preview) {
      this.setData({
        room: Object.assign({}, room, { categoryLabel: CATEGORY_LABELS[room.category] }),
        point: null, recommendations: [], selectedVenueId: '', markers: [],
        recommendationsStale: false, timeSuggestions: [], timeResponded: 0, topRecommendationReason: '',
        isMember: false, waitingForMembers: room.schemaVersion === 2 && room.memberCount < 2,
        claimableMembers: [], codePreview: room.cloudId,
        collectionProgress: null, finalPlanComplete: false, attendanceSummary: null, nominatedVenues: [], nominationDraft: null, planUpdated: false,
        codeLabel: '聚会码 · 6 位'
      })
      return
    }
    const { venues, venueSource } = room
    room.candidateDates = room.candidateDates || [room.meetingDate]
    room.durationMinutes = room.durationMinutes || 60
    const dateResponses = room.candidateDates.map((date) => ({ date,
      responded: room.members.filter((m) => Array.isArray(getDateAvailability(m, date, room.meetingDate))).length }))
    this.setData({ dateResponses })
    const isMember = Boolean(room.currentMemberId && room.members.some((m) => m.id === room.currentMemberId))
    this.setData({ nominatedVenues: (room.nominatedVenues || []).map((v) => ({ ...v,
      canRemove: (room.currentUserIsOwner || v.proposerId === room.currentMemberId) && !(room.finalVenue && room.finalVenue.id === v.id) })) })
    const progressMembers = room.members.map((member) => ({ id: member.id, name: member.name,
      timeSubmitted: hasAnsweredAllDates(room, member) }))
    const currentMember = progressMembers.find((member) => member.id === room.currentMemberId)
    const finalPlanComplete = isFinalPlanComplete(room), attendanceSummary = getAttendanceSummary(room)
    const [hour, minute] = (room.meetingTime || '00:00').split(':').map(Number)
    const endMinutes = hour * 60 + minute + room.durationMinutes
    this.setData({ finalPlanComplete, attendanceSummary,
      planUpdated: Boolean(this.data.planUpdated || (previousRoom && previousRoom.id === room.id &&
        (previousRoom.planRevision || 0) !== (room.planRevision || 0))),
      finalEndTime: `${endMinutes >= 1440 ? '次日 ' : ''}${String(Math.floor(endMinutes / 60) % 24).padStart(2, '0')}:${String(endMinutes % 60).padStart(2, '0')}` })
    const expectedCount = Number.isInteger(room.expectedMemberCount) && room.expectedMemberCount >= 2 && room.expectedMemberCount <= 8
      ? room.expectedMemberCount : 0
    const nextAction = !currentMember ? 'join' : !currentMember.timeSubmitted ? 'time'
      : finalPlanComplete && !attendanceSummary.myStatus ? 'attendance' : room.members.length < 2 ? 'invite' : 'recommendations'
    this.setData({ collectionProgress: {
      expectedCount, remainingCount: Math.max(0, expectedCount - room.members.length),
      locationCount: room.members.length, timeCount: progressMembers.filter((member) => member.timeSubmitted).length,
      members: progressMembers, nextAction,
      nextLabel: { join: '填写我的位置', time: '填写可用时间', invite: '邀请朋友提交位置', recommendations: '查看推荐', attendance: '确认是否参加最终方案' }[nextAction]
    } })
    if (room.schemaVersion === 2 && room.members.length < 2) {
      this.setData({
        room: Object.assign({}, room, { categoryLabel: CATEGORY_LABELS[room.category] }),
        point: null, recommendations: [], topRecommendationReason: '',
        recommendationsStale: false, timeSuggestions: [], timeResponded: 0,
        selectedVenueId: '', markers: [], isMember, waitingForMembers: true,
        claimableMembers: [], codePreview: room.cloudId, codeLabel: '聚会码 · 6 位'
      })
      return
    }
    const point = midpoint(room.members)
    const recommendations = recommendVenues(room, this.data.activeCategory, this.data.activeGoal).map((venue) => {
      const votes = (room.votes && room.votes[venue.id]) || []
      return Object.assign({}, venue, { voteCount: votes.length, hasVoted: votes.indexOf(room.currentMemberId) >= 0 })
    })
    const selectedVenueId = recommendations.some((venue) => venue.id === this.data.selectedVenueId)
      ? this.data.selectedVenueId : (recommendations[0] && recommendations[0].id) || ''
    const markers = this.getMarkers(room, recommendations, selectedVenueId)
    const recommendationsStale = (room.memberRevision || 0) !== (room.venueMemberRevision || 0) ||
      Boolean(room.meetingSearchDate && room.meetingSearchDate !== room.meetingDate) ||
      Boolean(room.meetingSearchTime && room.meetingSearchTime !== room.meetingTime)
    const timeResponded = room.members.filter((member) => hasAnsweredAllDates(room, member)).length
    const travelVenue = room.finalVenue
      ? recommendVenues(room, 'all').find((venue) => venue.id === room.finalVenue.id) || recommendations[0]
      : recommendations[0]
    const timeSuggestions = recommendRoomTimes(room,
      travelVenue ? travelVenue.maxMinutes : 0)
    const claimableMembers = room.currentUserIsOwner
      ? room.members.filter((member) => (room.claimableMemberIds || []).indexOf(member.id) >= 0)
      : []
    this.setData({
      room: Object.assign({}, room, {
        categoryLabel: CATEGORY_LABELS[room.category],
        transportLabel: TRANSPORT_LABELS[room.transport],
        venueSourceLabel: (venueSource && venueSource.label) || '已保存的地点数据'
      }),
      point,
      recommendations,
      topRecommendationReason: explainTopRecommendation(recommendations, this.data.activeGoal),
      recommendationsStale,
      timeSuggestions,
      timeResponded,
      selectedVenueId,
      markers,
      isMember,
      waitingForMembers: false,
      claimableMembers,
      // 有云端短码就展示短码，否则退回本地长码预览
      codePreview: room.cloudId || (encodeRoom(room).slice(0, 12) + '...'),
      codeLabel: room.cloudId ? '聚会码 · 6 位' : '聚会码 · 长码'
    })
    // 如果没有地点数据，自动搜索
    if (room.schemaVersion === 2 || room.endedAt) return
    if (!venues || !venues.length) {
      if (!room.cloudId || room.currentUserIsOwner) this.refreshNearby()
    } else if (recommendationsStale && room.cloudId && room.currentUserIsOwner && !localOnly &&
      this.autoRefreshRevision !== `${room.memberRevision}:${room.meetingTime}`) {
      this.autoRefreshRevision = `${room.memberRevision}:${room.meetingTime}`
      this.refreshNearby()
    }
  },
  retryLoadRoom() {
    this.loadRoom().then(() => this.startWatch())
  },
  retryCloudSync() {
    if (this.data.syncingRoom) return
    const room = getRoom(this.roomId)
    if (!room || room.cloudId || !room.currentUserIsOwner) return
    this.setData({ syncingRoom: true })
    cloudCreateRoom(room).then((savedRoom) => {
      this.setData({ syncingRoom: false })
      this.loadRoom(true)
      wx.showToast({ title: savedRoom ? '已同步到云端' : '同步失败，请稍后重试', icon: 'none' })
    })
  },
  getMarkers(room, recommendations, selectedVenueId) {
    const selected = recommendations.find((venue) => venue.id === selectedVenueId)
    const members = room.members.map((member, i) => ({ id: i + 1, latitude: member.latitude, longitude: member.longitude, width: 24, height: 30, iconPath: '/images/marker-member.svg', callout: { content: member.name, display: 'BYCLICK', padding: 5, borderRadius: 8, bgColor: '#ffffff', color: '#24324b', fontSize: 11 } }))
    if (!selected) return members
    return members.concat([{ id: 100, latitude: selected.latitude, longitude: selected.longitude, width: 34, height: 42, iconPath: '/images/marker-place.svg', callout: { content: selected.name, display: 'ALWAYS', padding: 7, borderRadius: 10, bgColor: '#1f5eff', color: '#ffffff', fontSize: 11 } }])
  },
  selectCategory(event) {
    this.setData({ activeCategory: event.currentTarget.dataset.id, selectedVenueId: '' }, () => this.loadRoom(true))
  },
  selectGoal(event) {
    const activeGoal = event.currentTarget.dataset.id
    const descriptions = {
      max: '优先让最远的一位朋友少走路',
      total: '优先减少所有人的总通勤时间',
      equal: '优先缩小大家通勤时间的差距'
    }
    if (!descriptions[activeGoal]) return
    this.setData({ activeGoal, goalDescription: descriptions[activeGoal], selectedVenueId: '' }, () => this.loadRoom(true))
  },
  refreshNearby() {
    if (!this.canEditRoom()) return Promise.resolve()
    if (this.data.refreshingNearby) return Promise.resolve()
    const room = getRoom(this.roomId)
    if (!room || !room.members || !room.members.length || (room.schemaVersion === 2 && room.members.length < 2)) return Promise.resolve()
    const isMember = Boolean(room.currentMemberId && room.members.some((member) => member.id === room.currentMemberId))
    if (room.cloudId && !room.currentUserIsOwner && !(room.schemaVersion === 2 && isMember)) {
      wx.showToast({ title: '请创建者更新推荐', icon: 'none' })
      return Promise.resolve()
    }
    const origins = candidateOrigins(room.members)
    const meetingDate = room.meetingDate || String(room.dateText || '').slice(0, 10)
    const meetingTime = room.meetingTime || String(room.dateText || '').slice(11, 16)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(meetingDate) || !/^\d{2}:\d{2}$/.test(meetingTime)) {
      wx.showToast({ title: '聚会时间不完整，无法刷新地点', icon: 'none' })
      return Promise.resolve()
    }
    this.setData({ refreshingNearby: true })
    wx.showLoading({ title: '搜索附近地点' })
    // 始终搜索全部类别，缓存后按标签筛选
    return getNearbyVenues(origins, 'all', meetingDate, meetingTime).then((searchResult) => {
      if (!searchResult.venues.length) throw new Error('暂未找到附近地点，请稍后重试')
      const searchRoom = Object.assign({}, room, {
        venues: searchResult.venues, venueSource: searchResult.source,
        venueSearchAt: Date.now(), routeMatrix: {}
      })
      return getRouteMatrix(room.members, routeCandidates(searchRoom), meetingDate, meetingTime).then((routeResult) => {
        searchRoom.routeMatrix = routeResult.routeMatrix || {}
        if (!room.cloudId) {
          searchRoom.venueMemberRevision = room.memberRevision || 0
          searchRoom.meetingSearchTime = room.meetingTime || ''
          searchRoom.meetingSearchDate = room.meetingDate || ''
        }
        return room.cloudId
          ? cloudSetVenues(room, searchResult.venues, searchResult.source, searchRoom.routeMatrix)
          : Promise.resolve(updateRoom(searchRoom))
      }).then(() => {
        wx.hideLoading()
        this.setData({ refreshingNearby: false })
        this.loadRoom(true)
        wx.showToast({ title: '已更新附近地点', icon: 'none' })
      })
    }).catch((error) => {
      wx.hideLoading()
      this.setData({ refreshingNearby: false })
      wx.showToast({ title: error.message || '附近搜索失败，请稍后重试', icon: 'none' })
    })
  },
  selectVenue(event) {
    const selectedVenueId = event.currentTarget.dataset.id
    const room = this.data.room
    this.setData({ selectedVenueId, markers: this.getMarkers(room, this.data.recommendations, selectedVenueId) })
  },
  followProgressAction() {
    if (!this.canEditRoom()) return
    const progress = this.data.collectionProgress
    if (!progress) return
    if (progress.nextAction === 'join') this.openJoinModal()
    else if (progress.nextAction === 'time') this.openAvailabilityModal()
    else if (progress.nextAction === 'recommendations') wx.pageScrollTo({ selector: '#recommendations-section', duration: 300 })
    else if (progress.nextAction === 'attendance') wx.pageScrollTo({ selector: '#final-plan-section', duration: 300 })
  },
  submitAttendance(event) {
    const room = this.data.room, status = event.currentTarget.dataset.status
    if (!room || !this.data.isMember || !this.data.finalPlanComplete || room.endedAt || this.data.attendanceSaving || !['yes', 'maybe', 'no'].includes(status)) return
    const revision = room.planRevision || 0
    this.setData({ attendanceSaving: true })
    return setMyAttendance(this.roomId, status, revision).then(() => this.loadRoom(true)).catch((error) => {
      wx.showToast({ title: error.message || '保存失败，请刷新后重试', icon: 'none' })
      return this.loadRoom()
    }).finally(() => this.setData({ attendanceSaving: false }))
  },
  chooseNominationLocation() {
    if (!this.data.isMember || this.data.nominationSaving || this.data.room.endedAt) return
    wx.chooseLocation({ success: (location) => {
      this.setData({ nominationDraft: { name: location.name || '', address: location.address || '',
        latitude: location.latitude, longitude: location.longitude, category: this.data.room.category },
      nominationCategoryIndex: Math.max(0, this.data.nominationCategories.findIndex((c) => c.id === this.data.room.category)) })
    }, fail: (error) => {
      if (!/cancel/.test(error.errMsg || '')) wx.showToast({ title: '无法选择地点，请检查定位权限', icon: 'none' })
    } })
  },
  closeNomination() { if (!this.data.nominationSaving) this.setData({ nominationDraft: null }) },
  setNominationName(event) {
    this.setData({ nominationDraft: { ...this.data.nominationDraft, name: event.detail.value.slice(0, 80) } })
  },
  selectNominationCategory(event) {
    const index = Number(event.detail.value), category = this.data.nominationCategories[index]
    if (category) this.setData({ nominationCategoryIndex: index, nominationDraft: { ...this.data.nominationDraft, category: category.id } })
  },
  submitNomination() {
    const venue = this.data.nominationDraft
    if (this.data.nominationSaving || !this.data.isMember || !venue || this.data.room.endedAt) return
    if (!venue.name.trim() || !Number.isFinite(venue.latitude) || Math.abs(venue.latitude) > 90 || !Number.isFinite(venue.longitude) || Math.abs(venue.longitude) > 180) {
      wx.showToast({ title: '请填写名称并选择有效地点', icon: 'none' }); return
    }
    this.setData({ nominationSaving: true })
    return nominateVenue(this.roomId, venue).then(({ room, venueId }) => {
      this.setData({ nominationDraft: null })
      this.loadRoom(true)
      wx.showToast({ title: '地点已提名', icon: 'success' })
      // 提名已经独立保存；路线失败只影响精度，不撤销地点。
      if (room.members.length < 2) return
      const candidate = getRoomCandidates(room).find((v) => v.id === venueId)
      return getRouteMatrix(room.members, [candidate], room.meetingDate, room.meetingTime)
        .then((result) => setNominationRoutes(room, venueId, (result.routeMatrix || {})[venueId] || {}))
        .then(() => this.loadRoom(true)).catch(() => {
          wx.showToast({ title: '提名已保存，路线暂用估算', icon: 'none' })
        })
    }).catch((error) => wx.showToast({ title: error.message || '提名失败', icon: 'none' }))
      .finally(() => this.setData({ nominationSaving: false }))
  },
  removeNominatedVenue(event) {
    if (this.data.nominationSaving || !this.data.room || this.data.room.endedAt) return
    const id = event.currentTarget.dataset.id
    if (!this.data.nominatedVenues.some((v) => v.id === id && v.canRemove)) return
    wx.showModal({ title: '删除提名地点', content: '同时清除该地点的投票和路线，确定删除吗？', success: (choice) => {
      if (!choice.confirm) return
      this.setData({ nominationSaving: true })
      removeNomination(this.roomId, id).then(() => this.loadRoom(true))
        .catch((e) => wx.showToast({ title: e.message || '删除失败', icon: 'none' }))
        .finally(() => this.setData({ nominationSaving: false }))
    } })
  },
  openAvailabilityModal() {
    if (!this.canEditRoom()) return
    const room = getRoom(this.roomId)
    const member = room && room.members.find((item) => item.id === room.currentMemberId)
    if (!member) return
    const dates = room.candidateDates || [room.meetingDate]
    const date = dates.find((d) => !Array.isArray(getDateAvailability(member, d, room.meetingDate))) || dates[0]
    this.setData({ showAvailabilityModal: true,
      availabilityDate: date, availabilityDates: dates, availabilityDateIndex: dates.indexOf(date),
      availabilityDraft: (getDateAvailability(member, date, room.meetingDate) || []).map((range) => Object.assign({}, range)) })
  },
  selectAvailabilityDate(event) {
    if (this.data.availabilitySaving) return
    const index = Number(event.detail.value), date = this.data.availabilityDates[index]
    const room = getRoom(this.roomId), member = room && room.members.find((m) => m.id === room.currentMemberId)
    if (!date || !member) return
    this.setData({ availabilityDate: date, availabilityDateIndex: index,
      availabilityDraft: (getDateAvailability(member, date, room.meetingDate) || []).map((r) => ({ ...r })) })
  },
  markUnavailable() {
    if (this.data.availabilitySaving) return
    this.setData({ availabilityDraft: [] })
    return this.saveAvailability()
  },
  closeAvailabilityModal() {
    this.setData({ showAvailabilityModal: false })
  },
  setAvailabilityStart(event) {
    this.setData({ availabilityStart: event.detail.value })
  },
  setAvailabilityEnd(event) {
    this.setData({ availabilityEnd: event.detail.value })
  },
  addAvailabilityRange() {
    const draft = this.data.availabilityDraft
    if (draft.length >= 5) return wx.showToast({ title: '最多填写 5 段时间', icon: 'none' })
    const start = this.data.availabilityStart
    const end = this.data.availabilityEnd
    if (start >= end) return wx.showToast({ title: '结束时间需晚于开始时间', icon: 'none' })
    if (draft.some((range) => range.start === start)) return wx.showToast({ title: '这个开始时间已填写', icon: 'none' })
    this.setData({ availabilityDraft: draft.concat({ start, end }) })
  },
  removeAvailabilityRange(event) {
    const index = Number(event.currentTarget.dataset.index)
    this.setData({ availabilityDraft: this.data.availabilityDraft.filter((_, i) => i !== index) })
  },
  saveAvailability() {
    if (!this.canEditRoom()) return
    if (this.data.availabilitySaving) return
    this.setData({ availabilitySaving: true })
    return updateMyAvailability(this.roomId, this.data.availabilityDraft, this.data.availabilityDate).then(() => {
      this.setData({ availabilitySaving: false, showAvailabilityModal: false })
      this.loadRoom(true)
      wx.showToast({ title: '可用时间已保存', icon: 'success' })
    }).catch((error) => {
      this.setData({ availabilitySaving: false })
      wx.showToast({ title: error.message || '保存失败', icon: 'none' })
    })
  },
  confirmSuggestedTime(event) {
    if (!this.canEditRoom()) return
    const room = getRoom(this.roomId)
    const time = event.currentTarget.dataset.time
    const date = event.currentTarget.dataset.date
    if (!room || !room.currentUserIsOwner || !this.data.timeSuggestions.some((item) => item.start === time && item.date === date)) return
    wx.showModal({ title: '确定聚会时间', content: `确定 ${date} ${time} 见面，聚会 ${room.durationMinutes || 60} 分钟吗？`,
      success: (choice) => {
        if (!choice.confirm) return
        wx.showLoading({ title: '正在保存时间' })
        setMeetingTime(room, time, date).then(() => {
          wx.hideLoading()
          this.loadRoom(true).then(() => this.refreshNearby())
          wx.showToast({ title: '时间已确定', icon: 'success' })
        }).catch((error) => {
          wx.hideLoading()
          wx.showToast({ title: error.message || '保存失败', icon: 'none' })
        })
      }
    })
  },
  confirmSelectedVenue() {
    if (!this.canEditRoom()) return
    const room = getRoom(this.roomId)
    const venue = room && getRoomCandidates(room).find((item) => item.id === this.data.selectedVenueId)
    if (!room || !room.currentUserIsOwner || !venue) return
    wx.showModal({
      title: room.finalVenue ? '重新确定地点' : '确定聚会地点',
      content: `确定在「${venue.name}」见面吗？所有成员都会看到这个决定。`,
      success: (choice) => {
        if (!choice.confirm) return
        wx.showLoading({ title: '正在保存地点' })
        setFinalVenue(room, venue.id).then(() => {
          wx.hideLoading()
          this.loadRoom(true)
          wx.showToast({ title: '地点已确定', icon: 'success' })
        }).catch((error) => {
          wx.hideLoading()
          wx.showToast({ title: error.message || '保存失败', icon: 'none' })
        })
      }
    })
  },
  copyFinalAddress() {
    const venue = this.data.room && this.data.room.finalVenue
    if (venue) wx.setClipboardData({ data: venue.address || venue.name })
  },
  navigateFinalVenue() {
    const venue = this.data.room && this.data.room.finalVenue
    if (venue) wx.openLocation({ latitude: venue.latitude, longitude: venue.longitude,
      name: venue.name, address: venue.address, scale: 17 })
  },
  openPlace(event) {
    wx.navigateTo({ url: `/pages/place/place?roomId=${this.roomId}&venueId=${event.currentTarget.dataset.id}` })
  },
  toggleVote(event) {
    if (!this.canEditRoom()) return
    const venueId = event.currentTarget.dataset.id
    if (this.votingVenueId) return
    const room = getRoom(this.roomId)
    const voterId = room.currentMemberId
    if (!voterId) {
      wx.showToast({ title: '请先加入聚会', icon: 'none' })
      return
    }
    const currentVotes = (room.votes && room.votes[venueId]) || []
    const hasVoted = currentVotes.indexOf(voterId) >= 0
    if (room.cloudId) {
      this.votingVenueId = venueId
      wx.showLoading({ title: '正在同步投票' })
      cloudToggleVote(room, venueId).then(() => {
        wx.hideLoading()
        this.votingVenueId = ''
        this.loadRoom(true)
        wx.showToast({ title: hasVoted ? '已取消投票' : '已投给这个地点', icon: 'none' })
      }).catch((error) => {
        wx.hideLoading()
        this.votingVenueId = ''
        wx.showToast({ title: error.message || '投票失败', icon: 'none' })
      })
      return
    }
    room.votes = room.votes || {}
    room.votes[venueId] = hasVoted ? currentVotes.filter((id) => id !== voterId) : currentVotes.concat(voterId)
    updateRoom(room)
    this.loadRoom(true)
    wx.showToast({ title: hasVoted ? '已取消投票' : '已投给这个地点', icon: 'none' })
  },
  openJoinModal() {
    if (!this.canEditRoom()) return
    this.setData({ showJoinModal: true, editingMember: false, joinName: '', joinClaimCode: '',
      joinLocationName: '', joinLatitude: null, joinLongitude: null,
      joinTransport: 'transit', joinBudget: 100, joinApproximate: false })
  },
  openEditMember() {
    if (!this.canEditRoom()) return
    const room = getRoom(this.roomId)
    const member = room && room.members.find((item) => item.id === room.currentMemberId)
    if (!member) return
    this.setData({
      showJoinModal: true, editingMember: true, editLocationChanged: false,
      editOriginalApproximate: Boolean(member.approximate),
      joinName: member.name, joinClaimCode: '', joinLocationName: member.locationName,
      joinLatitude: member.latitude, joinLongitude: member.longitude,
      joinTransport: member.transport, joinBudget: member.budget,
      joinApproximate: Boolean(member.approximate)
    })
  },
  closeJoinModal() {
    this.setData({ showJoinModal: false, editingMember: false })
  },
  noop() {},
  setJoinName(event) {
    const name = event.detail.value.slice(0, 8)
    this.setData({ joinName: name })
  },
  setJoinClaimCode(event) {
    this.setData({ joinClaimCode: event.detail.value.slice(0, 16) })
  },
  issueClaimCode(event) {
    if (!this.canEditRoom()) return
    const room = getRoom(this.roomId)
    const memberId = event.currentTarget.dataset.id
    const member = room.members.find((item) => item.id === memberId)
    if (!member || !room.currentUserIsOwner || !room.cloudId) return
    wx.showLoading({ title: '生成认领码' })
    cloudIssueClaimCode(room, memberId).then((result) => {
      wx.hideLoading()
      wx.showModal({
        title: `${member.name}的认领码`,
        content: `${result.claimCode}\n请私下发给本人，并告知聚会码 ${room.cloudId}。重新生成后旧码会失效。`,
        confirmText: '复制认领码',
        success: (choice) => {
          if (choice.confirm) wx.setClipboardData({ data: result.claimCode })
        }
      })
    }).catch((error) => {
      wx.hideLoading()
      wx.showToast({ title: error.message || '生成失败', icon: 'none' })
    })
  },
  chooseJoinLocation() {
    wx.chooseLocation({
      success: (result) => {
        this.setData({
          joinLatitude: result.latitude,
          joinLongitude: result.longitude,
          joinLocationName: result.name || result.address || '已选择位置',
          editLocationChanged: true
        })
      },
      fail: () => wx.showToast({ title: '未选择位置', icon: 'none' })
    })
  },
  locateJoinMe() {
    wx.showLoading({ title: '正在获取位置' })
    wx.getLocation({
      type: 'gcj02',
      isHighAccuracy: true,
      success: (result) => {
        wx.hideLoading()
        this.setData({
          joinLatitude: result.latitude,
          joinLongitude: result.longitude,
          joinLocationName: `当前位置 · ${result.latitude.toFixed(4)}, ${result.longitude.toFixed(4)}`,
          editLocationChanged: true
        })
        wx.showToast({ title: '已获取位置', icon: 'success' })
      },
      fail: () => {
        wx.hideLoading()
        wx.showModal({ title: '无法获取位置', content: '请允许位置权限，或手动在地图选点。', showCancel: false })
      }
    })
  },
  selectJoinTransport(event) {
    this.setData({ joinTransport: event.currentTarget.dataset.transport })
  },
  selectJoinBudget(event) {
    this.setData({ joinBudget: Number(event.currentTarget.dataset.budget) })
  },
  toggleJoinApproximate(event) {
    this.setData({ joinApproximate: event.detail.value })
  },
  submitJoin() {
    if (!this.canEditRoom()) return
    if (this.data.joinSubmitting) return
    const name = this.data.joinName.trim()
    if (!name) {
      wx.showToast({ title: '请输入你的名字', icon: 'none' })
      return
    }
    if (!Number.isFinite(this.data.joinLatitude) || !Number.isFinite(this.data.joinLongitude)) {
      wx.showToast({ title: '请选择你的出发位置', icon: 'none' })
      return
    }
    if (this.data.editingMember && this.data.editOriginalApproximate && !this.data.joinApproximate && !this.data.editLocationChanged) {
      wx.showToast({ title: '请重新选择精确位置', icon: 'none' })
      return
    }
    const room = getRoom(this.roomId)
    const member = prepareMemberLocation({
      name,
      shortName: name.slice(0, 1),
      color: memberColors[room.members.length % memberColors.length],
      latitude: this.data.joinLatitude,
      longitude: this.data.joinLongitude,
      locationName: this.data.joinLocationName,
      transport: this.data.joinTransport,
      budget: this.data.joinBudget,
      approximate: this.data.joinApproximate
    })
    this.setData({ joinSubmitting: true })
    const wasEditing = this.data.editingMember
    const save = wasEditing
      ? updateMyMember(this.roomId, member)
      : addMemberToRoom(this.roomId, member, this.data.joinClaimCode)
    return save.then((savedRoom) => {
      this.setData({ joinSubmitting: false })
      this.closeJoinModal()
      wx.showToast({ title: wasEditing ? '已更新我的信息' : '已成功加入聚会', icon: 'success' })
      return this.loadRoom(true).then(() => {
        this.startWatch()
        if (savedRoom.schemaVersion === 2) {
          if (savedRoom.autoRecommendNow) return this.refreshNearby()
        } else if (!savedRoom.cloudId || savedRoom.currentUserIsOwner) {
          return this.refreshNearby()
        }
      })
    }).catch((error) => {
      this.setData({ joinSubmitting: false })
      wx.showToast({ title: error.message || '加入失败', icon: 'none' })
    })
  },
  canEditRoom() {
    const room = getRoom(this.roomId)
    return Boolean(room && !room.endedAt)
  },
  endCurrentRoom() {
    const room = getRoom(this.roomId)
    if (!room || !room.currentUserIsOwner || room.endedAt || this.data.endingRoom) return
    wx.showModal({ title: '结束本次聚会', content: '结束后无法再加入、修改或投票。结束不等于删除位置：数据仍按原保留期限删除，也可主动删除整个聚会。', success: (choice) => {
      if (!choice.confirm || this.data.endingRoom) return
      this.setData({ endingRoom: true })
      endRoom(this.roomId).then(() => this.loadRoom(true))
        .catch((e) => wx.showToast({ title: e.message || '结束失败', icon: 'none' }))
        .finally(() => this.setData({ endingRoom: false }))
    } })
  },
  repeatRoom() {
    const room = getRoom(this.roomId)
    if (!room || room.preview || !(room.currentUserIsOwner || room.members.some((m) => m.id === room.currentMemberId))) return
    wx.navigateTo({ url: `/pages/create/create?repeatFrom=${encodeURIComponent(room.id)}` })
  },
  inviteFriends() {
    wx.showModal({ title: '邀请朋友', content: '右上角"···"可将聚会分享给朋友。朋友打开链接后可以加入聚会并提交位置。', showCancel: false, confirmText: '知道了' })
  },
  deleteCurrentRoom() {
    const room = getRoom(this.roomId)
    wx.showModal({
      title: '删除聚会',
      content: '删除后，聚会码、成员位置和投票都无法恢复。',
      confirmText: '删除',
      confirmColor: '#d14343',
      success: (result) => {
        if (!result.confirm) return
        wx.showLoading({ title: '正在删除' })
        cloudDeleteRoom(room).then(() => {
          wx.hideLoading()
          wx.reLaunch({ url: '/pages/index/index' })
        }).catch((error) => {
          wx.hideLoading()
          wx.showToast({ title: error.message || '删除失败', icon: 'none' })
        })
      }
    })
  },
  leaveCurrentRoom() {
    const room = getRoom(this.roomId)
    wx.showModal({
      title: '退出聚会',
      content: '退出后，你的位置和投票会从这次聚会中删除。',
      confirmText: '退出并删除',
      confirmColor: '#d14343',
      success: (result) => {
        if (!result.confirm) return
        wx.showLoading({ title: '正在退出' })
        cloudLeaveRoom(room).then(() => {
          wx.hideLoading()
          wx.reLaunch({ url: '/pages/index/index' })
        }).catch((error) => {
          wx.hideLoading()
          wx.showToast({ title: error.message || '退出失败', icon: 'none' })
        })
      }
    })
  },
  copyRoomCode() {
    const room = getRoom(this.roomId)
    if (!room) {
      wx.showToast({ title: '聚会数据异常', icon: 'none' })
      return
    }
    const code = room.cloudId || encodeRoom(room)
    const isShortCode = Boolean(room.cloudId)
    console.log('[copyRoomCode] 短码:', isShortCode, '长度:', code.length)
    this.setData({
      codePreview: isShortCode ? code : code.slice(0, 12) + '...',
      codeLabel: isShortCode ? '聚会码 · 6 位' : '聚会码 · 长码'
    })
    wx.setClipboardData({
      data: code,
      success: () => wx.showToast({ title: isShortCode ? '聚会码已复制，可直接念给朋友' : '长码已复制，发送给朋友即可', icon: 'none' })
    })
  },
  onShareAppMessage() {
    const room = this.data.room || {}
    const sharePath = room.cloudId ? `/pages/room/room?id=${room.cloudId}` : `/pages/room/room?id=${this.roomId}`
    return {
      title: room.finalVenue ? `${room.title || '聚会'} · ${room.dateText} 在${room.finalVenue.name}见面` : `${room.title || '聚会'} · 一起找个公平的碰头地点`,
      path: sharePath,
      imageUrl: ''
    }
  }
})
