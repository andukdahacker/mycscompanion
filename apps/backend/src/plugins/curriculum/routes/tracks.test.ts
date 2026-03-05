import { describe, it, expect, afterEach, afterAll, beforeEach, vi } from 'vitest'
import Fastify from 'fastify'
import type { Redis } from 'ioredis'
import { authPlugin } from '../../auth/index.js'
import { curriculumPlugin } from '../index.js'
import { createMockFirebaseAuth, createMockRedis } from '@mycscompanion/config/test-utils'
import { db } from '../../../shared/db.js'
import { generateId } from '../../../shared/id.js'

const TEST_UID = 'test-curriculum-uid'
const mockAuth = createMockFirebaseAuth(TEST_UID)
const mockRedis = createMockRedis()

const CONTENT_ROOT = '/tmp/test-content-milestones'

async function buildApp() {
  const app = Fastify({ logger: false })
  await app.register(authPlugin, { firebaseAuth: mockAuth })
  await app.register(curriculumPlugin, {
    prefix: '/api/curriculum',
    redis: mockRedis as unknown as Redis,
    contentRoot: CONTENT_ROOT,
  })
  await app.ready()
  return app
}

const app = await buildApp()

let trackId: string

beforeEach(async () => {
  trackId = generateId()
  await db
    .insertInto('tracks')
    .values({
      id: trackId,
      name: 'Build Your Own Database',
      slug: 'build-your-own-database',
      description: 'Learn CS by building a database.',
    })
    .execute()

  await db
    .insertInto('milestones')
    .values([
      { id: generateId(), track_id: trackId, title: 'Simple Key-Value Store', slug: 'kv-store', position: 1, description: 'Build a KV store.' },
      { id: generateId(), track_id: trackId, title: 'Storage Engine', slug: 'storage-engine', position: 2, description: 'Build a storage engine.' },
    ])
    .execute()
})

afterEach(async () => {
  vi.restoreAllMocks()
  await db.deleteFrom('milestones').execute()
  await db.deleteFrom('tracks').execute()
})

afterAll(async () => {
  await app.close()
})

describe('GET /api/curriculum/tracks', () => {
  it('should return tracks with milestones in position order', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/curriculum/tracks',
      headers: { authorization: 'Bearer valid-token' },
    })

    expect(response.statusCode).toBe(200)
    const body = response.json()
    expect(body.items).toHaveLength(1)
    expect(body.items[0].name).toBe('Build Your Own Database')
    expect(body.items[0].slug).toBe('build-your-own-database')
    expect(body.items[0].description).toBe('Learn CS by building a database.')
    expect(body.items[0].milestones).toHaveLength(2)
    expect(body.items[0].milestones[0].title).toBe('Simple Key-Value Store')
    expect(body.items[0].milestones[0].position).toBe(1)
    expect(body.items[0].milestones[1].title).toBe('Storage Engine')
    expect(body.items[0].milestones[1].position).toBe(2)
    expect(body.nextCursor).toBeNull()
  })

  it('should return camelCase field names', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/curriculum/tracks',
      headers: { authorization: 'Bearer valid-token' },
    })

    expect(response.statusCode).toBe(200)
    const body = response.json()
    const track = body.items[0]
    expect('id' in track).toBe(true)
    expect('name' in track).toBe(true)
    expect('slug' in track).toBe(true)
    expect('milestones' in track).toBe(true)
  })

  it('should support cursor-based pagination with nextCursor', async () => {
    const track2Id = generateId()
    await db
      .insertInto('tracks')
      .values({
        id: track2Id,
        name: 'Second Track',
        slug: 'second-track',
        description: 'Another track.',
      })
      .execute()

    const firstPage = await app.inject({
      method: 'GET',
      url: '/api/curriculum/tracks?pageSize=1',
      headers: { authorization: 'Bearer valid-token' },
    })

    expect(firstPage.statusCode).toBe(200)
    const firstBody = firstPage.json()
    expect(firstBody.items).toHaveLength(1)
    expect(firstBody.nextCursor).not.toBeNull()

    const secondPage = await app.inject({
      method: 'GET',
      url: `/api/curriculum/tracks?pageSize=1&afterCursor=${firstBody.nextCursor}`,
      headers: { authorization: 'Bearer valid-token' },
    })

    expect(secondPage.statusCode).toBe(200)
    const secondBody = secondPage.json()
    expect(secondBody.items).toHaveLength(1)
    expect(secondBody.items[0].name).not.toBe(firstBody.items[0].name)
    expect(secondBody.nextCursor).toBeNull()

    await db.deleteFrom('tracks').where('id', '=', track2Id).execute()
  })

  it('should return 401 when no auth token provided', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/curriculum/tracks',
    })

    expect(response.statusCode).toBe(401)
  })
})
