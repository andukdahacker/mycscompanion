import type { FastifyInstance } from 'fastify'
import type { Kysely } from 'kysely'
import type { DB } from '@mycscompanion/shared'
import { generateId } from '../../../shared/id.js'

interface AutoSaveBody {
  readonly milestoneId: string
  readonly code?: string
  readonly files?: Record<string, string>
}

interface AutoSaveRoutesOptions {
  readonly db: Kysely<DB>
}

const autoSaveBodySchema = {
  body: {
    type: 'object',
    required: ['milestoneId'],
    properties: {
      milestoneId: { type: 'string', minLength: 1 },
      code: { type: 'string' },
      files: {
        type: 'object',
        additionalProperties: { type: 'string' },
      },
    },
  },
} as const

async function autoSaveRoutes(
  fastify: FastifyInstance,
  opts: AutoSaveRoutesOptions
): Promise<void> {
  const { db } = opts

  // POST /api/progress/save
  fastify.post<{ Body: AutoSaveBody }>('/save', { schema: autoSaveBodySchema }, async (request, reply) => {
    const { milestoneId, code, files } = request.body

    if (code == null && !files) {
      reply.code(400)
      return { error: { code: 'VALIDATION_ERROR', message: 'Either code or files is required' } }
    }
    const userId = request.uid

    // Find or create active session
    let session = await db
      .selectFrom('sessions')
      .select(['id'])
      .where('user_id', '=', userId)
      .where('milestone_id', '=', milestoneId)
      .where('is_active', '=', true)
      .executeTakeFirst()

    if (!session) {
      const sessionId = generateId()
      await db
        .insertInto('sessions')
        .values({
          id: sessionId,
          user_id: userId,
          milestone_id: milestoneId,
          is_active: true,
        })
        .execute()
      session = { id: sessionId }
    }

    // Insert code snapshot (append-only)
    const snapshotId = generateId()
    await db
      .insertInto('code_snapshots')
      .values({
        id: snapshotId,
        user_id: userId,
        milestone_id: milestoneId,
        session_id: session.id,
        code: files ? null : (code ?? null),
        files: files ? JSON.stringify(files) : null,
      })
      .execute()

    return { snapshotId }
  })
}

export { autoSaveRoutes }
export type { AutoSaveBody }
