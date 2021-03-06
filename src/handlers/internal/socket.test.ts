jest.mock('../../lib/logger')
jest.mock('../../logic/messages')
jest.mock('../../lib/provider')

import { ObjectID } from 'mongodb'
import { mongoSetup, getMockType } from '../../../jest/testUtil'
import * as db from '../../lib/db'
import * as socket from './socket'
import * as logicMessages from '../../logic/messages'
import {
  addMessageQueue,
  addQueueToUsers,
  addUnreadQueue,
  addUpdateSearchRoomQueue
} from '../../lib/provider'
import * as config from '../../config'

let mongoServer = null

beforeAll(async () => {
  const mongo = await mongoSetup()
  mongoServer = mongo.mongoServer
  return await db.connect(mongo.uri)
})

afterAll(async () => {
  await db.close()
  await mongoServer.stop()
})

test('sendMessage', async () => {
  const roomId = new ObjectID()
  const userId = new ObjectID()

  await db.collections.users.insertOne({
    _id: userId,
    account: 'test',
    roomOrder: []
  })

  const message = 'post'

  const insertedIdMock = new ObjectID()
  const saveMessageMock = getMockType(logicMessages.saveMessage)
  saveMessageMock.mockClear()
  saveMessageMock.mockResolvedValueOnce({ insertedId: insertedIdMock })
  const addQueueToUsersMock = getMockType(addQueueToUsers)
  addQueueToUsersMock.mockClear()
  const addUnreadQueueMock = getMockType(addUnreadQueue)
  addUnreadQueueMock.mockClear()

  await socket.sendMessage(userId.toHexString(), {
    cmd: 'message:send',
    message: message,
    room: roomId.toHexString()
  })

  expect(saveMessageMock.mock.calls.length).toStrictEqual(1)
  const args = saveMessageMock.mock.calls[0]

  expect(args[0]).toStrictEqual(message)
  expect(args[1]).toStrictEqual(roomId.toHexString())
  expect(args[2]).toStrictEqual(userId.toHexString())

  expect(addUnreadQueueMock.mock.calls.length).toStrictEqual(1)
  expect(addQueueToUsersMock.mock.calls.length).toStrictEqual(1)
})

test('fail: sendMessage', async () => {
  const roomId = new ObjectID()
  const userId = new ObjectID()

  await db.collections.users.insertOne({
    _id: userId,
    account: 'test',
    roomOrder: []
  })

  const beforeCount = await db.collections.messages.countDocuments()
  const message = 'a'.repeat(config.message.MAX_MESSAGE_LENGTH + 1)

  const saveMessageMock = getMockType(logicMessages.saveMessage)
  saveMessageMock.mockClear()
  const addQueueToUsersMock = getMockType(addQueueToUsers)
  addQueueToUsersMock.mockClear()
  const addUnreadQueueMock = getMockType(addUnreadQueue)
  addUnreadQueueMock.mockClear()

  await socket.sendMessage(userId.toHexString(), {
    cmd: 'message:send',
    message: message,
    room: roomId.toHexString()
  })

  const afterCount = await db.collections.messages.countDocuments()

  expect(beforeCount).toStrictEqual(afterCount)
  expect(saveMessageMock.mock.calls.length).toStrictEqual(1)
  expect(addUnreadQueueMock.mock.calls.length).toStrictEqual(0)
  expect(addQueueToUsersMock.mock.calls.length).toStrictEqual(0)
})

test('modifyMessage', async () => {
  const roomId = new ObjectID()
  const userId = new ObjectID()
  const createdAt = new Date()

  const user = db.collections.users.insertOne({
    _id: userId,
    account: 'test',
    roomOrder: []
  })

  const message = db.collections.messages.insertOne({
    roomId,
    userId,
    updated: false,
    message: 'insert',
    iine: 0,
    createdAt,
    updatedAt: null
  })

  const [created] = await Promise.all([message, user])

  const addQueueToUsersMock = getMockType(addQueueToUsers)
  addQueueToUsersMock.mockClear()

  await socket.modifyMessage(userId.toHexString(), {
    cmd: 'message:modify',
    id: created.insertedId.toHexString(),
    message: 'modify'
  })

  const updated = await db.collections.messages.findOne({
    _id: created.insertedId
  })

  expect(updated.message).toStrictEqual('modify')
  expect(updated.roomId.toHexString()).toStrictEqual(roomId.toHexString())
  expect(updated.userId.toHexString()).toStrictEqual(userId.toHexString())
  expect(updated.createdAt.getTime()).toStrictEqual(createdAt.getTime())
  expect(updated.updated).toStrictEqual(true)
  expect(updated.updatedAt).not.toBeNull()

  expect(addQueueToUsersMock.mock.calls.length).toStrictEqual(1)
})

test('readMessage', async () => {
  const roomId = new ObjectID()
  const userId = new ObjectID()

  await Promise.all([
    db.collections.users.insertOne({
      _id: userId,
      account: 'test',
      roomOrder: []
    }),
    db.collections.enter.insertOne({
      userId,
      roomId,
      unreadCounter: 10,
      replied: 1
    })
  ])

  const addMessageQueueMock = getMockType(addMessageQueue)
  addMessageQueueMock.mockClear()

  await socket.readMessage(userId.toHexString(), {
    cmd: 'rooms:read',
    room: roomId.toHexString()
  })

  const updated = await db.collections.enter.findOne({ userId, roomId })

  expect(updated.unreadCounter).toStrictEqual(0)
  expect(updated.replied).toStrictEqual(0)

  expect(addMessageQueueMock.mock.calls.length).toStrictEqual(1)
})

test('iine', async () => {
  const userId = new ObjectID()

  const seed = await db.collections.messages.insertOne({
    roomId: new ObjectID(),
    userId,
    message: 'iine',
    iine: 1,
    updated: false,
    createdAt: new Date(),
    updatedAt: null
  })

  await socket.iine(userId.toHexString(), {
    cmd: 'message:iine',
    id: seed.insertedId.toHexString()
  })

  const message = await db.collections.messages.findOne({
    _id: seed.insertedId
  })

  expect(message.iine).toStrictEqual(2)
})

test('openRoom', async () => {
  const queueMock = getMockType(addUpdateSearchRoomQueue)
  queueMock.mockClear()

  const userId = new ObjectID()

  const insert = await db.collections.rooms.insertOne({
    name: userId.toHexString(),
    status: db.RoomStatusEnum.CLOSE,
    createdBy: 'system'
  })

  await socket.openRoom(userId.toHexString(), {
    cmd: socket.ReceiveMessageCmd.ROOMS_OPEN,
    roomId: insert.insertedId.toHexString()
  })

  const updated = await db.collections.rooms.findOne({
    _id: insert.insertedId
  })

  expect(updated.status).toStrictEqual(db.RoomStatusEnum.OPEN)
  expect(updated.updatedBy).toStrictEqual(userId)
  expect(queueMock.call.length).toStrictEqual(1)
})

test('closeRoom', async () => {
  const queueMock = getMockType(addUpdateSearchRoomQueue)
  queueMock.mockClear()

  const userId = new ObjectID()

  const insert = await db.collections.rooms.insertOne({
    name: userId.toHexString(),
    status: db.RoomStatusEnum.OPEN,
    createdBy: 'system'
  })

  await socket.closeRoom(userId.toHexString(), {
    cmd: socket.ReceiveMessageCmd.ROOMS_CLOSE,
    roomId: insert.insertedId.toHexString()
  })

  const updated = await db.collections.rooms.findOne({
    _id: insert.insertedId
  })

  expect(updated.status).toStrictEqual(db.RoomStatusEnum.CLOSE)
  expect(updated.updatedBy).toStrictEqual(userId)
  expect(queueMock.call.length).toStrictEqual(1)
})
