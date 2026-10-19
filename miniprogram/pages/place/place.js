const { getRoom, updateRoom, cloudToggleVote } = require('../../utils/store')
const { recommendVenues } = require('../../utils/recommend')
const { getRoutePreview } = require('../../utils/venue-service')
const { normalizeTransport, TRANSPORT_LABELS } = require('../../utils/constants')

Page({
  data: {
    room: null,
    venue: null,
    markers: [], mapPoints: [], polylines: [], canPreviewRoute: false,
    routeOpened: false, routeStatus: 'idle', routeError: '', routes: [], selectedRouteIndex: 0, selectedRoute: null,
    routeMode: 'transit', approximateStart: false,
    routeModes: ['transit', 'driving', 'walking', 'bicycle'].map((id) => ({ id, label: TRANSPORT_LABELS[id] }))
  },
  onLoad(options) {
    this.roomId = options.roomId
    this.venueId = options.venueId
  },
  onShow() {
    if (this.roomId) this.loadData()
  },
  onUnload() { this.routeRequestId = (this.routeRequestId || 0) + 1 },
  loadData() {
    const room = getRoom(this.roomId)
    const venue = room && recommendVenues(room, 'all').find((item) => item.id === this.venueId)
    if (!room || !venue || room.preview) {
      this.routeRequestId = (this.routeRequestId || 0) + 1
      this.routeContext = ''
      this.setData({ room: null, venue: null, markers: [], mapPoints: [], polylines: [], routes: [], selectedRoute: null, canPreviewRoute: false })
      return
    }
    const votes = (room.votes && room.votes[venue.id]) || []
    const hasVoted = votes.indexOf(room.currentMemberId) >= 0
    const hydratedVenue = Object.assign({}, venue, {
      voteCount: votes.length,
      hasVoted,
      voteButtonText: hasVoted ? '♥ 已投票' : '♥ 投票',
      voteSuffix: votes.length ? `(${votes.length})` : ''
    })
    const memberMarkers = room.members.map((member, index) => ({ id: index + 1, latitude: member.latitude, longitude: member.longitude, width: 24, height: 30, iconPath: '/images/marker-member.svg' }))
    const markers = memberMarkers.concat([{ id: 100, latitude: venue.latitude, longitude: venue.longitude, width: 36, height: 45, iconPath: '/images/marker-place.svg', callout: { content: venue.name, display: 'ALWAYS', padding: 7, borderRadius: 10, bgColor: '#1f5eff', color: '#ffffff', fontSize: 11 } }])
    const member = room.members.find((item) => item.id === room.currentMemberId)
    const canPreviewRoute = Boolean(member && Number.isFinite(member.latitude) && Number.isFinite(member.longitude))
    const context = JSON.stringify([room.id, room.currentMemberId, member && member.latitude, member && member.longitude,
      member && member.transport, member && member.approximate, venue.id, venue.latitude, venue.longitude])
    const changed = context !== this.routeContext
    if (changed) {
      this.routeRequestId = (this.routeRequestId || 0) + 1
      this.routeContext = context
    }
    this.setData({ room, venue: hydratedVenue, canPreviewRoute, approximateStart: Boolean(member && member.approximate),
      ...(changed ? { markers, mapPoints: markers.map(({ latitude, longitude }) => ({ latitude, longitude })), polylines: [],
        routeOpened: false, routeStatus: 'idle', routeError: '', routes: [], selectedRoute: null, selectedRouteIndex: 0,
        routeMode: normalizeTransport(member && member.transport) } : {}) })
    wx.setNavigationBarTitle({ title: venue.name })
  },
  async previewMyRoute() {
    if (!this.data.canPreviewRoute || this.data.routeStatus === 'loading') return
    const room = getRoom(this.roomId)
    const member = room && room.members.find((item) => item.id === room.currentMemberId)
    if (!member) { this.loadData(); return }
    const requestId = this.routeRequestId = (this.routeRequestId || 0) + 1
    const context = this.routeContext
    const destination = this.data.venue
    const markers = [
      { id: 1, latitude: member.latitude, longitude: member.longitude, iconPath: '/images/marker-member.svg', width: 24, height: 30,
        callout: { content: '我的出发点', display: 'ALWAYS', padding: 6, borderRadius: 8 } },
      { id: 100, latitude: destination.latitude, longitude: destination.longitude, iconPath: '/images/marker-place.svg', width: 32, height: 40,
        callout: { content: destination.name, display: 'ALWAYS', padding: 6, borderRadius: 8 } }
    ]
    this.setData({ routeOpened: true, routeStatus: 'loading', routeError: '', routes: [], selectedRoute: null,
      polylines: [], markers, mapPoints: markers.map(({ latitude, longitude }) => ({ latitude, longitude })) })
    try {
      const result = await getRoutePreview(member, destination, this.data.routeMode)
      if (requestId !== this.routeRequestId || context !== this.routeContext) return
      this.setData({ routes: result.routes, routeStatus: 'ready', routeSourceLabel: result.provider === 'tencent' ? '腾讯位置服务' : '高德地图' })
      this.showRoute(0)
    } catch (error) {
      if (requestId !== this.routeRequestId || context !== this.routeContext) return
      this.setData({ routeStatus: 'error', routeError: error.message })
    }
  },
  selectRouteMode(event) {
    const mode = event.currentTarget.dataset.mode
    if (!this.data.routeModes.some((item) => item.id === mode) || this.data.routeStatus === 'loading' || mode === this.data.routeMode) return
    this.setData({ routeMode: mode })
    return this.previewMyRoute()
  },
  selectRoute(event) { this.showRoute(Number(event.currentTarget.dataset.index)) },
  showRoute(index) {
    const route = this.data.routes[index]
    if (!route) return
    const colors = { walking: '#64748b', transit: '#16896b', driving: '#1f5eff', bicycle: '#1f5eff' }
    const polylines = route.segments.filter((s) => s.points.length >= 2).map((s) => ({ points: s.points,
      color: colors[s.mode] || '#1f5eff', width: 6, dottedLine: s.mode === 'walking', arrowLine: s.mode !== 'walking' }))
    const mapPoints = this.data.markers.map(({ latitude, longitude }) => ({ latitude, longitude })).concat(polylines.flatMap((line) => line.points))
    this.setData({ selectedRouteIndex: index, selectedRoute: route, polylines, mapPoints }, () => {
      wx.createMapContext('place-map', this).includePoints({ points: mapPoints, padding: [40, 40, 40, 40] })
    })
  },
  toggleVote() {
    const room = getRoom(this.roomId)
    if (!room || room.endedAt) return
    const voterId = room.currentMemberId
    if (!voterId) {
      wx.showToast({ title: '请先加入聚会', icon: 'none' })
      return
    }
    const currentVotes = (room.votes && room.votes[this.venueId]) || []
    const hasVoted = currentVotes.indexOf(voterId) >= 0
    if (room.cloudId) {
      wx.showLoading({ title: '正在同步投票' })
      cloudToggleVote(room, this.venueId).then(() => {
        wx.hideLoading()
        this.loadData()
        wx.showToast({ title: hasVoted ? '已取消投票' : '已投给这个地点', icon: 'none' })
      }).catch((error) => {
        wx.hideLoading()
        wx.showToast({ title: error.message || '投票失败', icon: 'none' })
      })
      return
    }
    room.votes = room.votes || {}
    room.votes[this.venueId] = hasVoted ? currentVotes.filter((id) => id !== voterId) : currentVotes.concat(voterId)
    updateRoom(room)
    this.loadData()
    wx.showToast({ title: hasVoted ? '已取消投票' : '已投给这个地点', icon: 'none' })
  },
  openNavigation() {
    const venue = this.data.venue
    wx.openLocation({ latitude: venue.latitude, longitude: venue.longitude, name: venue.name, address: venue.address, scale: 17 })
  }
})
