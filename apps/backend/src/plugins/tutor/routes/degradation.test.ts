import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import Fastify from 'fastify'
import * as Sentry from '@sentry/node'
import { authPlugin } from '../../auth/index.js'
import { tutorPlugin } from '../index.js'
import { createMockFirebaseAuth } from '@mycscompanion/config/test-utils'
import { db } from '../../../shared/db.js'
import { generateId } from '../../../shared/id.js'
import { createCircuitBreaker } from '../services/circuit-breaker.js'
import type { CircuitBreaker } from '../services/circuit-breaker.js'
import type { AnthropicService, AnthropicMessageStream } from '../services/anthropic.js'
import type { ContextAssembler } from '../services/context-assembler.js'
import type { StuckContextAssembler } from '../services/stuck-context-assembler.js'
import type { RateLimitChecker } from '../../../shared/rate-limiter.js'

vi.mock('@sentry/node', () => ({
  captureException: vi.fn(),
}))

const TEST_UID = 'test-degradation-uid'
const mockAuth = createMockFirebaseAuth(TEST_UID)

function createMockStream(chunks: string[]): AnthropicMessageStream {
  const handlers = new Map<string, (...args: never[]) => void>()

  const mock: AnthropicMessageStream = {
    on(event: string, handler: (...args: never[]) => void) {
      handlers.set(event, handler)
      return mock
    },
  }

  process.nextTick(() => {
    const textHandler = handlers.get('text') as ((delta: string, snapshot: string) => void) | undefined
    const finalHandler = handlers.get('finalMessage') as ((msg: {
      content: Array<{ type: string; text?: string }>
      model: string
      usage: { input_tokens: number; output_tokens: number }
    }) => void) | undefined

    if (textHandler) {
      let snapshot = ''
      for (const chunk of chunks) {
        snapshot += chunk
        textHandler(chunk, snapshot)
      }
    }

    if (finalHandler) {
      finalHandler({
        content: [{ type: 'text', text: chunks.join('') }],
        model: 'claude-haiku-4-5-20251001',
        usage: { input_tokens: 100, output_tokens: 50 },
      })
    }
  })

  return mock
}

const mockStreamFn = vi.fn(() => createMockStream(['Hello']))

const mockAnthropicService: AnthropicService = {
  createTutorResponse: vi.fn(async () => ({
    content: 'response',
    model: 'claude-haiku-4-5-20251001',
  })),
  createStreamingTutorResponse: mockStreamFn,
}

const mockContextAssembler: ContextAssembler = {
  assembleSystemPrompt: vi.fn(async () => 'You are a tutor.'),
  resetPromptCache: vi.fn(),
}

const mockStuckContextAssembler: StuckContextAssembler = {
  assembleStuckInterventionPrompt: vi.fn(async () => 'You are helping a stuck learner.'),
  resetPromptCache: vi.fn(),
}

const mockRateLimiter: RateLimitChecker = {
  check: vi.fn(async () => ({ allowed: true, remaining: 29, retryAfterMs: 0 })),
}

let circuitBreaker: CircuitBreaker

async function buildApp(cb: CircuitBreaker) {
  const app = Fastify({ logger: false })
  await app.register(authPlugin, { firebaseAuth: mockAuth })
  await app.register(tutorPlugin, {
    prefix: '/api/tutor',
    rateLimiter: mockRateLimiter,
    anthropicService: mockAnthropicService,
    contextAssembler: mockContextAssembler,
    stuckContextAssembler: mockStuckContextAssembler,
    circuitBreaker: cb,
  })
  await app.ready()
  return app
}

let trackId: string
let milestoneId: string
let sessionId: string

beforeEach(async () => {
  trackId = generateId()
  milestoneId = generateId()
  sessionId = generateId()
  circuitBreaker = createCircuitBreaker({ failureThreshold: 1 })

  await db.insertInto('users').values({ id: TEST_UID, email: 'degradation-test@example.com' }).execute()
  await db.insertInto('tracks').values({ id: trackId, name: 'Test Track', slug: 'test-track' }).execute()
  await db.insertInto('milestones').values({ id: milestoneId, track_id: trackId, title: 'Test Milestone', slug: 'test-milestone', position: 1 }).execute()
  await db.insertInto('sessions').values({ id: sessionId, user_id: TEST_UID, milestone_id: milestoneId, is_active: true }).execute()
})

afterEach(async () => {
  vi.restoreAllMocks()
  mockStreamFn.mockImplementation(() => createMockStream(['Hello']))
  vi.mocked(mockAnthropicService.createTutorResponse).mockResolvedValue({
    content: 'response',
    model: 'claude-haiku-4-5-20251001',
  })
  vi.mocked(mockRateLimiter.check).mockResolvedValue({ allowed: true, remaining: 29, retryAfterMs: 0 })

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

describe('graceful degradation', () => {
  describe('circuit breaker open — tutor routes return 503', () => {
    it('should return 503 with TUTOR_UNAVAILABLE on stream when circuit is OPEN', async () => {
      circuitBreaker.recordFailure() // threshold=1 → OPEN
      const app = await buildApp(circuitBreaker)

      const response = await app.inject({
        method: 'POST',
        url: `/api/tutor/${sessionId}/stream`,
        headers: { authorization: 'Bearer valid-token' },
        payload: { message: 'help' },
      })

      expect(response.statusCode).toBe(503)
      const body = response.json()
      expect(body.error.code).toBe('TUTOR_UNAVAILABLE')
      expect(body.error.retryAfter).toBeTypeOf('number')
      expect(response.headers['retry-after']).toBeDefined()

      await app.close()
    })

    it('should return 503 with TUTOR_UNAVAILABLE on message when circuit is OPEN', async () => {
      circuitBreaker.recordFailure()
      const app = await buildApp(circuitBreaker)

      const response = await app.inject({
        method: 'POST',
        url: `/api/tutor/${sessionId}/message`,
        headers: { authorization: 'Bearer valid-token' },
        payload: { message: 'help' },
      })

      expect(response.statusCode).toBe(503)
      const body = response.json()
      expect(body.error.code).toBe('TUTOR_UNAVAILABLE')

      await app.close()
    })

    it('should return 503 on stuck-intervention when circuit is OPEN', async () => {
      circuitBreaker.recordFailure()
      const app = await buildApp(circuitBreaker)

      const response = await app.inject({
        method: 'POST',
        url: `/api/tutor/${sessionId}/stuck-intervention`,
        headers: { authorization: 'Bearer valid-token' },
        payload: { timeStuckMinutes: 5 },
      })

      expect(response.statusCode).toBe(503)
      const body = response.json()
      expect(body.error.code).toBe('TUTOR_UNAVAILABLE')

      await app.close()
    })
  })

  describe('health endpoint works while circuit is OPEN', () => {
    it('should return health status even when circuit is OPEN', async () => {
      circuitBreaker.recordFailure()
      const app = await buildApp(circuitBreaker)

      const response = await app.inject({
        method: 'GET',
        url: '/api/tutor/health',
        headers: { authorization: 'Bearer valid-token' },
      })

      expect(response.statusCode).toBe(200)
      const body = response.json()
      expect(body.available).toBe(false)
      expect(body.circuitState).toBe('OPEN')

      await app.close()
    })
  })

  describe('tutor rate limiting is independent of other routes', () => {
    it('should apply tutor rate limit only to tutor routes, not affect non-tutor operations', async () => {
      // Rate limit the tutor
      vi.mocked(mockRateLimiter.check).mockResolvedValueOnce({
        allowed: false,
        remaining: 0,
        retryAfterMs: 60_000,
      })

      const app = await buildApp(circuitBreaker)

      // Tutor is rate limited
      const tutorResponse = await app.inject({
        method: 'POST',
        url: `/api/tutor/${sessionId}/stream`,
        headers: { authorization: 'Bearer valid-token' },
        payload: { message: 'help' },
      })
      expect(tutorResponse.statusCode).toBe(429)

      // Health endpoint still works (no rate limit)
      const healthResponse = await app.inject({
        method: 'GET',
        url: '/api/tutor/health',
        headers: { authorization: 'Bearer valid-token' },
      })
      expect(healthResponse.statusCode).toBe(200)

      await app.close()
    })
  })

  describe('Sentry error reporting with structured context', () => {
    it('should capture Anthropic errors with tutor_error_type tag and extra context', async () => {
      const apiError = Object.assign(new Error('Overloaded'), { status: 529 })
      vi.mocked(mockAnthropicService.createTutorResponse).mockRejectedValueOnce(apiError)
      const app = await buildApp(circuitBreaker)

      await app.inject({
        method: 'POST',
        url: `/api/tutor/${sessionId}/message`,
        headers: { authorization: 'Bearer valid-token' },
        payload: { message: 'help' },
      })

      expect(Sentry.captureException).toHaveBeenCalledWith(
        apiError,
        expect.objectContaining({
          tags: expect.objectContaining({
            tutor_error_type: 'overloaded',
          }),
          extra: expect.objectContaining({
            circuitState: expect.any(String),
          }),
        }),
      )

      await app.close()
    })

    it('should capture stream errors with tutor_error_type tag', async () => {
      const streamError = Object.assign(new Error('Rate limited'), { status: 429 })
      mockStreamFn.mockImplementationOnce(() => {
        const handlers = new Map<string, (...args: never[]) => void>()
        const mock: AnthropicMessageStream = {
          on(event: string, handler: (...args: never[]) => void) {
            handlers.set(event, handler)
            return mock
          },
        }
        process.nextTick(() => {
          const errorHandler = handlers.get('error') as ((error: Error) => void) | undefined
          if (errorHandler) errorHandler(streamError)
        })
        return mock
      })

      const app = await buildApp(circuitBreaker)

      await app.inject({
        method: 'POST',
        url: `/api/tutor/${sessionId}/stream`,
        headers: { authorization: 'Bearer valid-token' },
        payload: { message: 'help' },
      })

      expect(Sentry.captureException).toHaveBeenCalledWith(
        streamError,
        expect.objectContaining({
          tags: expect.objectContaining({
            tutor_error_type: 'rate_limit',
          }),
        }),
      )

      await app.close()
    })
  })

  describe('tutor SSE errors do not affect other SSE connections', () => {
    it('should handle tutor stream error without crashing the Fastify instance', async () => {
      // Use a higher threshold so one stream error doesn't open the circuit
      const highThresholdCb = createCircuitBreaker({ failureThreshold: 5 })
      const streamError = new Error('Anthropic connection lost')
      mockStreamFn.mockImplementationOnce(() => {
        const handlers = new Map<string, (...args: never[]) => void>()
        const mock: AnthropicMessageStream = {
          on(event: string, handler: (...args: never[]) => void) {
            handlers.set(event, handler)
            return mock
          },
        }
        process.nextTick(() => {
          const errorHandler = handlers.get('error') as ((error: Error) => void) | undefined
          if (errorHandler) errorHandler(streamError)
        })
        return mock
      })

      const app = await buildApp(highThresholdCb)

      // First request: tutor stream errors
      const errorResponse = await app.inject({
        method: 'POST',
        url: `/api/tutor/${sessionId}/stream`,
        headers: { authorization: 'Bearer valid-token' },
        payload: { message: 'help' },
      })

      expect(errorResponse.statusCode).toBe(200) // SSE started before error
      const events = errorResponse.body
        .split('\n\n')
        .filter((block: string) => block.startsWith('data:'))
        .map((block: string) => JSON.parse(block.replace(/^data: /, '')))
      expect(events.find((e: { type: string }) => e.type === 'error')).toBeDefined()

      // Second request: server is still functional (new stream works)
      mockStreamFn.mockImplementationOnce(() => createMockStream(['recovered']))
      const okResponse = await app.inject({
        method: 'POST',
        url: `/api/tutor/${sessionId}/stream`,
        headers: { authorization: 'Bearer valid-token' },
        payload: { message: 'try again' },
      })

      expect(okResponse.statusCode).toBe(200)
      const okEvents = okResponse.body
        .split('\n\n')
        .filter((block: string) => block.startsWith('data:'))
        .map((block: string) => JSON.parse(block.replace(/^data: /, '')))
      expect(okEvents.find((e: { type: string }) => e.type === 'message_complete')).toBeDefined()

      await app.close()
    })
  })
})
