import { describe, it, expect, afterEach, afterAll, beforeEach, vi } from 'vitest'
import Fastify from 'fastify'
import { authPlugin } from '../../auth/index.js'
import { tutorPlugin } from '../index.js'
import { createMockFirebaseAuth } from '@mycscompanion/config/test-utils'
import { db } from '../../../shared/db.js'
import { generateId } from '../../../shared/id.js'
import type { AnthropicService } from '../services/anthropic.js'
import type { ContextAssembler } from '../services/context-assembler.js'
import type { RateLimitChecker } from '../../../shared/rate-limiter.js'

const TEST_UID = 'test-tutor-history-uid'
const OTHER_UID = 'other-history-uid'
const mockAuth = createMockFirebaseAuth(TEST_UID)

const mockAnthropicService: AnthropicService = {
  createTutorResponse: vi.fn(async () => ({
    content: 'response',
    model: 'claude-haiku-4-5-20251001',
  })),
}

const mockContextAssembler: ContextAssembler = {
  assembleSystemPrompt: vi.fn(async () => 'prompt'),
}

const mockRateLimiter: RateLimitChecker = {
  check: vi.fn(async () => ({ allowed: true, remaining: 29, retryAfterMs: 0 })),
}

async function buildApp() {
  const app = Fastify({ logger: false })
  await app.register(authPlugin, { firebaseAuth: mockAuth })
  await app.register(tutorPlugin, {
    prefix: '/api/tutor',
    rateLimiter: mockRateLimiter,
    anthropicService: mockAnthropicService,
    contextAssembler: mockContextAssembler,
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
    .values({ id: TEST_UID, email: 'history-test@example.com' })
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
    .values({ id: sessionId, user_id: TEST_UID, milestone_id: milestoneId, is_active: true })
    .execute()
})

afterEach(async () => {
  vi.restoreAllMocks()
  await db.deleteFrom('tutor_messages').execute()
  await db.deleteFrom('session_summaries').execute()
  await db.deleteFrom('code_snapshots').execute()
  await db.deleteFrom('submissions').execute()
  await db.deleteFrom('sessions').execute()
  await db.deleteFrom('user_milestones').execute()
  await db.deleteFrom('milestones').execute()
  await db.deleteFrom('tracks').execute()
  await db.deleteFrom('users').execute()
})

afterAll(async () => {
  await app.close()
})

describe('GET /api/tutor/:sessionId/messages', () => {
  it('should return messages for session in chronological order', async () => {
    const now = new Date()
    await db
      .insertInto('tutor_messages')
      .values([
        {
          id: generateId(),
          session_id: sessionId,
          user_id: TEST_UID,
          role: 'user',
          content: 'First message',
          model: null,
          created_at: new Date(now.getTime()),
        },
        {
          id: generateId(),
          session_id: sessionId,
          user_id: TEST_UID,
          role: 'assistant',
          content: 'First response',
          model: 'claude-haiku-4-5-20251001',
          created_at: new Date(now.getTime() + 1000),
        },
        {
          id: generateId(),
          session_id: sessionId,
          user_id: TEST_UID,
          role: 'user',
          content: 'Second message',
          model: null,
          created_at: new Date(now.getTime() + 2000),
        },
      ])
      .execute()

    const response = await app.inject({
      method: 'GET',
      url: `/api/tutor/${sessionId}/messages`,
      headers: { authorization: 'Bearer valid-token' },
    })

    expect(response.statusCode).toBe(200)
    const body = response.json()
    expect(body.messages).toHaveLength(3)
    expect(body.messages[0].content).toBe('First message')
    expect(body.messages[0].role).toBe('user')
    expect(body.messages[1].content).toBe('First response')
    expect(body.messages[1].role).toBe('assistant')
    expect(body.messages[1].model).toBe('claude-haiku-4-5-20251001')
    expect(body.messages[2].content).toBe('Second message')
    // Verify camelCase conversion
    expect(body.messages[0].createdAt).toBeDefined()
  })

  it('should return 401 without auth token', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/tutor/${sessionId}/messages`,
    })

    expect(response.statusCode).toBe(401)
  })

  it('should return 404 for non-existent session', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/tutor/nonexistent-session/messages',
      headers: { authorization: 'Bearer valid-token' },
    })

    expect(response.statusCode).toBe(404)
    expect(response.json().error.code).toBe('SESSION_NOT_FOUND')
  })

  it('should return 404 for session owned by different user', async () => {
    await db.insertInto('users').values({ id: OTHER_UID, email: 'other@example.com' }).execute()
    const otherSessionId = generateId()
    await db
      .insertInto('sessions')
      .values({ id: otherSessionId, user_id: OTHER_UID, milestone_id: milestoneId, is_active: true })
      .execute()

    const response = await app.inject({
      method: 'GET',
      url: `/api/tutor/${otherSessionId}/messages`,
      headers: { authorization: 'Bearer valid-token' },
    })

    expect(response.statusCode).toBe(404)
  })

  it('should support cursor-based pagination', async () => {
    const messageIds: string[] = []
    const now = new Date()

    for (let i = 0; i < 5; i++) {
      const id = generateId()
      messageIds.push(id)
      await db
        .insertInto('tutor_messages')
        .values({
          id,
          session_id: sessionId,
          user_id: TEST_UID,
          role: i % 2 === 0 ? 'user' : 'assistant',
          content: `Message ${i}`,
          model: i % 2 === 0 ? null : 'claude-haiku-4-5-20251001',
          created_at: new Date(now.getTime() + i * 1000),
        })
        .execute()
    }

    // Get first page of 2
    const firstPage = await app.inject({
      method: 'GET',
      url: `/api/tutor/${sessionId}/messages?pageSize=2`,
      headers: { authorization: 'Bearer valid-token' },
    })

    expect(firstPage.statusCode).toBe(200)
    const firstBody = firstPage.json()
    expect(firstBody.messages).toHaveLength(2)
    expect(firstBody.messages[0].content).toBe('Message 0')
    expect(firstBody.messages[1].content).toBe('Message 1')
    expect(firstBody.nextCursor).toBeDefined()

    // Get second page using cursor
    const secondPage = await app.inject({
      method: 'GET',
      url: `/api/tutor/${sessionId}/messages?pageSize=2&afterCursor=${firstBody.nextCursor}`,
      headers: { authorization: 'Bearer valid-token' },
    })

    expect(secondPage.statusCode).toBe(200)
    const secondBody = secondPage.json()
    expect(secondBody.messages).toHaveLength(2)
    expect(secondBody.messages[0].content).toBe('Message 2')
    expect(secondBody.messages[1].content).toBe('Message 3')
  })

  it('should return empty array for session with no messages', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/tutor/${sessionId}/messages`,
      headers: { authorization: 'Bearer valid-token' },
    })

    expect(response.statusCode).toBe(200)
    const body = response.json()
    expect(body.messages).toHaveLength(0)
    expect(body.nextCursor).toBeNull()
  })
})
