jest.mock('../lib/logger')

import { Request } from 'express'
import { ObjectID } from 'mongodb'
import { dropCollection } from '../../jest/testUtil'
import { BadRequest, NotFound } from '../lib/errors'
import * as db from '../lib/db'
import { getUserInfo, updateAccount } from './users'

beforeAll(async () => {
  return await db.connect()
})

afterAll(async () => {
  return await db.close()
})

beforeEach(async () => {
  return await dropCollection(db.COLLECTION_NAMES.USERS)
})

test('getUserInfo', async () => {
  const userId = new ObjectID()
  const account = 'aaa'

  await db.collections.users.insertOne({ _id: userId, account })

  const req = {
    headers: {
      'x-user-id': userId.toHexString()
    },
    body: {
      account: account
    }
  }

  const user = await getUserInfo((req as any) as Request)

  const found = await db.collections.users.findOne({ _id: userId })

  expect(user.id).toStrictEqual(found._id.toHexString())
  expect(user.account).toStrictEqual(found.account)
})

test('getUserInfo before signUp', async () => {
  expect.assertions(1)

  const userId = new ObjectID()
  const account = null

  await db.collections.users.insertOne({ _id: userId, account })

  const req = {
    headers: {
      'x-user-id': userId.toHexString()
    }
  }

  try {
    await getUserInfo((req as any) as Request)
  } catch (e) {
    expect(e instanceof NotFound).toStrictEqual(true)
  }
})

test.each([
  ['null', null],
  ['undefined', undefined],
  ['空文字', ''],
  ['space', ' '],
  ['space2', '　'],
  ['space3', '　 　']
])('updateAccount fail (account: %s)', async (_label, account) => {
  expect.assertions(1)

  const userId = new ObjectID()

  const req = {
    headers: {
      'x-user-id': userId.toHexString()
    },
    body: {
      account: account
    }
  }

  try {
    await updateAccount((req as any) as Request)
  } catch (e) {
    expect(e instanceof BadRequest).toStrictEqual(true)
  }
})