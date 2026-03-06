import type { FastifyInstance } from 'fastify'
import type { Kysely } from 'kysely'
import type { DB } from '@mycscompanion/shared'
import type { CriterionResult, OverviewData, OverviewCriteriaProgress } from '@mycscompanion/shared'

const BRIEF_EXCERPT_LENGTH = 200

export interface OverviewContentLoader {
  loadMilestoneBrief(slug: string): Promise<string | null>
  loadMetadata(slug: string): Promise<{ csConceptLabel: string | null }>
}

interface OverviewRoutesOptions {
  readonly db: Kysely<DB>
  readonly contentLoader: OverviewContentLoader
}

export async function overviewRoutes(
  fastify: FastifyInstance,
  opts: OverviewRoutesOptions
): Promise<void> {
  const { db, contentLoader } = opts

  fastify.get('/overview', async (request) => {
    const uid = request.uid

    // Check if user has any completions or submissions
    const [completionCount, submissionCount] = await Promise.all([
      db
        .selectFrom('user_milestones')
        .select(db.fn.countAll<string>().as('count'))
        .where('user_id', '=', uid)
        .executeTakeFirstOrThrow(),
      db
        .selectFrom('submissions')
        .select(db.fn.countAll<string>().as('count'))
        .where('user_id', '=', uid)
        .executeTakeFirstOrThrow(),
    ])

    const hasCompletions = Number(completionCount.count) > 0
    const hasSubmissions = Number(submissionCount.count) > 0
    const isFirstTime = !hasCompletions && !hasSubmissions

    // Find the first track
    const firstTrack = await db
      .selectFrom('tracks')
      .select(['id'])
      .orderBy('id', 'asc')
      .limit(1)
      .executeTakeFirstOrThrow()

    let activeMilestone: { id: string; slug: string; title: string; position: number; track_id: string }

    if (!hasCompletions) {
      // First milestone in first track
      const milestone = await db
        .selectFrom('milestones')
        .select(['id', 'slug', 'title', 'position', 'track_id'])
        .where('track_id', '=', firstTrack.id)
        .orderBy('position', 'asc')
        .limit(1)
        .executeTakeFirstOrThrow()
      activeMilestone = milestone
    } else {
      // Find completed milestone IDs
      const completedMilestoneIds = await db
        .selectFrom('user_milestones')
        .select(['milestone_id'])
        .where('user_id', '=', uid)
        .execute()

      const completedIds = completedMilestoneIds.map((r) => r.milestone_id)

      // Find first incomplete milestone in first track
      let query = db
        .selectFrom('milestones')
        .select(['id', 'slug', 'title', 'position', 'track_id'])
        .where('track_id', '=', firstTrack.id)

      if (completedIds.length > 0) {
        query = query.where('id', 'not in', completedIds)
      }

      const incompleteMilestone = await query
        .orderBy('position', 'asc')
        .limit(1)
        .executeTakeFirst()

      if (incompleteMilestone) {
        activeMilestone = incompleteMilestone
      } else {
        // All milestones complete — return the last one
        const lastMilestone = await db
          .selectFrom('milestones')
          .select(['id', 'slug', 'title', 'position', 'track_id'])
          .where('track_id', '=', firstTrack.id)
          .orderBy('position', 'desc')
          .limit(1)
          .executeTakeFirstOrThrow()
        activeMilestone = lastMilestone
      }
    }

    // Load content for brief excerpt and CS concept label
    const [brief, metadata] = await Promise.all([
      contentLoader.loadMilestoneBrief(activeMilestone.slug),
      contentLoader.loadMetadata(activeMilestone.slug),
    ])

    const briefExcerpt = brief ? brief.slice(0, BRIEF_EXCERPT_LENGTH) : ''

    // Determine criteria progress for milestone-start variant
    let criteriaProgress: OverviewCriteriaProgress | null = null
    if (!isFirstTime) {
      const latestSubmission = await db
        .selectFrom('submissions')
        .select(['criteria_results'])
        .where('user_id', '=', uid)
        .where('milestone_id', '=', activeMilestone.id)
        .where('status', '=', 'completed')
        .orderBy('created_at', 'desc')
        .limit(1)
        .executeTakeFirst()

      if (latestSubmission?.criteria_results) {
        const results = latestSubmission.criteria_results as unknown[] as readonly CriterionResult[]
        const met = results.filter((r) => r.status === 'met').length
        const total = results.length
        const nextCriterion = results.find((r) => r.status !== 'met')
        criteriaProgress = {
          met,
          total,
          nextCriterionName: nextCriterion?.name ?? null,
        }
      }
    }

    const result: OverviewData = {
      variant: isFirstTime ? 'first-time' : 'milestone-start',
      milestone: {
        id: activeMilestone.id,
        slug: activeMilestone.slug,
        title: activeMilestone.title,
        position: activeMilestone.position,
        briefExcerpt,
        csConceptLabel: metadata.csConceptLabel,
      },
      criteriaProgress,
      sessionSummary: null,
      lastBenchmark: null,
      benchmarkTrend: null,
    }

    return result
  })
}
