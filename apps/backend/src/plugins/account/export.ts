import type { FastifyInstance } from 'fastify'
import type { Kysely } from 'kysely'
import type { DB } from '@mycscompanion/shared'
import type { Queue } from 'bullmq'
import type { ExportJobData } from '../../shared/queue.js'
import { createId } from '@paralleldrive/cuid2'

type ExportRoutesOptions = {
  readonly db: Kysely<DB>
  readonly exportQueue: Queue<ExportJobData>
}

const RATE_LIMIT_MS = 5 * 60 * 1000 // 5 minutes

export async function exportRoutes(
  fastify: FastifyInstance,
  opts: ExportRoutesOptions
): Promise<void> {
  const { db, exportQueue } = opts

  // POST /export — trigger export
  fastify.post('/export', async (request, reply) => {
    const userId = request.uid

    // Check for existing processing export
    const existingExport = await db
      .selectFrom('data_exports')
      .select(['id', 'status', 'created_at'])
      .where('user_id', '=', userId)
      .orderBy('created_at', 'desc')
      .limit(1)
      .executeTakeFirst()

    if (existingExport?.status === 'processing') {
      return reply.send({
        exportId: existingExport.id,
        status: 'processing',
        message: 'Export already in progress',
      })
    }

    // Rate limit: max 1 export per 5 minutes
    if (existingExport) {
      const createdAt = new Date(existingExport.created_at).getTime()
      const now = Date.now()
      if (now - createdAt < RATE_LIMIT_MS) {
        return reply.status(429).send({
          error: {
            code: 'RATE_LIMITED',
            message: 'Please wait at least 5 minutes between export requests',
          },
        })
      }
    }

    const exportId = createId()
    await db
      .insertInto('data_exports')
      .values({
        id: exportId,
        user_id: userId,
        status: 'processing',
      })
      .execute()

    await exportQueue.add('account-export', { exportId, userId })

    return reply.send({ exportId, status: 'processing' })
  })

  // GET /export/status — check latest export status
  fastify.get('/export/status', async (request, reply) => {
    const userId = request.uid

    const latest = await db
      .selectFrom('data_exports')
      .select(['id', 'status', 'created_at', 'completed_at'])
      .where('user_id', '=', userId)
      .orderBy('created_at', 'desc')
      .limit(1)
      .executeTakeFirst()

    if (!latest) {
      return reply.send({ exportId: null, status: 'none', createdAt: null, completedAt: null })
    }

    return reply.send({
      exportId: latest.id,
      status: latest.status,
      createdAt: latest.created_at,
      completedAt: latest.completed_at,
    })
  })

  // GET /export/download — download completed export
  fastify.get('/export/download', async (request, reply) => {
    const userId = request.uid

    const completed = await db
      .selectFrom('data_exports')
      .select(['export_data'])
      .where('user_id', '=', userId)
      .where('status', '=', 'completed')
      .orderBy('created_at', 'desc')
      .limit(1)
      .executeTakeFirst()

    if (!completed) {
      return reply.status(404).send({
        error: { code: 'NO_EXPORT', message: 'No completed export found' },
      })
    }

    const date = new Date().toISOString().split('T')[0]
    void reply.header('Content-Type', 'application/json')
    void reply.header('Content-Disposition', `attachment; filename="mycscompanion-export-${date}.json"`)
    return reply.send(completed.export_data)
  })
}
