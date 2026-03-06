import { describe, it, expect, afterEach, afterAll, beforeEach, vi } from 'vitest'
import Fastify from 'fastify'
import { authPlugin } from '../../auth/index.js'
import { progressPlugin } from '../index.js'
import { createMockFirebaseAuth } from '@mycscompanion/config/test-utils'
import { db } from '../../../shared/db.js'
import { generateId } from '../../../shared/id.js'
import type { OverviewContentLoader } from './overview.js'

const TEST_UID = 'test-session-uid'
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
let otherMilestoneId: string

beforeEach(async () => {
  trackId = generateId()
  milestoneId = generateId()
  otherMilestoneId = generateId()

  await db
    .insertInto('users')
    .values({ id: TEST_UID, email: 'session-test@example.com' })
    .execute()

  await db
    .insertInto('tracks')
    .values({ id: trackId, name: 'Test Track', slug: 'test-track' })
    .execute()

  await db
    .insertInto('milestones')
    .values([
      { id: milestoneId, track_id: trackId, title: 'Test Milestone', slug: 'test-milestone', position: 1 },
      { id: otherMilestoneId, track_id: trackId, title: 'Other Milestone', slug: 'other-milestone', position: 2 },
    ])
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

describe('POST /api/progress/sessions', () => {
  it('should create a new session when none exists', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/progress/sessions',
      headers: { authorization: 'Bearer valid-token' },
      payload: { milestoneId },
    })

    expect(response.statusCode).toBe(200)
    const body = response.json()
    expect(body.session.id).toBeDefined()
    expect(typeof body.session.startedAt).toBe('string')
    expect(body.created).toBe(true)
  })

  it('should return existing active session (idempotent)', async () => {
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

    const response = await app.inject({
      method: 'POST',
      url: '/api/progress/sessions',
      headers: { authorization: 'Bearer valid-token' },
      payload: { milestoneId },
    })

    expect(response.statusCode).toBe(200)
    const body = response.json()
    expect(body.session.id).toBe(sessionId)
    expect(body.created).toBe(false)
  })

  it('should deactivate other active sessions when creating new one for different milestone', async () => {
    const oldSessionId = generateId()
    await db
      .insertInto('sessions')
      .values({
        id: oldSessionId,
        user_id: TEST_UID,
        milestone_id: milestoneId,
        is_active: true,
      })
      .execute()

    const response = await app.inject({
      method: 'POST',
      url: '/api/progress/sessions',
      headers: { authorization: 'Bearer valid-token' },
      payload: { milestoneId: otherMilestoneId },
    })

    expect(response.statusCode).toBe(200)
    const body = response.json()
    expect(body.created).toBe(true)

    // Verify old session was deactivated
    const oldSession = await db
      .selectFrom('sessions')
      .selectAll()
      .where('id', '=', oldSessionId)
      .executeTakeFirst()

    expect(oldSession?.is_active).toBe(false)
    expect(oldSession?.ended_at).not.toBeNull()
  })

  it('should handle concurrent session creation with exactly one active session', async () => {
    // Send two requests concurrently — both should succeed without 500 errors
    const [response1, response2] = await Promise.all([
      app.inject({
        method: 'POST',
        url: '/api/progress/sessions',
        headers: { authorization: 'Bearer valid-token' },
        payload: { milestoneId },
      }),
      app.inject({
        method: 'POST',
        url: '/api/progress/sessions',
        headers: { authorization: 'Bearer valid-token' },
        payload: { milestoneId },
      }),
    ])

    // One succeeds with created=true, the other finds the existing session
    expect(response1.statusCode).toBe(200)
    expect(response2.statusCode).toBe(200)

    // Unique partial index guarantees exactly one active session
    const activeSessions = await db
      .selectFrom('sessions')
      .selectAll()
      .where('user_id', '=', TEST_UID)
      .where('milestone_id', '=', milestoneId)
      .where('is_active', '=', true)
      .execute()

    expect(activeSessions).toHaveLength(1)
  })

  it('should return 401 without auth', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/progress/sessions',
      payload: { milestoneId },
    })

    expect(response.statusCode).toBe(401)
  })

  it('should return 400 with missing milestoneId', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/progress/sessions',
      headers: { authorization: 'Bearer valid-token' },
      payload: {},
    })

    expect(response.statusCode).toBe(400)
  })
})
