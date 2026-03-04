import type { FastifyInstance } from 'fastify'
import type { Kysely } from 'kysely'
import type { DB } from '@mycscompanion/shared'
import { generateId } from '../../../shared/id.js'
import type { RateLimitChecker } from '../../../shared/rate-limiter.js'
import type { EventPublisher } from '../../../shared/event-publisher.js'
import type { ExecutionJobData } from '../../../shared/queue.js'

const MAX_CODE_SIZE_BYTES = 65536

const submitSchema = {
  body: {
    type: 'object',
    required: ['milestoneId', 'code'],
    properties: {
      milestoneId: { type: 'string', minLength: 1 },
      code: { type: 'string', minLength: 1, maxLength: MAX_CODE_SIZE_BYTES },
    },
    additionalProperties: false,
  },
} as const

interface SubmitBody {
  readonly milestoneId: string
  readonly code: string
}

export interface ExecutionQueueAdd {
  add(name: string, data: ExecutionJobData): Promise<unknown>
}

export interface SubmitRoutesOptions {
  readonly db: Kysely<DB>
  readonly queue: ExecutionQueueAdd
  readonly rateLimiter: RateLimitChecker
  readonly eventPublisher: EventPublisher
}

export async function submitRoutes(
  fastify: FastifyInstance,
  opts: SubmitRoutesOptions
): Promise<void> {
  const { db, queue, rateLimiter, eventPublisher } = opts

  fastify.post<{ Body: SubmitBody }>('/submit', { schema: submitSchema }, async (request, reply) => {
    // Rate limit check
    const rateResult = await rateLimiter.check(`rate:execution:${request.uid}`)
    if (!rateResult.allowed) {
      const retryAfterSeconds = Math.ceil(rateResult.retryAfterMs / 1000)
      reply.header('Retry-After', retryAfterSeconds)
      reply.code(429)
      return {
        error: {
          code: 'RATE_LIMITED',
          message: `Too many submissions. Try again in ${retryAfterSeconds} seconds.`,
        },
      }
    }

    const { milestoneId, code } = request.body
    const id = generateId()

    // Insert submission row
    try {
      await db
        .insertInto('submissions')
        .values({
          id,
          user_id: request.uid,
          milestone_id: milestoneId,
          code,
          status: 'queued',
        })
        .execute()
    } catch (err) {
      request.log.error(err, 'submission_insert_failed')
      reply.code(500)
      return { error: { code: 'INTERNAL_ERROR', message: 'Failed to create submission' } }
    }

    // Enqueue BullMQ job
    try {
      await queue.add('execution-run', {
        submissionId: id,
        milestoneId,
        code,
        userId: request.uid,
      })
    } catch (err) {
      request.log.error(err, 'queue_add_failed')
      // Update DB status to failed (protected against DB failure)
      try {
        await db
          .updateTable('submissions')
          .set({ status: 'failed', error_message: 'Queue unavailable' })
          .where('id', '=', id)
          .execute()
      } catch (dbErr) {
        request.log.error(dbErr, 'queue_failure_db_update_failed')
      }
      reply.code(503)
      return {
        error: {
          code: 'SERVICE_UNAVAILABLE',
          message: 'Execution service temporarily unavailable. Please try again.',
        },
      }
    }

    // Publish initial queued event (fire-and-forget — submission already created successfully)
    eventPublisher.publish(id, { type: 'queued', submissionId: id }).catch((err) => {
      request.log.error(err, 'queued_event_publish_failed')
    })

    reply.code(202)
    return { submissionId: id }
  })
}
