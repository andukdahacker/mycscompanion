import type { FastifyInstance } from 'fastify'
import type { Kysely } from 'kysely'
import type { DB } from '@mycscompanion/shared'
import { generateSessionSummary } from '../services/summary-generator.js'

interface SessionEndBody {
  readonly sessionId: string
}

interface SessionEndRoutesOptions {
  readonly db: Kysely<DB>
}

const sessionEndBodySchema = {
  body: {
    type: 'object',
    required: ['sessionId'],
    properties: {
      sessionId: { type: 'string', minLength: 1 },
    },
    additionalProperties: false,
  },
} as const

async function sessionEndRoutes(
  fastify: FastifyInstance,
  opts: SessionEndRoutesOptions
): Promise<void> {
  const { db } = opts

  // POST /api/progress/sessions/end
  fastify.post<{ Body: SessionEndBody }>(
    '/sessions/end',
    { schema: sessionEndBodySchema },
    async (request) => {
      const { sessionId } = request.body
      const userId = request.uid

      // Verify session belongs to this user and is active
      const session = await db
        .selectFrom('sessions')
        .select(['id', 'milestone_id'])
        .where('id', '=', sessionId)
        .where('user_id', '=', userId)
        .where('is_active', '=', true)
        .executeTakeFirst()

      if (!session) {
        // Session not found, already ended, or belongs to another user — no-op
        return { ended: false }
      }

      // Deactivate session
      await db
        .updateTable('sessions')
        .set({ is_active: false, ended_at: new Date() })
        .where('id', '=', sessionId)
        .execute()

      // Generate summary (fire-and-forget — don't block response)
      // Summary generation is idempotent so safe to retry
      void (async () => {
        try {
          await generateSessionSummary(db, sessionId)
        } catch (err) {
          fastify.log.error({ err, sessionId }, 'Failed to generate session summary')
        }
      })()

      return { ended: true }
    }
  )
}

export { sessionEndRoutes }
export type { SessionEndBody }
