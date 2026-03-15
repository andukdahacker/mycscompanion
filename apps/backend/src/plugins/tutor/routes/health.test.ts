import { describe, it, expect, afterEach, afterAll, beforeEach, vi } from 'vitest'
import Fastify from 'fastify'
import { authPlugin } from '../../auth/index.js'
import { tutorPlugin } from '../index.js'
import { createMockFirebaseAuth } from '@mycscompanion/config/test-utils'
import { db } from '../../../shared/db.js'
import { generateId } from '../../../shared/id.js'
import { createCircuitBreaker } from '../services/circuit-breaker.js'
import type { AnthropicService } from '../services/anthropic.js'
import type { ContextAssembler } from '../services/context-assembler.js'
import type { RateLimitChecker } from '../../../shared/rate-limiter.js'
import type { TutorMetrics } from '../services/tutor-metrics.js'

const TEST_UID = 'test-health-uid'
const mockAuth = createMockFirebaseAuth(TEST_UID)

const mockAnthropicService: AnthropicService = {
  createTutorResponse: vi.fn(async () => ({
    content: 'response',
    model: 'claude-haiku-4-5-20251001',
  })),
  createStreamingTutorResponse: vi.fn(() => {
    throw new Error('Not needed')
  }),
}

const mockContextAssembler: ContextAssembler = {
  assembleSystemPrompt: vi.fn(async () => 'You are a tutor.'),
  resetPromptCache: vi.fn(),
}

const mockRateLimiter: RateLimitChecker = {
  check: vi.fn(async () => ({ allowed: true, remaining: 29, retryAfterMs: 0 })),
}

const mockTutorMetrics: TutorMetrics = {
  recordSuccess: vi.fn(async () => undefined),
  recordFailure: vi.fn(async () => undefined),
  getAvailabilityRate: vi.fn(async () => 95.5),
}

describe('GET /api/tutor/health', () => {
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

  it('should return available=true when circuit breaker is CLOSED', async () => {
    const cb = createCircuitBreaker()
    const app = Fastify({ logger: false })
    await app.register(authPlugin, { firebaseAuth: mockAuth })
    await app.register(tutorPlugin, {
      prefix: '/api/tutor',
      rateLimiter: mockRateLimiter,
      anthropicService: mockAnthropicService,
      contextAssembler: mockContextAssembler,
      circuitBreaker: cb,
      tutorMetrics: mockTutorMetrics,
    })
    await app.ready()

    await db.insertInto('users').values({ id: TEST_UID, email: 'health-test@example.com' }).execute()

    const response = await app.inject({
      method: 'GET',
      url: '/api/tutor/health',
      headers: { authorization: 'Bearer valid-token' },
    })

    expect(response.statusCode).toBe(200)
    const body = response.json()
    expect(body.available).toBe(true)
    expect(body.circuitState).toBe('CLOSED')
    expect(body.availabilityRate).toBe(95.5)
    expect(body.consecutiveFailures).toBe(0)
    expect(body.retryAfterMs).toBeNull()

    await app.close()
  })

  it('should return available=false when circuit breaker is OPEN', async () => {
    const cb = createCircuitBreaker({ failureThreshold: 1 })
    cb.recordFailure()

    const app = Fastify({ logger: false })
    await app.register(authPlugin, { firebaseAuth: mockAuth })
    await app.register(tutorPlugin, {
      prefix: '/api/tutor',
      rateLimiter: mockRateLimiter,
      anthropicService: mockAnthropicService,
      contextAssembler: mockContextAssembler,
      circuitBreaker: cb,
      tutorMetrics: mockTutorMetrics,
    })
    await app.ready()

    await db.insertInto('users').values({ id: TEST_UID, email: 'health-test@example.com' }).execute()

    const response = await app.inject({
      method: 'GET',
      url: '/api/tutor/health',
      headers: { authorization: 'Bearer valid-token' },
    })

    expect(response.statusCode).toBe(200)
    const body = response.json()
    expect(body.available).toBe(false)
    expect(body.circuitState).toBe('OPEN')
    expect(body.consecutiveFailures).toBe(1)
    expect(body.retryAfterMs).toBeTypeOf('number')
    expect(body.retryAfterMs).toBeGreaterThan(0)

    await app.close()
  })

  it('should return correct availability rate from metrics', async () => {
    const cb = createCircuitBreaker()
    vi.mocked(mockTutorMetrics.getAvailabilityRate).mockResolvedValueOnce(87.5)

    const app = Fastify({ logger: false })
    await app.register(authPlugin, { firebaseAuth: mockAuth })
    await app.register(tutorPlugin, {
      prefix: '/api/tutor',
      rateLimiter: mockRateLimiter,
      anthropicService: mockAnthropicService,
      contextAssembler: mockContextAssembler,
      circuitBreaker: cb,
      tutorMetrics: mockTutorMetrics,
    })
    await app.ready()

    await db.insertInto('users').values({ id: TEST_UID, email: 'health-test@example.com' }).execute()

    const response = await app.inject({
      method: 'GET',
      url: '/api/tutor/health',
      headers: { authorization: 'Bearer valid-token' },
    })

    const body = response.json()
    expect(body.availabilityRate).toBe(87.5)

    await app.close()
  })

  it('should return 401 without auth token', async () => {
    const cb = createCircuitBreaker()
    const app = Fastify({ logger: false })
    await app.register(authPlugin, { firebaseAuth: mockAuth })
    await app.register(tutorPlugin, {
      prefix: '/api/tutor',
      rateLimiter: mockRateLimiter,
      anthropicService: mockAnthropicService,
      contextAssembler: mockContextAssembler,
      circuitBreaker: cb,
      tutorMetrics: mockTutorMetrics,
    })
    await app.ready()

    const response = await app.inject({
      method: 'GET',
      url: '/api/tutor/health',
    })

    expect(response.statusCode).toBe(401)

    await app.close()
  })
})
