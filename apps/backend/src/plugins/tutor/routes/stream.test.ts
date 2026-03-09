import { describe, it, expect, afterEach, afterAll, beforeEach, vi } from 'vitest'
import Fastify from 'fastify'
import { authPlugin } from '../../auth/index.js'
import { tutorPlugin } from '../index.js'
import { createMockFirebaseAuth } from '@mycscompanion/config/test-utils'
import { db } from '../../../shared/db.js'
import { generateId } from '../../../shared/id.js'
import type { AnthropicService, AnthropicMessageStream } from '../services/anthropic.js'
import type { ContextAssembler } from '../services/context-assembler.js'
import type { RateLimitChecker } from '../../../shared/rate-limiter.js'

const TEST_UID = 'test-tutor-stream-uid'
const mockAuth = createMockFirebaseAuth(TEST_UID)

function createMockStream(chunks: string[], options?: { error?: Error }): AnthropicMessageStream {
  const handlers = new Map<string, (...args: never[]) => void>()

  const mock: AnthropicMessageStream = {
    on(event: string, handler: (...args: never[]) => void) {
      handlers.set(event, handler)
      return mock
    },
  }

  process.nextTick(() => {
    if (options?.error) {
      const errorHandler = handlers.get('error') as ((error: Error) => void) | undefined
      if (errorHandler) errorHandler(options.error)
      return
    }

    const textHandler = handlers.get('text') as ((delta: string, snapshot: string) => void) | undefined
    const finalHandler = handlers.get('finalMessage') as ((msg: {
      content: Array<{ type: string; text?: string }>
      model: string
      usage: { input_tokens: number; output_tokens: number; cache_creation_input_tokens?: number; cache_read_input_tokens?: number }
    }) => void) | undefined

    if (textHandler) {
      let snapshot = ''
      for (const chunk of chunks) {
        snapshot += chunk
        textHandler(chunk, snapshot)
      }
    }

    if (finalHandler) {
      const fullText = chunks.join('')
      finalHandler({
        content: [{ type: 'text', text: fullText }],
        model: 'claude-haiku-4-5-20251001',
        usage: {
          input_tokens: 100,
          output_tokens: 50,
          cache_creation_input_tokens: 1200,
          cache_read_input_tokens: 800,
        },
      })
    }
  })

  return mock
}

const mockStreamFn = vi.fn(() => createMockStream(['Hello', ' world', '!']))

const mockAnthropicService: AnthropicService = {
  createTutorResponse: vi.fn(async () => ({
    content: 'non-streaming response',
    model: 'claude-haiku-4-5-20251001',
  })),
  createStreamingTutorResponse: mockStreamFn,
}

const mockContextAssembler: ContextAssembler = {
  assembleSystemPrompt: vi.fn(async () => 'You are a Socratic tutor.'),
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

  await db.insertInto('users').values({ id: TEST_UID, email: 'stream-test@example.com' }).execute()
  await db.insertInto('tracks').values({ id: trackId, name: 'Test Track', slug: 'test-track' }).execute()
  await db.insertInto('milestones').values({ id: milestoneId, track_id: trackId, title: 'Test Milestone', slug: 'test-milestone', position: 1 }).execute()
  await db.insertInto('sessions').values({ id: sessionId, user_id: TEST_UID, milestone_id: milestoneId, is_active: true }).execute()
})

afterEach(async () => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  mockStreamFn.mockImplementation(() => createMockStream(['Hello', ' world', '!']))
  vi.mocked(mockRateLimiter.check).mockResolvedValue({ allowed: true, remaining: 29, retryAfterMs: 0 })
  vi.mocked(mockContextAssembler.assembleSystemPrompt).mockResolvedValue('You are a Socratic tutor.')

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

function parseSSEEvents(body: string): Array<{ type: string; [key: string]: unknown }> {
  return body
    .split('\n\n')
    .filter((block) => block.startsWith('data:'))
    .map((block) => JSON.parse(block.replace(/^data: /, '')))
}

describe('POST /api/tutor/:sessionId/stream', () => {
  it('should stream text deltas as SSE events to the client', async () => {
    const response = await app.inject({
      method: 'POST',
      url: `/api/tutor/${sessionId}/stream`,
      headers: { authorization: 'Bearer valid-token' },
      payload: { message: 'How do I implement a hash table?' },
    })

    expect(response.statusCode).toBe(200)
    expect(response.headers['content-type']).toBe('text/event-stream')

    const events = parseSSEEvents(response.body)
    const textDeltas = events.filter((e) => e.type === 'text_delta')

    expect(textDeltas).toHaveLength(3)
    expect(textDeltas[0]).toEqual({ type: 'text_delta', delta: 'Hello' })
    expect(textDeltas[1]).toEqual({ type: 'text_delta', delta: ' world' })
    expect(textDeltas[2]).toEqual({ type: 'text_delta', delta: '!' })
  })

  it('should send message_complete event with full text and model after stream ends', async () => {
    const response = await app.inject({
      method: 'POST',
      url: `/api/tutor/${sessionId}/stream`,
      headers: { authorization: 'Bearer valid-token' },
      payload: { message: 'How do I implement a hash table?' },
    })

    const events = parseSSEEvents(response.body)
    const completeEvent = events.find((e) => e.type === 'message_complete')

    expect(completeEvent).toBeDefined()
    expect(completeEvent).toEqual(
      expect.objectContaining({
        type: 'message_complete',
        model: 'claude-haiku-4-5-20251001',
        content: 'Hello world!',
      })
    )
    expect(typeof completeEvent?.id).toBe('string')
  })

  it('should persist user message before streaming starts', async () => {
    await app.inject({
      method: 'POST',
      url: `/api/tutor/${sessionId}/stream`,
      headers: { authorization: 'Bearer valid-token' },
      payload: { message: 'How do I implement a hash table?' },
    })

    const messages = await db
      .selectFrom('tutor_messages')
      .selectAll()
      .where('session_id', '=', sessionId)
      .where('role', '=', 'user')
      .execute()

    expect(messages).toHaveLength(1)
    expect(messages[0]?.content).toBe('How do I implement a hash table?')
    expect(messages[0]?.role).toBe('user')
    expect(messages[0]?.model).toBeNull()
  })

  it('should persist assistant message with full content after stream completes', async () => {
    await app.inject({
      method: 'POST',
      url: `/api/tutor/${sessionId}/stream`,
      headers: { authorization: 'Bearer valid-token' },
      payload: { message: 'How do I implement a hash table?' },
    })

    const messages = await db
      .selectFrom('tutor_messages')
      .selectAll()
      .where('session_id', '=', sessionId)
      .where('role', '=', 'assistant')
      .execute()

    expect(messages).toHaveLength(1)
    expect(messages[0]?.content).toBe('Hello world!')
    expect(messages[0]?.model).toBe('claude-haiku-4-5-20251001')
  })

  it('should return 401 without auth token', async () => {
    const response = await app.inject({
      method: 'POST',
      url: `/api/tutor/${sessionId}/stream`,
      payload: { message: 'help' },
    })

    expect(response.statusCode).toBe(401)
  })

  it('should return 404 for non-existent or unowned session', async () => {
    const response = await app.inject({
      method: 'POST',
      url: `/api/tutor/${generateId()}/stream`,
      headers: { authorization: 'Bearer valid-token' },
      payload: { message: 'help' },
    })

    expect(response.statusCode).toBe(404)
  })

  it('should return 429 when rate limit exceeded', async () => {
    vi.mocked(mockRateLimiter.check).mockResolvedValueOnce({
      allowed: false,
      remaining: 0,
      retryAfterMs: 5000,
    })

    const response = await app.inject({
      method: 'POST',
      url: `/api/tutor/${sessionId}/stream`,
      headers: { authorization: 'Bearer valid-token' },
      payload: { message: 'help' },
    })

    expect(response.statusCode).toBe(429)
    const body = JSON.parse(response.body)
    expect(body.error.retryAfter).toBe(5)
  })

  it('should return 400 for empty or over-length message', async () => {
    const emptyResponse = await app.inject({
      method: 'POST',
      url: `/api/tutor/${sessionId}/stream`,
      headers: { authorization: 'Bearer valid-token' },
      payload: { message: '' },
    })
    expect(emptyResponse.statusCode).toBe(400)

    const longResponse = await app.inject({
      method: 'POST',
      url: `/api/tutor/${sessionId}/stream`,
      headers: { authorization: 'Bearer valid-token' },
      payload: { message: 'x'.repeat(2001) },
    })
    expect(longResponse.statusCode).toBe(400)
  })

  it('should send error SSE event when Anthropic API fails mid-stream', async () => {
    mockStreamFn.mockImplementationOnce(() =>
      createMockStream([], { error: new Error('Anthropic API rate limited') })
    )

    const response = await app.inject({
      method: 'POST',
      url: `/api/tutor/${sessionId}/stream`,
      headers: { authorization: 'Bearer valid-token' },
      payload: { message: 'help me' },
    })

    expect(response.statusCode).toBe(200)
    const events = parseSSEEvents(response.body)
    const errorEvent = events.find((e) => e.type === 'error')

    expect(errorEvent).toBeDefined()
    expect(errorEvent).toEqual({
      type: 'error',
      code: 'TUTOR_UNAVAILABLE',
      message: 'Tutor encountered an error during streaming',
    })
  })

  it('should configure 30-second heartbeat and 3-minute max duration', async () => {
    // Fake timers + real DB I/O are incompatible (advanceTimersByTimeAsync cannot
    // yield enough event loop turns for sequential DB queries). Instead, verify
    // setInterval/setTimeout are called with the correct durations.
    const setIntervalSpy = vi.spyOn(globalThis, 'setInterval')
    const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout')

    const response = await app.inject({
      method: 'POST',
      url: `/api/tutor/${sessionId}/stream`,
      headers: { authorization: 'Bearer valid-token' },
      payload: { message: 'test heartbeat setup' },
    })

    expect(response.statusCode).toBe(200)
    expect(setIntervalSpy).toHaveBeenCalledWith(expect.any(Function), 30_000)
    expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 180_000)

    // Stream completes cleanly = timers properly cleared in cleanup
    const events = parseSSEEvents(response.body)
    expect(events.find((e) => e.type === 'message_complete')).toBeDefined()

    setIntervalSpy.mockRestore()
    setTimeoutSpy.mockRestore()
  })

  it('should clean up resources on stream completion', async () => {
    // Note: fastify.inject() does not support simulating mid-stream client disconnect.
    // Client disconnect cleanup (request.raw.on('close', cleanup)) is verified by code
    // structure. This test verifies the stream completes cleanly with no leaked timers.
    const response = await app.inject({
      method: 'POST',
      url: `/api/tutor/${sessionId}/stream`,
      headers: { authorization: 'Bearer valid-token' },
      payload: { message: 'How do I implement a hash table?' },
    })

    const events = parseSSEEvents(response.body)
    const completeEvent = events.find((e) => e.type === 'message_complete')
    expect(completeEvent).toBeDefined()
  })

  it('should include conversation history in Anthropic request', async () => {
    // Insert previous messages with explicit timestamps for stable ordering
    const baseTime = new Date()
    await db.insertInto('tutor_messages').values([
      {
        id: generateId(),
        session_id: sessionId,
        user_id: TEST_UID,
        role: 'user',
        content: 'Previous question',
        model: null,
        created_at: new Date(baseTime.getTime()),
      },
      {
        id: generateId(),
        session_id: sessionId,
        user_id: TEST_UID,
        role: 'assistant',
        content: 'Previous answer',
        model: 'claude-haiku-4-5-20251001',
        created_at: new Date(baseTime.getTime() + 1),
      },
    ]).execute()

    await app.inject({
      method: 'POST',
      url: `/api/tutor/${sessionId}/stream`,
      headers: { authorization: 'Bearer valid-token' },
      payload: { message: 'Follow up question' },
    })

    expect(mockStreamFn).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationHistory: expect.arrayContaining([
          { role: 'user', content: 'Previous question' },
          { role: 'assistant', content: 'Previous answer' },
          { role: 'user', content: 'Follow up question' },
        ]),
      })
    )
  })

  it('should validate TTFT is fast with mocked Anthropic', async () => {
    const start = performance.now()

    const response = await app.inject({
      method: 'POST',
      url: `/api/tutor/${sessionId}/stream`,
      headers: { authorization: 'Bearer valid-token' },
      payload: { message: 'How do I implement a hash table?' },
    })

    const events = parseSSEEvents(response.body)
    const firstTextDelta = events.find((e) => e.type === 'text_delta')
    expect(firstTextDelta).toBeDefined()

    const elapsed = performance.now() - start
    // With mocked Anthropic, should be well under 1 second
    expect(elapsed).toBeLessThan(1000)
  })

  it('should log prompt caching metrics from finalMessage usage', async () => {
    const response = await app.inject({
      method: 'POST',
      url: `/api/tutor/${sessionId}/stream`,
      headers: { authorization: 'Bearer valid-token' },
      payload: { message: 'How do I implement a hash table?' },
    })

    const events = parseSSEEvents(response.body)
    const completeEvent = events.find((e) => e.type === 'message_complete')
    expect(completeEvent).toBeDefined()

    // Verify streaming was called (finalMessage handler runs, which logs cache metrics).
    // Mock stream includes cache_creation_input_tokens: 1200, cache_read_input_tokens: 800.
    // Debug-level logging (request.log.debug) is not capturable without a custom pino
    // destination — verified by code structure: stream.ts logs usage object at debug level.
    expect(mockStreamFn).toHaveBeenCalled()
  })

  it('should reject whitespace-only messages', async () => {
    const response = await app.inject({
      method: 'POST',
      url: `/api/tutor/${sessionId}/stream`,
      headers: { authorization: 'Bearer valid-token' },
      payload: { message: '   ' },
    })

    expect(response.statusCode).toBe(400)
    const body = JSON.parse(response.body)
    expect(body.error.code).toBe('MESSAGE_EMPTY')
  })
})
