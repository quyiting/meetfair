const Module = require('module')
const clone = (value) => JSON.parse(JSON.stringify(value))
function merge(target, patch) {
  Object.keys(patch).forEach((key) => {
    const value = patch[key]
    if (value && value.__setValue) target[key] = value.__setValue
    else if (value && !Array.isArray(value) && typeof value === 'object' && target[key] && typeof target[key] === 'object' && !Array.isArray(target[key])) merge(target[key], value)
    else target[key] = value
  })
}

// 仅替代 CloudBase 边界；测试运行真实 action、事务回调和校验。
module.exports = function roomCloud(room) {
  let openid = 'owner'
  const doc = { _id: 'test-room', code: 'ABC234', owner: 'owner', expiresAt: Date.now() + 3600000,
    signals: {}, memberBindings: [{ memberId: 'self', openid: 'owner' }, { memberId: 'friend', openid: 'guest' }], room: clone(room) }
  const collection = {
    where() { return { limit() { return this }, async get() { return { data: [clone(doc)] } } } },
    doc() { return {
      async get() { return { data: clone(doc) } },
      async set() {}, async remove() {},
      async update({ data }) { merge(doc, clone(data)) }
    } }
  }
  let queue = Promise.resolve()
  const db = { command: { set: (v) => ({ __setValue: v }) }, collection: () => collection,
    async runTransaction(fn) {
      const previous = queue; let release
      queue = new Promise((resolve) => { release = resolve })
      await previous
      try { return await fn({ collection: () => collection }) } finally { release() }
    } }
  const original = Module._load
  Module._load = function (name, ...args) {
    return name === 'wx-server-sdk' ? { init() {}, database: () => db, getWXContext: () => ({ OPENID: openid }) }
      : original.call(this, name, ...args)
  }
  const path = require.resolve('../../cloudfunctions/roomService')
  delete require.cache[path]
  const service = require(path)
  Module._load = original
  return { doc, as(value) { openid = value }, call(action, payload = {}) { return service.main({ action, code: doc.code, ...payload }) } }
}
