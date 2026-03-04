import { describe, it, expect, afterEach } from 'vitest'
import Fastify from 'fastify'
import { authPlugin } from '../../auth/index.js'
import { submitRoutes } from './submit.js'
import { streamRoutes } from './stream.js'
import { createMockFirebaseAuth } from '@mycscompanion/config/test-utils'
import { db } from '../../../shared/db.js'
import { redis } from '../../../shared/redis.js'
import { createExecutionQueue, createBullMQConnection } from '../../../shared/queue.js'
import { RateLimiter } from '../../../shared/rate-limiter.js'
import { createEventPublisher } from '../../../shared/event-publisher.js'

const TEST_UID = 'test-integration-uid'
const mockAuth = createMockFirebaseAuth(TEST_UID)

describe.skipIf(!process.env['MCC_FLY_API_TOKEN'])(
  'Integration: Submission → SSE stream round-trip',
  () => {
    let submissionId: string | undefined

    afterEach(async () => {
      if (submissionId) {
        await db.deleteFrom('submissions').where('id', '=', submissionId).execute()
      }
      await db.deleteFrom('users').where('id', '=', TEST_UID).execute()
    })

    it('should complete compilation round-trip within 5 seconds', async () => {
      // Seed user for FK constraint
      await db
        .insertInto('users')
        .values({ id: TEST_UID, email: 'integration@test.com' })
        .onConflict((oc) => oc.column('id').doNothing())
        .execute()

      const redisUrl = process.env['REDIS_URL']
      if (!redisUrl) throw new Error('REDIS_URL required for integration test')

      const bullmqConnection = createBullMQConnection(redisUrl)
      const executionQueue = createExecutionQueue(bullmqConnection)
      const rateLimiter = new RateLimiter({ redis, windowMs: 60_000, maxRequests: 100 })
      const eventPublisher = createEventPublisher(redis)

      const app = Fastify({ logger: false })
      await app.register(authPlugin, { firebaseAuth: mockAuth })
      await app.register(submitRoutes, {
        prefix: '/api/execution',
        db,
        queue: executionQueue,
        rateLimiter,
        eventPublisher,
      })
      await app.register(streamRoutes, {
        prefix: '/api/execution',
        db,
        redis,
      })
      await app.ready()

      // Submit Go code
      const submitResponse = await app.inject({
        method: 'POST',
        url: '/api/execution/submit',
        headers: { authorization: 'Bearer valid-token' },
        payload: {
          milestoneId: 'integration-test',
          code: 'package main\nimport "fmt"\nfunc main() { fmt.Println("hello") }',
        },
      })

      expect(submitResponse.statusCode).toBe(202)
      submissionId = submitResponse.json().submissionId

      // Open SSE stream and wait for complete event
      const start = Date.now()
      const streamResponse = await app.inject({
        method: 'GET',
        url: `/api/execution/${submissionId}/stream`,
        headers: { authorization: 'Bearer valid-token' },
      })

      const elapsed = Date.now() - start
      expect(streamResponse.statusCode).toBe(200)
      expect(streamResponse.body).toContain('event: complete')
      expect(elapsed).toBeLessThan(5000) // NFR-P1: <5s round-trip

      await app.close()
      await executionQueue.close()
      await bullmqConnection.quit()
    }, 10_000) // 10s test timeout
  }
)
