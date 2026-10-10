const assert = require('assert')
const https = require('https')
const { EventEmitter } = require('events')

const originalGet = https.get
const originalAmapKey = process.env.AMAP_KEY
const originalTencentKey = process.env.QQ_MAP_KEY
let mode = 'quota'
let requests = []

// 只替换外部 HTTP 接口；实际搜索、缓存、排队和重试逻辑仍由云函数执行。
https.get = (options, callback) => {
  assert.strictEqual(options.hostname, 'apis.map.qq.com')
  const now = Date.now()
  const recentCount = requests.filter((request) => now - request.at < 1000).length
  const query = new URL('https://' + options.hostname + options.path).searchParams
  requests.push({ at: now })
  let status = 0
  if (mode === 'quota' && recentCount >= 5) status = 120
  if (mode === 'limitOnce' && requests.length === 1) status = 120
  if (mode === 'alwaysLimited') status = 120
  if (mode === 'dailyLimit') status = 121
  if (mode === 'signatureFailure') status = 111
  const messages = { 120: '此key每秒请求量已达到上限', 121: '此key每日调用量已达到上限', 111: '签名验证失败' }
  const request = new EventEmitter()
  request.destroy = (error) => request.emit('error', error)
  setImmediate(() => {
    const response = new EventEmitter()
    response.statusCode = 200
    response.setEncoding = () => {}
    callback(response)
    response.emit('data', JSON.stringify({ status, message: messages[status] || 'query ok',
      data: status ? [] : [{ id: query.get('boundary') + query.get('keyword'), title: '测试地点',
        location: { lat: 31.2, lng: 121.4 }, address: '测试地址' }] }))
    response.emit('end')
  })
  return request
}

delete process.env.AMAP_KEY
process.env.QQ_MAP_KEY = 'simulation-only'
const { main } = require('../cloudfunctions/venueService')

function searchEvent(latitude, category = 'food') {
  return { origins: [{ latitude, longitude: 121.4 }], category,
    meetingDate: '2026-10-11', meetingTime: '18:30' }
}

async function run() {
  const first = searchEvent(31.2, 'all')
  first.origins.push({ latitude: 31.3, longitude: 121.4 }, { latitude: 31.4, longitude: 121.4 })
  const results = await Promise.all([main(first), main(searchEvent(31.5, 'all'))])
  assert(results.every((result) => result.ok), '同一实例并行搜索应共享排队，避免触发 5 QPS 限流')
  assert.strictEqual(results[0].venues.length, 12)
  assert.strictEqual(results[1].venues.length, 4)
  assert.strictEqual(requests.length, 16, '正常搜索不应产生额外重试')
  requests.forEach((request) => {
    assert(requests.filter((other) => other.at >= request.at && other.at < request.at + 1000).length <= 5,
      '任意一秒内最多发送 5 次地点搜索请求')
  })

  mode = 'limitOnce'
  requests = []
  const recovered = await main(searchEvent(31.6))
  assert.strictEqual(recovered.ok, true, '短暂限流后应自动恢复搜索')
  assert.strictEqual(recovered.venues.length, 1)
  assert.strictEqual(requests.length, 2)
  assert(requests[1].at - requests[0].at >= 1000, '限流后至少等待一秒再重试')

  mode = 'alwaysLimited'
  requests = []
  const exhausted = await main(searchEvent(31.7))
  assert.strictEqual(exhausted.ok, false)
  assert.strictEqual(requests.length, 3, '持续限流最多重试两次')
  assert.match(exhausted.message, /繁忙|稍后/)

  for (const failureMode of ['dailyLimit', 'signatureFailure']) {
    mode = failureMode
    requests = []
    const failed = await main(searchEvent(failureMode === 'dailyLimit' ? 31.8 : 31.9))
    assert.strictEqual(failed.ok, false)
    assert.strictEqual(requests.length, 1, '每日额度或签名错误不应自动重试')
  }
  console.log('venue rate limit tests: ok')
}

run().catch((error) => { console.error(error); process.exitCode = 1 }).finally(() => {
  https.get = originalGet
  if (originalAmapKey === undefined) delete process.env.AMAP_KEY
  else process.env.AMAP_KEY = originalAmapKey
  if (originalTencentKey === undefined) delete process.env.QQ_MAP_KEY
  else process.env.QQ_MAP_KEY = originalTencentKey
})
