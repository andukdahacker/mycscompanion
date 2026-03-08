# Story 5.3: Session Summary Generation

Status: done

## Story

As a system,
I want to generate a natural-language session summary when a learner's session ends,
so that returning learners have useful context about where they left off.

## Acceptance Criteria

1. Given a learner's session ends, when the system generates the session summary, then session end is detected via three mechanisms: (1) client-side `beforeunload` event sends a session-end signal to the API, (2) server-side heartbeat timeout — if no auto-save or API call is received for 15 minutes, the session is considered ended, (3) explicit logout
2. Given a browser crash (no `beforeunload`), when the user next logs in, then the server-side heartbeat timeout is the fallback — summary is generated on next login if no summary exists for the last session
3. Given a migration is run, then a `session_summaries` table is created per ARCH-19/ARCH-20 with: summary ID (cuid2), user ID, session ID, milestone ID, summary text, and created timestamp
4. Given a session ends with activity, when the summary is generated, then it uses a structured template combining: current milestone name, criteria met/unmet with names, count of submissions in session, and a brief description of code activity (derived from snapshot count and line changes against first snapshot)
5. Given a session summary is generated, then it does NOT require an LLM call — it is deterministic and template-driven
6. Given a session summary is generated, then the template output reads as natural language (e.g., "Working on Milestone 3: B-Tree Implementation. 3 of 5 criteria met. Focused on node splitting logic.")
7. Given a session summary is generated, then it uses zero temporal framing — no dates, no "welcome back," no "last time you," no relative timestamps (UX-3)
8. Given a session summary is generated, then it uses engineering-appropriate language consistent with the workshop atmosphere (UX-5)
9. Given a session summary is generated, then it is pre-computed and stored, not generated on-the-fly at next login
10. Given a session summary already exists for a session, then generating again is a no-op (idempotent)
11. Given no meaningful activity occurred (e.g., opened and immediately closed — zero snapshots, zero submissions), then no summary is generated

## Tasks / Subtasks

- [x] Task 1: Create database migration for session_summaries table (AC: #3)
  - [x] 1.1 Create `apps/backend/migrations/007_add_session_summaries.ts`:
    ```typescript
    import type { Kysely } from 'kysely'

    export async function up(db: Kysely<unknown>): Promise<void> {
      await db.schema
        .createTable('session_summaries')
        .addColumn('id', 'text', (col) => col.primaryKey())
        .addColumn('user_id', 'text', (col) => col.notNull().references('users.id').onDelete('cascade'))
        .addColumn('session_id', 'text', (col) => col.notNull().references('sessions.id').onDelete('cascade'))
        .addColumn('milestone_id', 'text', (col) => col.notNull().references('milestones.id').onDelete('cascade'))
        .addColumn('summary_text', 'text', (col) => col.notNull())
        .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(db.fn('now')))
        .execute()

      // One summary per session — enforces idempotency at DB level
      await db.schema
        .createIndex('idx_session_summaries_session_id')
        .on('session_summaries')
        .columns(['session_id'])
        .unique()
        .execute()

      // Fast lookup: latest summary for a user+milestone
      await db.schema
        .createIndex('idx_session_summaries_user_milestone')
        .on('session_summaries')
        .columns(['user_id', 'milestone_id'])
        .execute()
    }

    export async function down(db: Kysely<unknown>): Promise<void> {
      await db.schema.dropTable('session_summaries').execute()
    }
    ```
  - [x] 1.2 Run migration and regenerate types:
    ```bash
    pnpm --filter backend db:migrate
    pnpm --filter shared db:types
    ```
  - [x] 1.3 Verify generated types in `packages/shared/src/types/db.ts` include `SessionSummaries` interface

- [x] Task 2: Create session summary generation function (AC: #4, #5, #6, #7, #8, #10, #11)
  - [x] 2.1 Create `apps/backend/src/plugins/progress/services/summary-generator.ts`:
    ```typescript
    import type { Kysely } from 'kysely'
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

      const [first, last] = await Promise.all([
        db
          .selectFrom('code_snapshots')
          .select(['code'])
          .where('session_id', '=', sessionId)
          .orderBy('created_at', 'asc')
          .limit(1)
          .executeTakeFirst(),
        db
          .selectFrom('code_snapshots')
          .select(['code'])
          .where('session_id', '=', sessionId)
          .orderBy('created_at', 'desc')
          .limit(1)
          .executeTakeFirst(),
      ])

      return {
        count,
        firstLines: first ? first.code.split('\n').length : null,
        lastLines: last ? last.code.split('\n').length : null,
      }
    }

    async function gatherSessionActivity(
      db: Kysely<DB>,
      sessionId: string,
    ): Promise<SessionActivityData | null> {
      // Load session with milestone info — include started_at and ended_at for query bounds
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
        (() => {
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
    ```
    **CRITICAL**: `generateSummaryText` is a pure function — deterministic, no LLM, no external calls. Testable in isolation.
  - [x] 2.2 Create `apps/backend/src/plugins/progress/services/summary-generator.test.ts`:
    - Test `generateSummaryText` with all criteria met → includes "All X criteria met"
    - Test `generateSummaryText` with partial criteria → includes "X of Y criteria met" + next unmet criterion name
    - Test `generateSummaryText` with no criteria results → includes "X criteria to tackle"
    - Test `generateSummaryText` with code growth → includes "Code grew by N lines"
    - Test `generateSummaryText` with code refinement (fewer lines) → includes "Code refined by N lines"
    - Test `generateSummaryText` with single snapshot (no diff) → no line change info
    - Test `generateSummaryText` with submissions → includes "N submissions made" (singular/plural)
    - Test `generateSummaryText` with zero activity → returns null (no summary)
    - Test `generateSummaryText` output contains zero temporal framing (no dates, no "ago", no "last", no "welcome")
    - Test `generateSessionSummary` idempotency — second call returns null
    - Test `generateSessionSummary` with nonexistent session → returns null
    - Test `generateSessionSummary` creates DB record with correct fields
    - Test `generateSessionSummary` skips when no meaningful activity
    - Test `gatherSessionActivity` returns correct snapshot count and line counts
    - Test `gatherSessionActivity` returns correct submission count within session timeframe only (not from subsequent sessions)
    - Test `gatherSessionActivity` with ended session bounds submissions correctly (submissions after ended_at excluded)
    - Test `getSnapshotStats` returns count=0 with null line counts when no snapshots
    - Pure function tests for `generateSummaryText`: use direct argument passing (no DB needed)
    - Integration tests for `generateSessionSummary` and `gatherSessionActivity`: real PostgreSQL, manual cleanup in `afterEach`
    - `vi.restoreAllMocks()` in `afterEach`

- [x] Task 3: Create session end endpoint (AC: #1)
  - [x] 3.1 Create `apps/backend/src/plugins/progress/routes/session-end.ts`:
    ```typescript
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
    ```
    **NOTE**: Summary generation is fire-and-forget in the session-end endpoint. The `beforeunload` handler needs a fast response. If summary generation fails, the stale session fallback (Task 4) will catch it.
  - [x] 3.2 Register in `apps/backend/src/plugins/progress/index.ts`:
    - Import `sessionEndRoutes`
    - Register: `await fastify.register(sessionEndRoutes, { db })`
  - [x] 3.3 Create `apps/backend/src/plugins/progress/routes/session-end.test.ts`:
    - Test successful session end deactivates session (is_active = false, ended_at set)
    - Test successful session end triggers summary generation (verify session_summaries record)
    - Test with session belonging to another user → returns `{ ended: false }`, session unchanged
    - Test with already-ended session (is_active = false) → returns `{ ended: false }`
    - Test with nonexistent sessionId → returns `{ ended: false }`
    - Test idempotent — calling end twice for same session returns `{ ended: false }` second time
    - Test 401 without auth
    - Test 400 with missing sessionId
    - Real PostgreSQL, `fastify.inject()`, mock Firebase auth
    - Cleanup: delete from `session_summaries`, `code_snapshots`, `submissions`, `sessions`, `milestones`, `tracks`, `users`
    - `vi.restoreAllMocks()` in `afterEach`

- [x] Task 4: Create stale session detection and summary backfill (AC: #1, #2, #9)
  - [x] 4.1 Create `apps/backend/src/plugins/progress/services/stale-session-handler.ts`:
    ```typescript
    import type { FastifyBaseLogger } from 'fastify'
    import type { Kysely } from 'kysely'
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

      // Find active sessions for this user
      const activeSessions = await db
        .selectFrom('sessions')
        .select(['id', 'started_at'])
        .where('user_id', '=', userId)
        .where('is_active', '=', true)
        .execute()

      for (const session of activeSessions) {
        // Check last activity: latest code_snapshot or the session start time
        const latestSnapshot = await db
          .selectFrom('code_snapshots')
          .select(['created_at'])
          .where('session_id', '=', session.id)
          .orderBy('created_at', 'desc')
          .limit(1)
          .executeTakeFirst()

        const lastActivity = latestSnapshot?.created_at ?? session.started_at
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
    ```
  - [x] 4.2 Create `apps/backend/src/plugins/progress/services/stale-session-handler.test.ts`:
    - Test `processStaleSessionsForUser` deactivates session with no activity for > 15 min
    - Test `processStaleSessionsForUser` leaves active session with recent activity untouched
    - Test `processStaleSessionsForUser` generates summary for stale session
    - Test `processStaleSessionsForUser` uses latest snapshot time as last activity (not session start)
    - Test `processStaleSessionsForUser` uses session start time when no snapshots exist
    - Test `processStaleSessionsForUser` sets ended_at to last activity time (not current time)
    - Test `processStaleSessionsForUser` handles multiple active sessions
    - Test `backfillLatestSessionSummary` generates summary for ended session without one
    - Test `backfillLatestSessionSummary` skips when summary already exists
    - Test `backfillLatestSessionSummary` skips when no ended sessions exist
    - Real PostgreSQL, manual cleanup in `afterEach`, `vi.restoreAllMocks()` in `afterEach`
    - Use `vi.useFakeTimers()` + `vi.setSystemTime()` to control `Date.now()` for stale threshold testing

- [x] Task 5: Wire stale session handling into overview and resume routes (AC: #2, #9)
  - [x] 5.1 Update `apps/backend/src/plugins/progress/routes/overview.ts`:
    - Import `processStaleSessionsForUser` and `backfillLatestSessionSummary`
    - Before building the overview response, call both:
      ```typescript
      // Process stale sessions (lazy heartbeat timeout)
      await processStaleSessionsForUser(db, uid, fastify.log)

      // ... existing milestone lookup logic ...

      // Backfill summary if missing (browser crash recovery)
      await backfillLatestSessionSummary(db, uid, activeMilestone.id)

      // Fetch latest session summary for this user+milestone
      const latestSummary = await db
        .selectFrom('session_summaries')
        .select(['summary_text'])
        .where('user_id', '=', uid)
        .where('milestone_id', '=', activeMilestone.id)
        .orderBy('created_at', 'desc')
        .limit(1)
        .executeTakeFirst()
      ```
    - Replace `sessionSummary: null` with `sessionSummary: latestSummary?.summary_text ?? null`
  - [x] 5.2 Update `apps/backend/src/plugins/progress/routes/overview.test.ts`:
    - Test: overview returns sessionSummary when summary exists for user's active milestone
    - Test: overview returns sessionSummary: null when no summary exists
    - Test: overview triggers stale session processing (stale session gets deactivated + summary generated)
    - Test: overview triggers backfill for ended session missing summary
    - Mock or use real stale session data with `vi.useFakeTimers()`

- [x] Task 6: Wire session end into frontend (AC: #1)
  - [x] 6.1 Create `apps/webapp/src/lib/end-session.ts`:
    ```typescript
    import { apiFetch } from './api-fetch'

    /**
     * Sends a session-end signal to the backend. Fire-and-forget.
     * Uses keepalive: true for beforeunload reliability.
     * Errors are swallowed — server heartbeat timeout is the fallback.
     */
    function endSession(sessionId: string | null): void {
      if (!sessionId) return

      void apiFetch('/api/progress/sessions/end', {
        method: 'POST',
        body: JSON.stringify({ sessionId }),
        keepalive: true,
      }).catch(() => {
        // Best-effort — server heartbeat timeout is the fallback
      })
    }

    export { endSession }
    ```
    **NOTE**: This is a plain utility function, not a hook. It's simpler and can be called from any context (Workspace unmount, beforeunload, logout) without React hook constraints.
  - [x] 6.2 Update `apps/webapp/src/routes/Workspace.tsx`:
    - Import `endSession` from `../lib/end-session`
    - Capture sessionId from the session mutation response:
      ```typescript
      const sessionIdRef = useRef<string | null>(null)

      // Update session creation to capture sessionId
      const sessionMutation = useSession(milestoneId ?? '')
      useEffect(() => {
        if (milestoneId) {
          sessionMutation.mutate(undefined, {
            onSuccess: (data) => {
              sessionIdRef.current = data.session.id
            },
          })
        }
      }, [milestoneId]) // eslint-disable-line react-hooks/exhaustive-deps
      ```
    - Update the existing `beforeunload` handler to also call `endSession`:
      ```typescript
      useEffect(() => {
        const handleBeforeUnload = () => {
          saveImmediately(currentCodeRef.current)
          endSession(sessionIdRef.current)
        }
        window.addEventListener('beforeunload', handleBeforeUnload)
        return () => window.removeEventListener('beforeunload', handleBeforeUnload)
      }, [saveImmediately])
      ```
    - **CRITICAL**: Add Workspace unmount cleanup to end session on SPA navigation:
      ```typescript
      // End session when Workspace unmounts (route change, sign-out, etc.)
      // beforeunload only fires on tab/browser close — NOT on SPA navigation.
      // This cleanup handles: navigating to overview, signing out, any route change.
      useEffect(() => {
        return () => {
          endSession(sessionIdRef.current)
        }
      }, [])
      ```
    - **IMPORTANT**: `saveImmediately` is called BEFORE `endSession` in beforeunload. Auto-save creates the final code snapshot, then session end triggers summary generation using that snapshot.
    - **Logout coverage**: Signing out (in `NotReady.tsx` or future logout buttons) navigates away from `/workspace/:milestoneId`, which unmounts Workspace, which triggers the cleanup effect → `endSession()`. No explicit logout wiring needed.
  - [x] 6.3 Create `apps/webapp/src/lib/end-session.test.ts`:
    - Test `endSession` calls correct endpoint with sessionId
    - Test `endSession` uses keepalive: true
    - Test `endSession` is no-op when sessionId is null
    - Test `endSession` catches errors silently (no unhandled rejections)
    - Mock `apiFetch`
  - [x] 6.4 Update `apps/webapp/src/routes/Workspace.test.tsx`:
    - Test `beforeunload` calls both `saveImmediately` and `endSession`
    - Test `endSession` receives the sessionId from session creation
    - Test component unmount calls `endSession` (route navigation coverage)
    - Mock `endSession` from `../lib/end-session`

- [x] Task 7: Add SessionSummary type to shared package (AC: #3)
  - [x] 7.1 Add to `packages/shared/src/types/api.ts`:
    ```typescript
    // No new type needed here — sessionSummary is already typed as `string | null`
    // in the OverviewData interface. The summary_text is plain text, not a structured object.
    ```
    - Verify `OverviewData.sessionSummary` is already typed as `string | null` — it is (line 95)
    - No type changes needed — the existing type already supports the populated value

## Dev Notes

### Existing Infrastructure (DO NOT recreate)

- **Progress plugin**: `apps/backend/src/plugins/progress/index.ts` — has `overviewRoutes`, `autoSaveRoutes`, `latestSnapshotRoutes`, `sessionRoutes`, `resumeRoutes`. Add `sessionEndRoutes` here.
- **Sessions table**: `apps/backend/migrations/006_add_sessions_and_code_snapshots.ts` — sessions and code_snapshots tables exist with indexes. Unique partial index `idx_sessions_user_milestone_active` prevents concurrent active sessions.
- **Session creation**: `POST /api/progress/sessions` in `sessions.ts`. Returns `{ session: { id, startedAt }, created }`. Deactivates previous sessions on milestone switch.
- **Auto-save**: `POST /api/progress/save` in `auto-save.ts`. Creates code_snapshot records. Find-or-create session logic.
- **Overview endpoint**: `GET /api/progress/overview` in `overview.ts`. Currently returns `sessionSummary: null` — this is the placeholder to populate.
- **Resume endpoint**: `GET /api/progress/resume/:milestoneId` in `resume.ts`. Returns latest snapshot + last submission criteria.
- **`beforeunload` handler**: Already in `Workspace.tsx` (lines 59-65). Calls `saveImmediately` for auto-save. Extend to also call `endSession`.
- **`useSession` hook**: `apps/webapp/src/hooks/use-session.ts`. Calls `POST /api/progress/sessions` on workspace mount. Fire-and-forget.
- **`OverviewData` type**: `packages/shared/src/types/api.ts` line 91-98. Already has `sessionSummary: string | null`.
- **`generateId()`**: `apps/backend/src/shared/id.ts`. Wraps cuid2.
- **`toCamelCase()`**: `@mycscompanion/shared`. NOT needed for this story — summary is a plain text string, not a DB row to convert.
- **`CriterionResult` type**: `packages/shared/src/types/curriculum.ts`. `{ name, order, status, expected, actual, errorHint? }`. Used by summary generator to extract criteria names and status.
- **Workspace UI store**: `useWorkspaceUIStore` in `apps/webapp/src/stores/workspace-ui-store.ts`. Has `tutorExpanded`, `tutorAvailable`, `activeTerminalTab`, `breakpointMode`. NOT modified in this story.
- **Editor store**: `useEditorStore` — `content`, `isDirty`. Not modified in this story.
- **Logout flow**: `signOut()` exported from `apps/webapp/src/lib/firebase.ts`. Currently called only in `apps/webapp/src/routes/NotReady.tsx`. Signing out navigates to `/sign-in` which unmounts Workspace → triggers cleanup effect → `endSession()`. No explicit logout wiring needed.

### Architecture Compliance

- **New `services/` directory**: This story introduces `plugins/progress/services/` for business logic that isn't tied to HTTP routes. `summary-generator.ts` and `stale-session-handler.ts` are pure functions/services, not Fastify route handlers. Convention: keep `routes/` for HTTP handlers, `services/` for business logic. No other plugin uses this pattern yet — it's introduced here because summary generation is the first non-trivial business logic in the progress plugin.
- **No new Zustand stores**: No new stores needed. `endSession` is a plain utility function — no Zustand store changes required.
- **No new packages**: All code in existing apps and packages.
- **Plugin isolation**: All new backend code in progress plugin. No cross-plugin imports.
- **Named exports only** — no default exports in any new file.
- **Route responses**: Direct object for success. `{ ended: true/false }` for session end.
- **cuid2 for IDs**: `session_summaries.id` uses `generateId()`.
- **`timestamptz` for timestamps**: `session_summaries.created_at` uses `timestamptz`.
- **No LLM for summaries**: `generateSummaryText` is a pure function — deterministic, template-driven. This is explicitly required by the epic acceptance criteria.
- **Zero temporal framing**: Summary text must NEVER contain dates, "ago", "last session", "welcome back", or any time reference. This is a hard UX rule.
- **Pre-computed, not on-the-fly**: Summaries are generated at session end and stored. The overview route reads from `session_summaries` table, not generating on-the-fly.
- **Idempotency at two levels**: (1) `generateSessionSummary` checks for existing summary before creating. (2) Unique index on `session_id` prevents DB-level duplicates.
- **Fire-and-forget summary in session-end endpoint**: The `beforeunload` fetch has `keepalive: true` but the browser may still kill it. Summary generation is async — if it fails, the stale session handler or backfill will catch it on next login.
- **Stale session handling as lazy check**: No BullMQ scheduled job needed. Stale session processing runs on overview/resume requests. This is simpler and avoids worker infrastructure for a low-frequency operation.
- **`beforeunload` race condition (acceptable)**: `saveImmediately` is called BEFORE `endSession` in the `beforeunload` handler. Both use `keepalive: true` and fire concurrently — the auto-save POST may not complete before the session-end POST arrives at the server. If `endSession` arrives first, the summary generator might miss the final snapshot. This is acceptable because: (1) the summary still captures all previous snapshots, (2) `backfillLatestSessionSummary` on next login regenerates the summary if the snapshot count changes, and (3) snapshots use `session_id` FK so they link to the session regardless of timing.
- **SPA navigation session end**: The Workspace unmount cleanup effect calls `endSession()` on any route change (including sign-out navigation). This is MORE reliable than `beforeunload` for SPA navigation since `beforeunload` only fires on tab/browser close. The unmount cleanup is the primary mechanism for in-app navigation; `beforeunload` is the secondary for tab close.

### UX Specification Compliance

**From UX Design Specification — Critical Rules:**

- "Pre-computed session summary surfaces where the user left off. The AI tutor receives this context automatically."
- "Session summary with pure context (no temporal framing), one button"
- "Zero temporal framing — No dates, no 'last session', no relative time in session context."
- "Sessions end quietly." — The session end signal is invisible. No toast, no confirmation.

**Summary template examples (zero temporal framing):**

- "Working on Milestone 3: B-Tree Implementation. 3 of 5 criteria met. Next: implement node splitting. 2 submissions made. Code grew by 15 lines."
- "Working on Milestone 1: Key-Value Store. All 5 criteria met."
- "Working on Milestone 2: Write-Ahead Logging. 0 of 4 criteria met. Next: implement log entry format. 1 submission made."

**Prohibited summary content:**
- "Welcome back" / "Last time" / "2 days ago" / "In your last session"
- Any dates or relative timestamps
- "You haven't been here in a while"
- Session duration or time spent

### Session End Detection Strategy

**Four-layer approach (in order of reliability):**

1. **Workspace unmount cleanup (React effect cleanup)**: Most reliable for SPA navigation. Fires on ANY route change — user navigates to overview, signs out, switches pages. Calls `endSession(sessionIdRef.current)` in the effect cleanup. This covers the "explicit logout" case automatically since signing out navigates away from workspace → unmount → cleanup.

2. **`beforeunload` (browser event)**: Fires on tab close, browser close, external navigation. Unreliable on mobile Safari, never fires on crash. Calls both `saveImmediately` (auto-save) and `endSession`. Both use `keepalive: true`.

3. **Server-side heartbeat timeout (15 min)**: Fallback for crashes and missed signals. The `processStaleSessionsForUser` function checks on next overview/resume request. If no auto-save for 15 minutes, session is considered ended. Sets `ended_at` to last activity time (last snapshot or session start).

4. **Summary backfill**: `backfillLatestSessionSummary` handles the case where a session was ended (by stale handler or manually) but summary generation failed or was missed. Called on overview to ensure summary exists before displaying.

**Logout coverage**: The codebase currently has sign-out only in `apps/webapp/src/routes/NotReady.tsx` (calls `signOut()` from `apps/webapp/src/lib/firebase.ts`, then navigates to `/sign-in`). If the user is on the workspace route, navigating away unmounts Workspace → triggers cleanup effect → `endSession()`. No explicit sign-out wiring is needed.

### Project Structure Notes

```
# Backend (new)
apps/backend/migrations/007_add_session_summaries.ts                    # DB migration
apps/backend/src/plugins/progress/services/summary-generator.ts         # Summary generation logic
apps/backend/src/plugins/progress/services/summary-generator.test.ts    # Summary generator tests
apps/backend/src/plugins/progress/services/stale-session-handler.ts     # Stale session detection
apps/backend/src/plugins/progress/services/stale-session-handler.test.ts # Stale handler tests
apps/backend/src/plugins/progress/routes/session-end.ts                 # POST /api/progress/sessions/end
apps/backend/src/plugins/progress/routes/session-end.test.ts            # Session end tests

# Backend (modified)
apps/backend/src/plugins/progress/index.ts                              # Register sessionEndRoutes

# Frontend (new)
apps/webapp/src/lib/end-session.ts                                      # Session end utility function
apps/webapp/src/lib/end-session.test.ts                                 # Session end utility tests

# Frontend (modified)
apps/webapp/src/routes/Workspace.tsx                                    # Wire session end to beforeunload + unmount cleanup
apps/webapp/src/routes/Workspace.test.tsx                               # Update tests for session end + unmount

# Backend (modified)
apps/backend/src/plugins/progress/routes/overview.ts                    # Populate sessionSummary
apps/backend/src/plugins/progress/routes/overview.test.ts               # Update overview tests

# Generated (after migration)
packages/shared/src/types/db.ts                                         # Updated by kysely-codegen
```

### Testing Requirements

- **Pure function tests** (`summary-generator.test.ts`): `generateSummaryText` is a pure function — test with direct argument passing, no DB needed. Cover all template branches: all criteria met, partial criteria, no criteria, code growth, code refinement, no diff, submissions singular/plural, zero activity.
- **Integration tests** (`summary-generator.test.ts`, `stale-session-handler.test.ts`): Real PostgreSQL for `generateSessionSummary`, `gatherSessionActivity`, `processStaleSessionsForUser`, `backfillLatestSessionSummary`. Manual cleanup in `afterEach`.
- **Route tests** (`session-end.test.ts`): Real PostgreSQL, `fastify.inject()`, mock Firebase auth via `createMockFirebaseAuth()`. Build app via `buildApp()` helper.
- **Frontend utility tests** (`end-session.test.ts`): Mock `apiFetch`. Verify `keepalive: true`, error swallowing, null sessionId guard.
- **Test syntax**: `describe()` + `it()`, never `test()`. `vi.restoreAllMocks()` in `afterEach`.
- **No snapshot tests** — explicit behavioral assertions only.
- **No `any`** — use proper types, `Partial<T>`, or mock factories.
- **Use `vi.useFakeTimers()` + `vi.setSystemTime()`** for stale session threshold testing.
- **Import from `@mycscompanion/config/test-utils/`** for shared test utilities.

### Anti-Patterns to Avoid

- Do NOT use an LLM for summary generation — summaries are deterministic and template-driven
- Do NOT include any temporal framing in summaries — no dates, no "ago", no "last session"
- Do NOT create a BullMQ job for stale session detection — lazy check on request is sufficient
- Do NOT add UI indicators for session end — it's invisible, like auto-save
- Do NOT create a new Zustand store — no store changes needed; `endSession` is a plain utility function
- Do NOT modify `useAutoSave`, `useSession`, `CodeEditor`, or `useWorkspaceUIStore` — they work as-is
- Do NOT use `.then()` chains — always `async/await` (project-context.md rule; caught in Story 5.1 code review)
- Do NOT use React hooks for simple fire-and-forget utilities — `endSession` is a plain function, not a hook
- Do NOT add `console.log` — backend uses pino via Fastify logger
- Do NOT use `@/` import aliases — relative paths within apps
- Do NOT use default exports — named exports only
- Do NOT use `as` casting — use proper types (exception: `criteria_results as unknown[] as readonly CriterionResult[]` for JSONB — existing pattern from overview.ts)
- Do NOT use `any` — use proper types, `Partial<T>`, or mock factories
- Do NOT generate summaries on-the-fly at login — pre-compute and store
- Do NOT block the session-end response waiting for summary generation — fire-and-forget
- Do NOT use `sendBeacon` — use `fetch` with `keepalive: true` (supports auth headers)
- Do NOT create a separate `/api/progress/summaries` endpoint — Story 5.4 will handle display via the existing overview route

### Previous Story (5.2) Learnings

- Resume endpoint uses `Promise.all` for parallel DB queries — follow same pattern in `gatherSessionActivity`
- `criteria_results` JSONB is already camelCase in DB — cast as `unknown[] as readonly CriterionResult[]` (pattern from `overview.ts` line 127)
- `toCamelCase()` is NOT needed for manually constructed response objects
- Route tests: `buildApp()` helper, `fastify.inject()` with auth headers, reverse-order cleanup
- Session transaction uses `FOR UPDATE` for race protection — session-end endpoint uses simpler `where is_active = true` guard since concurrent end calls are harmless
- `satisfies` pattern preferred over `toCamelCase` for response construction (Story 5.2 code review learning)

### Git Intelligence (Recent Commits)

Recent commits follow pattern: "Implement Story X.Y: Title with code review fixes"

Key patterns from Stories 5.1 and 5.2:
- New routes follow `{ db }` options pattern
- Route tests use `buildApp()` helper with mock auth + plugin registration
- `afterEach` cleanup in reverse dependency order
- `vi.useFakeTimers()` for time-dependent tests (instead of `setTimeout` delays)
- Fire-and-forget async operations use `void (async () => { ... })()` pattern (from submit.ts snapshot creation)
- Unique index violations caught with `try/catch` for idempotency (from sessions.ts)

### Dependencies on Previous Work

- Sessions + code_snapshots tables and infrastructure (Story 5.1) - done
- Session creation on workspace mount (Story 5.1) - done
- Auto-save with debounced saves (Story 5.1) - done
- `beforeunload` handler with `saveImmediately` (Story 5.1) - done
- Session resume with criteria restoration (Story 5.2) - done
- Overview endpoint with `sessionSummary: null` placeholder (Story 4.6) - done
- `OverviewData` type with `sessionSummary: string | null` (Story 4.6) - done
- Submission criteria_results JSONB column (Stories 3.3, 3.4, 4.3) - done
- Firebase Auth integration (Epic 2) - done
- `CriterionResult` type in shared package (Story 4.3) - done
- Milestones table with title field (Story 4.1) - done

### Forward References

- **Story 5.4**: Will populate the returning-user overview slot with the session summary text. The overview route's `sessionSummary` field (populated in Task 5) is consumed by the frontend's `MilestoneStartOverview.tsx`. Story 5.4 renders it — this story just makes it available.
- **Epic 6 (Story 6.1)**: The AI tutor system prompt will include the session summary for context. The summary is available via the `session_summaries` table — tutor plugin reads it directly. No API needed between plugins (both read from DB).

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story-5.3]
- [Source: _bmad-output/planning-artifacts/architecture.md#ARCH-19-Data-Architecture]
- [Source: _bmad-output/planning-artifacts/architecture.md#ARCH-20-Database-Naming]
- [Source: _bmad-output/planning-artifacts/architecture.md#SSE-Streaming-Heartbeat]
- [Source: _bmad-output/planning-artifacts/architecture.md#Content-Before-Tools]
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#Session-Summary-Temporal-Rule]
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#Return-After-Absence]
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#Zero-Temporal-Framing]
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#Effortless-Interactions]
- [Source: _bmad-output/planning-artifacts/prd.md#FR36-Session-Summary-Generation]
- [Source: _bmad-output/planning-artifacts/prd.md#FR37-Session-Summary-Display]
- [Source: _bmad-output/planning-artifacts/prd.md#FR38-AI-Tutor-Session-Context]
- [Source: _bmad-output/implementation-artifacts/5-1-auto-save-and-code-snapshot-persistence.md]
- [Source: _bmad-output/implementation-artifacts/5-2-session-resume-and-continue-building.md]
- [Source: _bmad-output/project-context.md]
- [Source: apps/backend/src/plugins/progress/index.ts]
- [Source: apps/backend/src/plugins/progress/routes/overview.ts]
- [Source: apps/backend/src/plugins/progress/routes/sessions.ts]
- [Source: apps/backend/src/plugins/progress/routes/auto-save.ts]
- [Source: apps/backend/src/plugins/progress/routes/resume.ts]
- [Source: apps/backend/migrations/006_add_sessions_and_code_snapshots.ts]
- [Source: apps/webapp/src/routes/Workspace.tsx]
- [Source: apps/webapp/src/hooks/use-session.ts]
- [Source: apps/webapp/src/hooks/use-auto-save.ts]
- [Source: apps/webapp/src/stores/workspace-ui-store.ts]
- [Source: apps/webapp/src/lib/firebase.ts]
- [Source: apps/webapp/src/routes/NotReady.tsx]
- [Source: apps/backend/src/plugins/execution/routes/submit.ts]
- [Source: packages/shared/src/types/api.ts]
- [Source: packages/shared/src/types/curriculum.ts]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6

### Debug Log References

- Stale session test initially failed due to unique partial index on (user_id, milestone_id) WHERE is_active = true — fixed by using different milestones for concurrent active sessions test

### Completion Notes List

- Task 1: Created migration 007_add_session_summaries.ts with session_summaries table, unique index on session_id (idempotency), composite index on (user_id, milestone_id). Migration ran successfully, kysely-codegen types regenerated.
- Task 2: Implemented summary-generator.ts with pure function generateSummaryText (deterministic, no LLM), gatherSessionActivity (parallel DB queries), getSnapshotStats, and generateSessionSummary (idempotent). 21 tests passing — pure function tests + integration tests with real PostgreSQL.
- Task 3: Created session-end.ts route (POST /sessions/end). Verifies ownership + active status, deactivates session, fires-and-forgets summary generation. Registered in progress plugin index.ts. 8 route tests passing.
- Task 4: Created stale-session-handler.ts with processStaleSessionsForUser (15-min heartbeat timeout, sets ended_at to last activity time) and backfillLatestSessionSummary (crash recovery). 9 tests passing with vi.useFakeTimers().
- Task 5: Wired stale session processing and summary backfill into overview route. Overview now returns populated sessionSummary from session_summaries table instead of null. Updated overview tests (10 tests passing).
- Task 6: Created end-session.ts utility (fire-and-forget with keepalive:true). Updated Workspace.tsx: captures sessionId from session mutation, calls endSession in beforeunload handler and unmount cleanup effect. 4 utility tests + 3 new Workspace tests passing.
- Task 7: Verified OverviewData.sessionSummary already typed as string | null — no changes needed.

### Change Log

- 2026-03-08: Implemented Story 5.3 — session summary generation with all 7 tasks complete
- 2026-03-08: Code review fixes — 6 issues fixed: (1) `.catch()` chain replaced with async/await IIFE in end-session.ts, (2) flaky setTimeout replaced with DB polling in session-end.test.ts, (3) getSnapshotStats now uses SQL line counting instead of loading full code content, (4) redundant vi.clearAllMocks replaced with targeted mockClear in end-session.test.ts, (5) N+1 query in processStaleSessionsForUser replaced with single JOIN query, (6) temporal framing test made robust by stripping milestone name before checking forbidden phrases

### File List

#### New Files
- apps/backend/migrations/007_add_session_summaries.ts
- apps/backend/src/plugins/progress/services/summary-generator.ts
- apps/backend/src/plugins/progress/services/summary-generator.test.ts
- apps/backend/src/plugins/progress/services/stale-session-handler.ts
- apps/backend/src/plugins/progress/services/stale-session-handler.test.ts
- apps/backend/src/plugins/progress/routes/session-end.ts
- apps/backend/src/plugins/progress/routes/session-end.test.ts
- apps/webapp/src/lib/end-session.ts
- apps/webapp/src/lib/end-session.test.ts

#### Modified Files
- apps/backend/src/plugins/progress/index.ts (registered sessionEndRoutes)
- apps/backend/src/plugins/progress/routes/overview.ts (added stale session processing, backfill, session summary fetch)
- apps/backend/src/plugins/progress/routes/overview.test.ts (updated tests for sessionSummary population)
- apps/webapp/src/routes/Workspace.tsx (added sessionIdRef, endSession in beforeunload + unmount cleanup)
- apps/webapp/src/routes/Workspace.test.tsx (added endSession mock + 3 new tests)

#### Generated Files
- packages/shared/src/types/db.ts (regenerated by kysely-codegen after migration)
