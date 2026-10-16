function assertRoomEditable(doc) {
  if (doc.room.endedAt) throw new Error('聚会已结束，只能查看、退出或删除')
}

module.exports = { assertRoomEditable }
