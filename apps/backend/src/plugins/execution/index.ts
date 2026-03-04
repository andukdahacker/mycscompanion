import type { FastifyInstance } from 'fastify'
import type { Kysely } from 'kysely'
import type { DB } from '@mycscompanion/shared'
import { db as defaultDb } from '../../shared/db.js'
import type { RateLimitChecker } from '../../shared/rate-limiter.js'
import type { EventPublisher } from '../../shared/event-publisher.js'
import type { ExecutionQueueAdd } from './routes/submit.js'
import { submitRoutes } from './routes/submit.js'

export interface ExecutionPluginOptions {
  readonly db?: Kysely<DB>
  readonly queue: ExecutionQueueAdd
  readonly rateLimiter: RateLimitChecker
  readonly eventPublisher: EventPublisher
}

export async function executionPlugin(
  fastify: FastifyInstance,
  opts: ExecutionPluginOptions
): Promise<void> {
  const db = opts.db ?? defaultDb

  await fastify.register(submitRoutes, {
    db,
    queue: opts.queue,
    rateLimiter: opts.rateLimiter,
    eventPublisher: opts.eventPublisher,
  })

  // GET /:submissionId/stream — SSE stream for execution results (Story 3.4)
}
