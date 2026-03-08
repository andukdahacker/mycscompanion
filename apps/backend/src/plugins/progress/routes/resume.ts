import type { FastifyInstance } from 'fastify'
import type { Kysely } from 'kysely'
import type { DB, ResumeData, CriterionResult } from '@mycscompanion/shared'

interface ResumeRoutesOptions {
  readonly db: Kysely<DB>
}

async function resumeRoutes(
  fastify: FastifyInstance,
  opts: ResumeRoutesOptions
): Promise<void> {
  const { db } = opts

  // GET /api/progress/resume/:milestoneId
  fastify.get<{ Params: { milestoneId: string } }>(
    '/resume/:milestoneId',
    async (request): Promise<ResumeData> => {
      const { milestoneId } = request.params
      const userId = request.uid

      // Parallel fetch: independent queries for snapshot and submission
      const [snapshot, submission] = await Promise.all([
        db
          .selectFrom('code_snapshots')
          .select(['id', 'code', 'created_at'])
          .where('user_id', '=', userId)
          .where('milestone_id', '=', milestoneId)
          .orderBy('created_at', 'desc')
          .limit(1)
          .executeTakeFirst(),
        db
          .selectFrom('submissions')
          .select(['id', 'criteria_results'])
          .where('user_id', '=', userId)
          .where('milestone_id', '=', milestoneId)
          .where('status', '=', 'completed')
          .orderBy('created_at', 'desc')
          .limit(1)
          .executeTakeFirst(),
      ])

      return {
        latestSnapshot: snapshot
          ? {
              id: snapshot.id,
              code: snapshot.code,
              createdAt: new Date(snapshot.created_at).toISOString(),
            }
          : null,
        lastSubmissionId: submission?.id ?? null,
        lastSubmissionCriteria: (submission?.criteria_results ?? null) as ReadonlyArray<CriterionResult> | null,
      }
    }
  )
}

export { resumeRoutes }
