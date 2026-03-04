import { describe, it, expect, afterEach, vi } from 'vitest'
import Fastify from 'fastify'
import { authPlugin } from '../../auth/index.js'
import { submitRoutes } from './submit.js'
import type { ExecutionQueueAdd } from './submit.js'
import { createMockFirebaseAuth } from '@mycscompanion/config/test-utils'
import { db } from '../../../shared/db.js'
import type { RateLimitChecker } from '../../../shared/rate-limiter.js'
import type { EventPublisher } from '../../../shared/event-publisher.js'

const TEST_UID = 'test-submit-uid'
const TEST_EMAIL = 'test-submit@example.com'
const mockAuth = createMockFirebaseAuth(TEST_UID)

function createMockQueue(): ExecutionQueueAdd {
  return { add: vi.fn().mockResolvedValue({ id: 'job-1' }) }
}

function createMockRateLimiter(
  overrides: Partial<{ allowed: boolean; remaining: number; retryAfterMs: number }> = {}
): RateLimitChecker {
  return {
    check: vi.fn().mockResolvedValue({
      allowed: overrides.allowed ?? true,
      remaining: overrides.remaining ?? 9,
      retryAfterMs: overrides.retryAfterMs ?? 0,
    }),
  }
}

function createMockEventPublisher(): EventPublisher {
  return {
    publish: vi.fn().mockResolvedValue(undefined),
    setLogTTL: vi.fn().mockResolvedValue(undefined),
  }
}

async function buildApp(opts?: {
  queue?: ExecutionQueueAdd
  rateLimiter?: RateLimitChecker
  eventPublisher?: EventPublisher
}) {
  const app = Fastify({ logger: false })
  await app.register(authPlugin, { firebaseAuth: mockAuth })
  await app.register(submitRoutes, {
    prefix: '/api/execution',
    db,
    queue: opts?.queue ?? createMockQueue(),
    rateLimiter: opts?.rateLimiter ?? createMockRateLimiter(),
    eventPublisher: opts?.eventPublisher ?? createMockEventPublisher(),
  })
  await app.ready()
  return app
}

// Seed a user for FK constraint
async function seedUser() {
  await db
    .insertInto('users')
    .values({ id: TEST_UID, email: TEST_EMAIL })
    .onConflict((oc) => oc.column('id').doNothing())
    .execute()
}

afterEach(async () => {
  await db.deleteFrom('submissions').where('user_id', '=', TEST_UID).execute()
  await db.deleteFrom('users').where('id', '=', TEST_UID).execute()
  vi.restoreAllMocks()
})

describe('POST /api/execution/submit', () => {
  it('should return 202 with submissionId on successful submission', async () => {
    await seedUser()
    const queue = createMockQueue()
    const eventPublisher = createMockEventPublisher()
    const app = await buildApp({ queue, eventPublisher })

    const response = await app.inject({
      method: 'POST',
      url: '/api/execution/submit',
      headers: { authorization: 'Bearer valid-token' },
      payload: { milestoneId: 'milestone-1', code: 'package main\nfunc main() {}' },
    })

    expect(response.statusCode).toBe(202)
    const body = response.json()
    expect(body.submissionId).toBeDefined()
    expect(typeof body.submissionId).toBe('string')

    await app.close()
  })

  it('should insert a submission row in the database', async () => {
    await seedUser()
    const app = await buildApp()

    const response = await app.inject({
      method: 'POST',
      url: '/api/execution/submit',
      headers: { authorization: 'Bearer valid-token' },
      payload: { milestoneId: 'ms-1', code: 'package main' },
    })

    const body = response.json()
    const row = await db
      .selectFrom('submissions')
      .selectAll()
      .where('id', '=', body.submissionId)
      .executeTakeFirst()

    expect(row).toBeDefined()
    expect(row?.user_id).toBe(TEST_UID)
    expect(row?.milestone_id).toBe('ms-1')
    expect(row?.code).toBe('package main')
    expect(row?.status).toBe('queued')

    await app.close()
  })

  it('should enqueue a BullMQ job with correct data', async () => {
    await seedUser()
    const queue = createMockQueue()
    const app = await buildApp({ queue })

    const response = await app.inject({
      method: 'POST',
      url: '/api/execution/submit',
      headers: { authorization: 'Bearer valid-token' },
      payload: { milestoneId: 'ms-2', code: 'package main\nfunc main() {}' },
    })

    const body = response.json()
    expect(queue.add).toHaveBeenCalledWith('execution-run', {
      submissionId: body.submissionId,
      milestoneId: 'ms-2',
      code: 'package main\nfunc main() {}',
      userId: TEST_UID,
    })

    await app.close()
  })

  it('should publish a queued event after enqueuing', async () => {
    await seedUser()
    const eventPublisher = createMockEventPublisher()
    const app = await buildApp({ eventPublisher })

    const response = await app.inject({
      method: 'POST',
      url: '/api/execution/submit',
      headers: { authorization: 'Bearer valid-token' },
      payload: { milestoneId: 'ms-3', code: 'package main' },
    })

    const body = response.json()
    expect(eventPublisher.publish).toHaveBeenCalledWith(body.submissionId, {
      type: 'queued',
      submissionId: body.submissionId,
    })

    await app.close()
  })

  it('should return 429 with Retry-After when rate limited', async () => {
    const rateLimiter = createMockRateLimiter({
      allowed: false,
      remaining: 0,
      retryAfterMs: 30_000,
    })
    const app = await buildApp({ rateLimiter })

    const response = await app.inject({
      method: 'POST',
      url: '/api/execution/submit',
      headers: { authorization: 'Bearer valid-token' },
      payload: { milestoneId: 'ms-1', code: 'package main' },
    })

    expect(response.statusCode).toBe(429)
    expect(response.headers['retry-after']).toBe('30')
    expect(response.json().error.code).toBe('RATE_LIMITED')

    await app.close()
  })

  it('should return 400 when milestoneId is missing', async () => {
    const app = await buildApp()

    const response = await app.inject({
      method: 'POST',
      url: '/api/execution/submit',
      headers: { authorization: 'Bearer valid-token' },
      payload: { code: 'package main' },
    })

    expect(response.statusCode).toBe(400)

    await app.close()
  })

  it('should return 400 when code is missing', async () => {
    const app = await buildApp()

    const response = await app.inject({
      method: 'POST',
      url: '/api/execution/submit',
      headers: { authorization: 'Bearer valid-token' },
      payload: { milestoneId: 'ms-1' },
    })

    expect(response.statusCode).toBe(400)

    await app.close()
  })

  it('should return 400 when code exceeds max size', async () => {
    const app = await buildApp()
    const largeCode = 'x'.repeat(65537)

    const response = await app.inject({
      method: 'POST',
      url: '/api/execution/submit',
      headers: { authorization: 'Bearer valid-token' },
      payload: { milestoneId: 'ms-1', code: largeCode },
    })

    expect(response.statusCode).toBe(400)

    await app.close()
  })

  it('should return 503 when queue add fails and mark submission as failed', async () => {
    await seedUser()
    const queue = createMockQueue()
    ;(queue.add as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Queue down'))
    const app = await buildApp({ queue })

    const response = await app.inject({
      method: 'POST',
      url: '/api/execution/submit',
      headers: { authorization: 'Bearer valid-token' },
      payload: { milestoneId: 'ms-1', code: 'package main' },
    })

    expect(response.statusCode).toBe(503)
    expect(response.json().error.code).toBe('SERVICE_UNAVAILABLE')

    // Verify DB status updated to failed
    const rows = await db
      .selectFrom('submissions')
      .selectAll()
      .where('user_id', '=', TEST_UID)
      .execute()
    expect(rows.length).toBe(1)
    expect(rows[0]?.status).toBe('failed')
    expect(rows[0]?.error_message).toBe('Queue unavailable')

    await app.close()
  })

  it('should return 401 when no auth token provided', async () => {
    const app = await buildApp()

    const response = await app.inject({
      method: 'POST',
      url: '/api/execution/submit',
      payload: { milestoneId: 'ms-1', code: 'package main' },
    })

    expect(response.statusCode).toBe(401)

    await app.close()
  })
})
