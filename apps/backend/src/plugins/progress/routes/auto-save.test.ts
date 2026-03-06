import { describe, it, expect, afterEach, afterAll, beforeEach, vi } from 'vitest'
import Fastify from 'fastify'
import { authPlugin } from '../../auth/index.js'
import { progressPlugin } from '../index.js'
import { createMockFirebaseAuth } from '@mycscompanion/config/test-utils'
import { db } from '../../../shared/db.js'
import { generateId } from '../../../shared/id.js'
import type { OverviewContentLoader } from './overview.js'

const TEST_UID = 'test-autosave-uid'
const mockAuth = createMockFirebaseAuth(TEST_UID)

const mockContentLoader: OverviewContentLoader = {
  loadMilestoneBrief: vi.fn(async () => null),
  loadMetadata: vi.fn(async () => ({ csConceptLabel: null })),
}

async function buildApp() {
  const app = Fastify({ logger: false })
  await app.register(authPlugin, { firebaseAuth: mockAuth })
  await app.register(progressPlugin, {
    prefix: '/api/progress',
    contentLoader: mockContentLoader,
  })
  await app.ready()
  return app
}

const app = await buildApp()

let trackId: string
let milestoneId: string

beforeEach(async () => {
  trackId = generateId()
  milestoneId = generateId()

  await db
    .insertInto('users')
    .values({ id: TEST_UID, email: 'autosave-test@example.com' })
    .execute()

  await db
    .insertInto('tracks')
    .values({ id: trackId, name: 'Test Track', slug: 'test-track' })
    .execute()

  await db
    .insertInto('milestones')
    .values({ id: milestoneId, track_id: trackId, title: 'Test Milestone', slug: 'test-milestone', position: 1 })
    .execute()
})

afterEach(async () => {
  vi.restoreAllMocks()
  await db.deleteFrom('code_snapshots').execute()
  await db.deleteFrom('sessions').execute()
  await db.deleteFrom('user_milestones').execute()
  await db.deleteFrom('submissions').execute()
  await db.deleteFrom('milestones').execute()
  await db.deleteFrom('tracks').execute()
  await db.deleteFrom('users').execute()
})

afterAll(async () => {
  await app.close()
})

describe('POST /api/progress/save', () => {
  it('should create a code snapshot and return snapshotId', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/progress/save',
      headers: { authorization: 'Bearer valid-token' },
      payload: { milestoneId, code: 'package main\nfunc main() {}' },
    })

    expect(response.statusCode).toBe(200)
    const body = response.json()
    expect(body.snapshotId).toBeDefined()
    expect(typeof body.snapshotId).toBe('string')
  })

  it('should create a new session if none exists', async () => {
    await app.inject({
      method: 'POST',
      url: '/api/progress/save',
      headers: { authorization: 'Bearer valid-token' },
      payload: { milestoneId, code: 'package main' },
    })

    const sessions = await db
      .selectFrom('sessions')
      .selectAll()
      .where('user_id', '=', TEST_UID)
      .where('milestone_id', '=', milestoneId)
      .execute()

    expect(sessions).toHaveLength(1)
    expect(sessions[0]?.is_active).toBe(true)
  })

  it('should reuse existing active session', async () => {
    const sessionId = generateId()
    await db
      .insertInto('sessions')
      .values({
        id: sessionId,
        user_id: TEST_UID,
        milestone_id: milestoneId,
        is_active: true,
      })
      .execute()

    await app.inject({
      method: 'POST',
      url: '/api/progress/save',
      headers: { authorization: 'Bearer valid-token' },
      payload: { milestoneId, code: 'package main' },
    })

    const snapshot = await db
      .selectFrom('code_snapshots')
      .selectAll()
      .where('user_id', '=', TEST_UID)
      .executeTakeFirst()

    expect(snapshot?.session_id).toBe(sessionId)
  })

  it('should accept empty code string', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/progress/save',
      headers: { authorization: 'Bearer valid-token' },
      payload: { milestoneId, code: '' },
    })

    expect(response.statusCode).toBe(200)

    const snapshot = await db
      .selectFrom('code_snapshots')
      .selectAll()
      .where('user_id', '=', TEST_UID)
      .executeTakeFirst()

    expect(snapshot?.code).toBe('')
  })

  it('should return 401 without valid auth token', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/progress/save',
      payload: { milestoneId, code: 'package main' },
    })

    expect(response.statusCode).toBe(401)
  })

  it('should return 400 with missing milestoneId', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/progress/save',
      headers: { authorization: 'Bearer valid-token' },
      payload: { code: 'package main' },
    })

    expect(response.statusCode).toBe(400)
  })

  it('should return 400 with missing code field', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/progress/save',
      headers: { authorization: 'Bearer valid-token' },
      payload: { milestoneId },
    })

    expect(response.statusCode).toBe(400)
  })

  it('should append multiple snapshots without overwriting', async () => {
    for (let i = 0; i < 3; i++) {
      await app.inject({
        method: 'POST',
        url: '/api/progress/save',
        headers: { authorization: 'Bearer valid-token' },
        payload: { milestoneId, code: `version ${i}` },
      })
    }

    const snapshots = await db
      .selectFrom('code_snapshots')
      .selectAll()
      .where('user_id', '=', TEST_UID)
      .where('milestone_id', '=', milestoneId)
      .execute()

    expect(snapshots).toHaveLength(3)
  })

  it('should return 500 when DB is unreachable', async () => {
    // Use an invalid milestone_id to trigger FK constraint violation (simulates DB error)
    const response = await app.inject({
      method: 'POST',
      url: '/api/progress/save',
      headers: { authorization: 'Bearer valid-token' },
      payload: { milestoneId: 'nonexistent-milestone', code: 'package main' },
    })

    expect(response.statusCode).toBe(500)
  })
})
