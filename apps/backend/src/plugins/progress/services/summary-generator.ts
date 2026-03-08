import type { Kysely } from 'kysely'
import { sql } from 'kysely'
import type { DB } from '@mycscompanion/shared'
import type { CriterionResult } from '@mycscompanion/shared'
import { generateId } from '../../../shared/id.js'

interface SessionActivityData {
  readonly sessionId: string
  readonly userId: string
  readonly milestoneId: string
  readonly milestoneName: string
  readonly snapshotCount: number
  readonly submissionCount: number
  readonly criteriaResults: ReadonlyArray<CriterionResult> | null
  readonly totalCriteriaCount: number
  readonly firstSnapshotLineCount: number | null
  readonly lastSnapshotLineCount: number | null
}

function generateSummaryText(activity: SessionActivityData): string | null {
  // No meaningful activity — skip summary
  if (activity.snapshotCount === 0 && activity.submissionCount === 0) {
    return null
  }

  const parts: string[] = []

  // Milestone context
  parts.push(`Working on ${activity.milestoneName}.`)

  // Criteria progress
  if (activity.criteriaResults && activity.criteriaResults.length > 0) {
    const met = activity.criteriaResults.filter((r) => r.status === 'met').length
    const total = activity.criteriaResults.length
    if (met === total) {
      parts.push(`All ${total} criteria met.`)
    } else {
      parts.push(`${met} of ${total} criteria met.`)
      const nextUnmet = activity.criteriaResults.find((r) => r.status !== 'met')
      if (nextUnmet) {
        parts.push(`Next: ${nextUnmet.name}.`)
      }
    }
  } else if (activity.totalCriteriaCount > 0) {
    parts.push(`${activity.totalCriteriaCount} criteria to tackle.`)
  }

  // Code activity
  if (activity.submissionCount > 0) {
    const submissionWord = activity.submissionCount === 1 ? 'submission' : 'submissions'
    parts.push(`${activity.submissionCount} ${submissionWord} made.`)
  }

  if (
    activity.firstSnapshotLineCount !== null
    && activity.lastSnapshotLineCount !== null
    && activity.snapshotCount > 1
  ) {
    const lineDiff = activity.lastSnapshotLineCount - activity.firstSnapshotLineCount
    if (lineDiff > 0) {
      parts.push(`Code grew by ${lineDiff} lines.`)
    } else if (lineDiff < 0) {
      parts.push(`Code refined by ${Math.abs(lineDiff)} lines.`)
    }
  }

  return parts.join(' ')
}

async function getSnapshotStats(
  db: Kysely<DB>,
  sessionId: string,
): Promise<{ count: number; firstLines: number | null; lastLines: number | null }> {
  const countResult = await db
    .selectFrom('code_snapshots')
    .select(db.fn.countAll<string>().as('count'))
    .where('session_id', '=', sessionId)
    .executeTakeFirstOrThrow()

  const count = Number(countResult.count)
  if (count === 0) return { count, firstLines: null, lastLines: null }

  // Use SQL to count lines without transferring full code content
  const lineCountExpr = sql<number>`length(code) - length(replace(code, E'\\n', '')) + 1`

  const [first, last] = await Promise.all([
    db
      .selectFrom('code_snapshots')
      .select(lineCountExpr.as('line_count'))
      .where('session_id', '=', sessionId)
      .orderBy('created_at', 'asc')
      .limit(1)
      .executeTakeFirst(),
    db
      .selectFrom('code_snapshots')
      .select(lineCountExpr.as('line_count'))
      .where('session_id', '=', sessionId)
      .orderBy('created_at', 'desc')
      .limit(1)
      .executeTakeFirst(),
  ])

  return {
    count,
    firstLines: first ? Number(first.line_count) : null,
    lastLines: last ? Number(last.line_count) : null,
  }
}

async function gatherSessionActivity(
  db: Kysely<DB>,
  sessionId: string,
): Promise<SessionActivityData | null> {
  // Load session with milestone info
  const session = await db
    .selectFrom('sessions')
    .innerJoin('milestones', 'milestones.id', 'sessions.milestone_id')
    .select([
      'sessions.id',
      'sessions.user_id',
      'sessions.milestone_id',
      'sessions.started_at',
      'sessions.ended_at',
      'milestones.title',
    ])
    .where('sessions.id', '=', sessionId)
    .executeTakeFirst()

  if (!session) return null

  // Build submission count query with upper bound when session has ended_at
  let submissionQuery = db
    .selectFrom('submissions')
    .select(db.fn.countAll<string>().as('count'))
    .where('user_id', '=', session.user_id)
    .where('milestone_id', '=', session.milestone_id)
    .where('created_at', '>=', session.started_at)

  if (session.ended_at) {
    submissionQuery = submissionQuery.where('created_at', '<=', session.ended_at)
  }

  // Gather activity data in parallel
  const [snapshotStats, submissionCount, latestSubmission] = await Promise.all([
    getSnapshotStats(db, sessionId),
    submissionQuery.executeTakeFirstOrThrow(),
    // Latest completed submission for criteria results (scoped to session timeframe)
    (async () => {
      let q = db
        .selectFrom('submissions')
        .select(['criteria_results'])
        .where('user_id', '=', session.user_id)
        .where('milestone_id', '=', session.milestone_id)
        .where('status', '=', 'completed')
        .where('created_at', '>=', session.started_at)

      if (session.ended_at) {
        q = q.where('created_at', '<=', session.ended_at)
      }

      return q.orderBy('created_at', 'desc').limit(1).executeTakeFirst()
    })(),
  ])

  // Count total criteria from curriculum (use criteria_results length as proxy)
  const criteriaResults = latestSubmission?.criteria_results as unknown[] as readonly CriterionResult[] | null
  const totalCriteriaCount = criteriaResults?.length ?? 0

  return {
    sessionId: session.id,
    userId: session.user_id,
    milestoneId: session.milestone_id,
    milestoneName: session.title,
    snapshotCount: snapshotStats.count,
    submissionCount: Number(submissionCount.count),
    criteriaResults: criteriaResults ?? null,
    totalCriteriaCount,
    firstSnapshotLineCount: snapshotStats.firstLines,
    lastSnapshotLineCount: snapshotStats.lastLines,
  }
}

async function generateSessionSummary(
  db: Kysely<DB>,
  sessionId: string,
): Promise<{ summaryId: string; summaryText: string } | null> {
  // Idempotency check — skip if summary already exists
  const existing = await db
    .selectFrom('session_summaries')
    .select(['id'])
    .where('session_id', '=', sessionId)
    .executeTakeFirst()

  if (existing) return null

  const activity = await gatherSessionActivity(db, sessionId)
  if (!activity) return null

  const summaryText = generateSummaryText(activity)
  if (!summaryText) return null

  const summaryId = generateId()

  try {
    await db
      .insertInto('session_summaries')
      .values({
        id: summaryId,
        user_id: activity.userId,
        session_id: sessionId,
        milestone_id: activity.milestoneId,
        summary_text: summaryText,
      })
      .execute()
  } catch {
    // Unique index violation — another concurrent call already created it (idempotent)
    return null
  }

  return { summaryId, summaryText }
}

export { generateSessionSummary, generateSummaryText, gatherSessionActivity, getSnapshotStats }
export type { SessionActivityData }
