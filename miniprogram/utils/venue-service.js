function getSearchSource() {
  return {
    ready: true,
    provider: 'cloud',
    title: '真实搜索已开启',
    detail: '地点搜索通过云函数完成，地图密钥不会进入小程序包。'
  }
}

function getNearbyVenues(origins, category, meetingDate, meetingTime) {
  return new Promise((resolve, reject) => {
    if (!wx.cloud || !wx.cloud.callFunction) {
      reject(new Error('云开发不可用，无法搜索附近地点'))
      return
    }
    wx.cloud.callFunction({
      name: 'venueService',
      data: { origins, category: category || 'all', meetingDate, meetingTime },
      success: (response) => {
        const result = response.result || {}
        if (!result.ok) {
          reject(new Error(result.message || '地点搜索失败'))
          return
        }
        resolve({ venues: result.venues || [], source: result.source || null })
      },
      fail: (error) => reject(new Error((error && error.errMsg) || '地点搜索云函数调用失败'))
    })
  })
}

function getRouteMatrix(members, venues, meetingDate, meetingTime) {
  return new Promise((resolve) => {
    if (!wx.cloud || !wx.cloud.callFunction || !venues.length) {
      resolve({ available: false, routeMatrix: {} })
      return
    }
    wx.cloud.callFunction({
      name: 'venueService',
      data: { action: 'routes', members, venues, meetingDate, meetingTime },
      success: (response) => {
        const result = response.result || {}
        resolve(result.ok ? result : { available: false, routeMatrix: {} })
      },
      fail: () => resolve({ available: false, routeMatrix: {} })
    })
  })
}

function getRoutePreview(origin, destination, mode) {
  return new Promise((resolve, reject) => {
    if (!wx.cloud || !wx.cloud.callFunction) return reject(new Error('云开发不可用，请使用地图导航'))
    wx.cloud.callFunction({ name: 'venueService', data: { action: 'routePreview',
      origin: { latitude: origin.latitude, longitude: origin.longitude },
      destination: { latitude: destination.latitude, longitude: destination.longitude }, mode },
    success: ({ result }) => {
      if (!result || !result.ok || !Array.isArray(result.routes) || !result.routes.length) {
        reject(new Error(result && result.message || '暂无可用路线，请使用地图导航'))
        return
      }
      resolve(result)
    }, fail: () => reject(new Error('路线查询失败，请稍后重试或使用地图导航')) })
  })
}

module.exports = { getNearbyVenues, getRouteMatrix, getSearchSource, getRoutePreview }
