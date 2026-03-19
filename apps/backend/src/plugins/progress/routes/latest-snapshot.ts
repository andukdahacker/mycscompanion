import type { FastifyInstance } from 'fastify'
import type { Kysely } from 'kysely'
import type { DB } from '@mycscompanion/shared'
import { toCamelCase } from '@mycscompanion/shared'

interface LatestSnapshotRoutesOptions {
  readonly db: Kysely<DB>
}

async function latestSnapshotRoutes(
  fastify: FastifyInstance,
  opts: LatestSnapshotRoutesOptions
): Promise<void> {
  const { db } = opts

  // GET /api/progress/snapshots/:milestoneId/latest
  fastify.get<{ Params: { milestoneId: string } }>(
    '/snapshots/:milestoneId/latest',
    async (request) => {
      const { milestoneId } = request.params
      const userId = request.uid

      const snapshot = await db
        .selectFrom('code_snapshots')
        .select(['id', 'code', 'files', 'created_at'])
        .where('user_id', '=', userId)
        .where('milestone_id', '=', milestoneId)
        .orderBy('created_at', 'desc')
        .limit(1)
        .executeTakeFirst()

      if (!snapshot) {
        return { snapshot: null }
      }

      // Extract files before toCamelCase to preserve filename keys (e.g., "main.go")
      const { files: rawFiles, ...rest } = snapshot
      const files = typeof rawFiles === 'string' ? JSON.parse(rawFiles) : (rawFiles ?? null)
      return { snapshot: { ...toCamelCase(rest), files } }
    }
  )
}

export { latestSnapshotRoutes }
