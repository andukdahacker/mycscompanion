# Story 8.2: Data Export

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a user,
I want to download all my data from the platform,
so that I have a personal copy of my work and interactions.

## Acceptance Criteria

1. Given a user is on the account settings page, when they request a data export, then the system collects all user data: code submissions, code snapshots, benchmark results, milestone progress, AI tutor conversations, session summaries, and profile information (FR41)
2. And the export is processed asynchronously via BullMQ to avoid blocking the request
3. And the user receives a notification or download link when the export is ready
4. And the exported file is a structured JSON archive with clearly labeled sections
5. And the export includes metadata (export date, data categories included)
6. And the export endpoint requires valid Firebase Auth token matching the requesting user
7. And no other user's data is included in the export

## Tasks / Subtasks

- [x] Task 1: Create `data_exports` database table (AC: #1, #2, #5)
  - [x] 1.1 Create migration `apps/backend/migrations/010_add_data_exports.ts`:
    ```typescript
    import type { Kysely } from 'kysely'
    import { sql } from 'kysely'

    export async function up(db: Kysely<never>): Promise<void> {
      await db.schema
        .createTable('data_exports')
        .addColumn('id', 'text', (col) => col.primaryKey())
        .addColumn('user_id', 'text', (col) => col.notNull().references('users.id').onDelete('cascade'))
        .addColumn('status', 'text', (col) => col.notNull().defaultTo('processing'))
        .addColumn('export_data', 'jsonb')
        .addColumn('error_message', 'text')
        .addColumn('created_at', sql`timestamptz`, (col) => col.notNull().defaultTo(sql`now()`))
        .addColumn('completed_at', sql`timestamptz`)
        .execute()

      await db.schema
        .createIndex('idx_data_exports_user_id')
        .on('data_exports')
        .column('user_id')
        .execute()
    }

    export async function down(db: Kysely<never>): Promise<void> {
      await db.schema.dropTable('data_exports').execute()
    }
    ```
    - **Status values:** `'processing' | 'completed' | 'failed'` — union type, NOT enum
    - **`export_data` is nullable JSONB** — null while processing, populated on completion
    - **Cascade delete** — when user is deleted (Story 8.3), exports are cleaned up automatically
    - **Index on `user_id`** — optimizes status lookup for user's latest export
  - [x] 1.2 Run migration and regenerate types:
    ```bash
    pnpm --filter backend db:migrate
    pnpm --filter shared db:types
    ```

- [x] Task 2: Create export queue and job data types (AC: #2)
  - [x] 2.1 Add export queue to `apps/backend/src/shared/queue.ts`:
    ```typescript
    export const EXPORT_QUEUE_NAME = 'account-export'

    export type ExportJobData = {
      readonly exportId: string
      readonly userId: string
    }

    export function createExportQueue(connection: Redis): Queue<ExportJobData> {
      return new Queue<ExportJobData>(EXPORT_QUEUE_NAME, {
        connection,
        defaultJobOptions: {
          attempts: 3,
          backoff: { type: 'exponential', delay: 5000 },
          removeOnComplete: { age: 3600 },
          removeOnFail: { age: 86400 },
        },
      })
    }
    ```
    - **3 attempts** — export is idempotent (re-gathers data and overwrites), safe to retry
    - **Queue name `account-export`** — follows hyphenated convention matching existing `execution-run` queue

- [x] Task 3: Create export processor (AC: #1, #4, #5, #7)
  - [x] 3.1 Create `apps/backend/src/worker/processors/export-processor.ts`:
    ```typescript
    import type { Job, Processor } from 'bullmq'
    import type { Kysely } from 'kysely'
    import type { DB } from '@mycscompanion/shared'
    import type { Logger } from 'pino'
    import type { ExportJobData } from '../../shared/queue.js'
    import { toCamelCase } from '@mycscompanion/shared'

    type ExportProcessorDeps = {
      readonly db: Kysely<DB>
      readonly logger: Logger
    }

    export function createExportProcessor(deps: ExportProcessorDeps): Processor<ExportJobData> {
      return async (job: Job<ExportJobData>) => {
        // implementation
      }
    }
    ```
    - **Data collection scope** (each section labeled in output JSON):
      - `profile` — from `users` table (single row)
      - `sessions` — from `sessions` table (all user sessions)
      - `codeSnapshots` — from `code_snapshots` table (all snapshots)
      - `submissions` — from `submissions` table (all submissions with execution_result, criteria_results)
      - `benchmarkResults` — from `benchmark_results` table (all benchmark data)
      - `tutorMessages` — from `tutor_messages` table (all AI conversations)
      - `sessionSummaries` — from `session_summaries` table (all summaries)
      - `milestoneProgress` — from `user_milestones` table (completion records)
    - **Query pattern for each table:**
      ```typescript
      const submissions = await deps.db
        .selectFrom('submissions')
        .selectAll()
        .where('user_id', '=', job.data.userId)
        .orderBy('created_at', 'asc')
        .execute()
      ```
    - **CRITICAL: Use `toCamelCase()` on all DB results** — export uses camelCase API convention. Note: `toCamelCase()` handles arrays natively (see `to-camel-case.ts` line 33-34), so you can pass arrays directly without `.map()`.
    - **CRITICAL: Filter by `user_id`** — never use a join or query that could leak other users' data (AC #7)
    - **Metadata wrapper:**
      ```typescript
      const exportPayload = {
        metadata: {
          exportDate: new Date().toISOString(),
          userId: job.data.userId,
          categoriesIncluded: [
            'profile', 'sessions', 'codeSnapshots', 'submissions',
            'benchmarkResults', 'tutorMessages', 'sessionSummaries', 'milestoneProgress',
          ],
        },
        data: {
          profile: toCamelCase(user),
          sessions: toCamelCase(sessions),
          codeSnapshots: toCamelCase(codeSnapshots),
          submissions: toCamelCase(submissions),
          benchmarkResults: toCamelCase(benchmarkResults),
          tutorMessages: toCamelCase(tutorMessages),
          sessionSummaries: toCamelCase(sessionSummaries),
          milestoneProgress: toCamelCase(milestoneProgress),
        },
      }
      ```
    - **On success:** Update `data_exports` row: `status = 'completed'`, `export_data = exportPayload`, `completed_at = now()`
    - **On failure:** Update `data_exports` row: `status = 'failed'`, `error_message = err.message`
    - **Wrap entire processor in try/catch** — always update DB status even on failure
    - **No Sentry for expected errors** — only log. Sentry capture happens in worker.ts `failed` event handler for exhausted retries
  - [x] 3.2 Create `apps/backend/src/worker/processors/export-processor.test.ts`:
    - Test: should gather all user data categories and store in data_exports table
    - Test: should only include data for the specified userId (insert test data for 2 users, verify only 1 user's data exported)
    - Test: should include metadata with export date and categories
    - Test: should update status to 'failed' with error message on processor error
    - Test: should use toCamelCase on all DB results
    - **Use real PostgreSQL** — no mocking Kysely (per testing rules)
    - **Test cleanup in `afterEach`:** Use direct `db.deleteFrom()` calls, NOT transaction rollback. Follow existing pattern from `account.test.ts` line 23: `await db.deleteFrom('users').where('id', 'like', 'test-%').execute()`. Clean up in FK-safe order: `data_exports` → `benchmark_results` → `tutor_messages` → `session_summaries` → `code_snapshots` → `submissions` → `user_milestones` → `sessions` → `users` (children before parents).
    - **Use `vi.restoreAllMocks()` in `afterEach`**
    - **Use `it()`, never `test()`**

- [x] Task 4: Create export API routes in account plugin (AC: #2, #3, #6)
  - [x] 4.1 Create `apps/backend/src/plugins/account/export.ts`:
    ```typescript
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

    export async function exportRoutes(
      fastify: FastifyInstance,
      opts: ExportRoutesOptions
    ): Promise<void> {
      // POST /api/account/export — trigger export
      // GET /api/account/export/status — check latest export status
      // GET /api/account/export/download — download completed export
    }
    ```
    - **POST /api/account/export:**
      - Check for existing in-progress export for this user (prevent duplicate jobs)
      - If existing processing export found, return `{ exportId, status: 'processing', message: 'Export already in progress' }`
      - Create `data_exports` row with `id = createId()`, `user_id = request.uid`, `status = 'processing'`
      - Add job to export queue: `exportQueue.add('account-export', { exportId, userId: request.uid })`
      - Return `{ exportId, status: 'processing' }`
      - Rate limit: max 1 export per 5 minutes per user. Use DB-based check (query `created_at` of latest `data_exports` row for this user), NOT the Redis `RateLimiter` class from `shared/rate-limiter.ts`. The DB approach is simpler here since you're already querying for existing exports.
    - **GET /api/account/export/status:**
      - Query latest `data_exports` row for `request.uid` ordered by `created_at desc`
      - Return `{ exportId, status, createdAt, completedAt }` or `{ status: 'none' }` if no exports
      - Do NOT return `export_data` in status response (too large)
    - **GET /api/account/export/download:**
      - Query latest completed `data_exports` row for `request.uid`
      - If no completed export: return 404 `{ error: { code: 'NO_EXPORT', message: 'No completed export found' } }`
      - Set response headers:
        ```typescript
        reply.header('Content-Type', 'application/json')
        reply.header('Content-Disposition', `attachment; filename="mycscompanion-export-${date}.json"`)
        ```
      - Return `export_data` JSONB column directly (Fastify auto-serializes)
      - **IMPORTANT:** Use `reply.send()` with explicit headers — this is a file download, not a standard API response
    - **All routes scoped to `request.uid`** — impossible to access another user's export (AC #6, #7)
  - [x] 4.2 Register export routes in `apps/backend/src/plugins/account/index.ts`:
    - Add imports at the top:
      ```typescript
      import type { Queue } from 'bullmq'
      import type { ExportJobData } from '../../shared/queue.js'
      import { exportRoutes } from './export.js'
      ```
    - Update options interface and plugin function:
      ```typescript
      interface AccountPluginOptions {
        readonly db?: typeof defaultDb
        readonly exportQueue?: Queue<ExportJobData>
      }

      export async function accountPlugin(fastify: FastifyInstance, opts: AccountPluginOptions = {}): Promise<void> {
        const db = opts.db ?? defaultDb
        await fastify.register(profileRoutes, { db })
        await fastify.register(onboardingRoutes, { db })
        await fastify.register(skillAssessmentRoutes, { db })
        if (opts.exportQueue) {
          await fastify.register(exportRoutes, { db, exportQueue: opts.exportQueue })
        }
      }
      ```
    - **Conditional registration** — export routes only register if `exportQueue` is provided. This keeps existing tests working (e.g., `account.test.ts` doesn't pass a queue) and makes the dependency explicit.
  - [x] 4.3 Update `apps/backend/src/app.ts` to create export queue and pass to account plugin:
    ```typescript
    import { createExportQueue, createExecutionQueue } from './shared/queue.js'
    // ...
    const exportQueue = createExportQueue(bullmqConnection)
    // ...
    await fastify.register(accountPlugin, { prefix: '/api/account', exportQueue })
    // ...
    // In onClose hook:
    await exportQueue.close()
    ```
  - [x] 4.4 Create `apps/backend/src/plugins/account/export.test.ts`:
    - Test: POST /export should create data_exports row and return exportId
    - Test: POST /export should return existing exportId if export already processing
    - Test: POST /export should rate limit to 1 per 5 minutes
    - Test: GET /export/status should return latest export status for user
    - Test: GET /export/status should return `{ status: 'none' }` when no exports exist
    - Test: GET /export/download should return JSON file with Content-Disposition header
    - Test: GET /export/download should return 404 when no completed export exists
    - Test: all endpoints should only return data for authenticated user (no cross-user leakage)
    - **Use `fastify.inject()`** — never supertest, never real HTTP
    - **Use real PostgreSQL** — direct cleanup in `afterEach` via `db.deleteFrom()` (NOT transaction rollback). Follow `account.test.ts` pattern exactly.
    - **Mock Firebase auth via `createMockFirebaseAuth(TEST_UID)`** from `@mycscompanion/config/test-utils`
    - **Build a test Fastify app** that includes auth plugin + account plugin WITH a mock export queue. Use a real BullMQ `Queue` instance connected to test Redis, or mock it with `{ add: vi.fn() } as unknown as Queue<ExportJobData>` for route tests (route tests verify HTTP behavior, not job processing).
    - **Follow `account.test.ts` pattern:** top-level `buildApp()`, `afterEach` cleanup, `afterAll` close app.
    - **Cleanup order in `afterEach`:** `data_exports` → `users` (export rows reference users via FK)

- [x] Task 5: Register export worker in worker.ts (AC: #2)
  - [x] 5.1 Update `apps/backend/src/worker/worker.ts`:
    ```typescript
    import { createExportProcessor } from './processors/export-processor.js'
    import { EXPORT_QUEUE_NAME } from '../shared/queue.js'

    // Create export processor
    const exportProcessor = createExportProcessor({ db, logger })

    // Create export Worker
    const exportWorker = new Worker(EXPORT_QUEUE_NAME, exportProcessor, {
      connection: bullmqConnection,
      concurrency: 2, // Low concurrency — exports are DB-heavy
    })

    exportWorker.on('failed', (job, err) => {
      if (job && job.attemptsMade >= (job.opts.attempts ?? 1)) {
        Sentry.captureException(err, {
          extra: { exportId: job.data.exportId, userId: job.data.userId },
        })
      }
    })

    exportWorker.on('error', (err) => {
      logger.error(err, 'Export worker connection error')
    })
    ```
    - **Concurrency: 2** — exports are DB-read-heavy. Keep low to avoid overwhelming PostgreSQL with parallel full-table scans per user.
    - **No Fly Machine deps** — export worker doesn't need `MCC_FLY_API_TOKEN`. Don't gate worker startup on this env var for export worker.
    - **Add `exportWorker.close()` to graceful shutdown**
  - [x] 5.2 **IMPORTANT:** The `MCC_FLY_API_TOKEN` validation at the top of `worker.ts` will prevent the worker from starting if the env var is missing. This is fine — both workers run in the same process, and the execution worker needs it. No change needed.

- [x] Task 6: Add export API types to shared package (AC: #4, #5)
  - [x] 6.1 Add types to `packages/shared/src/types/api.ts`:
    ```typescript
    // Use `export interface` to match existing api.ts style (all types use interface pattern)
    export type DataExportStatus = 'processing' | 'completed' | 'failed' | 'none'

    export interface DataExportResponse {
      readonly exportId: string
      readonly status: DataExportStatus
      readonly message?: string
    }

    export interface DataExportStatusResponse {
      readonly exportId: string | null
      readonly status: DataExportStatus
      readonly createdAt: string | null
      readonly completedAt: string | null
    }

    export interface DataExportMetadata {
      readonly exportDate: string
      readonly userId: string
      readonly categoriesIncluded: readonly string[]
    }

    export interface DataExportData {
      readonly profile: Record<string, unknown>
      readonly sessions: readonly Record<string, unknown>[]
      readonly codeSnapshots: readonly Record<string, unknown>[]
      readonly submissions: readonly Record<string, unknown>[]
      readonly benchmarkResults: readonly Record<string, unknown>[]
      readonly tutorMessages: readonly Record<string, unknown>[]
      readonly sessionSummaries: readonly Record<string, unknown>[]
      readonly milestoneProgress: readonly Record<string, unknown>[]
    }

    export interface DataExportPayload {
      readonly metadata: DataExportMetadata
      readonly data: DataExportData
    }
    ```
    - **`export interface` pattern** — matches all existing types in `api.ts` (e.g., `export interface UserProfile`, `export interface OnboardingRequest`)
    - **`DataExportStatus` stays as `type`** — union types can't be interfaces
    - **`readonly` on all fields** — export data is immutable
    - **`Record<string, unknown>`** for data sections — export shape comes from DB and may evolve. Using `unknown` instead of `any` (per project rules)
  - [x] 6.2 No barrel file change needed — `packages/shared/src/types/index.ts` already re-exports all of `api.ts` via `export type * from './api.js'` (line 6). New exports are automatically included.

- [x] Task 7: Create frontend export hook and download utility (AC: #3)
  - [x] 7.1 Create `apps/webapp/src/hooks/use-data-export.ts`:
    ```typescript
    import { useState, useCallback, useRef, useEffect } from 'react'
    import { apiFetch, API_URL } from '../lib/api-fetch'
    import { auth } from '../lib/firebase'
    import type { DataExportResponse, DataExportStatusResponse } from '@mycscompanion/shared'

    type ExportState = {
      readonly status: 'idle' | 'processing' | 'completed' | 'failed'
      readonly error: string | null
    }

    function useDataExport() {
      const [state, setState] = useState<ExportState>({ status: 'idle', error: null })
      const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

      const stopPolling = useCallback(() => {
        if (pollIntervalRef.current) {
          clearInterval(pollIntervalRef.current)
          pollIntervalRef.current = null
        }
      }, [])

      // Cleanup on unmount
      useEffect(() => stopPolling, [stopPolling])

      const startPolling = useCallback(() => {
        pollIntervalRef.current = setInterval(async () => {
          try {
            const status = await apiFetch<DataExportStatusResponse>('/api/account/export/status')
            if (status.status === 'completed') {
              stopPolling()
              setState({ status: 'completed', error: null })
            } else if (status.status === 'failed') {
              stopPolling()
              setState({ status: 'failed', error: 'Export failed. Please try again.' })
            }
          } catch {
            stopPolling()
            setState({ status: 'failed', error: 'Failed to check export status.' })
          }
        }, 2000)
      }, [stopPolling])

      // Check for existing export on mount (resume if processing, show download if completed)
      useEffect(() => {
        async function checkExistingExport() {
          try {
            const status = await apiFetch<DataExportStatusResponse>('/api/account/export/status')
            if (status.status === 'completed') {
              setState({ status: 'completed', error: null })
            } else if (status.status === 'processing') {
              setState({ status: 'processing', error: null })
              startPolling()
            }
          } catch {
            // No existing export — stay idle
          }
        }
        void checkExistingExport()
      }, [startPolling])

      const triggerExport = useCallback(async () => {
        setState({ status: 'processing', error: null })
        try {
          await apiFetch<DataExportResponse>('/api/account/export', { method: 'POST' })
          startPolling()
        } catch {
          setState({ status: 'failed', error: 'Failed to start export.' })
        }
      }, [startPolling])

      const downloadExport = useCallback(async () => {
        try {
          const user = auth.currentUser
          if (!user) throw new Error('Not authenticated')
          const token = await user.getIdToken()
          const response = await fetch(`${API_URL}/api/account/export/download`, {
            headers: { Authorization: `Bearer ${token}` },
          })
          if (!response.ok) throw new Error('Download failed')
          const blob = await response.blob()
          const url = URL.createObjectURL(blob)
          const a = document.createElement('a')
          a.href = url
          a.download = `mycscompanion-export-${new Date().toISOString().split('T')[0]}.json`
          document.body.appendChild(a)
          a.click()
          document.body.removeChild(a)
          URL.revokeObjectURL(url)
        } catch {
          setState({ status: 'failed', error: 'Failed to download export.' })
        }
      }, [])

      return { state, triggerExport, downloadExport }
    }

    export { useDataExport }
    ```
    - **CRITICAL `downloadExport` notes:**
      - Cannot use `apiFetch` because it calls `response.json()` (line 77 of `api-fetch.ts`). For file download, use raw `fetch` to get a Blob.
      - **Auth token:** `firebase.ts` does NOT export `getIdToken`. It exports `auth`. Use `auth.currentUser?.getIdToken()` — this is the same pattern used by `apiFetch` itself (line 38), `use-tutor-stream.ts`, and `use-sse.ts`.
      - **API_URL prefix:** Import `API_URL` from `'../lib/api-fetch'` (exported at line 80). Raw `fetch` without this prefix hits the Vite dev server (port 5173), not the backend (port 3001).
    - **`startPolling` extracted as reusable callback** — used by both `triggerExport` and the `checkExistingExport` mount effect (Task 9 merged here).
    - **Polling interval: 2s** — export for a single user should complete in <10s. 2s polling is responsive without being excessive.
    - **Cleanup interval on unmount** — prevents memory leaks if user navigates away during export
    - **No TanStack Query** — this is a one-shot action with polling, not cacheable server state. `useState` is appropriate per the state split rule (UI state = Zustand or local state, NOT TanStack Query for imperative actions).
  - [x] 7.2 Create `apps/webapp/src/hooks/use-data-export.test.ts`:
    - Test: triggerExport should POST to /api/account/export and start polling
    - Test: should update state to 'completed' when status response shows completed
    - Test: should update state to 'failed' on error
    - Test: should stop polling on unmount (cleanup)
    - Test: downloadExport should trigger file download via Blob
    - **Mock `apiFetch` via `vi.mock('../lib/api-fetch')`**
    - **Use `vi.useFakeTimers()` for polling interval tests**
    - **Use `vi.restoreAllMocks()` in `afterEach`**

- [x] Task 8: Update AccountSettings to enable export functionality (AC: #1, #3)
  - [x] 8.1 Update `apps/webapp/src/routes/AccountSettings.tsx`:
    - Add import at top:
      ```tsx
      import { useDataExport } from '../hooks/use-data-export'
      ```
    - Add hook call inside `AccountSettings` function, after `const [signingOut, setSigningOut] = useState(false)` (line 43):
      ```tsx
      const { state: exportState, triggerExport, downloadExport } = useDataExport()
      ```
    - **Replace the disabled export button** at lines 152-154. The exact current code is:
      ```tsx
      {/* Inside: <Card> → <CardContent> → <section aria-label="Account actions" className="space-y-3"> */}
      <Button variant="outline" className="w-full" disabled>
        Export My Data (Coming soon)
      </Button>
      ```
      Replace with:
      ```tsx
      {exportState.status === 'idle' && (
        <Button variant="outline" className="w-full" onClick={() => void triggerExport()}>
          Export My Data
        </Button>
      )}
      {exportState.status === 'processing' && (
        <Button variant="outline" className="w-full" disabled>
          Preparing Export...
        </Button>
      )}
      {exportState.status === 'completed' && (
        <Button variant="outline" className="w-full" onClick={() => void downloadExport()}>
          Download Export
        </Button>
      )}
      {exportState.status === 'failed' && (
        <div className="space-y-2">
          <p className="text-sm text-destructive">{exportState.error}</p>
          <Button variant="outline" className="w-full" onClick={() => void triggerExport()}>
            Retry Export
          </Button>
        </div>
      )}
      ```
    - **Keep surrounding siblings intact:** The "Delete Account (Coming soon)" button (line 155-157) and "Privacy Policy (Coming soon)" button (line 158-160) stay disabled — those are Stories 8.3 and 8.4.
    - **Button states:** idle → processing (disabled, "Preparing Export...") → completed ("Download Export") → or failed (error + retry)
    - **`void` keyword** on async onClick handlers — same pattern as `handleSignOut` on line 170
  - [x] 8.2 Update `apps/webapp/src/routes/AccountSettings.test.tsx`:
    - Update existing placeholder test: `it('should render disabled "Export My Data" button')` → remove or replace
    - Add new tests:
      - `it('should render "Export My Data" button in idle state')`
      - `it('should show "Preparing Export..." when processing')`
      - `it('should show "Download Export" button when completed')`
      - `it('should show error message and retry button when failed')`
      - `it('should call triggerExport when export button clicked')`
      - `it('should call downloadExport when download button clicked')`
    - **Mock `useDataExport` hook** via `vi.mock('../hooks/use-data-export')`. Follow the same mock pattern as `useAccountProfile` in existing tests (line 23-26): `const mockUseDataExport = vi.fn()` + `vi.mock(...)` + configure return values per test with `mockUseDataExport.mockReturnValue({ state: { status: 'idle', error: null }, triggerExport: vi.fn(), downloadExport: vi.fn() })`
    - **Existing test to update:** `it('should render disabled "Export My Data" button')` at line 213-217 searches for text `'Export My Data (Coming soon)'`. This test must be replaced since the button text changes.

- [x] Task 9: Register export queue in Bull Board admin (AC: #2)
  - [x] 9.1 Update `apps/backend/src/plugins/admin/index.ts`:
    - Update `AdminPluginOptions` interface to accept export queue:
      ```typescript
      interface AdminPluginOptions {
        readonly executionQueue?: Queue
        readonly exportQueue?: Queue
      }
      ```
    - Update the queues array construction (currently lines 43-45):
      ```typescript
      // Current code:
      const queues = opts.executionQueue
        ? [new BullMQAdapter(opts.executionQueue)]
        : []

      // Replace with:
      const queues: BullMQAdapter[] = []
      if (opts.executionQueue) queues.push(new BullMQAdapter(opts.executionQueue))
      if (opts.exportQueue) queues.push(new BullMQAdapter(opts.exportQueue))
      ```
  - [x] 9.2 Update `apps/backend/src/app.ts` admin plugin registration (line 105):
    ```typescript
    // Current:
    await fastify.register(adminPlugin, { prefix: '/admin/queues', executionQueue })
    // Updated:
    await fastify.register(adminPlugin, { prefix: '/admin/queues', executionQueue, exportQueue })
    ```

## Dev Notes

### Architecture Compliance

- **Plugin isolation preserved** — export routes live in account plugin (`/api/account/export`), matching ARCH-5 architecture
- **No cross-plugin imports** — export processor queries DB directly, no imports from other plugins
- **BullMQ queue naming** — `account-export` follows hyphenated convention matching existing `execution-run`
- **No new Zustand stores** — export state managed via local `useState` in custom hook (imperative one-shot action, not server state)
- **Named exports only** — all new modules use named exports
- **`toCamelCase()` on all DB results** — export data follows camelCase API convention
- **Plugin registration order** — no change needed. Account plugin already at position 3 (domain plugins). Export routes register within it.
- **Worker process** — both execution and export workers run in same process (`apps/backend`). No separate `apps/worker/` directory.
- **cuid2 for export IDs** — consistent with all other entity IDs (except Firebase UID for users)

### Existing Implementation to Build On

| What | Where | Status |
|---|---|---|
| Account plugin | `apps/backend/src/plugins/account/index.ts` | Complete — add export routes registration |
| BullMQ queue pattern | `apps/backend/src/shared/queue.ts` | Complete — follow `createExecutionQueue` pattern |
| Worker setup | `apps/backend/src/worker/worker.ts` | Complete — add second Worker instance |
| Execution processor pattern | `apps/backend/src/worker/processors/execution-processor.ts` | Complete — follow for export processor |
| `toCamelCase()` | `@mycscompanion/shared` | Complete — use for all DB→export conversion |
| `createId()` from `@paralleldrive/cuid2` | Already used in submissions, sessions | Complete — use for export IDs |
| `apiFetch` + `API_URL` | `apps/webapp/src/lib/api-fetch.ts` | Complete — use `apiFetch` for POST/status, `API_URL` for download fetch prefix |
| `auth` (Firebase) | `apps/webapp/src/lib/firebase.ts` line 80 | Complete — use `auth.currentUser?.getIdToken()` for download auth header (NOT `getIdToken` — doesn't exist as standalone export) |
| AccountSettings.tsx | `apps/webapp/src/routes/AccountSettings.tsx` | Complete — update export button |
| Bull Board admin | `apps/backend/src/plugins/admin/index.ts` | Complete — add export queue |
| App.ts queue setup | `apps/backend/src/app.ts` | Complete — add export queue creation |

### Data Flow

```
Frontend AccountSettings route:
  1. User clicks "Export My Data"
  2. useDataExport.triggerExport() → POST /api/account/export
     → Backend creates data_exports row (status: 'processing')
     → Backend adds job to BullMQ 'account-export' queue
     → Returns { exportId, status: 'processing' }
  3. Frontend polls GET /api/account/export/status every 2s
  4. Worker picks up job:
     → Queries all user data tables (users, sessions, code_snapshots,
        submissions, benchmark_results, tutor_messages, session_summaries,
        user_milestones)
     → Applies toCamelCase() to all results
     → Wraps in metadata envelope (exportDate, categoriesIncluded)
     → Stores as JSONB in data_exports.export_data
     → Updates status to 'completed'
  5. Frontend poll detects 'completed' → shows "Download Export" button
  6. User clicks "Download Export"
     → GET /api/account/export/download
     → Backend reads export_data from data_exports
     → Returns JSON file with Content-Disposition header
     → Frontend creates Blob URL → triggers browser download
```

### Database Tables Containing User Data (Complete List)

| Table | FK Column | Data Description |
|---|---|---|
| `users` | `id` (PK) | Profile, email, questionnaire, skill assessment |
| `sessions` | `user_id` | Work sessions with start/end times |
| `code_snapshots` | `user_id` | Auto-saved code state (append-only) |
| `submissions` | `user_id` | Code submissions with results (execution_result JSONB, criteria_results JSONB) |
| `benchmark_results` | `user_id` | Normalized performance metrics per submission |
| `tutor_messages` | `user_id` | AI conversation history (role, content, model) |
| `session_summaries` | `user_id` | Pre-computed session summaries |
| `user_milestones` | `user_id` | Milestone completion records |

### Security Considerations

- **All queries filter by `request.uid`** — scoped at the SQL level, not just application logic
- **No `SELECT *` without `WHERE user_id =`** — every export query must include the user filter
- **Rate limiting** — 1 export per 5 minutes per user prevents abuse
- **Auth required** — all endpoints behind global auth hook (ARCH-5 position 1)
- **Export data cleanup** — consider periodic cleanup of old exports (>24h). Not critical for MVP but good practice. Can be a cron job or BullMQ repeatable job added later.
- **No logging of export data** — per privacy rules, never log user data content at info level or above
- **JSONB column size** — for active users, export data could reach 1-2MB (many code snapshots + tutor messages). This is within PostgreSQL's JSONB limits. Monitor in production; if exports grow beyond ~10MB, consider streaming to object storage (S3) instead. Acceptable for MVP.

### Project Structure Notes

**New files:**
- `apps/backend/migrations/010_add_data_exports.ts` — Migration for data_exports table
- `apps/backend/src/plugins/account/export.ts` — Export API routes (POST, GET status, GET download)
- `apps/backend/src/plugins/account/export.test.ts` — Route tests
- `apps/backend/src/worker/processors/export-processor.ts` — BullMQ job processor
- `apps/backend/src/worker/processors/export-processor.test.ts` — Processor tests
- `apps/webapp/src/hooks/use-data-export.ts` — Frontend export hook with polling
- `apps/webapp/src/hooks/use-data-export.test.ts` — Hook tests

**Modified files:**
- `apps/backend/src/shared/queue.ts` — Add EXPORT_QUEUE_NAME, ExportJobData, createExportQueue
- `apps/backend/src/plugins/account/index.ts` — Register export routes (conditional on exportQueue option)
- `apps/backend/src/app.ts` — Create export queue, pass to account plugin, cleanup on close
- `apps/backend/src/worker/worker.ts` — Add export Worker instance + graceful shutdown
- `apps/backend/src/plugins/admin/index.ts` — Add `exportQueue` to `AdminPluginOptions` and `createBullBoard` queues array
- `packages/shared/src/types/api.ts` — Add DataExportStatus, DataExportResponse, DataExportStatusResponse, DataExportMetadata, DataExportData, DataExportPayload (auto re-exported via existing `export type * from './api.js'` in index.ts)
- `apps/webapp/src/routes/AccountSettings.tsx` — Replace disabled export button with functional UI
- `apps/webapp/src/routes/AccountSettings.test.tsx` — Update export button tests

**All new component files use `PascalCase.tsx`, hooks use `kebab-case.ts`, backend files use `kebab-case.ts`**
**Co-located tests: `*.test.ts(x)` next to source**

### Previous Story Intelligence (from 8.1)

1. **AccountSettings already has the disabled export button** — lines 152-153 render `<Button variant="outline" className="w-full" disabled>Export My Data (Coming soon)</Button>` inside `<Card>` → `<CardContent>` → `<section aria-label="Account actions" className="space-y-3">`. Replace this with the functional export UI.
2. **Account plugin accepts optional deps** — `AccountPluginOptions` pattern with `readonly` fields and defaults. Follow this for adding `exportQueue`.
3. **MemoryRouter required in AccountSettings tests** — tests wrap in both `MemoryRouter` and `TestProviders`. Maintain this pattern.
4. **`motion-reduce:animate-none`** — if adding any loading animations (e.g., spinner during export), include reduced motion support.
5. **`signOut` pattern** — the `handleSignOut` function in AccountSettings uses `useCallback` + `void` on async onClick. Follow same pattern for `triggerExport` and `downloadExport`.
6. **No new Zustand stores** — use local component state or custom hooks for imperative actions.

### Git Intelligence (Recent Commits)

```
4af2625 Implement Story 8.1: Account Settings Page with code review fixes
4964fc2 Implement Story 7.5: Progressive Enhancements to Overview & Completion with code review fixes
```

**Patterns established:**
- Account plugin at `apps/backend/src/plugins/account/` with clean module separation
- AccountSettings route at `apps/webapp/src/routes/AccountSettings.tsx`
- Hooks at `apps/webapp/src/hooks/use-*.ts`
- BullMQ queue + worker pattern established in execution pipeline

### Testing Strategy

- **Processor tests (real DB):** `export-processor.test.ts` — insert test data across all tables for 2 users, run processor, verify only target user's data is exported. Verify metadata structure. Verify toCamelCase applied. Clean up in FK-safe order in `afterEach`.
- **Route tests (fastify.inject):** `export.test.ts` — test all 3 endpoints. Mock BullMQ queue as `{ add: vi.fn() }` (external dependency). Use real DB for `data_exports` table. Follow `account.test.ts` pattern: top-level `buildApp()`, `createMockFirebaseAuth(TEST_UID)`, `afterEach` cleanup via `db.deleteFrom()`, `afterAll` close app.
- **Hook tests (mocked API):** `use-data-export.test.ts` — mock `apiFetch` via `vi.mock('../lib/api-fetch')`, mock `auth` from `vi.mock('../lib/firebase')`. Test state transitions, polling behavior, cleanup on unmount, download Blob creation. Use `vi.useFakeTimers()` for interval testing.
- **Component tests (mocked hook):** Update `AccountSettings.test.tsx` — mock `useDataExport` hook, test button rendering for each state (idle/processing/completed/failed). Replace existing test at line 213-217 that looks for `'Export My Data (Coming soon)'` text.
- **No snapshot tests** — explicit behavioral assertions only
- **Import test utils from `@mycscompanion/config/test-utils/`**

### References

- [Source: _bmad-output/planning-artifacts/epics.md — Epic 8, Story 8.2 acceptance criteria]
- [Source: _bmad-output/planning-artifacts/architecture.md — ARCH-5 account plugin, API route patterns, DB schema]
- [Source: _bmad-output/planning-artifacts/prd.md — FR41 data export, GDPR considerations, security requirements]
- [Source: _bmad-output/project-context.md — All project rules, testing rules, anti-patterns]
- [Source: apps/backend/src/shared/queue.ts — BullMQ queue creation pattern]
- [Source: apps/backend/src/worker/worker.ts — Worker setup and graceful shutdown pattern]
- [Source: apps/backend/src/worker/processors/execution-processor.ts — Processor pattern reference]
- [Source: apps/backend/src/plugins/account/index.ts — Account plugin registration pattern]
- [Source: apps/backend/src/app.ts — Plugin registration order, queue creation, cleanup hooks]
- [Source: apps/webapp/src/routes/AccountSettings.tsx — Current disabled export button (lines 152-153), sign-out pattern (line 45-53)]
- [Source: apps/webapp/src/routes/AccountSettings.test.tsx — Existing mock patterns (lines 8-26), export placeholder test (lines 213-217)]
- [Source: apps/webapp/src/lib/api-fetch.ts — apiFetch (JSON only, line 77), API_URL export (line 80)]
- [Source: apps/webapp/src/lib/firebase.ts — auth export (line 80), NO standalone getIdToken export]
- [Source: apps/webapp/src/hooks/use-account-profile.ts — Hook pattern reference]
- [Source: packages/shared/src/types/api.ts — Existing API types (all use export interface pattern)]
- [Source: packages/shared/src/to-camel-case.ts — toCamelCase handles arrays natively (lines 33-34)]
- [Source: apps/backend/src/plugins/account/account.test.ts — Test pattern: direct db.deleteFrom cleanup (line 23), createMockFirebaseAuth (line 10)]
- [Source: apps/backend/src/plugins/admin/index.ts — AdminPluginOptions (line 9-11), queues array (lines 43-45)]
- [Source: apps/backend/migrations/009_add_benchmark_results.ts — Migration pattern: Kysely<never>, sql template for timestamptz and now()]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6

### Debug Log References

None — clean implementation with no blocking issues.

### Completion Notes List

- Task 1: Created `data_exports` table migration (010_add_data_exports.ts) with cascade delete, JSONB export_data, and user_id index. Ran migration and regenerated Kysely types.
- Task 2: Added `EXPORT_QUEUE_NAME`, `ExportJobData` type, and `createExportQueue` to `shared/queue.ts` following existing execution queue pattern. 3 retry attempts with exponential backoff.
- Task 3: Created `export-processor.ts` — queries all 8 user data tables, applies `toCamelCase()`, wraps in metadata envelope, stores as JSONB. Try/catch updates status to 'failed' on error. 5 tests passing (real PostgreSQL, 2-user isolation test).
- Task 4: Created `export.ts` routes (POST trigger, GET status, GET download). DB-based rate limiting (5 min). Conditional registration in account plugin. Created and passed exportQueue in app.ts. 8 tests passing.
- Task 5: Registered export Worker in `worker.ts` with concurrency 2. Added Sentry error capture on exhausted retries. Added graceful shutdown.
- Task 6: Added 6 export API types to `packages/shared/src/types/api.ts` — auto re-exported via existing barrel.
- Task 7: Created `use-data-export.ts` hook with polling (2s interval), mount-time status check, and Blob-based file download using raw `fetch` + `auth.currentUser.getIdToken()`. 6 tests passing.
- Task 8: Replaced disabled "Export My Data (Coming soon)" button with functional 4-state UI (idle/processing/completed/failed). Updated 21 component tests — all passing.
- Task 9: Added `exportQueue` to Bull Board admin options and app.ts registration.

### Change Log

- 2026-03-12: Implemented Story 8.2 — Data Export (all 9 tasks, all ACs satisfied)
- 2026-03-12: Code review fixes — removed banned `as` cast in export.ts, added filtered cleanup in processor tests, added 2-min polling timeout in use-data-export.ts, guarded startPolling against double invocation, simplified error test in export-processor.test.ts

### File List

**New files:**
- `apps/backend/migrations/010_add_data_exports.ts`
- `apps/backend/src/plugins/account/export.ts`
- `apps/backend/src/plugins/account/export.test.ts`
- `apps/backend/src/worker/processors/export-processor.ts`
- `apps/backend/src/worker/processors/export-processor.test.ts`
- `apps/webapp/src/hooks/use-data-export.ts`
- `apps/webapp/src/hooks/use-data-export.test.ts`

**Modified files:**
- `apps/backend/src/shared/queue.ts`
- `apps/backend/src/plugins/account/index.ts`
- `apps/backend/src/app.ts`
- `apps/backend/src/worker/worker.ts`
- `apps/backend/src/plugins/admin/index.ts`
- `packages/shared/src/types/api.ts`
- `apps/webapp/src/routes/AccountSettings.tsx`
- `apps/webapp/src/routes/AccountSettings.test.tsx`
