import { describe, it, expect, afterEach, afterAll, beforeEach, vi } from 'vitest'
import Fastify from 'fastify'
import { authPlugin } from '../../auth/index.js'
import { tutorPlugin } from '../index.js'
import { createMockFirebaseAuth } from '@mycscompanion/config/test-utils'
import { db } from '../../../shared/db.js'
import { generateId } from '../../../shared/id.js'
import type { AnthropicService, AnthropicMessageStream } from '../services/anthropic.js'
import type { ContextAssembler } from '../services/context-assembler.js'
import type { StuckContextAssembler } from '../services/stuck-context-assembler.js'
import type { RateLimitChecker } from '../../../shared/rate-limiter.js'

vi.mock('@sentry/node', () => ({
  captureException: vi.fn(),
}))

const TEST_UID = 'test-stuck-intervention-uid'
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
        model: 'claude-sonnet-4-5-20241022',
        usage: {
          input_tokens: 200,
          output_tokens: 100,
          cache_creation_input_tokens: 1500,
          cache_read_input_tokens: 500,
        },
      })
    }
  })

  return mock
}

const mockStreamFn = vi.fn(() => createMockStream(['I noticed', ' you are stuck', ' on persistence.']))

const mockAnthropicService: AnthropicService = {
  createTutorResponse: vi.fn(async () => ({
    content: 'non-streaming response',
    model: 'claude-sonnet-4-5-20241022',
  })),
  createStreamingTutorResponse: mockStreamFn,
}

const mockContextAssembler: ContextAssembler = {
  assembleSystemPrompt: vi.fn(async () => 'You are a Socratic tutor.'),
  resetPromptCache: vi.fn(),
}

const mockStuckContextAssembler: StuckContextAssembler = {
  assembleStuckInterventionPrompt: vi.fn(async () => 'You are helping a stuck learner.'),
  resetPromptCache: vi.fn(),
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
    stuckContextAssembler: mockStuckContextAssembler,
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

  await db.insertInto('users').values({ id: TEST_UID, email: 'stuck-test@example.com' }).execute()
  await db.insertInto('tracks').values({ id: trackId, name: 'Test Track', slug: 'test-track' }).execute()
  await db.insertInto('milestones').values({ id: milestoneId, track_id: trackId, title: 'Test Milestone', slug: 'test-milestone', position: 1 }).execute()
  await db.insertInto('sessions').values({ id: sessionId, user_id: TEST_UID, milestone_id: milestoneId, is_active: true }).execute()
})

afterEach(async () => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  mockStreamFn.mockImplementation(() => createMockStream(['I noticed', ' you are stuck', ' on persistence.']))
  vi.mocked(mockRateLimiter.check).mockResolvedValue({ allowed: true, remaining: 29, retryAfterMs: 0 })
  vi.mocked(mockStuckContextAssembler.assembleStuckInterventionPrompt).mockResolvedValue('You are helping a stuck learner.')

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

describe('POST /api/tutor/:sessionId/stuck-intervention', () => {
  it('should return SSE stream with text_delta and message_complete events', async () => {
    const response = await app.inject({
      method: 'POST',
      url: `/api/tutor/${sessionId}/stuck-intervention`,
      headers: { authorization: 'Bearer valid-token' },
      payload: { timeStuckMinutes: 15 },
    })

    expect(response.statusCode).toBe(200)
    expect(response.headers['content-type']).toBe('text/event-stream')

    const events = parseSSEEvents(response.body)
    const textDeltas = events.filter((e) => e.type === 'text_delta')

    expect(textDeltas).toHaveLength(3)
    expect(textDeltas[0]).toEqual({ type: 'text_delta', delta: 'I noticed' })
    expect(textDeltas[1]).toEqual({ type: 'text_delta', delta: ' you are stuck' })
    expect(textDeltas[2]).toEqual({ type: 'text_delta', delta: ' on persistence.' })

    const completeEvent = events.find((e) => e.type === 'message_complete')
    expect(completeEvent).toBeDefined()
    expect(completeEvent).toEqual(
      expect.objectContaining({
        type: 'message_complete',
        model: 'claude-sonnet-4-5-20241022',
        content: 'I noticed you are stuck on persistence.',
      })
    )
    expect(typeof completeEvent?.id).toBe('string')
  })

  it('should persist synthetic user message and assistant response', async () => {
    await app.inject({
      method: 'POST',
      url: `/api/tutor/${sessionId}/stuck-intervention`,
      headers: { authorization: 'Bearer valid-token' },
      payload: { timeStuckMinutes: 10 },
    })

    const messages = await db
      .selectFrom('tutor_messages')
      .selectAll()
      .where('session_id', '=', sessionId)
      .orderBy('created_at', 'asc')
      .execute()

    expect(messages).toHaveLength(2)

    // Synthetic user message
    expect(messages[0]?.role).toBe('user')
    expect(messages[0]?.content).toContain('Stuck detection triggered')
    expect(messages[0]?.model).toBeNull()

    // Assistant response
    expect(messages[1]?.role).toBe('assistant')
    expect(messages[1]?.content).toBe('I noticed you are stuck on persistence.')
    expect(messages[1]?.model).toBe('claude-sonnet-4-5-20241022')
  })

  it('should validate timeStuckMinutes minimum is 1', async () => {
    const response = await app.inject({
      method: 'POST',
      url: `/api/tutor/${sessionId}/stuck-intervention`,
      headers: { authorization: 'Bearer valid-token' },
      payload: { timeStuckMinutes: 0 },
    })

    expect(response.statusCode).toBe(400)
  })

  it('should validate timeStuckMinutes maximum is 60', async () => {
    const response = await app.inject({
      method: 'POST',
      url: `/api/tutor/${sessionId}/stuck-intervention`,
      headers: { authorization: 'Bearer valid-token' },
      payload: { timeStuckMinutes: 61 },
    })

    expect(response.statusCode).toBe(400)
  })

  it('should return 404 for invalid session', async () => {
    const response = await app.inject({
      method: 'POST',
      url: `/api/tutor/${generateId()}/stuck-intervention`,
      headers: { authorization: 'Bearer valid-token' },
      payload: { timeStuckMinutes: 10 },
    })

    expect(response.statusCode).toBe(404)
  })

  it('should return 429 when rate limited', async () => {
    vi.mocked(mockRateLimiter.check).mockResolvedValueOnce({
      allowed: false,
      remaining: 0,
      retryAfterMs: 5000,
    })

    const response = await app.inject({
      method: 'POST',
      url: `/api/tutor/${sessionId}/stuck-intervention`,
      headers: { authorization: 'Bearer valid-token' },
      payload: { timeStuckMinutes: 10 },
    })

    expect(response.statusCode).toBe(429)
    const body = JSON.parse(response.body)
    expect(body.error.retryAfter).toBe(5)
  })

  it('should return 503 when Anthropic is unavailable', async () => {
    mockStreamFn.mockImplementationOnce(() => {
      throw new Error('Anthropic API key not configured')
    })

    const response = await app.inject({
      method: 'POST',
      url: `/api/tutor/${sessionId}/stuck-intervention`,
      headers: { authorization: 'Bearer valid-token' },
      payload: { timeStuckMinutes: 10 },
    })

    expect(response.statusCode).toBe(503)
    const body = JSON.parse(response.body)
    expect(body.error.code).toBe('TUTOR_UNAVAILABLE')
  })

  it('should use Sonnet model for stuck interventions via isStuckIntervention context flag', async () => {
    await app.inject({
      method: 'POST',
      url: `/api/tutor/${sessionId}/stuck-intervention`,
      headers: { authorization: 'Bearer valid-token' },
      payload: { timeStuckMinutes: 10 },
    })

    expect(mockStreamFn).toHaveBeenCalledWith(
      expect.objectContaining({
        context: expect.objectContaining({
          isStuckIntervention: true,
        }),
      })
    )
  })
})
