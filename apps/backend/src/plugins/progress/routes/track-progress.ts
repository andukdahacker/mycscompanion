import type { FastifyInstance } from 'fastify'
import { sql, type Kysely } from 'kysely'
import type { DB } from '@mycscompanion/shared'
import type { CriterionResult, MilestoneProgressInfo, MilestoneStatus, TrackProgressData } from '@mycscompanion/shared'

interface TrackProgressRoutesOptions {
  readonly db: Kysely<DB>
}

export async function trackProgressRoutes(
  fastify: FastifyInstance,
  opts: TrackProgressRoutesOptions
): Promise<void> {
  const { db } = opts

  fastify.get('/track-progress', async (request) => {
    const uid = request.uid

    // Find the first track (MVP: single track)
    const track = await db
      .selectFrom('tracks')
      .select(['id', 'name', 'slug'])
      .orderBy('id', 'asc')
      .limit(1)
      .executeTakeFirstOrThrow()

    // Load all milestones in the track ordered by position
    const milestones = await db
      .selectFrom('milestones')
      .select(['id', 'slug', 'title', 'position', 'description'])
      .where('track_id', '=', track.id)
      .orderBy('position', 'asc')
      .execute()

    // Load user completions
    const completions = await db
      .selectFrom('user_milestones')
      .select(['milestone_id', 'completed_at'])
      .where('user_id', '=', uid)
      .execute()

    const completionMap = new Map(
      completions.map((c) => [c.milestone_id, c.completed_at])
    )

    // Find first incomplete milestone for in-progress detection
    const firstIncompleteMilestone = milestones.find(
      (m) => !completionMap.has(m.id)
    )

    // For the in-progress milestone, get latest completed submission criteria
    let inProgressCriteria: { met: number; total: number } | null = null
    if (firstIncompleteMilestone) {
      // Check if user has any submissions for this milestone
      const latestSubmission = await db
        .selectFrom('submissions')
        .select(['criteria_results'])
        .where('user_id', '=', uid)
        .where('milestone_id', '=', firstIncompleteMilestone.id)
        .where('status', '=', 'completed')
        .orderBy('created_at', 'desc')
        .limit(1)
        .executeTakeFirst()

      if (latestSubmission?.criteria_results) {
        const results = latestSubmission.criteria_results as unknown[] as readonly CriterionResult[]
        const met = results.filter((r) => r.status === 'met').length
        inProgressCriteria = { met, total: results.length }
      }
    }

    // For completed milestones, batch-load criteria counts from latest submissions
    const completedMilestoneIds = milestones
      .filter((m) => completionMap.has(m.id))
      .map((m) => m.id)

    const completedCriteriaMap = new Map<string, { met: number; total: number }>()
    if (completedMilestoneIds.length > 0) {
      // Single query: get latest completed submission per completed milestone
      const completedSubmissions = await db
        .selectFrom('submissions as s')
        .select(['s.milestone_id', 's.criteria_results'])
        .where('s.user_id', '=', uid)
        .where('s.milestone_id', 'in', completedMilestoneIds)
        .where('s.status', '=', 'completed')
        .where(({ eb, selectFrom }) =>
          eb(
            's.created_at',
            '=',
            selectFrom('submissions as s2')
              .select(({ fn }) => fn.max('s2.created_at').as('max_created_at'))
              .where('s2.user_id', '=', uid)
              .where('s2.milestone_id', '=', eb.ref('s.milestone_id'))
              .where('s2.status', '=', 'completed')
          )
        )
        .execute()

      for (const sub of completedSubmissions) {
        if (sub.criteria_results) {
          const results = sub.criteria_results as unknown[] as readonly CriterionResult[]
          completedCriteriaMap.set(sub.milestone_id, {
            met: results.filter((r) => r.status === 'met').length,
            total: results.length,
          })
        }
      }
    }

    // Fetch best benchmark ops/sec per milestone via SQL aggregation
    const milestoneIdsWithActivity = milestones
      .filter((m) => completionMap.has(m.id) || (firstIncompleteMilestone && m.id === firstIncompleteMilestone.id))
      .map((m) => m.id)

    const benchmarkMap = new Map<string, number>()
    if (milestoneIdsWithActivity.length > 0) {
      const benchmarkRows = await db
        .selectFrom('benchmark_results')
        .select('milestone_id')
        .select(sql<string>`max((raw_metrics->>'opsPerSec')::numeric)`.as('max_ops'))
        .where('user_id', '=', uid)
        .where('milestone_id', 'in', milestoneIdsWithActivity)
        .groupBy('milestone_id')
        .execute()

      for (const row of benchmarkRows) {
        const ops = parseFloat(row.max_ops) || 0
        if (ops > 0) {
          benchmarkMap.set(row.milestone_id, ops)
        }
      }
    }

    // Build milestone progress info
    const milestoneProgress: MilestoneProgressInfo[] = milestones.map((m) => {
      let status: MilestoneStatus
      let criteriaMet: number | null = null
      let criteriaTotal: number | null = null
      let completedAt: string | null = null

      if (completionMap.has(m.id)) {
        status = 'completed'
        const completedDate = completionMap.get(m.id)
        completedAt = completedDate ? new Date(completedDate).toISOString() : null

        const criteria = completedCriteriaMap.get(m.id)
        if (criteria) {
          criteriaMet = criteria.met
          criteriaTotal = criteria.total
        }
      } else if (firstIncompleteMilestone && m.id === firstIncompleteMilestone.id) {
        status = 'in-progress'
        if (inProgressCriteria) {
          criteriaMet = inProgressCriteria.met
          criteriaTotal = inProgressCriteria.total
        }
      } else {
        status = 'upcoming'
      }

      return {
        id: m.id,
        slug: m.slug,
        title: m.title,
        position: m.position,
        description: m.description ?? '',
        status,
        criteriaMet,
        criteriaTotal,
        completedAt,
        lastBenchmark: benchmarkMap.has(m.id)
          ? { bestOpsPerSec: benchmarkMap.get(m.id)! }
          : null,
      }
    })

    const result: TrackProgressData = {
      trackName: track.name,
      trackSlug: track.slug,
      milestones: milestoneProgress,
      completedCount: completedMilestoneIds.length,
      totalCount: milestones.length,
    }

    return result
  })
}
