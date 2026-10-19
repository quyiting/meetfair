const assert = require('assert')
const { createRoutePreview, normalizeRoutes } = require('../cloudfunctions/venueService/route-preview')

const line = '120.100000,30.200000;120.110000,30.210000;120.120000,30.220000'
const path = { distance: '2600', cost: { duration: '780' }, steps: [{ instruction: '沿道路前往目的地', polyline: line }] }
const transit = { distance: '5200', cost: { duration: '1500' }, segments: [
  { walking: { steps: [{ instruction: '步行到车站', polyline: line }] } },
  { bus: { buslines: [{ name: '测试公交线', departure_stop: { name: '甲站' }, arrival_stop: { name: '乙站' }, via_num: '2', polyline: line },
    { name: '备选公交，不应拼到同一方案', polyline: line }] } }
] }
const event = { origin: { latitude: 30.2, longitude: 120.1 }, destination: { latitude: 30.3, longitude: 120.3 }, mode: 'transit' }
const oldKey = process.env.AMAP_KEY, oldSk = process.env.AMAP_SK
const oldQqKey = process.env.QQ_MAP_KEY, oldQqSk = process.env.QQ_MAP_SK

async function run() {
  const result = normalizeRoutes({ route: { transits: [transit] } }, 'transit')[0]
  assert.strictEqual(result.minutes, 25)
  assert.strictEqual(result.segments.length, 2)
  assert.strictEqual(result.segments[1].detail, '甲站 → 乙站 · 3 站')
  assert.deepStrictEqual(result.segments[0].points[0], { longitude: 120.1, latitude: 30.2 })
  assert(result.geometryComplete)
  for (const mode of ['walking', 'driving', 'bicycle']) {
    const route = normalizeRoutes({ route: { paths: [path] } }, mode)[0]
    assert.strictEqual(route.minutes, 13)
    assert.strictEqual(route.segments[0].mode, mode)
  }
  const malformed = { ...path, steps: [{ polyline: '120,30;NaN,31;121,31' }] }
  const partial = normalizeRoutes({ route: { paths: [malformed] } }, 'walking')[0]
  assert(!partial.geometryComplete)
  assert.deepStrictEqual(partial.segments[0].points, [], '不能跨过坏点伪造路线')
  assert.deepStrictEqual(normalizeRoutes({ route: { paths: [{ cost: { duration: [] }, distance: '5' }] } }, 'walking'), [])
  const dense = Array.from({ length: 5000 }, (_, i) => `${120 + i / 100000},30`).join(';')
  const bounded = normalizeRoutes({ route: { paths: [{ ...path, steps: [{ polyline: dense }] }] } }, 'driving')[0]
  assert(bounded.segments[0].points.length <= 1800)
  assert.strictEqual(bounded.segments[0].points.at(-1).longitude, 120.04999)

  const calls = []
  const preview = createRoutePreview(async (host, url, params) => {
    calls.push({ host, url, params })
    if (url.includes('regeo')) return { statusCode: 200, data: { status: '1', regeocode: { addressComponent: { citycode: calls.length === 1 ? '0571' : '0572' } } } }
    return { statusCode: 200, data: { status: '1', route: { transits: [transit], paths: [path] } } }
  })
  delete process.env.AMAP_KEY
  delete process.env.QQ_MAP_KEY
  assert.strictEqual((await preview(event)).ok, false)
  process.env.AMAP_KEY = 'simulation-only'
  process.env.AMAP_SK = 'simulation-signature'
  const responses = await Promise.all([preview(event), preview(event)])
  assert(responses.every((r) => r.ok))
  assert.strictEqual(calls.length, 3, '并发相同路线共享一次请求，公交分别解析两端城市')
  assert.strictEqual(calls[2].params.city1, '0571')
  assert.strictEqual(calls[2].params.city2, '0572')
  assert.strictEqual(calls[2].params.show_fields, 'cost,polyline')
  assert.strictEqual(calls[2].params.AlternativeRoute, 3)
  assert(calls.every((c) => /^[a-f0-9]{32}$/.test(c.params.sig)))
  await preview({ ...event, mode: 'walking' })
  assert.strictEqual(calls.length, 4, '步行无需解析城市')
  assert.strictEqual((await preview({ ...event, origin: { latitude: 100, longitude: 120 } })).ok, false)
  assert.strictEqual((await preview({ ...event, mode: '__proto__' })).ok, false)
  assert.strictEqual(calls.length, 4, '非法参数不得请求地图')
  let attempts = 0
  const retry = createRoutePreview(async () => {
    if (++attempts === 1) throw new Error('network with secret simulation-only')
    return { statusCode: 200, data: { status: '1', route: { paths: [path] } } }
  })
  const failed = await retry({ ...event, mode: 'driving' })
  assert(!failed.ok && !failed.message.includes('simulation-only'))
  assert((await retry({ ...event, mode: 'driving' })).ok, '失败不能污染缓存')
  // 只有腾讯 Key 的部署也应返回真实路线；坐标压缩和分钟单位不能沿用高德格式。
  delete process.env.AMAP_KEY
  process.env.QQ_MAP_KEY = 'qq-simulation-only'
  process.env.QQ_MAP_SK = 'qq-simulation-signature'
  const qqCalls = []
  const compressed = [30.2, 120.1, 10000, 10000, 10000, 10000]
  const qqPath = { duration: 13, distance: 2600, polyline: compressed,
    steps: [{ instruction: '步行前往路口', polyline_idx: [0, 3] }, { instruction: '前往目的地', polyline_idx: [2, 5] }] }
  const qqTransit = { duration: 25, distance: 5200, steps: [
    { mode: 'WALKING', polyline: compressed },
    { mode: 'TRANSIT', lines: [{ title: '测试地铁', station_count: 3, geton: { title: '甲站' }, getoff: { title: '乙站' }, polyline: compressed },
      { title: '同段备选线路', polyline: compressed }] }
  ] }
  const qqPreview = createRoutePreview(async (host, url, params) => {
    qqCalls.push({ host, url, params })
    return { statusCode: 200, data: { status: 0, result: { routes: [url.includes('transit') ? qqTransit : qqPath] } } }
  })
  const qqResult = await qqPreview({ ...event, mode: 'walking' })
  assert(qqResult.ok, '未配置高德时使用腾讯路线接口')
  assert.strictEqual(qqResult.provider, 'tencent')
  assert.strictEqual(qqResult.routes[0].minutes, 13)
  assert.strictEqual(qqResult.routes[0].segments.length, 2)
  assert.strictEqual(qqResult.routes[0].segments[1].points[0].latitude.toFixed(6), '30.210000')
  assert.strictEqual(qqResult.routes[0].segments[1].points[1].longitude.toFixed(6), '120.120000')
  assert.strictEqual(qqCalls[0].host, 'apis.map.qq.com')
  assert.strictEqual(qqCalls[0].url, '/ws/direction/v1/walking/')
  assert.strictEqual(qqCalls[0].params.from, '30.200000,120.100000')
  const expectedSig = require('crypto').createHash('md5').update('/ws/direction/v1/walking/?from=30.200000,120.100000&key=qq-simulation-only&to=30.300000,120.300000qq-simulation-signature').digest('hex')
  assert.strictEqual(qqCalls[0].params.sig, expectedSig, '腾讯签名包含路径和原始排序参数')
  const qqBus = await qqPreview(event)
  assert.strictEqual(qqBus.routes[0].segments.length, 2, '同段备选车次不应连接到同一方案')
  assert.strictEqual(qqBus.routes[0].segments[1].detail, '甲站 → 乙站 · 3 站')
  assert(qqBus.routes[0].geometryComplete)
  for (const mode of ['driving', 'bicycle']) assert((await qqPreview({ ...event, mode })).ok)
  const invalidQq = createRoutePreview(async () => ({ statusCode: 200, data: { status: 0, result: {
    routes: [{ ...qqPath, polyline: [30.2, 120.1, NaN, 1] }] } } }))
  const badGeometry = await invalidQq({ ...event, mode: 'walking' })
  assert(!badGeometry.routes[0].geometryComplete)
  assert.deepStrictEqual(badGeometry.routes[0].segments[0].points, [])
  const { main } = require('../cloudfunctions/venueService')
  assert.strictEqual((await main({ action: 'routePreview', ...event, mode: 'invalid' })).ok, false)
  console.log('route preview service tests: ok')
}

run().catch((e) => { console.error(e); process.exitCode = 1 }).finally(() => {
  if (oldKey === undefined) delete process.env.AMAP_KEY
  else process.env.AMAP_KEY = oldKey
  if (oldSk === undefined) delete process.env.AMAP_SK
  else process.env.AMAP_SK = oldSk
  if (oldQqKey === undefined) delete process.env.QQ_MAP_KEY
  else process.env.QQ_MAP_KEY = oldQqKey
  if (oldQqSk === undefined) delete process.env.QQ_MAP_SK
  else process.env.QQ_MAP_SK = oldQqSk
})
