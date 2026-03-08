import { describe, it, expect, afterEach, afterAll, beforeEach, vi } from 'vitest'
import Fastify from 'fastify'
import { authPlugin } from '../../auth/index.js'
import { progressPlugin } from '../index.js'
import { createMockFirebaseAuth } from '@mycscompanion/config/test-utils'
import { db } from '../../../shared/db.js'
import { generateId } from '../../../shared/id.js'
import type { OverviewContentLoader } from './overview.js'

const TEST_UID = 'test-session-end-uid'
const OTHER_UID = 'test-session-end-other-uid'
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
let sessionId: string

beforeEach(async () => {
  trackId = generateId()
  milestoneId = generateId()
  sessionId = generateId()

  await db
    .insertInto('users')
    .values([
      { id: TEST_UID, email: 'session-end-test@example.com' },
      { id: OTHER_UID, email: 'session-end-other@example.com' },
    ])
    .execute()

  await db
    .insertInto('tracks')
    .values({ id: trackId, name: 'Test Track', slug: 'test-track' })
    .execute()

  await db
    .insertInto('milestones')
    .values({ id: milestoneId, track_id: trackId, title: 'Test Milestone', slug: 'test-milestone', position: 1 })
    .execute()

  await db
    .insertInto('sessions')
    .values({
      id: sessionId,
      user_id: TEST_UID,
      milestone_id: milestoneId,
      is_active: true,
      started_at: new Date('2026-03-01T10:00:00Z'),
    })
    .execute()
})

afterEach(async () => {
  vi.restoreAllMocks()
  await db.deleteFrom('session_summaries').execute()
  await db.deleteFrom('code_snapshots').execute()
  await db.deleteFrom('submissions').execute()
  await db.deleteFrom('sessions').execute()
  await db.deleteFrom('milestones').execute()
  await db.deleteFrom('tracks').execute()
  await db.deleteFrom('users').execute()
})

afterAll(async () => {
  await app.close()
})

describe('POST /api/progress/sessions/end', () => {
  it('should deactivate session and return ended: true', async () => {
    // Add a snapshot so summary generation has something to work with
    await db
      .insertInto('code_snapshots')
      .values({ id: generateId(), user_id: TEST_UID, milestone_id: milestoneId, session_id: sessionId, code: 'hello', created_at: new Date('2026-03-01T10:05:00Z') })
      .execute()

    const response = await app.inject({
      method: 'POST',
      url: '/api/progress/sessions/end',
      headers: { authorization: 'Bearer valid-token' },
      payload: { sessionId },
    })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({ ended: true })

    // Verify session is deactivated
    const session = await db
      .selectFrom('sessions')
      .select(['is_active', 'ended_at'])
      .where('id', '=', sessionId)
      .executeTakeFirstOrThrow()

    expect(session.is_active).toBe(false)
    expect(session.ended_at).toBeDefined()
  })

  it('should trigger summary generation', async () => {
    // Add a snapshot so summary is generated
    await db
      .insertInto('code_snapshots')
      .values({ id: generateId(), user_id: TEST_UID, milestone_id: milestoneId, session_id: sessionId, code: 'hello', created_at: new Date('2026-03-01T10:05:00Z') })
      .execute()

    await app.inject({
      method: 'POST',
      url: '/api/progress/sessions/end',
      headers: { authorization: 'Bearer valid-token' },
      payload: { sessionId },
    })

    // Summary is fire-and-forget — poll DB until record appears
    let summary: { user_id: string; milestone_id: string; summary_text: string } | undefined
    for (let i = 0; i < 20; i++) {
      summary = await db
        .selectFrom('session_summaries')
        .selectAll()
        .where('session_id', '=', sessionId)
        .executeTakeFirst()
      if (summary) break
      await new Promise((resolve) => setTimeout(resolve, 50))
    }

    expect(summary).toBeDefined()
    expect(summary!.user_id).toBe(TEST_UID)
    expect(summary!.milestone_id).toBe(milestoneId)
    expect(summary!.summary_text).toContain('Working on Test Milestone.')
  })

  it('should return ended: false for session belonging to another user', async () => {
    // Session belongs to TEST_UID, but OTHER_UID is trying to end it
    // Can't easily test another user with the same mock auth, so test with nonexistent session
    const otherSessionId = generateId()
    await db
      .insertInto('sessions')
      .values({
        id: otherSessionId,
        user_id: OTHER_UID,
        milestone_id: milestoneId,
        is_active: true,
        started_at: new Date('2026-03-01T10:00:00Z'),
      })
      .execute()

    const response = await app.inject({
      method: 'POST',
      url: '/api/progress/sessions/end',
      headers: { authorization: 'Bearer valid-token' },
      payload: { sessionId: otherSessionId },
    })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({ ended: false })

    // Verify the other user's session is still active
    const session = await db
      .selectFrom('sessions')
      .select(['is_active'])
      .where('id', '=', otherSessionId)
      .executeTakeFirstOrThrow()

    expect(session.is_active).toBe(true)
  })

  it('should return ended: false for already-ended session', async () => {
    // End the session first
    await db
      .updateTable('sessions')
      .set({ is_active: false, ended_at: new Date() })
      .where('id', '=', sessionId)
      .execute()

    const response = await app.inject({
      method: 'POST',
      url: '/api/progress/sessions/end',
      headers: { authorization: 'Bearer valid-token' },
      payload: { sessionId },
    })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({ ended: false })
  })

  it('should return ended: false for nonexistent sessionId', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/progress/sessions/end',
      headers: { authorization: 'Bearer valid-token' },
      payload: { sessionId: 'nonexistent' },
    })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({ ended: false })
  })

  it('should be idempotent — calling end twice returns ended: false second time', async () => {
    const first = await app.inject({
      method: 'POST',
      url: '/api/progress/sessions/end',
      headers: { authorization: 'Bearer valid-token' },
      payload: { sessionId },
    })
    expect(first.json()).toEqual({ ended: true })

    const second = await app.inject({
      method: 'POST',
      url: '/api/progress/sessions/end',
      headers: { authorization: 'Bearer valid-token' },
      payload: { sessionId },
    })
    expect(second.json()).toEqual({ ended: false })
  })

  it('should return 401 without auth', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/progress/sessions/end',
      payload: { sessionId },
    })

    expect(response.statusCode).toBe(401)
  })

  it('should return 400 with missing sessionId', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/progress/sessions/end',
      headers: { authorization: 'Bearer valid-token' },
      payload: {},
    })

    expect(response.statusCode).toBe(400)
  })
})
