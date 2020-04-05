import assert from 'assert'
import { Request } from 'express'
import { MongoClient, ObjectID } from 'mongodb'
import { MongoMemoryServer } from 'mongodb-memory-server'

export function getMockType(arg) {
  return <jest.Mock<typeof arg>>arg
}

export async function mongoSetup() {
  const mongoServer = new MongoMemoryServer()
  const uri = await mongoServer.getConnectionString()
  return { uri, mongoServer }
}

export async function getDbConnection(uri: string) {
  assert.strictEqual(process.env.NODE_ENV, 'test')

  const client = await MongoClient.connect(uri, {
    useNewUrlParser: true,
    useUnifiedTopology: true
  })

  return client
}

export async function dropCollection(uri: string, name: string) {
  const client = await getDbConnection(uri)
  const db = client.db('mzm')

  const collections = (await db.collections()).map(c => c.collectionName)
  if (!collections.includes(name)) {
    return Promise.resolve()
  }
  return await db.collection(name).drop()
}

type TestRequest = Request & { file?: { [key: string]: string | number } }

export function createRequest(
  userId: ObjectID | null,
  {
    params,
    query,
    body,
    file
  }: {
    params?: { [key: string]: string }
    query?: { [key: string]: string }
    body?: any
    file?: { [key: string]: string | number }
  }
): TestRequest {
  const req = {
    headers: {
      'x-user-id': userId?.toHexString()
    },
    query: {},
    params: {},
    body: {}
  } as any

  if (params) {
    req.params = params
  }

  if (query) {
    req.query = query
  }

  if (body) {
    req.body = body
  }

  if (file) {
    req.file = file
  }

  return req as TestRequest
}
