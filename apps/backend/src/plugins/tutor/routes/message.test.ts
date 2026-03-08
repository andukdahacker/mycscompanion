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

const TEST_UID = 'test-tutor-msg-uid'
const OTHER_UID = 'other-user-uid'
const mockAuth = createMockFirebaseAuth(TEST_UID)

const mockAnthropicService: AnthropicService = {
  createTutorResponse: vi.fn(async () => ({
    content: 'What do you think happens when the process exits?',
    model: 'claude-haiku-4-5-20251001',
  })),
}

const mockContextAssembler: ContextAssembler = {
  assembleSystemPrompt: vi.fn(async () => 'You are a tutor.'),
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
    .values({ id: TEST_UID, email: 'tutor-test@example.com' })
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
  // Reset mocks to defaults
  vi.mocked(mockAnthropicService.createTutorResponse).mockResolvedValue({
    content: 'What do you think happens when the process exits?',
    model: 'claude-haiku-4-5-20251001',
  })
  vi.mocked(mockRateLimiter.check).mockResolvedValue({ allowed: true, remaining: 29, retryAfterMs: 0 })
  vi.mocked(mockContextAssembler.assembleSystemPrompt).mockResolvedValue('You are a tutor.')

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

describe('POST /api/tutor/:sessionId/message', () => {
  it('should send message and receive Socratic response', async () => {
    const response = await app.inject({
      method: 'POST',
      url: `/api/tutor/${sessionId}/message`,
      headers: { authorization: 'Bearer valid-token' },
      payload: { message: 'I am stuck on persistence' },
    })

    expect(response.statusCode).toBe(200)
    const body = response.json()
    expect(body.id).toBeDefined()
    expect(body.role).toBe('assistant')
    expect(body.content).toBe('What do you think happens when the process exits?')
    expect(body.model).toBe('claude-haiku-4-5-20251001')
    expect(body.createdAt).toBeDefined()
  })

  it('should return 401 without auth token', async () => {
    const response = await app.inject({
      method: 'POST',
      url: `/api/tutor/${sessionId}/message`,
      payload: { message: 'help' },
    })

    expect(response.statusCode).toBe(401)
  })

  it('should return 404 for non-existent session', async () => {
    const response = await app.inject({
      method: 'POST',
      url: `/api/tutor/nonexistent-session/message`,
      headers: { authorization: 'Bearer valid-token' },
      payload: { message: 'help' },
    })

    expect(response.statusCode).toBe(404)
    const body = response.json()
    expect(body.error.code).toBe('SESSION_NOT_FOUND')
  })

  it('should return 404 for session owned by different user', async () => {
    // Create another user and session
    await db.insertInto('users').values({ id: OTHER_UID, email: 'other@example.com' }).execute()
    const otherSessionId = generateId()
    await db
      .insertInto('sessions')
      .values({ id: otherSessionId, user_id: OTHER_UID, milestone_id: milestoneId, is_active: true })
      .execute()

    const response = await app.inject({
      method: 'POST',
      url: `/api/tutor/${otherSessionId}/message`,
      headers: { authorization: 'Bearer valid-token' },
      payload: { message: 'help' },
    })

    expect(response.statusCode).toBe(404)
    expect(response.json().error.code).toBe('SESSION_NOT_FOUND')
  })

  it('should return 429 when rate limit exceeded', async () => {
    vi.mocked(mockRateLimiter.check).mockResolvedValueOnce({
      allowed: false,
      remaining: 0,
      retryAfterMs: 30000,
    })

    const response = await app.inject({
      method: 'POST',
      url: `/api/tutor/${sessionId}/message`,
      headers: { authorization: 'Bearer valid-token' },
      payload: { message: 'help' },
    })

    expect(response.statusCode).toBe(429)
    const body = response.json()
    expect(body.error.code).toBe('RATE_LIMITED')
    expect(body.error.retryAfter).toBe(30)
  })

  it('should return 400 for message exceeding 2000 characters', async () => {
    const response = await app.inject({
      method: 'POST',
      url: `/api/tutor/${sessionId}/message`,
      headers: { authorization: 'Bearer valid-token' },
      payload: { message: 'x'.repeat(2001) },
    })

    expect(response.statusCode).toBe(400)
  })

  it('should return 503 when Anthropic API is unavailable', async () => {
    vi.mocked(mockAnthropicService.createTutorResponse).mockRejectedValueOnce(
      new Error('API unavailable')
    )

    const response = await app.inject({
      method: 'POST',
      url: `/api/tutor/${sessionId}/message`,
      headers: { authorization: 'Bearer valid-token' },
      payload: { message: 'help' },
    })

    expect(response.statusCode).toBe(503)
    const body = response.json()
    expect(body.error.code).toBe('TUTOR_UNAVAILABLE')
  })

  it('should pass user background to context assembly', async () => {
    await app.inject({
      method: 'POST',
      url: `/api/tutor/${sessionId}/message`,
      headers: { authorization: 'Bearer valid-token' },
      payload: { message: 'help' },
    })

    expect(mockContextAssembler.assembleSystemPrompt).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: TEST_UID,
        sessionId,
        milestoneId,
      })
    )
  })

  it('should pass current code snapshot context to Anthropic', async () => {
    await app.inject({
      method: 'POST',
      url: `/api/tutor/${sessionId}/message`,
      headers: { authorization: 'Bearer valid-token' },
      payload: { message: 'help' },
    })

    expect(mockAnthropicService.createTutorResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        systemPrompt: 'You are a tutor.',
        conversationHistory: [{ role: 'user', content: 'help' }],
      })
    )
  })

  it('should route to Sonnet when compile errors are present', async () => {
    await db
      .insertInto('submissions')
      .values({
        id: generateId(),
        user_id: TEST_UID,
        milestone_id: milestoneId,
        code: 'package main',
        status: 'failed',
        error_message: 'compilation failed',
      })
      .execute()

    await app.inject({
      method: 'POST',
      url: `/api/tutor/${sessionId}/message`,
      headers: { authorization: 'Bearer valid-token' },
      payload: { message: 'help' },
    })

    expect(mockAnthropicService.createTutorResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        context: expect.objectContaining({ hasCompileErrors: true }),
      })
    )
  })

  it('should route to Haiku for default Socratic dialogue', async () => {
    await app.inject({
      method: 'POST',
      url: `/api/tutor/${sessionId}/message`,
      headers: { authorization: 'Bearer valid-token' },
      payload: { message: 'I am stuck' },
    })

    expect(mockAnthropicService.createTutorResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        context: expect.objectContaining({ hasCompileErrors: false }),
      })
    )
  })

  it('should persist both user and assistant messages to tutor_messages table', async () => {
    await app.inject({
      method: 'POST',
      url: `/api/tutor/${sessionId}/message`,
      headers: { authorization: 'Bearer valid-token' },
      payload: { message: 'I am stuck' },
    })

    const messages = await db
      .selectFrom('tutor_messages')
      .selectAll()
      .where('session_id', '=', sessionId)
      .orderBy('created_at', 'asc')
      .execute()

    expect(messages).toHaveLength(2)
    expect(messages[0]?.role).toBe('user')
    expect(messages[0]?.content).toBe('I am stuck')
    expect(messages[0]?.model).toBeNull()
    expect(messages[1]?.role).toBe('assistant')
    expect(messages[1]?.content).toBe('What do you think happens when the process exits?')
    expect(messages[1]?.model).toBe('claude-haiku-4-5-20251001')
  })

  it('should include previous messages in conversation history', async () => {
    // Insert a previous message exchange
    await db
      .insertInto('tutor_messages')
      .values([
        {
          id: generateId(),
          session_id: sessionId,
          user_id: TEST_UID,
          role: 'user',
          content: 'How do I persist data?',
          model: null,
        },
        {
          id: generateId(),
          session_id: sessionId,
          user_id: TEST_UID,
          role: 'assistant',
          content: 'What happens when the process exits?',
          model: 'claude-haiku-4-5-20251001',
        },
      ])
      .execute()

    await app.inject({
      method: 'POST',
      url: `/api/tutor/${sessionId}/message`,
      headers: { authorization: 'Bearer valid-token' },
      payload: { message: 'The data is lost' },
    })

    expect(mockAnthropicService.createTutorResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationHistory: [
          { role: 'user', content: 'How do I persist data?' },
          { role: 'assistant', content: 'What happens when the process exits?' },
          { role: 'user', content: 'The data is lost' },
        ],
      })
    )
  })
})
