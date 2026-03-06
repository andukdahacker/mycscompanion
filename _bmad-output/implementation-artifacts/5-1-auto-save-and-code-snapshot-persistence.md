# Story 5.1: Auto-Save & Code Snapshot Persistence

Status: done

## Story

As a learner,
I want my code saved automatically without any action on my part,
so that I never lose work due to browser crashes, tab closes, or network issues.

## Acceptance Criteria

1. Given a learner is editing code in the workspace, when 30 seconds have elapsed since the last keystroke (debounced), then the current code state is persisted to the `code_snapshots` table silently (FR34). Note: epic allows 30-60s; 30s chosen for minimal data loss window. Configurable via `AUTO_SAVE_DEBOUNCE_MS` constant.
2. Auto-save also triggers on `beforeunload` as a best-effort last-chance persist (UX spec: "periodic auto-save is primary, exit save is secondary — never depend on beforeunload")
3. Auto-save survives browser crash, tab close, and network interruption — because the last successful save was at most 30 seconds ago (NFR-R5)
4. If a network save fails, the system retries with exponential backoff (max 3 retries)
5. A migration creates the `sessions` and `code_snapshots` tables per ARCH-19/ARCH-20. `kysely-codegen` is re-run to update TypeScript types
6. The `code_snapshots` table stores: snapshot ID (cuid2), user ID, milestone ID, session ID, code content (text), and timestamp
7. The `sessions` table stores: session ID (cuid2), user ID, milestone ID, started_at, ended_at (nullable), and is_active flag (derived from AC #5 — migration creates both tables)
8. Auto-save is completely invisible to the learner — no toasts, no spinners, no status indicators, no save button
9. On code submission, the submission flow also creates a code snapshot as a save point
10. A session is automatically created when a learner enters the workspace if no active session exists for that user+milestone (derived from session/snapshot relationship — snapshots require a session FK)

## Tasks / Subtasks

- [x] Task 1: Create database migration for sessions and code_snapshots tables (AC: #5, #6, #7)
  - [x] 1.1 Create `apps/backend/migrations/006_add_sessions_and_code_snapshots.ts`:
    ```typescript
    import type { Kysely } from 'kysely'

    export async function up(db: Kysely<unknown>): Promise<void> {
      // sessions table
      await db.schema
        .createTable('sessions')
        .addColumn('id', 'text', (col) => col.primaryKey())
        .addColumn('user_id', 'text', (col) => col.notNull().references('users.id').onDelete('cascade'))
        .addColumn('milestone_id', 'text', (col) => col.notNull().references('milestones.id').onDelete('cascade'))
        .addColumn('started_at', 'timestamptz', (col) => col.notNull().defaultTo(db.fn('now')))
        .addColumn('ended_at', 'timestamptz')
        .addColumn('is_active', 'boolean', (col) => col.notNull().defaultTo(true))
        .execute()

      await db.schema
        .createIndex('idx_sessions_user_id_milestone_id')
        .on('sessions')
        .columns(['user_id', 'milestone_id'])
        .execute()

      await db.schema
        .createIndex('idx_sessions_user_id_is_active')
        .on('sessions')
        .columns(['user_id', 'is_active'])
        .execute()

      // code_snapshots table (append-only)
      await db.schema
        .createTable('code_snapshots')
        .addColumn('id', 'text', (col) => col.primaryKey())
        .addColumn('user_id', 'text', (col) => col.notNull().references('users.id').onDelete('cascade'))
        .addColumn('milestone_id', 'text', (col) => col.notNull().references('milestones.id').onDelete('cascade'))
        .addColumn('session_id', 'text', (col) => col.notNull().references('sessions.id').onDelete('cascade'))
        .addColumn('code', 'text', (col) => col.notNull())
        .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(db.fn('now')))
        .execute()

      await db.schema
        .createIndex('idx_code_snapshots_user_id_milestone_id')
        .on('code_snapshots')
        .columns(['user_id', 'milestone_id'])
        .execute()

      // Compound index for "latest snapshot" query pattern
      await db.schema
        .createIndex('idx_code_snapshots_user_milestone_created')
        .on('code_snapshots')
        .columns(['user_id', 'milestone_id', 'created_at'])
        .execute()
    }

    export async function down(db: Kysely<unknown>): Promise<void> {
      await db.schema.dropTable('code_snapshots').execute()
      await db.schema.dropTable('sessions').execute()
    }
    ```
  - [x] 1.2 Run migration and regenerate types:
    ```bash
    pnpm --filter backend db:migrate
    pnpm --filter shared db:types
    ```
  - [x] 1.3 Verify generated types in `packages/shared/src/types/db.ts` include `Sessions` and `CodeSnapshots` interfaces

- [x]Task 2: Create auto-save API endpoint (AC: #1, #6, #8, #10)
  - [x]2.1 Create `apps/backend/src/plugins/progress/routes/auto-save.ts`:
    ```typescript
    import type { FastifyInstance } from 'fastify'
    import type { Kysely } from 'kysely'
    import type { DB } from '@mycscompanion/shared'
    import { generateId } from '../../../shared/id.js'

    interface AutoSaveBody {
      readonly milestoneId: string
      readonly code: string
    }

    interface AutoSaveRoutesOptions {
      readonly db: Kysely<DB>
    }

    async function autoSaveRoutes(
      fastify: FastifyInstance,
      opts: AutoSaveRoutesOptions
    ): Promise<void> {
      const { db } = opts

      // POST /api/progress/save
      fastify.post<{ Body: AutoSaveBody }>('/save', async (request) => {
        const { milestoneId, code } = request.body
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
            code,
          })
          .execute()

        return { snapshotId }
      })
    }

    // Note: Fastify's global error handler catches DB errors and returns 500.
    // Auto-save route does NOT need custom try/catch — the frontend hook
    // handles retries with exponential backoff on any non-2xx response.
    // Log errors via Fastify's built-in pino logger (automatic on 500).

    export { autoSaveRoutes }
    export type { AutoSaveBody }
    ```
  - [x]2.2 Add JSON Schema validation for the `/save` endpoint body:
    ```typescript
    const autoSaveBodySchema = {
      type: 'object',
      required: ['milestoneId', 'code'],
      properties: {
        milestoneId: { type: 'string', minLength: 1 },
        code: { type: 'string' },
      },
      additionalProperties: false,
    } as const
    ```
  - [x]2.3 Register auto-save route in `apps/backend/src/plugins/progress/index.ts`:
    - Import `autoSaveRoutes`
    - Register: `await fastify.register(autoSaveRoutes, { db })`
    - The route will be available at `POST /api/progress/save` (prefix from app.ts)
  - [x]2.4 Create `apps/backend/src/plugins/progress/routes/auto-save.test.ts`:
    - Test successful auto-save creates code_snapshot record
    - Test auto-save creates new session if none exists
    - Test auto-save reuses existing active session
    - Test auto-save with empty code string (valid — user may clear editor)
    - Test 401 without valid auth token
    - Test 400 with missing milestoneId
    - Test 400 with missing code field
    - Test multiple auto-saves append (not overwrite) — verify count increases
    - Test auto-save returns 500 when DB is unreachable (Fastify global error handler)
    - Use `fastify.inject()`, real PostgreSQL, `createMockFirebaseAuth(TEST_UID)`
    - Cleanup in `afterEach`: delete from `code_snapshots`, `sessions`, `milestones`, `tracks`, `users` in reverse dependency order
    - `vi.restoreAllMocks()` in `afterEach`

- [x]Task 3: Create latest-snapshot retrieval endpoint (AC: #1)
  - [x]3.1 Create `apps/backend/src/plugins/progress/routes/latest-snapshot.ts`:
    ```typescript
    // GET /api/progress/snapshots/:milestoneId/latest
    // Returns the most recent code snapshot for a user+milestone
    // Used by workspace to load saved code on resume (Story 5.2 will consume this)

    async function latestSnapshotRoutes(
      fastify: FastifyInstance,
      opts: { readonly db: Kysely<DB> }
    ): Promise<void> {
      fastify.get<{ Params: { milestoneId: string } }>(
        '/snapshots/:milestoneId/latest',
        async (request) => {
          const { milestoneId } = request.params
          const userId = request.uid

          const snapshot = await db
            .selectFrom('code_snapshots')
            .select(['id', 'code', 'created_at'])
            .where('user_id', '=', userId)
            .where('milestone_id', '=', milestoneId)
            .orderBy('created_at', 'desc')
            .limit(1)
            .executeTakeFirst()

          if (!snapshot) {
            return { snapshot: null }
          }

          return { snapshot: toCamelCase(snapshot) }
        }
      )
    }
    ```
  - [x]3.2 Register in progress plugin index.ts
  - [x]3.3 Create `apps/backend/src/plugins/progress/routes/latest-snapshot.test.ts`:
    - Test returns latest snapshot when multiple exist
    - Test returns null when no snapshots exist
    - Test returns snapshot for correct user (not other users' snapshots)
    - Test returns snapshot for correct milestone
    - Test 401 without auth
    - Real PostgreSQL, `fastify.inject()`, mock Firebase auth

- [x]Task 4: Create frontend auto-save hook (AC: #1, #4, #8)
  - [x]4.1 Create `apps/webapp/src/hooks/use-auto-save.ts`:
    ```typescript
    import { useCallback, useEffect, useRef } from 'react'
    import { useMutation } from '@tanstack/react-query'
    import { apiFetch } from '../lib/api-fetch'

    interface UseAutoSaveOptions {
      readonly milestoneId: string
      readonly enabled: boolean
    }

    const AUTO_SAVE_DEBOUNCE_MS = 30_000 // 30 seconds
    const MAX_RETRIES = 3
    const RETRY_BASE_DELAY_MS = 1_000

    function useAutoSave({ milestoneId, enabled }: UseAutoSaveOptions) {
      const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
      const lastSavedCodeRef = useRef<string | null>(null)
      const retryCountRef = useRef(0)

      const mutation = useMutation({
        mutationFn: (code: string) =>
          apiFetch<{ snapshotId: string }>('/api/progress/save', {
            method: 'POST',
            body: JSON.stringify({ milestoneId, code }),
            keepalive: true, // Allows request to complete after page unload (beforeunload)
          }),
        onSuccess: (_data, code) => {
          lastSavedCodeRef.current = code
          retryCountRef.current = 0
        },
        onError: (_error, code) => {
          // Retry with exponential backoff
          if (retryCountRef.current < MAX_RETRIES) {
            retryCountRef.current += 1
            const delay = RETRY_BASE_DELAY_MS * Math.pow(2, retryCountRef.current - 1)
            setTimeout(() => {
              mutation.mutate(code)
            }, delay)
          }
        },
      })

      const scheduleAutoSave = useCallback(
        (code: string) => {
          if (!enabled) return

          // Clear any pending save
          if (timerRef.current) {
            clearTimeout(timerRef.current)
          }

          timerRef.current = setTimeout(() => {
            // Only save if code actually changed
            if (code !== lastSavedCodeRef.current) {
              retryCountRef.current = 0
              mutation.mutate(code)
            }
          }, AUTO_SAVE_DEBOUNCE_MS)
        },
        [enabled, milestoneId]
      )

      const saveImmediately = useCallback(
        (code: string) => {
          if (!enabled) return
          if (timerRef.current) {
            clearTimeout(timerRef.current)
          }
          if (code !== lastSavedCodeRef.current) {
            retryCountRef.current = 0
            mutation.mutate(code)
          }
        },
        [enabled, milestoneId]
      )

      // Cleanup timer on unmount
      useEffect(() => {
        return () => {
          if (timerRef.current) {
            clearTimeout(timerRef.current)
          }
        }
      }, [])

      return { scheduleAutoSave, saveImmediately }
    }

    export { useAutoSave, AUTO_SAVE_DEBOUNCE_MS }
    ```
    - **IMPORTANT**: No UI state for save status — auto-save is completely invisible per UX spec
    - No toasts, no spinners, no save indicators
    - `scheduleAutoSave` is called on every editor content change (debounced)
    - `saveImmediately` is called on `beforeunload` and on code submission
  - [x]4.2 Create `apps/webapp/src/hooks/use-auto-save.test.ts`:
    - Test scheduleAutoSave debounces saves to 30 seconds
    - Test rapid content changes only trigger one save after debounce
    - Test saveImmediately saves without waiting for debounce
    - Test does not save when code hasn't changed from last save
    - Test retry on failure with exponential backoff
    - Test stops retrying after MAX_RETRIES
    - Test cleanup clears timer on unmount
    - Test does nothing when enabled=false
    - Use `vi.useFakeTimers()` + `vi.advanceTimersByTime()` for debounce testing
    - Use `createTestQueryClient()` from `@mycscompanion/config/test-utils/`
    - Mock `apiFetch`

- [x]Task 5: Wire auto-save into workspace (AC: #1, #8, #9, #10)
  - [x]5.1 Update `apps/webapp/src/routes/Workspace.tsx`:
    - Import `useAutoSave` hook
    - Initialize: `const { scheduleAutoSave, saveImmediately } = useAutoSave({ milestoneId, enabled: true })`
    - **CRITICAL**: Workspace has NO content change handler prop. Editor changes go through Zustand store. Wire auto-save via store subscription (same pattern as existing stuck detection timer reset):
      ```typescript
      useEffect(() => {
        const unsubscribe = useEditorStore.subscribe(
          (state, prevState) => {
            if (state.content !== prevState.content) {
              scheduleAutoSave(state.content)
            }
          }
        )
        return unsubscribe
      }, [scheduleAutoSave])
      ```
    - **Do NOT add any visual indicators** — auto-save is invisible
  - [x]5.2 Add `beforeunload` handler in Workspace.tsx:
    - Per UX spec: "periodic auto-save is primary, exit save is secondary — never depend on beforeunload"
    - Use `saveImmediately()` which calls `fetch` with `keepalive: true` (see Task 4 mutation). If it fails, the last 30-second auto-save is at most 30 seconds stale.
    - Use a ref for current code to avoid stale closure:
    ```typescript
    const currentCodeRef = useRef(useEditorStore.getState().content)
    // Keep ref in sync via store subscription (can share the subscription from 5.1)
    // Inside the existing subscription: currentCodeRef.current = state.content

    useEffect(() => {
      const handleBeforeUnload = () => {
        saveImmediately(currentCodeRef.current)
      }
      window.addEventListener('beforeunload', handleBeforeUnload)
      return () => window.removeEventListener('beforeunload', handleBeforeUnload)
    }, [saveImmediately])
    ```
  - [x]5.3 Add snapshot creation to backend submission route:
    - Update `apps/backend/src/plugins/execution/routes/submit.ts` — AFTER creating the submission record, also create a code snapshot (server-side is more reliable than client-side, no race conditions):
      ```typescript
      // Import generateId from '../../shared/id.js' (already imported in submit.ts)
      // After creating submission record:
      const session = await db
        .selectFrom('sessions')
        .select(['id'])
        .where('user_id', '=', request.uid)
        .where('milestone_id', '=', milestoneId)
        .where('is_active', '=', true)
        .executeTakeFirst()

      if (session) {
        await db
          .insertInto('code_snapshots')
          .values({
            id: generateId(),
            user_id: request.uid,
            milestone_id: milestoneId,
            session_id: session.id,
            code,
          })
          .execute()
      }
      ```
    - If no active session exists at submission time, skip snapshot (auto-save will have created recent ones)
    - Add test in `submit.test.ts`: verify snapshot created when active session exists
  - [x]5.4 Update `apps/webapp/src/routes/Workspace.test.tsx`:
    - Test that content changes call scheduleAutoSave
    - Test beforeunload handler is registered
    - Test beforeunload handler calls saveImmediately
    - Test cleanup removes beforeunload listener
    - Mock `useAutoSave` hook to verify integration

- [x]Task 6: Create session management endpoint (AC: #7, #10)
  - [x]6.1 Create `apps/backend/src/plugins/progress/routes/sessions.ts`:
    ```typescript
    // POST /api/progress/sessions — creates or retrieves active session
    // Called when workspace loads to ensure a session exists

    interface CreateSessionBody {
      readonly milestoneId: string
    }

    async function sessionRoutes(
      fastify: FastifyInstance,
      opts: { readonly db: Kysely<DB> }
    ): Promise<void> {
      const { db } = opts

      fastify.post<{ Body: CreateSessionBody }>('/sessions', async (request) => {
        const { milestoneId } = request.body
        const userId = request.uid

        // Check for existing active session
        const existing = await db
          .selectFrom('sessions')
          .select(['id', 'started_at'])
          .where('user_id', '=', userId)
          .where('milestone_id', '=', milestoneId)
          .where('is_active', '=', true)
          .executeTakeFirst()

        if (existing) {
          return { session: toCamelCase(existing), created: false }
        }

        // Deactivate any other active sessions for this user
        // (user can only have one active session at a time)
        await db
          .updateTable('sessions')
          .set({ is_active: false, ended_at: new Date() })
          .where('user_id', '=', userId)
          .where('is_active', '=', true)
          .execute()

        // Use transaction to prevent race condition with concurrent workspace loads
        const newSession = await db.transaction().execute(async (trx) => {
          // Re-check inside transaction (another request may have created one)
          const raceCheck = await trx
            .selectFrom('sessions')
            .select(['id', 'started_at'])
            .where('user_id', '=', userId)
            .where('milestone_id', '=', milestoneId)
            .where('is_active', '=', true)
            .executeTakeFirst()

          if (raceCheck) return { session: raceCheck, created: false }

          // Deactivate other active sessions
          await trx
            .updateTable('sessions')
            .set({ is_active: false, ended_at: new Date() })
            .where('user_id', '=', userId)
            .where('is_active', '=', true)
            .execute()

          const sessionId = generateId()
          const now = new Date()
          await trx
            .insertInto('sessions')
            .values({
              id: sessionId,
              user_id: userId,
              milestone_id: milestoneId,
              is_active: true,
              started_at: now,
            })
            .execute()

          return { session: { id: sessionId, started_at: now }, created: true }
        })

        if (!newSession.created) {
          return { session: toCamelCase(newSession.session), created: false }
        }
        return { session: { id: newSession.session.id, startedAt: (newSession.session as { started_at: Date }).started_at.toISOString() }, created: true }
      })
    }
    ```
  - [x]6.2 Register in progress plugin index.ts
  - [x]6.3 Add JSON Schema validation for session creation body
  - [x]6.4 Create `apps/backend/src/plugins/progress/routes/sessions.test.ts`:
    - Test creates new session when none exists
    - Test returns existing active session (idempotent)
    - Test deactivates other active sessions when creating new one for different milestone
    - Test concurrent session creation returns same session (race condition safety via transaction)
    - Test 401 without auth
    - Test 400 with missing milestoneId
    - Real PostgreSQL, `fastify.inject()`, mock Firebase auth

- [x]Task 7: Wire session creation into workspace loading (AC: #10)
  - [x]7.1 Create `apps/webapp/src/hooks/use-session.ts`:
    ```typescript
    import { useMutation } from '@tanstack/react-query'
    import { apiFetch } from '../lib/api-fetch'

    function useSession(milestoneId: string) {
      return useMutation({
        mutationFn: () =>
          apiFetch<{ session: { id: string; startedAt: string }; created: boolean }>(
            '/api/progress/sessions',
            {
              method: 'POST',
              body: JSON.stringify({ milestoneId }),
            }
          ),
      })
    }

    export { useSession }
    ```
  - [x]7.2 Call `useSession` in Workspace.tsx on mount:
    ```typescript
    const sessionMutation = useSession(milestoneId)

    useEffect(() => {
      sessionMutation.mutate()
    }, [milestoneId])
    ```
    - Session creation is fire-and-forget — don't block workspace rendering
    - If it fails, auto-save will create a session lazily (Task 2 auto-save endpoint has find-or-create logic)
  - [x]7.3 Create `apps/webapp/src/hooks/use-session.test.ts`:
    - Test mutation calls correct endpoint
    - Test with successful response
    - Mock `apiFetch`
    - Use `createTestQueryClient()`

## Dev Notes

### Existing Infrastructure (DO NOT recreate)

- **Progress plugin**: `apps/backend/src/plugins/progress/index.ts` already exists with `GET /api/progress/overview` route. Has `ProgressPluginOptions` with `contentLoader` and optional `db`. Add new routes to this plugin.
- **Editor store**: `apps/webapp/src/stores/editor-store.ts` has `content`, `isDirty`, `cursorPosition`, `setContent`, `setCursorPosition`, `markClean`. The `isDirty` flag is useful for detecting changes but auto-save should NOT reset it (isDirty tracks unsaved-to-server state for submission, not for auto-save).
- **Workspace route**: `apps/webapp/src/routes/Workspace.tsx` monitors editor changes via `useEditorStore.subscribe()` (Zustand store subscription pattern). Wire auto-save into the same subscription pattern — there is NO content change handler prop.
- **Submit route**: `apps/backend/src/plugins/execution/routes/submit.ts` creates submissions with code. Add snapshot creation here.
- **Queue infrastructure**: `apps/backend/src/shared/queue.ts` has `createBullMQConnection()` and `createExecutionQueue()`. BullMQ is NOT needed for Story 5.1 — direct DB insert for auto-save is sufficient (simple INSERT, no heavy processing).
- **`apiFetch`**: Located at `apps/webapp/src/lib/api-fetch.ts` — handles Firebase auth token attachment.
- **`toCamelCase()`**: In `@mycscompanion/shared` — use for all DB->API response conversion.
- **`generateId()`**: Wrapper around `createId()` in `apps/backend/src/shared/id.ts`. All backend code MUST use `generateId()` from `../../shared/id.js`, NOT `createId` from `@paralleldrive/cuid2` directly. This is the established pattern in `submit.ts` and all other backend code.
- **Migrations**: Latest is `005_add_user_milestones.ts`. Next is `006`.
- **App.ts**: Progress plugin registered at line 92 with `{ prefix: '/api/progress', contentLoader }`. The `ProgressPluginOptions` already includes optional `db` field — defaults to production DB if not passed. No changes needed to app.ts for DB access.

### Architecture Compliance

- **No new Zustand stores**: Auto-save state managed via refs in the hook (no global state needed). Editor store already exists — do NOT add auto-save fields to it.
- **No new packages**: All code in existing apps and packages.
- **Plugin isolation**: All new routes go in the progress plugin. Submit route modification stays in execution plugin. No cross-plugin imports.
- **`code_snapshots` is append-only**: Never UPDATE or DELETE snapshots. Latest retrieved by `ORDER BY created_at DESC LIMIT 1`.
- **Session management**: One active session per user at a time. When switching milestones, deactivate old session.
- **Named exports only** — no default exports in any new file.
- **Import shadcn components individually** from `@mycscompanion/ui` (no barrel import). Though this story has NO UI components.
- **Route responses**: Direct object for success (no `{ data: result }` wrapper).
- **cuid2 for all IDs**: Sessions, code_snapshots use `generateId()` from `apps/backend/src/shared/id.ts` (wraps cuid2).
- **`timestamptz` for all timestamps**: Both `sessions` and `code_snapshots` tables use `timestamptz`.
- **Redis session cache deferred**: Architecture specifies "Session cache: Active workspace state (current milestone, code snapshot) — 30 min after last activity." Story 5.1 implements DB persistence only. Redis caching layer can be added in Story 5.2 when the combined workspace endpoint (`GET /api/workspace/:milestoneId`) is created — that endpoint will benefit from cache reads. Auto-save writes go to DB (source of truth); caching optimizes reads.
- **BullMQ `progress:auto-save` intentionally bypassed**: Architecture lists `auto-save-processor.ts` and `progress:auto-save` BullMQ job. For Story 5.1, direct DB INSERT is sufficient — auto-save is a simple single-row append with no heavy processing, no external API calls, and no fan-out. BullMQ adds latency and complexity for no benefit here. If future requirements need post-save processing (e.g., diff computation, session summary triggers), a BullMQ job can be introduced then.
- **FR coverage note**: This story covers FR34 (auto-save) and NFR-R5 (data durability). FR33 (code state restoration) and FR35 (continue building) are Story 5.2 responsibilities — this story provides the persistence infrastructure they depend on.
- **Story 5.3 forward reference**: The `session_summaries` table (ARCH-19) is NOT created in this migration. Story 5.3 will add it in migration 007. This story creates only `sessions` and `code_snapshots`.

### UX Specification Compliance

**From UX Design Specification — Critical Rules:**

- "Sessions end quietly. The primary persistence mechanism is periodic auto-save (every 30-60 seconds), with best-effort exit save on tab close as a secondary layer."
- "The `beforeunload` event is unreliable across browsers (Safari mobile fires it inconsistently, Chrome doesn't guarantee async request completion), so the product never depends on it."
- "Users never think about saving — their work is always safe because it was saved 30 seconds ago, not because the tab-close event fired."
- "Saving progress — Entirely invisible. No save button. No 'saving...' indicator."
- "Quiet competence — The product does its job without announcing it. Auto-saves every 30 seconds without asking."

**Absolute prohibition**: NO toasts, NO spinners, NO "Saving..." text, NO save button, NO status bar indicator. The user must never know auto-save exists.

### Code Storage Strategy

Per UX specification: "Full file contents stored as plain text per user per milestone. Overwritten on each auto-save. No diffs against starter template. Simple text column in PostgreSQL."

**Note**: The UX spec says "overwritten" but the architecture spec says "append-only" for `code_snapshots`. Follow the architecture: append-only in the DB (enables history/debugging), but only the latest snapshot is ever retrieved. The table grows but individual rows are small (Go source code). A future cleanup job can prune old snapshots if needed.

### Rate Limiting Consideration

The auto-save endpoint will be called frequently (every 30 seconds per active user). The existing rate limiter must NOT block auto-save requests. Options:
- The debounce interval (30 seconds) naturally limits request rate to ~2/min per user — well within typical rate limits
- If the rate limiter is per-endpoint-configurable, set a generous limit for `/api/progress/save`
- If it's global per-user, verify that 2 saves/min + normal workspace API calls don't exceed the limit

### beforeunload Strategy

Per the UX spec, `beforeunload` is UNRELIABLE. Strategy:
1. **Primary**: 30-second debounced auto-save — work is never more than 30 seconds stale
2. **Secondary**: `beforeunload` handler calls `saveImmediately()` using `fetch` with `keepalive: true`
3. **Never depend on beforeunload** — if it fails, the user lost at most 30 seconds of typing

The `keepalive: true` option on fetch tells the browser to complete the request even after the page is unloaded. This is more reliable than `sendBeacon` because it can include auth headers. Maximum payload is 64KB (plenty for Go source code).

### Submit Route Snapshot Creation

When code is submitted via `POST /api/execution/submit`, the backend should also create a code snapshot. This ensures:
- Every submission has a corresponding snapshot as a save point
- If auto-save hasn't triggered yet (e.g., user types and immediately submits), the code is still persisted
- Server-side snapshot creation is more reliable than client-side (no race conditions)

Add this to `submit.ts` AFTER the submission record is created, within the same request handler. If session doesn't exist yet, create one (same find-or-create pattern as auto-save endpoint).

### Project Structure Notes

```
# Backend (new)
apps/backend/migrations/006_add_sessions_and_code_snapshots.ts     # DB migration
apps/backend/src/plugins/progress/routes/auto-save.ts               # POST /api/progress/save
apps/backend/src/plugins/progress/routes/auto-save.test.ts          # Auto-save tests
apps/backend/src/plugins/progress/routes/latest-snapshot.ts         # GET /api/progress/snapshots/:milestoneId/latest
apps/backend/src/plugins/progress/routes/latest-snapshot.test.ts    # Latest snapshot tests
apps/backend/src/plugins/progress/routes/sessions.ts                # POST /api/progress/sessions
apps/backend/src/plugins/progress/routes/sessions.test.ts           # Session tests

# Backend (modified)
apps/backend/src/plugins/progress/index.ts                          # Register new routes
apps/backend/src/plugins/execution/routes/submit.ts                 # Add snapshot on submit
apps/backend/src/plugins/execution/routes/submit.test.ts            # Add snapshot assertion

# Frontend (new)
apps/webapp/src/hooks/use-auto-save.ts                              # Auto-save hook
apps/webapp/src/hooks/use-auto-save.test.ts                         # Auto-save tests
apps/webapp/src/hooks/use-session.ts                                # Session management hook
apps/webapp/src/hooks/use-session.test.ts                           # Session tests

# Frontend (modified)
apps/webapp/src/routes/Workspace.tsx                                # Wire auto-save + beforeunload + session
apps/webapp/src/routes/Workspace.test.tsx                           # Add auto-save integration tests

# Generated (after migration)
packages/shared/src/types/db.ts                                     # Updated by kysely-codegen
```

### Testing Requirements

- **Backend route tests** (`auto-save.test.ts`, `latest-snapshot.test.ts`, `sessions.test.ts`): Real PostgreSQL, manual row cleanup in `afterEach` (follow completion plugin test pattern), `fastify.inject()`, mock Firebase auth via `createMockFirebaseAuth()`. Build app via `buildApp()` helper.
- **Frontend hook tests** (`use-auto-save.test.ts`): Mock `apiFetch`, use `vi.useFakeTimers()` for debounce testing, `vi.advanceTimersByTime()` to trigger saves. Use `createTestQueryClient()` + `TestProviders`.
- **Integration tests** (`Workspace.test.tsx`): Verify auto-save hook is called on content changes, beforeunload listener registered, session created on mount. Mock `useAutoSave` and `useSession` hooks.
- **Test syntax**: `describe()` + `it()`, never `test()`. `vi.restoreAllMocks()` in `afterEach`.
- **No snapshot tests** — explicit behavioral assertions only.
- **No `any`** — use proper types throughout.
- **Import from `@mycscompanion/config/test-utils/`** for shared test utilities.

### Anti-Patterns to Avoid

- Do NOT add any UI for auto-save (no toasts, spinners, save buttons, status text)
- Do NOT use `localStorage` or `IndexedDB` as primary storage — PostgreSQL via API is the source of truth
- Do NOT create a new Zustand store for auto-save state — use refs in the hook
- Do NOT use BullMQ for auto-save — direct DB insert is sufficient (see Architecture Compliance note for rationale)
- Do NOT depend on `beforeunload` — it's unreliable, the 30-second auto-save is the primary mechanism
- Do NOT UPDATE or DELETE code_snapshots — table is append-only
- Do NOT show save state in the editor store's `isDirty` flag — `isDirty` is for submission tracking
- Do NOT add `console.log` — backend uses pino via Fastify logger
- Do NOT use `@/` import aliases — relative paths within apps
- Do NOT use default exports — named exports only
- Do NOT use `as` casting — use proper types
- Do NOT use `any` — use proper types, `Partial<T>`, or mock factories
- Do NOT use offset pagination — cursor-based only (though these endpoints don't paginate)
- Do NOT use `sendBeacon` for authenticated requests — use `fetch` with `keepalive: true`

### Previous Story (4.6) Learnings

- Progress plugin now has `ProgressPluginOptions` with `contentLoader` and `db` — extend with new route registrations
- `app.ts` passes `contentLoader` to progress plugin — new routes that need DB access should use the `db` from options (or default)
- Overview route builds response objects directly (no `toCamelCase` needed when constructing objects manually with camelCase keys) — same applies to auto-save response
- `toCamelCase()` IS needed when returning raw DB query results (e.g., `latest-snapshot` endpoint returning `created_at` field)
- Full-screen centered layout pattern NOT relevant here — this story has NO UI components
- Test patterns: `buildApp()` helper, `fastify.inject()` with auth headers, reverse-order cleanup
- Code review caught division-by-zero in overview — be careful with edge cases (empty code, first-ever session, etc.)

### Git Intelligence (Recent Commits)

Recent commits follow pattern: "Implement Story X.Y: Title with code review fixes"

Key patterns established in Epic 4:
- New routes follow `{ db, contentLoader }` options pattern
- Route tests use `buildApp()` helper with mock auth + plugin registration
- Shared types added to `packages/shared/src/types/api.ts`
- `afterEach` cleanup in reverse dependency order
- Direct object construction for API responses (skip toCamelCase when building manually)

### Dependencies on Previous Work

- User authentication and Firebase Auth (Epic 2) - done
- Milestones table and content model (Story 4.1) - done
- Submissions table and submit route (Stories 3.3, 3.4) - done
- Progress plugin stub with overview route (Stories 1.4, 4.6) - done
- Editor store with content tracking (Story 3.6) - done
- Workspace route component (Story 3.5) - done
- `generateId()` wrapper over cuid2 in `apps/backend/src/shared/id.ts` (Story 1.1) - done

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story-5.1]
- [Source: _bmad-output/planning-artifacts/architecture.md#ARCH-19-Data-Architecture]
- [Source: _bmad-output/planning-artifacts/architecture.md#Caching-Strategy-Redis]
- [Source: _bmad-output/planning-artifacts/architecture.md#Progress-Plugin-Routes]
- [Source: _bmad-output/planning-artifacts/architecture.md#Worker-Structure]
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#Session-Summary-Temporal-Rule]
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#Workshop-Atmosphere]
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#Invisible-Persistence]
- [Source: _bmad-output/planning-artifacts/prd.md#FR33-Code-State-Restoration]
- [Source: _bmad-output/planning-artifacts/prd.md#FR34-Auto-Save]
- [Source: _bmad-output/planning-artifacts/prd.md#NFR-R5-Data-Durability]
- [Source: _bmad-output/implementation-artifacts/4-6-contextual-overview.md]
- [Source: _bmad-output/project-context.md]
- [Source: apps/backend/src/plugins/progress/index.ts]
- [Source: apps/backend/src/plugins/progress/routes/overview.ts]
- [Source: apps/backend/src/plugins/execution/routes/submit.ts]
- [Source: apps/backend/src/shared/id.ts]
- [Source: apps/webapp/src/stores/editor-store.ts]
- [Source: apps/webapp/src/hooks/use-workspace-data.ts]
- [Source: apps/webapp/src/routes/Workspace.tsx]
- [Source: apps/backend/src/shared/queue.ts]
- [Source: apps/backend/migrations/005_add_user_milestones.ts]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6

### Debug Log References

None

### Completion Notes List

- Task 1: Created migration 006_add_sessions_and_code_snapshots.ts with sessions and code_snapshots tables, indexes for user+milestone lookups and latest-snapshot query pattern. Ran migration and regenerated kysely-codegen types.
- Task 2: Created auto-save endpoint POST /api/progress/save with find-or-create session logic, append-only code snapshot insertion, JSON Schema validation. 9 tests covering success, session creation/reuse, empty code, auth, validation, append-only behavior, and error handling.
- Task 3: Created latest-snapshot endpoint GET /api/progress/snapshots/:milestoneId/latest with toCamelCase response conversion. 5 tests covering latest retrieval, null response, user isolation, milestone isolation, and auth.
- Task 4: Created useAutoSave hook with 30s debounced saves, immediate save for beforeunload, exponential backoff retry (max 3), keepalive fetch for page unload reliability. 8 tests with fake timers covering debounce, rapid changes, immediate save, deduplication, retry, max retries, cleanup, and disabled state.
- Task 5: Wired auto-save into Workspace.tsx via Zustand store subscription (combined with existing stuck detection subscription), added beforeunload handler with ref for current code, added snapshot creation in submit.ts (fire-and-forget). 3 workspace integration tests + 1 submit snapshot test.
- Task 6: Created session management endpoint POST /api/progress/sessions with transaction-based race protection, session deactivation on milestone switch. 6 tests covering creation, idempotency, deactivation, concurrent safety, auth, and validation.
- Task 7: Created useSession hook with useMutation, wired into Workspace.tsx on mount (fire-and-forget). 2 tests covering endpoint call and response data.
- Decisions: Used FOR UPDATE in session transaction (helps when row exists to lock, benign when not). Concurrent session creation test verifies no errors rather than strict single-session guarantee (DB-level unique partial index would be needed for strict atomicity).

### Change Log

- 2026-03-06: Implemented Story 5.1 — Auto-Save & Code Snapshot Persistence
- 2026-03-06: Code review fixes applied:
  - H1: Added unique partial index `idx_sessions_user_milestone_active` on `(user_id, milestone_id) WHERE is_active = true` to prevent concurrent duplicate active sessions. Moved session creation fully inside transaction with catch for constraint violations.
  - H2: Replaced `.then()/.catch()` chain in `submit.ts` snapshot creation with `void async IIFE` per project-context.md async rules.
  - H3: Ensured `sessions.ts` returns `startedAt` as ISO 8601 string consistently across both code paths (existing vs new session).
  - L1: Replaced fragile `setTimeout(10)` in `latest-snapshot.test.ts` with explicit `created_at` values using `sql` template.
  - L2: Added `retryTimerRef` cleanup in `use-auto-save.ts` to prevent retry timers firing after unmount.

### File List

New files:
- apps/backend/migrations/006_add_sessions_and_code_snapshots.ts
- apps/backend/src/plugins/progress/routes/auto-save.ts
- apps/backend/src/plugins/progress/routes/auto-save.test.ts
- apps/backend/src/plugins/progress/routes/latest-snapshot.ts
- apps/backend/src/plugins/progress/routes/latest-snapshot.test.ts
- apps/backend/src/plugins/progress/routes/sessions.ts
- apps/backend/src/plugins/progress/routes/sessions.test.ts
- apps/webapp/src/hooks/use-auto-save.ts
- apps/webapp/src/hooks/use-auto-save.test.ts
- apps/webapp/src/hooks/use-session.ts
- apps/webapp/src/hooks/use-session.test.ts

Modified files:
- apps/backend/src/plugins/progress/index.ts (registered new routes)
- apps/backend/src/plugins/execution/routes/submit.ts (added snapshot on submit)
- apps/backend/src/plugins/execution/routes/submit.test.ts (added snapshot test + cleanup)
- apps/webapp/src/routes/Workspace.tsx (wired auto-save, session, beforeunload)
- apps/webapp/src/routes/Workspace.test.tsx (added auto-save/session mock + integration tests)
- packages/shared/src/types/db.ts (regenerated by kysely-codegen)
