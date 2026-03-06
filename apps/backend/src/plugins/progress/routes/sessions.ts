import type { FastifyInstance } from 'fastify'
import type { Kysely } from 'kysely'
import type { DB } from '@mycscompanion/shared'
import { generateId } from '../../../shared/id.js'

interface CreateSessionBody {
  readonly milestoneId: string
}

interface SessionRoutesOptions {
  readonly db: Kysely<DB>
}

const createSessionBodySchema = {
  body: {
    type: 'object',
    required: ['milestoneId'],
    properties: {
      milestoneId: { type: 'string', minLength: 1 },
    },
    additionalProperties: false,
  },
} as const

async function sessionRoutes(
  fastify: FastifyInstance,
  opts: SessionRoutesOptions
): Promise<void> {
  const { db } = opts

  // POST /api/progress/sessions
  fastify.post<{ Body: CreateSessionBody }>('/sessions', { schema: createSessionBodySchema }, async (request) => {
    const { milestoneId } = request.body
    const userId = request.uid

    // Check for existing active session (fast path, no transaction needed)
    const existing = await db
      .selectFrom('sessions')
      .select(['id', 'started_at'])
      .where('user_id', '=', userId)
      .where('milestone_id', '=', milestoneId)
      .where('is_active', '=', true)
      .executeTakeFirst()

    if (existing) {
      return {
        session: { id: existing.id, startedAt: existing.started_at.toISOString() },
        created: false,
      }
    }

    // Try to create a new session inside a transaction
    try {
      const result = await db.transaction().execute(async (trx) => {
        // Re-check inside transaction with FOR UPDATE
        const raceCheck = await trx
          .selectFrom('sessions')
          .select(['id', 'started_at'])
          .where('user_id', '=', userId)
          .where('milestone_id', '=', milestoneId)
          .where('is_active', '=', true)
          .forUpdate()
          .executeTakeFirst()

        if (raceCheck) {
          return {
            session: { id: raceCheck.id, startedAt: raceCheck.started_at.toISOString() },
            created: false,
          }
        }

        // Deactivate other active sessions for this user
        await trx
          .updateTable('sessions')
          .set({ is_active: false, ended_at: new Date() })
          .where('user_id', '=', userId)
          .where('is_active', '=', true)
          .execute()

        const sessionId = generateId()
        const now = new Date()
        await trx
          .insertInto('sessions')
          .values({
            id: sessionId,
            user_id: userId,
            milestone_id: milestoneId,
            is_active: true,
            started_at: now,
          })
          .execute()

        return {
          session: { id: sessionId, startedAt: now.toISOString() },
          created: true,
        }
      })

      return result
    } catch {
      // Unique partial index violation — another concurrent request won the race
      // Query outside the failed transaction
      const raceWinner = await db
        .selectFrom('sessions')
        .select(['id', 'started_at'])
        .where('user_id', '=', userId)
        .where('milestone_id', '=', milestoneId)
        .where('is_active', '=', true)
        .executeTakeFirst()

      if (raceWinner) {
        return {
          session: { id: raceWinner.id, startedAt: raceWinner.started_at.toISOString() },
          created: false,
        }
      }
      throw new Error('Failed to create or find active session')
    }
  })
}

export { sessionRoutes }
export type { CreateSessionBody }
