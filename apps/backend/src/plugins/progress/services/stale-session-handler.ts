import type { FastifyBaseLogger } from 'fastify'
import type { Kysely } from 'kysely'
import { sql } from 'kysely'
import type { DB } from '@mycscompanion/shared'
import { generateSessionSummary } from './summary-generator.js'

const STALE_SESSION_THRESHOLD_MS = 15 * 60 * 1000 // 15 minutes

/**
 * Finds and processes stale sessions for a user:
 * 1. Finds active sessions with no recent activity (> 15 min since last snapshot)
 * 2. Deactivates them
 * 3. Generates summaries if missing
 *
 * Called on overview/resume requests as a lazy check.
 */
async function processStaleSessionsForUser(
  db: Kysely<DB>,
  userId: string,
  logger?: FastifyBaseLogger,
): Promise<void> {
  const staleCutoff = new Date(Date.now() - STALE_SESSION_THRESHOLD_MS)

  // Single query: join active sessions with their latest snapshot to avoid N+1
  const sessionsWithActivity = await db
    .selectFrom('sessions as s')
    .leftJoin(
      (eb) =>
        eb
          .selectFrom('code_snapshots')
          .select(['session_id', sql<Date>`max(created_at)`.as('latest_snapshot_at')])
          .groupBy('session_id')
          .as('cs'),
      (join) => join.onRef('cs.session_id', '=', 's.id'),
    )
    .select(['s.id', 's.started_at', 'cs.latest_snapshot_at'])
    .where('s.user_id', '=', userId)
    .where('s.is_active', '=', true)
    .execute()

  for (const session of sessionsWithActivity) {
    const lastActivity = session.latest_snapshot_at ?? session.started_at
    const lastActivityDate = lastActivity instanceof Date ? lastActivity : new Date(lastActivity)

    if (lastActivityDate < staleCutoff) {
      // Session is stale — deactivate and generate summary
      await db
        .updateTable('sessions')
        .set({ is_active: false, ended_at: lastActivityDate })
        .where('id', '=', session.id)
        .where('is_active', '=', true) // Guard against race
        .execute()

      try {
        await generateSessionSummary(db, session.id)
      } catch (err) {
        // Log but don't throw — stale session handling is best-effort
        logger?.error({ err, sessionId: session.id }, 'stale_session_summary_failed')
      }
    }
  }
}

/**
 * Backfills summary for the most recent ended session if missing.
 * Called on overview/resume to handle browser-crash scenarios where
 * beforeunload never fired and the heartbeat timeout already ended the session.
 */
async function backfillLatestSessionSummary(
  db: Kysely<DB>,
  userId: string,
  milestoneId: string,
): Promise<void> {
  // Find the most recent ended session for this user+milestone
  const lastEndedSession = await db
    .selectFrom('sessions')
    .select(['id'])
    .where('user_id', '=', userId)
    .where('milestone_id', '=', milestoneId)
    .where('is_active', '=', false)
    .orderBy('started_at', 'desc')
    .limit(1)
    .executeTakeFirst()

  if (!lastEndedSession) return

  // Check if summary exists
  const existingSummary = await db
    .selectFrom('session_summaries')
    .select(['id'])
    .where('session_id', '=', lastEndedSession.id)
    .executeTakeFirst()

  if (existingSummary) return

  // Generate summary for the ended session that lacks one
  try {
    await generateSessionSummary(db, lastEndedSession.id)
  } catch {
    // Best-effort — will retry on next request
  }
}

export { processStaleSessionsForUser, backfillLatestSessionSummary, STALE_SESSION_THRESHOLD_MS }
