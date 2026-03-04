# Story 3.3: Submission Queue & Worker Process

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **learner**,
I want my code submissions queued and processed fairly,
so that the system handles concurrent users without dropping submissions.

## Acceptance Criteria

1. **Given** a code submission is received by the API, **When** it is enqueued in BullMQ, **Then** the worker process dequeues and processes jobs in FIFO order with fair scheduling across users (FR22)
   - _Fair scheduling for MVP: rate limiting (10/min/user) prevents queue flooding. FIFO ordering is sufficient at 100-user scale. Per-user concurrency limiting deferred to scale-out._
2. **And** the worker delegates execution to the `packages/execution` module and publishes `ExecutionEvent` messages to Redis pub/sub (ARCH-6)
   - _Worker uses `FlyClient`, `buildMachineRequest` from `@mycscompanion/execution` directly (not `executeCode` — worker needs more lifecycle control for log capture). Publishes events to channel `execution:{submissionId}` and writes to list `execution:{submissionId}:log` (TTL: 5 min)._
3. **And** code submissions are rate-limited at 10 per minute per user (FR25, NFR-S7)
   - _Redis sliding window rate limiter. Returns HTTP 429 with `Retry-After` header._
4. **And** rate-limited requests receive a clear error response with retry-after guidance
5. **And** failed jobs are auto-retried once; permanently failed jobs are marked failed with an admin alert via Sentry (NFR-R6)
   - _BullMQ `attempts: 2` (original + 1 retry). On permanent failure: update DB status to 'failed', publish error event, capture to Sentry with submission context._
6. **And** the system supports 10 simultaneous code executions at MVP scale (NFR-P11)
   - _BullMQ Worker `concurrency: 10`. FlyClient is stateless and concurrency-safe (per Story 3.2)._
7. **And** the worker runs as a separate Railway service using the same backend codebase with a separate entry point (ARCH-18)
   - _`pnpm --filter backend start:worker` entry point. Worker shares `apps/backend` codebase with API._
8. **And** a migration creates the `submissions` table with: submission ID (cuid2), user ID, milestone ID, code content, status, execution result, criteria results, and timestamps per ARCH-19/ARCH-20. `kysely-codegen` is re-run to update TypeScript types
   - _`ExecutionStatus` from `@mycscompanion/execution` is the canonical source for status values: 'queued' | 'running' | 'completed' | 'failed'. Use text column with CHECK constraint (not PG enum — easier to extend)._

## Tasks / Subtasks

- [x] Task 1: Create database migration — submissions table (AC: #8)
  - [x] 1.1 Create `apps/backend/src/db/migrations/004_add_submissions.ts`
  - [x] 1.2 Create `submissions` table with columns: `id` (text PK — cuid2), `user_id` (text NOT NULL FK to users.id), `milestone_id` (text NOT NULL — no FK for now, milestones may not be seeded), `code` (text NOT NULL), `status` (text NOT NULL DEFAULT 'queued' CHECK IN ('queued', 'running', 'completed', 'failed')), `execution_result` (jsonb NULL — stores machine output, exit code, duration), `criteria_results` (jsonb NULL — populated by Epic 4), `error_message` (text NULL), `created_at` (timestamptz NOT NULL DEFAULT now()), `updated_at` (timestamptz NOT NULL DEFAULT now())
  - [x] 1.3 Create indexes: `idx_submissions_user_id` on `user_id`, `idx_submissions_user_id_milestone_id` on `(user_id, milestone_id)`, `idx_submissions_status` on `status`
  - [x] 1.4 Write down migration (drop table + indexes)
  - [x] 1.5 Run migration: `pnpm --filter backend db:migrate`
  - [x] 1.6 Regenerate types: `pnpm --filter shared db:types` — new `Submissions` table type will appear in `packages/shared/src/types/db.ts`
  - [x] 1.7 Verify types: `pnpm typecheck`

- [x] Task 2: Add BullMQ dependency + shared queue configuration (AC: #1, #6)
  - [x] 2.1 Add BullMQ: `pnpm --filter backend add bullmq`
  - [x] 2.2 Create `apps/backend/src/shared/queue.ts`:
    - Export `EXECUTION_QUEUE_NAME = 'execution:run'` constant
    - Export `ExecutionJobData` type: `{ readonly submissionId: string; readonly milestoneId: string; readonly code: string; readonly userId: string }`
    - Export `createBullMQConnection(redisUrl: string)` factory returning `new Redis(redisUrl, { maxRetriesPerRequest: null })` (BullMQ requires this setting)
    - Export `createExecutionQueue(connection)` factory returning `new Queue<ExecutionJobData>(EXECUTION_QUEUE_NAME, { connection, defaultJobOptions })` with default job options: `{ attempts: 2, backoff: { type: 'exponential', delay: 5000 }, removeOnComplete: { age: 3600 }, removeOnFail: { age: 86400 } }`
  - [x] 2.3 Create `apps/backend/src/shared/queue.test.ts` — verify queue name constant, default job options shape
  - [x] 2.4 Named exports only — no default exports

- [x] Task 3: Create Redis sliding window rate limiter (AC: #3, #4)
  - [x] 3.1 Create `apps/backend/src/shared/rate-limiter.ts`
  - [x] 3.2 Implement `RateLimiter` class with constructor `({ redis, windowMs, maxRequests })` — injectable Redis client for testability
  - [x] 3.3 Method `check(key: string): Promise<{ allowed: boolean; remaining: number; retryAfterMs: number }>`
  - [x] 3.4 Implementation: Redis sorted set sliding window — `ZADD` with score = timestamp, `ZREMRANGEBYSCORE` to remove expired entries, `ZCARD` to count current window, `EXPIRE` for auto-cleanup
  - [x] 3.5 Create `apps/backend/src/shared/rate-limiter.test.ts` — test allow/deny scenarios, window sliding, TTL cleanup. Use `createMockRedis` from `@mycscompanion/config/test-utils/` or use real Redis in test
  - [x] 3.6 Default config for execution: 10 requests per 60,000ms per user key `rate:execution:{uid}`

- [x] Task 4: Create submit route — POST /api/execution/submit (AC: #1, #3, #4, #8)
  - [x] 4.1 Create `apps/backend/src/plugins/execution/routes/submit.ts`
  - [x] 4.2 Route: `POST /submit` (prefix `/api/execution` from plugin registration)
  - [x] 4.3 Request body schema (JSON Schema at boundary): `{ milestoneId: string (required), code: string (required, maxLength matching MAX_CODE_SIZE_BYTES ~65536) }`
  - [x] 4.4 Rate limit check: call `rateLimiter.check(`rate:execution:${request.uid}`)`. If denied, reply 429 with `Retry-After` header (seconds) and `{ error: { code: 'RATE_LIMITED', message: 'Too many submissions. Try again in {n} seconds.' } }`
  - [x] 4.5 Generate submission ID using `generateId()` from `shared/id.ts`
  - [x] 4.6 Insert submission row: `db.insertInto('submissions').values({ id, user_id: request.uid, milestone_id: body.milestoneId, code: body.code, status: 'queued' })`
  - [x] 4.7 Enqueue BullMQ job: `queue.add('execution:run', { submissionId, milestoneId, code, userId: request.uid })`
  - [x] 4.8 Publish initial `queued` event immediately: `eventPublisher.publish(submissionId, { type: 'queued', submissionId })` — ensures SSE clients (Story 3.4) get instant feedback before worker picks up the job
  - [x] 4.9 Return `{ submissionId: id }` with HTTP 202 (Accepted)
  - [x] 4.10 Error handling: DB insert failure returns 500. Queue add failure updates DB status to 'failed' and returns 503 with retry guidance
  - [x] 4.11 Create `apps/backend/src/plugins/execution/routes/submit.test.ts` — test with `fastify.inject()`. Mock queue.add and eventPublisher.publish via injectable dependencies. Use real DB in test transaction. Cover: happy path (202 + queued event published), rate limit (429), validation errors (400), code too large (400), DB failure (500), queue failure (503)

- [x] Task 5: Create Redis pub/sub event publisher utility (AC: #2)
  - [x] 5.1 Create `apps/backend/src/shared/event-publisher.ts`
  - [x] 5.2 Export `createEventPublisher(redis: Redis)` returning `{ publish(submissionId: string, event: ExecutionEvent): Promise<void>; setLogTTL(submissionId: string, ttlSeconds: number): Promise<void> }`
  - [x] 5.3 `publish` implementation: `redis.publish(`execution:${submissionId}`, JSON.stringify(event))` AND `redis.rpush(`execution:${submissionId}:log`, JSON.stringify(event))` — both channel (live) and list (replay)
  - [x] 5.4 `setLogTTL` implementation: `redis.expire(`execution:${submissionId}:log`, ttlSeconds)` — called after job completes (5 min TTL)
  - [x] 5.5 Create `apps/backend/src/shared/event-publisher.test.ts` — verify publish to correct channel name, rpush to correct list name, JSON serialization, TTL setting

- [x] Task 6: Create execution processor — worker (AC: #1, #2, #5, #6)
  - [x] 6.1 Create `apps/backend/src/worker/processors/execution-processor.ts`
  - [x] 6.2 Export `createExecutionProcessor(deps: { flyClient: FlyClient; flyConfig: FlyMachineConfig; db: Kysely<DB>; eventPublisher: EventPublisher; logger: Logger })` — returns BullMQ-compatible processor function. ALL deps injectable
  - [x] 6.3 Processor function: `async (job: Job<ExecutionJobData>) => Promise<void>`
  - [x] 6.4 Processing flow:
    1. Update submission status to 'running' in DB (`SET status = 'running', updated_at = now()`)
    2. Publish `{ type: 'output', phase: 'preparing', data: 'Provisioning execution environment...', sequenceId: 1 }` event (note: `queued` event was already published by the submit route)
    3. Build machine request: `buildMachineRequest(flyConfig, job.data.code, { submissionId, milestoneId })`
    4. Create Fly Machine: `flyClient.createMachine(request)` — capture `machineId` and `instanceId`
    5. Publish `{ type: 'output', phase: 'preparing', data: 'Machine created in {region}', sequenceId: 2 }`
    6. Wait for 'started': `flyClient.waitForState(machineId, 'started', { timeoutSeconds })`
    7. Publish `{ type: 'output', phase: 'compiling', data: 'Compiling and running...', sequenceId: 3 }`
    8. Wait for 'stopped': `flyClient.waitForState(machineId, 'stopped', { instanceId, timeoutSeconds })`
    9. Capture machine output via Fly Logs REST API (see Dev Notes — Output Capture Strategy)
    10. Parse output and publish as `compile_output`/`compile_error`/`output` events
    11. Publish `complete` or `error` event based on output analysis
    12. Update submission in DB: `SET status = 'completed'|'failed', execution_result = {...}, updated_at = now()`
    13. Set event log TTL: `eventPublisher.setLogTTL(submissionId, 300)`
    14. **ALWAYS** in finally block: `flyClient.destroyMachine(machineId, true)` — explicit destroy, auto_destroy is safety net only
  - [x] 6.5 Timeout handling: if waitForState throws FlyApiError with status 408/504, attempt `flyClient.stopMachine(machineId)`, publish `timeout` event, update DB status to 'failed'
  - [x] 6.6 Retryable error handling: if `FlyApiError.isRetryable === true`, throw the error to trigger BullMQ retry (attempts: 2). Still destroy machine in finally block
  - [x] 6.7 Non-retryable error handling: catch, publish error event with `isUserError: false`, update DB status to 'failed', do NOT re-throw (marks job as complete to prevent retry)
  - [x] 6.8 Create `apps/backend/src/worker/processors/execution-processor.test.ts`:
    - Use canonical msw handlers from `@mycscompanion/config/test-utils/mock-fly-api`
    - Real PostgreSQL in test transaction for DB assertions
    - Mock event publisher (spy on publish calls)
    - Tests: happy path (lifecycle + DB updates), timeout, retryable Fly error (verify throw for BullMQ retry), permanent failure (verify Sentry capture), DB status transitions, machine always destroyed

- [x] Task 7: Update worker entry point (AC: #6, #7)
  - [x] 7.1 Update `apps/backend/src/worker/worker.ts`:
    - Create BullMQ connection: `createBullMQConnection(process.env.REDIS_URL!)`
    - Create standard Redis connection for pub/sub: `new Redis(process.env.REDIS_URL!)`
    - Instantiate `FlyClient` with `{ apiToken: process.env.MCC_FLY_API_TOKEN!, appName: process.env.MCC_FLY_APP_NAME ?? 'mcc-execution' }`
    - Build runtime FlyMachineConfig: spread `DEFAULT_FLY_MACHINE_CONFIG` with `image: getExecutionImageRef()`
    - Create event publisher: `createEventPublisher(redis)`
    - Create execution processor with all deps (flyClient, flyConfig, db, eventPublisher, logger)
    - Create BullMQ Worker: `new Worker(EXECUTION_QUEUE_NAME, processor, { connection: bullmqConnection, concurrency: 10 })`
    - Wire `worker.on('failed', (job, err) => { if (job?.attemptsMade >= job?.opts.attempts) Sentry.captureException(err, { extra: { submissionId: job.data.submissionId } }) })`
    - Wire `worker.on('error', (err) => logger.error(err, 'Worker connection error'))`
    - Update graceful shutdown: `await worker.close()` then `await redis.quit()` then `await bullmqConnection.quit()` then `await destroyDb()`
  - [x] 7.2 Remove the `keepAlive` setInterval — BullMQ Worker keeps event loop alive
  - [x] 7.3 Validate required env vars at startup: `MCC_FLY_API_TOKEN` must be set (throw if missing)

- [x] Task 8: Register execution queue with Bull Board (AC: visual monitoring)
  - [x] 8.1 Update `apps/backend/src/plugins/admin/index.ts`:
    - Accept optional `executionQueue` in plugin options: `{ executionQueue?: Queue }`
    - Import `BullMQAdapter` from `@bull-board/api/bullMQAdapter`
    - If `executionQueue` provided, add to Bull Board: `createBullBoard({ queues: [new BullMQAdapter(executionQueue)], serverAdapter })`
    - Otherwise keep empty queues array (backwards compatible)
  - [x] 8.2 The queue instance is the SAME one created in `app.ts` (Task 9) — no duplicate BullMQ connections in the API process. The queue is passed via plugin options, following the existing DI pattern

- [x] Task 9: Update execution plugin to register routes (AC: #1)
  - [x] 9.1 Update `apps/backend/src/plugins/execution/index.ts`:
    - Accept options: `{ db?, redis?, queue?, rateLimiter?, eventPublisher? }` — all injectable with defaults from shared modules
    - Register submit route: `fastify.register(submitRoutes, { db, queue, rateLimiter, eventPublisher })`
    - Follow account plugin pattern for dependency injection
  - [x] 9.2 Update `apps/backend/src/app.ts`:
    - Create BullMQ connection and execution queue for the API process
    - Create rate limiter instance
    - Create event publisher (for the `queued` event published by submit route)
    - Pass to execution plugin registration: `fastify.register(executionPlugin, { prefix: '/api/execution', queue, rateLimiter, eventPublisher })`
    - Pass execution queue to admin plugin: `fastify.register(adminPlugin, { prefix: '/admin', executionQueue: queue })`

- [x] Task 10: Environment variables + integration verification
  - [x] 10.1 Verify `.env.example` has all required vars — `MCC_FLY_API_TOKEN` and `MCC_FLY_APP_NAME` already present from Stories 3.1/3.2. No new env vars needed
  - [x] 10.2 Run migration: `pnpm --filter backend db:migrate`
  - [x] 10.3 Regenerate types: `pnpm --filter shared db:types`
  - [x] 10.4 Run all tests: `pnpm --filter backend test`
  - [x] 10.5 Run typecheck: `pnpm typecheck`
  - [x] 10.6 Run lint: `pnpm lint`
  - [x] 10.7 Run root checks: `turbo lint && turbo typecheck && turbo test`
  - [x] 10.8 Verify worker starts: `pnpm --filter backend dev:worker` (should log "Worker started" and connect to Redis)
  - [x] 10.9 Verify Bull Board shows execution queue at `/admin/queues` (requires MCC_ADMIN_PASSWORD set)

## Dev Notes

### Architecture Compliance

**Plugin location:** `apps/backend/src/plugins/execution/` — domain plugin following existing patterns (auth, account, admin). Routes in `routes/`.

**Worker location:** `apps/backend/src/worker/processors/` — per architecture directory structure. Worker and API share `apps/backend` codebase with different entry points (`start:api` vs `start:worker`).

**Plugin isolation:** Execution plugin imports from `shared/` and `packages/*` only — never cross-plugin. Worker processors follow the same rule.

**Naming conventions:**
- BullMQ queue: `execution:run` (domain:action format per architecture)
- Redis channels: `execution:{submissionId}` (per architecture ARCH-6)
- Redis event log: `execution:{submissionId}:log` (per architecture ARCH-10)
- Route path: `POST /api/execution/submit` (kebab-case, plural, matches architecture)
- DB table: `submissions` (snake_case)
- DB columns: `snake_case` (user_id, milestone_id, execution_result, created_at)
- API response: `camelCase` (submissionId) — convert via `toCamelCase()` utility where needed
- SSE event types: `snake_case` (compile_output, compile_error — per project-context)

**Env var naming:** `MCC_` prefix for custom vars. `MCC_FLY_API_TOKEN`, `MCC_FLY_APP_NAME` already exist from Stories 3.1/3.2.

**Dependency injection:** Every component accepts dependencies via constructor/factory options: FlyClient, Redis, DB, Queue, RateLimiter — all injectable for testability.

**No new packages:** Extends `apps/backend` only. Uses `@mycscompanion/execution` (one of exactly 4 shared packages).

### Database Schema Design

```sql
CREATE TABLE submissions (
  id TEXT PRIMARY KEY,                    -- cuid2 from shared/id.ts
  user_id TEXT NOT NULL REFERENCES users(id),
  milestone_id TEXT NOT NULL,             -- no FK for now (milestones may not be seeded)
  code TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'running', 'completed', 'failed')),
  execution_result JSONB,                 -- { exitCode, output, machineId, durationMs }
  criteria_results JSONB,                 -- null until Epic 4
  error_message TEXT,                     -- human-readable error for failed submissions
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_submissions_user_id ON submissions(user_id);
CREATE INDEX idx_submissions_user_id_milestone_id ON submissions(user_id, milestone_id);
CREATE INDEX idx_submissions_status ON submissions(status);
```

**Status values from `ExecutionStatus`** in `@mycscompanion/execution/events.ts`: `'queued' | 'running' | 'completed' | 'failed'`. Use text column with CHECK constraint — not PG enum (easier to add values later without migration).

**`execution_result` JSONB shape (TypeScript):**
Define `ExecutionResult` type in `apps/backend/src/shared/execution-types.ts` — used by both the processor and submit route:
```typescript
// apps/backend/src/shared/execution-types.ts
export type ExecutionResult = {
  readonly exitCode: number | null
  readonly output: string           // combined stdout+stderr from Fly Machine
  readonly machineId: string
  readonly durationMs: number
  readonly compilationSucceeded: boolean
}
```

**`criteria_results`:** null in this story. Populated by Epic 4 acceptance criteria evaluation.

### BullMQ Configuration

**Version:** BullMQ 5.x (latest stable ~5.70). Install: `pnpm --filter backend add bullmq`

**Connection:** BullMQ requires `maxRetriesPerRequest: null` on the ioredis connection. The existing `shared/redis.ts` does NOT set this. Create a **separate** BullMQ-specific connection factory:

```typescript
// shared/queue.ts
import { Redis } from 'ioredis'

export function createBullMQConnection(redisUrl: string): Redis {
  return new Redis(redisUrl, { maxRetriesPerRequest: null })
}
```

Do NOT modify `shared/redis.ts` — it's used for general Redis operations (pub/sub, rate limiting) and should keep default ioredis settings. BullMQ needs its own connection instance.

**Queue configuration:**
```typescript
const queue = new Queue<ExecutionJobData>('execution:run', {
  connection: bullmqConnection,
  defaultJobOptions: {
    attempts: 2,                             // original + 1 retry
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: { age: 3600 },         // 1 hour
    removeOnFail: { age: 86400 },            // 24 hours
  },
})
```

**Worker configuration:**
```typescript
const worker = new Worker<ExecutionJobData>('execution:run', processor, {
  connection: bullmqConnection,
  concurrency: 10,  // NFR-P11: 10 simultaneous executions
})
```

**Graceful shutdown pattern:**
```typescript
// In SIGTERM/SIGINT handler:
await worker.close()   // Waits for active jobs to finish
await queue.close()    // Closes queue connection
// Then close Redis, DB, etc.
```

### Rate Limiting Design

**Redis sliding window algorithm** — per architecture spec. Key pattern: `rate:execution:{uid}`

```typescript
// Pseudocode for sliding window using sorted sets — two-phase approach
const key = `rate:execution:${uid}`
const now = Date.now()
const windowStart = now - windowMs

// Phase 1: Clean expired entries and check count
const checkPipeline = redis.pipeline()
checkPipeline.zremrangebyscore(key, 0, windowStart)  // Remove old entries
checkPipeline.zcard(key)                               // Count current window
const checkResults = await checkPipeline.exec()

// checkResults[1] is [err, count] from zcard
const countResult = checkResults?.[1]?.[1]
const count = typeof countResult === 'number' ? countResult : 0

if (count >= maxRequests) {
  // Over limit — find oldest entry to calculate retry-after
  const oldest = await redis.zrange(key, 0, 0, 'WITHSCORES')
  const retryAfterMs = oldest.length >= 2 ? Number(oldest[1]) + windowMs - now : windowMs
  return { allowed: false, remaining: 0, retryAfterMs }
}

// Phase 2: Allowed — add entry and set TTL
const addPipeline = redis.pipeline()
addPipeline.zadd(key, now, `${now}:${crypto.randomUUID()}`)  // Unique member
addPipeline.expire(key, Math.ceil(windowMs / 1000))           // Auto-cleanup
await addPipeline.exec()

return { allowed: true, remaining: maxRequests - count - 1, retryAfterMs: 0 }
```

**Note:** Two-phase pipeline avoids the add-then-check-then-remove antipattern. Small race window between check and add is acceptable at MVP scale (10 req/min/user).

**Configuration:** 10 requests per 60,000ms (1 minute) per user.

**Response on rate limit:**
```
HTTP 429
Retry-After: {seconds}
{ "error": { "code": "RATE_LIMITED", "message": "Too many submissions. Try again in {n} seconds." } }
```

**Injectable for testability:** `RateLimiter` accepts Redis instance via constructor.

### Redis Pub/Sub Event Publishing

**Architecture pattern (ARCH-6, ARCH-10):**
- **Channel:** `execution:{submissionId}` — live event stream, Story 3.4's SSE endpoint subscribes
- **List:** `execution:{submissionId}:log` — ordered event log for SSE reconnect replay (Story 3.4)
- **TTL:** 5 minutes after job completion — set via `redis.expire()`

**Event format:** JSON-serialized `ExecutionEvent` from `@mycscompanion/execution`. Each event is:
1. Published to the Redis channel (for live SSE subscribers in Story 3.4)
2. Appended to the Redis list (for replay on reconnect)

```typescript
async function publish(submissionId: string, event: ExecutionEvent): Promise<void> {
  const payload = JSON.stringify(event)
  await Promise.all([
    redis.publish(`execution:${submissionId}`, payload),
    redis.rpush(`execution:${submissionId}:log`, payload),
  ])
}
```

**Two Redis clients for pub/sub:** The subscriber blocks the connection, so Story 3.4's API will need a dedicated subscriber connection. For Story 3.3, the worker only publishes (non-blocking) — the standard Redis connection works fine.

### Fly Machine Output Capture Strategy

**CRITICAL architectural context:** The `executeCode` orchestrator from Story 3.2 yields lifecycle events only (queued, output, complete, error, timeout). It does NOT capture machine stdout/stderr. Story 3.3's worker is responsible for capturing actual Go compiler and runtime output.

**Why the worker should NOT use `executeCode` directly:**
1. `executeCode` destroys the machine in its `finally` block, preventing post-execution log retrieval
2. The worker needs more lifecycle control for output capture (polling or post-execution log fetch)
3. The worker has different error handling needs (BullMQ retry semantics, Sentry alerts)

**The worker SHOULD use directly:**
- `FlyClient` — for all Fly Machine API calls (create, wait, get, stop, destroy)
- `buildMachineRequest` — for constructing the machine request with code injection
- `ExecutionEvent` types — for publishing well-typed events to Redis

**Recommended approach: Fly Logs REST API**

Fly.io captures machine stdout/stderr and makes them available via a logs REST API:

```
GET https://api.fly.io/api/v1/apps/{app_name}/logs?instance={machine_id}
Authorization: Bearer {MCC_FLY_API_TOKEN}
```

- **Base URL:** `https://api.fly.io` (**NOT** `api.machines.dev` — different service)
- **Returns:** Newline-delimited JSON log entries with timestamp, message, level
- **Instance filtering:** `instance={machine_id}` parameter — reported as "sometimes flaky" in Fly docs
- **Auth:** Same `MCC_FLY_API_TOKEN` bearer token as Machines API

**Implementation approach for the processor:**

```
1. Build request (buildMachineRequest)
2. Create machine (flyClient.createMachine) → capture machineId, instanceId
3. Wait for 'started' (flyClient.waitForState)
4. Wait for 'stopped' (flyClient.waitForState with instanceId + timeout)
5. Fetch logs via Fly Logs REST API (GET .../logs?instance={machineId})
6. Parse log entries → compile_output/compile_error/output events → publish each
7. Determine success/failure from exit analysis
8. Publish complete or error event
9. ALWAYS destroy in finally (flyClient.destroyMachine(id, true))
```

**For the Fly Logs API call**, create a simple standalone async function (NOT a method on FlyClient — different base URL, used only in worker):

```typescript
// In execution-processor.ts or a helper file
type FlyLogEntry = { timestamp: string; message: string; level: string }

async function fetchMachineLogs(
  appName: string,
  machineId: string,
  apiToken: string,
): Promise<string[]> {
  const url = `https://api.fly.io/api/v1/apps/${appName}/logs?instance=${machineId}`
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${apiToken}` },
  })
  if (!response.ok) return []  // Graceful fallback — report success/failure from exit status only
  const text = await response.text()
  // Fly Logs API returns newline-delimited JSON (NDJSON)
  return text.trim().split('\n').filter(Boolean).flatMap((line) => {
    try {
      const entry: unknown = JSON.parse(line)
      if (typeof entry === 'object' && entry !== null && 'message' in entry) {
        return [(entry as FlyLogEntry).message]
      }
      return []
    } catch {
      return [line]  // Fallback: treat as raw text
    }
  })
}
```

**Note:** The `as FlyLogEntry` cast here is acceptable — it's at an external API boundary after runtime type checking (`typeof` + `in` guard). This is the same pattern as `FlyClient.handleJsonResponse`.

**Exit code extraction — `FlyMachineResponse` type is incomplete:**
The current `FlyMachineResponse` in `packages/execution/src/fly-api-types.ts` does NOT have an `exit_code` or `exit_event` field. The real Fly API returns these on stopped machines. Two options:
1. **Preferred for this story:** After machine stops, call `flyClient.getMachine(machineId)` and extract exit info from the raw response using type narrowing (the response includes `events` array — look for event with `type: 'exit'`). Avoid modifying `fly-api-types.ts` unless you also add a test.
2. **Alternative:** Extend `FlyMachineEvent` in `fly-api-types.ts` with optional `exit_code?: number` field and update tests.

Either approach works — pick the one that's least disruptive. If neither yields exit code reliably, fall back to log-based analysis only.

**Go compiler output parsing heuristic:**
- Go compile errors have recognizable patterns: `./main.go:N:M: ...` or `# command-line-arguments`
- If machine exit code is available and != 0 AND output contains Go error patterns → compilation failed → yield as `compile_error`
- If exit code == 0 (or output contains no error patterns) → compilation + execution succeeded → yield as `output` + `complete`
- If exit code != 0 but no Go error patterns → runtime panic/error → yield as `error` with `isUserError: true`
- If exit code is unavailable (API didn't return it) → determine success/failure from log content patterns only

**Fallback if Fly Logs API is unreliable or returns empty:** Report success/failure based on machine exit status from `getMachine()` response. The user sees "Compilation failed" or "Execution completed" without detailed output text. Log the issue and note as a known limitation for enhancement.

**Performance note (NFR-P1):** The <5s compilation round-trip target includes network latency to Fly Logs API. This should be validated in Story 3.4's integration test.

### Previous Story Intelligence (Stories 3.1 + 3.2)

**Established patterns from Story 3.2:**
- `FlyClient` is stateless and concurrency-safe — safe to share across concurrent processor invocations (NFR-P11)
- `buildMachineRequest(config, code, { submissionId, milestoneId })` validates code size (64 KB limit), encodes as base64, sets all security constraints
- `FlyApiError.isRetryable` = true for 429/503 only (not all 5xx). Use for BullMQ retry decisions: if `isRetryable`, re-throw to trigger retry; otherwise mark as permanently failed
- `FlyApiError.retryAfter` — available when 429, contains Retry-After header value
- Canonical msw handlers in `@mycscompanion/config/test-utils/mock-fly-api.ts`: `setupFlyApiHandlers(server, options)` and `createMockFlyMachineResponse()` — use for Fly API tests
- `vi.stubEnv()` for env var tests, `vi.unstubAllEnvs()` + `vi.restoreAllMocks()` in afterEach
- Single shared msw server with `server.use()` for per-test overrides (avoid multiple `setupServer()` — causes "fetch already patched" error)
- Machine init command: `sh -c "ulimit -u 64 && go build -o main . 2>&1 && ./main 2>&1"` — combines stdout+stderr

**From Story 3.2 code review:**
- Never use `as` casts — use type narrowing, `satisfies`, or `instanceof` guards
- Exact value assertions (not `toBeDefined()`)
- `import type` for barrel imports to prevent circular deps

**From Story 3.1:**
- `DEFAULT_FLY_MACHINE_CONFIG` uses `as const satisfies FlyMachineConfig` pattern
- `getExecutionImageRef()` reads `MCC_EXECUTION_IMAGE` env var with fallback to registry URL
- Vitest infrastructure already set up in `packages/execution/`

**Existing test infrastructure in `apps/backend`:**
- `src/test/test-app.ts` — builds test Fastify app with injected deps
- `src/test/test-db.ts` — creates Kysely test instance with transaction rollback pattern
- `src/test/setup.ts` — global test setup
- Tests use `fastify.inject()` for route testing — NEVER supertest, NEVER real HTTP
- Firebase auth mocked via injected `TokenVerifier` in auth plugin options
- Account plugin tests demonstrate the full pattern: inject deps, create test app, use real DB

**Existing test utilities in `@mycscompanion/config/test-utils/`:**
- `createMockRedis` — mock Redis instance for unit tests
- `createTestQueryClient` — TanStack Query test client (frontend)
- `createMockFirebaseAuth` — mock Firebase token verifier
- `setupFlyApiHandlers` / `createMockFlyMachineResponse` — canonical Fly API msw handlers

### Git Intelligence

**Recent commit pattern:** `Implement Story X.Y: <title> with code review fixes`

**Files from recent stories follow these patterns:**
- Backend plugins: `apps/backend/src/plugins/<domain>/index.ts` with `routes/` and `services/` subdirs
- Route files: `<route-name>.ts` with `<route-name>.test.ts` co-located
- Shared utilities: `apps/backend/src/shared/<utility>.ts`
- Worker: `apps/backend/src/worker/worker.ts` (placeholder with Sentry + pino already wired)
- Migration files: `apps/backend/src/db/migrations/00N_<name>.ts`

**Key patterns from implemented stories:**
- All plugins accept injected dependencies via options (DB, Redis, etc.)
- Routes registered via `fastify.register(routePlugin, { deps })` pattern
- DB queries use Kysely builder, results converted via `toCamelCase()` for API responses
- JSON Schema validation at API boundary only (no internal validation)
- Error responses: `{ error: { code: 'UPPER_SNAKE', message: 'Human readable' } }`
- API response shape: direct object for success (no wrapper)
- HTTP 202 for accepted async operations is NOT yet established — this story introduces it

### Testing Strategy

**Route tests (`submit.test.ts`):**
- Use `fastify.inject()` — never supertest
- Real PostgreSQL in test transaction (rolled back in afterEach) — follow `account.test.ts` pattern
- Mock BullMQ queue (`.add()` → spy via injected dependency)
- Mock event publisher (`.publish()` → spy to verify `queued` event published)
- Mock rate limiter for controlled testing (inject mock that returns `{ allowed: true/false }`)
- Tests: happy path (202 + DB row + job enqueued + queued event published), rate limit (429 + Retry-After header), validation errors (400: missing milestoneId, missing code, code too large), DB failure (500), queue failure (503)

**Processor tests (`execution-processor.test.ts`):**
- Use canonical msw handlers from `@mycscompanion/config/test-utils/mock-fly-api`
- Real PostgreSQL in test transaction for DB assertions
- Mock event publisher (spy on publish calls to verify event sequence)
- Tests: happy path (full lifecycle → DB status: queued→running→completed), timeout (DB status: failed), retryable Fly error (verify error is thrown for BullMQ retry), permanent failure (verify Sentry would be called), machine always destroyed in finally (verify destroyMachine called even on error)

**Rate limiter tests (`rate-limiter.test.ts`):**
- Use real Redis or `createMockRedis` depending on complexity
- Tests: allow first N requests, deny at limit, window expiry re-allows, concurrent access, TTL cleanup
- `vi.useFakeTimers()` for time-dependent assertions

**Event publisher tests (`event-publisher.test.ts`):**
- Use `createMockRedis` or spy on redis methods
- Verify publish to correct channel name (`execution:{submissionId}`)
- Verify rpush to correct list name (`execution:{submissionId}:log`)
- Verify JSON serialization matches `ExecutionEvent` shape
- Verify setLogTTL calls redis.expire

**Test syntax rules:**
- Always `it()`, never `test()`
- `describe` mirrors module structure
- Test names describe behavior: `it('should return 429 when submission rate limit is exceeded')`
- `afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs() })`
- No `any` type — use `Partial<T>`, `satisfies`, or canonical mock factories
- Co-located test files: `submit.test.ts` next to `submit.ts`

### File Structure

**Files to CREATE:**
```
apps/backend/src/
  db/migrations/
    004_add_submissions.ts                  # submissions table migration
  shared/
    queue.ts                                # BullMQ queue config, connection factory, job data type
    queue.test.ts                           # Queue config tests
    rate-limiter.ts                         # Redis sliding window rate limiter
    rate-limiter.test.ts                    # Rate limiter tests
    event-publisher.ts                      # Redis pub/sub + event log publisher
    event-publisher.test.ts                 # Event publisher tests
    execution-types.ts                      # ExecutionResult type for DB jsonb column
  plugins/execution/
    routes/
      submit.ts                             # POST /submit route handler
      submit.test.ts                        # Submit route tests (fastify.inject)
  worker/processors/
    execution-processor.ts                  # Fly Machine lifecycle + output capture + DB updates
    execution-processor.test.ts             # Processor tests with msw + real DB
```

**Files to MODIFY:**
```
apps/backend/package.json                   # Add bullmq dependency
apps/backend/src/worker/worker.ts           # Wire up BullMQ Worker + processor + graceful shutdown
apps/backend/src/plugins/execution/index.ts # Register submit route with deps
apps/backend/src/plugins/admin/index.ts     # Register execution queue with Bull Board
apps/backend/src/app.ts                     # Create queue + rate limiter, pass to execution plugin
pnpm-lock.yaml                              # Updated lock file
```

### Library/Framework Requirements

**npm dependencies to add:**
- `bullmq` (^5.70) — add to `apps/backend`: `pnpm --filter backend add bullmq`

**No other new dependencies needed.** Already present in backend:
- `ioredis` (^5.6.1) — Redis client
- `@bull-board/api` (^6.20.3) + `@bull-board/fastify` (^6.20.3) — Bull Board UI
- `@mycscompanion/execution` (workspace:*) — FlyClient, buildMachineRequest, ExecutionEvent types
- `@mycscompanion/shared` (workspace:*) — DB types, toCamelCase
- `@paralleldrive/cuid2` (^3.3.0) — ID generation (via shared/id.ts)
- `@sentry/node` (^10.40.0) — error tracking
- `kysely` (^0.28.11) — SQL query builder

**BullMQ connection requirement:** `maxRetriesPerRequest: null` on ioredis. Create separate connection — do NOT modify existing `shared/redis.ts`.

### What This Story Does NOT Include

- SSE streaming endpoint for execution results (Story 3.4 — subscribes to Redis pub/sub channels this story creates)
- Frontend workspace UI (Stories 3.5-3.8)
- Fine-grained Go output parsing into separate `compile_output`/`test_result` events — MVP captures raw output as string, enhancement in later stories
- Benchmark runner logic (Epic 7 — `benchmark_progress`, `benchmark_result` events unused)
- Test runner logic (Epic 4 — `test_output`, `test_result` events unused)
- Acceptance criteria evaluation, `criteria_results` population (Epic 4)
- Content CI integration (separate workflow, uses packages/execution directly)
- Database `milestone_id` FK constraint (added when milestones are populated in Epic 4)
- Per-user concurrency limiting (rate limiting is sufficient for MVP scale)

### Project Structure Notes

- Alignment with unified project structure: `apps/backend/src/plugins/execution/` and `apps/backend/src/worker/processors/`
- No new packages directory created (exactly 4: ui, shared, execution, config)
- No new Zustand stores
- Worker is same `apps/backend` codebase, different entry point — NOT a separate `apps/worker/`
- Shared utilities (queue, rate-limiter, event-publisher) live in `apps/backend/src/shared/` — NOT in `packages/*` (they depend on backend-specific infrastructure: ioredis, BullMQ, Fastify)
- BullMQ adapter for Bull Board: `import { BullMQAdapter } from '@bull-board/api/bullMQAdapter'` (subpath import from existing `@bull-board/api` package)
- The `processors/` directory under `worker/` is already created (exists as empty dir from scaffold)

### References

- [Source: _bmad-output/planning-artifacts/architecture.md — Code Execution Pipeline, Execution Flow]
- [Source: _bmad-output/planning-artifacts/architecture.md — Worker<->API Communication (Redis Pub/Sub + Event Log)]
- [Source: _bmad-output/planning-artifacts/architecture.md — Rate Limiting (Redis sliding window, 10/min/user)]
- [Source: _bmad-output/planning-artifacts/architecture.md — Fastify Plugin Architecture, Plugin Isolation]
- [Source: _bmad-output/planning-artifacts/architecture.md — BullMQ Jobs naming: `execution:run`]
- [Source: _bmad-output/planning-artifacts/architecture.md — Data Flow: Code Submission lifecycle]
- [Source: _bmad-output/planning-artifacts/architecture.md — Railway Service Topology: worker as separate service]
- [Source: _bmad-output/planning-artifacts/architecture.md — Core Schema Entities: submissions table]
- [Source: _bmad-output/planning-artifacts/architecture.md — Caching Strategy: execution event log 5-min TTL]
- [Source: _bmad-output/planning-artifacts/epics.md — Epic 3, Story 3.3 acceptance criteria]
- [Source: _bmad-output/project-context.md — Testing Rules, Anti-Patterns, Naming Conventions, Error Handling Two Paths]
- [Source: _bmad-output/implementation-artifacts/3-1-execution-environment-image-and-registry.md — Dockerfile, FlyMachineConfig, CI workflow]
- [Source: _bmad-output/implementation-artifacts/3-2-execution-package-and-fly-io-machine-integration.md — FlyClient, ExecutionEvent, buildMachineRequest, executeCode, canonical msw handlers, FlyApiError]
- [Source: Fly.io Logs API — https://fly.io/docs/monitoring/logs-api-options/]
- [Source: BullMQ Connections — https://docs.bullmq.io/guide/connections]
- [Source: BullMQ npm — https://www.npmjs.com/package/bullmq (v5.70.x)]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6 (claude-opus-4-6)

### Debug Log References

- BullMQ 5.x disallows colons in queue names — changed `execution:run` to `execution-run`
- Test file parallelism caused DB conflicts (account tests cleanup deleting submission FK targets) — fixed with `fileParallelism: false` in vitest.config.ts and `ON DELETE CASCADE` on submissions.user_id FK
- packages/execution/src/index.ts had missing `.js` extensions causing TypeScript type resolution failures downstream — fixed all internal imports

### Completion Notes List

- All 10 tasks completed successfully
- 82 backend tests passing (11 test files), 65 execution package tests passing
- Typecheck clean, backend lint clean
- BullMQ queue name: `execution-run` (not `execution:run` as spec'd — BullMQ constraint)
- Migration created at `apps/backend/migrations/004_add_submissions.ts` (not `src/db/migrations/` — project uses root migrations dir)
- Worker uses FlyClient + buildMachineRequest directly (not executeCode) per story design notes
- Fly Logs REST API output capture implemented via standalone `fetchMachineLogs()` in processor
- Also fixed pre-existing TypeScript issues in packages/execution (missing .js extensions in imports)

### Senior Developer Review (AI)

**Reviewer:** Claude Opus 4.6 — 2026-03-04

**Issues Found:** 8 High, 10 Medium, 6 Low — **18 HIGH+MEDIUM fixed automatically**

**Fixes Applied:**
1. Removed all prohibited `as` casts in production code (execution-processor.ts) — replaced with type guards, `in` narrowing, and narrow interfaces (`ExecutionJob`, `ExecutionQueueAdd`, `RateLimitChecker`)
2. Removed all `as unknown as` casts in test files (submit.test.ts, execution-processor.test.ts, event-publisher.test.ts) — replaced with narrow interfaces and properly typed mock factories
3. Replaced `Kysely<any>` with `Kysely<never>` in migration file
4. Fixed retryable errors leaving DB in `running` status — processor now resets to `queued` before re-throwing, worker `failed` handler updates permanently failed jobs to `failed`
5. Fixed rate limiter fail-open on Redis errors — now propagates pipeline errors instead of silently defaulting to count=0
6. Added `vi.restoreAllMocks()` to `afterEach` in queue.test.ts and rate-limiter.test.ts
7. Fixed `eventPublisher.publish` in submit route — now fire-and-forget to prevent 500 after successful submission
8. Added `WHERE status = 'queued'` guard on `running` update to prevent resurrection of failed submissions on retry
9. Reverted out-of-scope changes to `firebase.test.ts` and `NotReady.tsx`
10. Added error handlers to BullMQ connections in worker.ts and app.ts
11. Changed worker Redis error handler from silent swallow to logger.error
12. Added shutdown re-entry guard in worker.ts
13. Added safety TTL (600s) on event log Redis list to prevent unbounded growth
14. Fixed timing attack on admin password — uses `crypto.timingSafeEqual()`
15. Protected submit route queue failure DB update with try/catch
16. Added `AbortSignal.timeout(10_000)` to `fetchMachineLogs` fetch call
17. Added output truncation (`MAX_OUTPUT_BYTES = 65536`) before DB storage
18. Added `URL`+`encodeURIComponent` for Fly Logs API URL construction
19. Queue tests now use `REDIS_URL` env var with fallback and `try/finally` for cleanup

**Pre-existing Issues Not Fixed (out of scope):**
- 4 webapp lint errors in `firebase.test.ts` and `NotReady.tsx` (pre-existing, not Story 3.3)
- TOCTOU race in rate limiter (accepted for MVP per story spec — Lua script needed for atomic check-and-add)
- No test for user error path (compilation failure) — tracked as LOW, deferred

### File List

**Created:**
- `apps/backend/migrations/004_add_submissions.ts` — submissions table migration
- `apps/backend/src/shared/queue.ts` — BullMQ queue config, connection factory, job data type
- `apps/backend/src/shared/queue.test.ts` — queue config tests (3 tests)
- `apps/backend/src/shared/rate-limiter.ts` — Redis sliding window rate limiter
- `apps/backend/src/shared/rate-limiter.test.ts` — rate limiter tests (7 tests)
- `apps/backend/src/shared/event-publisher.ts` — Redis pub/sub + event log publisher
- `apps/backend/src/shared/event-publisher.test.ts` — event publisher tests (5 tests)
- `apps/backend/src/shared/execution-types.ts` — ExecutionResult type for DB jsonb column
- `apps/backend/src/plugins/execution/routes/submit.ts` — POST /submit route handler
- `apps/backend/src/plugins/execution/routes/submit.test.ts` — submit route tests (10 tests)
- `apps/backend/src/worker/processors/execution-processor.ts` — Fly Machine lifecycle + output capture
- `apps/backend/src/worker/processors/execution-processor.test.ts` — processor tests with msw + real DB (8 tests)

**Modified:**
- `apps/backend/src/worker/worker.ts` — rewritten with BullMQ Worker + processor + graceful shutdown
- `apps/backend/src/plugins/execution/index.ts` — registers submit routes with DI
- `apps/backend/src/plugins/admin/index.ts` — accepts executionQueue for Bull Board
- `apps/backend/src/app.ts` — creates queue, rate limiter, event publisher, wires to plugins
- `apps/backend/vitest.config.ts` — added `fileParallelism: false`
- `packages/shared/src/types/db.ts` — auto-generated (submissions type added)
- `packages/execution/src/index.ts` — fixed .js extensions in imports
- `packages/execution/src/execute.ts` — fixed .js extensions in imports
- `packages/execution/src/fly-client.ts` — fixed .js extension in import
- `packages/execution/src/fly-config.ts` — fixed .js extension in import
- `packages/execution/src/machine-request-builder.ts` — fixed .js extensions in imports
