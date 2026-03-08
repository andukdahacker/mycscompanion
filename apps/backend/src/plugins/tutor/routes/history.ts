import type { FastifyInstance } from 'fastify'
import type { Kysely } from 'kysely'
import type { DB } from '@mycscompanion/shared'
import { toCamelCase } from '@mycscompanion/shared'

export type HistoryRoutesOptions = {
  readonly db: Kysely<DB>
}

const DEFAULT_PAGE_SIZE = 20

const historySchema = {
  params: {
    type: 'object' as const,
    required: ['sessionId'],
    properties: {
      sessionId: { type: 'string' as const },
    },
  },
  querystring: {
    type: 'object' as const,
    properties: {
      afterCursor: { type: 'string' as const },
      pageSize: { type: 'string' as const },
    },
  },
}

export async function historyRoutes(
  fastify: FastifyInstance,
  opts: HistoryRoutesOptions
): Promise<void> {
  const { db } = opts

  fastify.get<{
    Params: { sessionId: string }
    Querystring: { afterCursor?: string; pageSize?: string }
  }>(
    '/:sessionId/messages',
    { schema: historySchema },
    async (request, reply) => {
      const uid = request.uid
      const { sessionId } = request.params
      const afterCursor = request.query.afterCursor
      const pageSize = Math.min(
        Math.max(1, parseInt(request.query.pageSize ?? '', 10) || DEFAULT_PAGE_SIZE),
        100
      )

      // Validate session ownership
      const session = await db
        .selectFrom('sessions')
        .select('id')
        .where('id', '=', sessionId)
        .where('user_id', '=', uid)
        .executeTakeFirst()

      if (!session) {
        return reply.status(404).send({
          error: { code: 'SESSION_NOT_FOUND', message: 'Session not found' },
        })
      }

      // Build query with stable composite ordering (created_at, id)
      let query = db
        .selectFrom('tutor_messages')
        .select(['id', 'role', 'content', 'model', 'created_at'])
        .where('session_id', '=', sessionId)
        .orderBy('created_at', 'asc')
        .orderBy('id', 'asc')
        .limit(pageSize)

      if (afterCursor) {
        const cursorMessage = await db
          .selectFrom('tutor_messages')
          .select(['created_at', 'id'])
          .where('id', '=', afterCursor)
          .executeTakeFirst()

        if (cursorMessage) {
          // Composite cursor: (created_at, id) > (cursor_created_at, cursor_id)
          query = query.where((eb) =>
            eb.or([
              eb('created_at', '>', cursorMessage.created_at),
              eb.and([
                eb('created_at', '=', cursorMessage.created_at),
                eb('id', '>', cursorMessage.id),
              ]),
            ])
          )
        }
      }

      const messages = await query.execute()

      return {
        messages: messages.map((m) => toCamelCase(m)),
        nextCursor: messages.length === pageSize ? messages[messages.length - 1]?.id ?? null : null,
      }
    }
  )
}
