const crypto = require('crypto')

const MODES = { transit: 'transit/integrated', driving: 'driving', walking: 'walking', bicycle: 'bicycling' }
const LABELS = { transit: '公共交通', driving: '驾车', walking: '步行', bicycle: '骑行' }
const validPoint = (p) => p && Number.isFinite(p.latitude) && Math.abs(p.latitude) <= 90 &&
  Number.isFinite(p.longitude) && Math.abs(p.longitude) <= 180
const text = (value, fallback = '') => typeof value === 'string' ? value.slice(0, 120) : fallback
const list = (value) => Array.isArray(value) ? value : []
function number(value) {
  if ((typeof value !== 'string' && typeof value !== 'number') || value === '') return null
  const result = Number(value)
  return Number.isFinite(result) && result >= 0 ? result : null
}

function points(polyline) {
  if (typeof polyline !== 'string' || polyline.length > 500000) return []
  const parts = polyline.split(';')
  if (parts.length > 20000) return []
  const result = parts.map((part) => {
    const pair = part.split(',')
    return pair.length === 2 && pair.every((v) => v.trim() !== '')
      ? { longitude: Number(pair[0]), latitude: Number(pair[1]) } : null
  })
  // 不跳过坏点后连成虚假的直线；该段无有效几何时仅显示文字。
  return result.length >= 2 && result.every(validPoint) ? result : []
}

function segment(step, mode) {
  return { mode, label: text(step.instruction, text(step.road_name, text(step.road, LABELS[mode]))),
    points: points(step.polyline) }
}

function transitSegments(route) {
  const result = []
  for (const part of list(route.segments).slice(0, 80)) {
    if (!part || typeof part !== 'object') continue
    list(part.walking && part.walking.steps).forEach((step) => {
      if (step && typeof step === 'object') result.push(segment(step, 'walking'))
    })
    const bus = list(part.bus && (part.bus.buslines || part.bus.steps))[0]
    if (bus) {
      const from = text(bus.departure_stop && bus.departure_stop.name)
      const to = text(bus.arrival_stop && bus.arrival_stop.name)
      const stations = number(bus.via_num)
      result.push({ mode: 'transit', label: text(bus.name, '乘坐公交或地铁'),
        detail: [from && to ? from + ' → ' + to : '', stations !== null ? (stations + 1) + ' 站' : ''].filter(Boolean).join(' · '),
        points: points(bus.polyline) })
    }
    if (part.railway && !Array.isArray(part.railway) && part.railway.name) {
      result.push({ mode: 'transit', label: text(part.railway.name), points: points(part.railway.polyline) })
    }
    if (part.taxi && number(part.taxi.distance) > 0) {
      result.push({ mode: 'driving', label: '出租车接驳', points: points(part.taxi.polyline) })
    }
  }
  return result
}

function normalizeRoutes(payload, mode) {
  const route = payload && payload.route || {}
  return list(mode === 'transit' ? route.transits : route.paths).slice(0, 3).map((item, index) => {
    if (!item || typeof item !== 'object') return null
    const seconds = number(item.cost && item.cost.duration)
    const meters = number(item.distance)
    if (!seconds || seconds > 7 * 86400 || meters === null) return null
    const raw = mode === 'transit' ? transitSegments(item) : list(item.steps).filter(Boolean).map((step) => segment(step, mode))
    return routeResult(index, seconds / 60, meters, raw)
  }).filter(Boolean)
}

function routeResult(index, minutes, meters, raw) {
  const segments = raw.slice(0, 80)
  const limit = Math.max(2, Math.floor(1800 / Math.max(segments.length, 1)))
  segments.forEach((s) => {
    const source = s.points
    if (source.length > limit) s.points = Array.from({ length: limit }, (_, i) => source[Math.round(i * (source.length - 1) / (limit - 1))])
  })
  return { id: String(index), minutes: Math.max(1, Math.ceil(minutes)), distanceKm: Number((meters / 1000).toFixed(1)),
    segments, geometryComplete: raw.length <= 80 && segments.length > 0 && segments.every((s) => s.points.length >= 2) }
}

// 腾讯点串以纬度、经度开头，后续为百万分之一度的差分；不修改原始响应。
function tencentPoints(polyline) {
  if (!Array.isArray(polyline) || polyline.length < 4 || polyline.length > 40000 ||
    polyline.length % 2 || !polyline.every(Number.isFinite)) return []
  const values = polyline.slice()
  for (let i = 2; i < values.length; i++) values[i] = values[i - 2] + values[i] / 1000000
  const result = []
  for (let i = 0; i < values.length; i += 2) result.push({ latitude: values[i], longitude: values[i + 1] })
  return result.every(validPoint) ? result : []
}

function normalizeTencentRoutes(payload, mode) {
  return list(payload && payload.result && payload.result.routes).slice(0, 3).map((item, index) => {
    if (!item || typeof item !== 'object') return null
    const minutes = number(item.duration), meters = number(item.distance)
    if (!minutes || minutes > 7 * 1440 || meters === null) return null
    const full = mode === 'transit' ? [] : tencentPoints(item.polyline)
    const steps = list(item.steps)
    const raw = steps.slice(0, 81).filter(Boolean).map((step) => {
      if (mode === 'transit') {
        if (step.mode === 'TRANSIT') {
          const line = list(step.lines)[0] || {}
          const from = text(line.geton && line.geton.title), to = text(line.getoff && line.getoff.title)
          const stations = number(line.station_count)
          return { mode: 'transit', label: text(line.title, '乘坐公交或地铁'),
            detail: [from && to ? from + ' → ' + to : '', stations !== null ? stations + ' 站' : ''].filter(Boolean).join(' · '),
            points: tencentPoints(line.polyline) }
        }
        const known = step.mode === 'WALKING' || step.mode === 'DRIVING'
        const kind = step.mode === 'DRIVING' ? 'driving' : 'walking'
        return { mode: kind, label: text(step.instruction, known ? LABELS[kind] + '接驳' : '接驳路段，请结合地图导航查看'),
          points: known ? tencentPoints(step.polyline) : [] }
      }
      const idx = list(step.polyline_idx)
      const valid = idx.length === 2 && idx.every(Number.isInteger) && idx[0] >= 0 && idx[0] % 2 === 0 &&
        idx[1] % 2 === 1 && idx[1] > idx[0] && idx[1] < full.length * 2
      return { mode, label: text(step.instruction, LABELS[mode]),
        points: valid ? full.slice(idx[0] / 2, (idx[1] + 1) / 2) : [] }
    })
    if (!steps.length && mode !== 'transit') raw.push({ mode, label: LABELS[mode] + '前往目的地', points: full })
    return routeResult(index, minutes, meters, raw)
  }).filter(Boolean)
}

// routePreview: {origin, destination: {latitude, longitude}, mode}; 当前出发，最多三条方案。
// 只返回当前请求的路线，不写入房间或本地持久化；缓存仅在云函数实例内保留一分钟。
function createRoutePreview(requestJson) {
  const cache = new Map()
  return async function routePreview(event) {
    if (!validPoint(event.origin) || !validPoint(event.destination) || !Object.hasOwn(MODES, event.mode)) {
      return { ok: false, message: '路线预览参数不合法' }
    }
    const provider = process.env.AMAP_KEY ? 'amap' : 'tencent'
    const key = provider === 'amap' ? process.env.AMAP_KEY : process.env.QQ_MAP_KEY
    const sk = (provider === 'amap' ? process.env.AMAP_SK : process.env.QQ_MAP_SK) || ''
    if (!key) return { ok: false, message: '路线预览暂未开通，可先使用地图导航' }
    const coordinate = (p) => p.longitude.toFixed(6) + ',' + p.latitude.toFixed(6)
    const origin = coordinate(event.origin), destination = coordinate(event.destination)
    const cacheKey = crypto.createHash('sha256').update([provider, key, sk, origin, destination, event.mode].join('|')).digest('hex')
    const previous = cache.get(cacheKey)
    if (previous && previous.expiresAt > Date.now()) return previous.promise
    async function request(path, values) {
      const params = { ...values, key }
      if (sk) params.sig = crypto.createHash('md5').update((provider === 'tencent' ? path + '?' : '') +
        Object.keys(params).sort().map((k) => k + '=' + params[k]).join('&') + sk).digest('hex')
      const response = await requestJson(provider === 'amap' ? 'restapi.amap.com' : 'apis.map.qq.com', path, params)
      if (provider === 'tencent' && response.data && response.data.status === 120) throw new Error('地图服务暂时繁忙，请稍后再试')
      if (response.statusCode !== 200 || !response.data || response.data.status !== (provider === 'amap' ? '1' : 0)) throw new Error('地图服务暂不可用，请稍后重试或使用地图导航')
      return response.data
    }
    async function city(location) {
      const data = await request('/v3/geocode/regeo', { location, extensions: 'base' })
      const value = data.regeocode && data.regeocode.addressComponent && data.regeocode.addressComponent.citycode
      if (typeof value !== 'string' || !/^\d{2,6}$/.test(value)) throw new Error('暂无法查询该地区的公交路线，请切换出行方式')
      return value
    }
    const promise = (async () => {
      if (provider === 'tencent') {
        const coordinateQq = (p) => p.latitude.toFixed(6) + ',' + p.longitude.toFixed(6)
        const params = { from: coordinateQq(event.origin), to: coordinateQq(event.destination) }
        if (event.mode === 'driving') params.get_mp = 1
        const type = event.mode === 'bicycle' ? 'bicycling' : event.mode
        const payload = await request('/ws/direction/v1/' + type + '/', params)
        const routes = normalizeTencentRoutes(payload, event.mode)
        if (!routes.length) throw new Error('没有找到可用路线，请切换出行方式或使用地图导航')
        return { ok: true, provider, routes, fetchedAt: Date.now() }
      }
      const params = { origin, destination, show_fields: 'cost,polyline' }
      if (event.mode === 'transit') {
        // 不能把目的地城市当成起点城市；手动提名也可能没有 cityCode。
        params.city1 = await city(origin)
        params.city2 = await city(destination)
        params.AlternativeRoute = 3
      }
      const payload = await request('/v5/direction/' + MODES[event.mode], params)
      const routes = normalizeRoutes(payload, event.mode)
      if (!routes.length) throw new Error('没有找到可用路线，请切换出行方式或使用地图导航')
      return { ok: true, provider: 'amap', routes, fetchedAt: Date.now() }
    })().catch((error) => {
      if (cache.get(cacheKey)?.promise === promise) cache.delete(cacheKey)
      return { ok: false, message: /^(地图服务|暂无法|没有找到)/.test(error.message || '')
        ? error.message : '路线查询失败，请稍后重试或使用地图导航' }
    })
    cache.set(cacheKey, { promise, expiresAt: Date.now() + 60000 })
    if (cache.size > 64) cache.delete(cache.keys().next().value)
    return promise
  }
}

module.exports = { createRoutePreview, normalizeRoutes }
