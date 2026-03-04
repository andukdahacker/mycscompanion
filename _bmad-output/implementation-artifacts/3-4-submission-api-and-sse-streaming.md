# Story 3.4: Submission API & SSE Streaming

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **learner**,
I want to submit code and see compilation results stream in real-time,
so that I get immediate feedback without waiting for the full execution to complete.

## Acceptance Criteria

1. **Given** a learner submits code via `POST /api/execution/submit` (already implemented in Story 3.3), **When** the client opens an SSE connection to `GET /api/execution/:submissionId/stream`, **Then** the API returns an SSE stream that delivers `ExecutionEvent` messages as they occur
   - _The submit route (Story 3.3) returns `{ submissionId }` with HTTP 202. The client uses this ID to open the SSE stream. The SSE endpoint is a separate GET route._
2. **And** a Redis event log is created per submission with 5-minute TTL (ARCH-10)
   - _Already implemented by Story 3.3's `EventPublisher`. This story CONSUMES the event log — reads from `execution:{submissionId}:log` Redis list for replay on reconnect._
3. **And** SSE reconnection replays missed events via `Last-Event-ID` header (ARCH-6)
   - _On reconnect, read `Last-Event-ID` from request headers. Replay events from Redis list `execution:{submissionId}:log` starting after the given sequence ID. Then subscribe to live channel._
4. **And** SSE streams send a heartbeat every 30 seconds to keep the connection alive (ARCH-6)
   - _Heartbeat as SSE comment: `: heartbeat\n\n`. Keeps connection alive within Railway's 5-minute hard timeout without triggering client-side event handlers. Uses `setInterval` cleared on stream close. Note: `ExecutionEvent` includes a `heartbeat` type for type completeness, but the wire format uses an SSE comment._
5. **And** the API distinguishes user-code errors (compilation failures, runtime panics) from platform errors and surfaces each appropriately (FR24)
   - _User-code errors: SSE events with `type: 'compile_error'` or `type: 'error'` with `isUserError: true`. HTTP status is always 200 OK for SSE connections. Platform errors: HTTP 500/503 before stream opens, or `type: 'error'` with `isUserError: false` during streaming._
6. **And** compilation round-trip completes in <5 seconds for typical submissions (NFR-P1)
   - _Architecture requires this. Not directly controlled by this story (depends on Fly Machine provisioning from Story 3.3), but the SSE stream should add <100ms overhead. Integration test validates._
7. **And** an integration test validates that compilation round-trip for a simple Go program completes in <5 seconds (NFR-P1)
   - _E2E test: submit code via POST, open SSE stream, assert `complete` event received within 5 seconds. This test requires actual Fly.io access — marked as CI-skip, manual run only._
8. **And** >95% of compilable submissions complete without platform errors (NFR-R4)
   - _Not directly testable in unit tests. Sentry monitoring + operational SLA. Architecture compliance._
9. **And** the submission endpoint requires a valid Firebase Auth token (NFR-S6)
   - _Already enforced by the global auth `onRequest` hook (Story 2.1). The SSE stream endpoint inherits this protection — verified in tests._
10. **And** the SSE stream verifies submission ownership — the requesting user must be the submission owner _(Story-level security addition — not in epic ACs but essential to prevent cross-user data leakage)_
    - _Query `submissions` table, verify `request.uid === submission.user_id`. Return 403 if mismatch. Return 404 if submission doesn't exist._

## Tasks / Subtasks

- [x] Task 1: Create SSE stream route — `GET /api/execution/:submissionId/stream` (AC: #1, #3, #4, #5, #9, #10)
  - [x] 1.1 Create `apps/backend/src/plugins/execution/routes/stream.ts` — use `import type` for barrel imports from `@mycscompanion/execution`
  - [x] 1.2 Export `StreamRoutesOptions` interface:
    ```typescript
    export interface StreamRoutesOptions {
      readonly db?: Kysely<DB>  // Optional — falls back to defaultDb (matches existing plugin pattern)
      readonly redis: Redis     // Standard ioredis connection — will be duplicated for subscriber
    }
    ```
  - [x] 1.3 Route: `GET /:submissionId/stream` with params schema `{ submissionId: { type: 'string', minLength: 1 } }`
  - [x] 1.4 Ownership verification:
    - Query `submissions` table: `db.selectFrom('submissions').select(['user_id', 'status']).where('id', '=', submissionId).executeTakeFirst()`
    - If not found: return 404 `{ error: { code: 'NOT_FOUND', message: 'Submission not found' } }`
    - If `submission.user_id !== request.uid`: return 403 `{ error: { code: 'FORBIDDEN', message: 'Access denied' } }`
  - [x] 1.5 If submission status is `completed` or `failed` (terminal): replay ALL events from log and close — no live subscription needed
  - [x] 1.6 Set SSE headers on `reply.raw`:
    - `Content-Type: text/event-stream`
    - `Cache-Control: no-cache`
    - `Connection: keep-alive`
    - `X-Accel-Buffering: no` (prevents reverse proxy buffering — standard header for SSE)
  - [x] 1.7 Disable socket idle timeout: `request.raw.socket.setTimeout(0)` — prevents Node.js from killing the long-lived SSE connection. Note: architecture/project-context reference `connectionTimeout` which is Fastify server-level config (not per-route). The correct per-route approach is `socket.setTimeout(0)` on the raw TCP socket
  - [x] 1.8 Implement the REFINED replay-then-subscribe pattern with double LRANGE (see Dev Notes "Replay-Then-Subscribe Pattern" — refined algorithm). This eliminates the race window between replay and subscribe
  - [x] 1.9 SSE event format per event:
    ```
    id: {sequenceId or submissionId for queued event}
    event: {event.type}
    data: {JSON.stringify(event)}

    ```
  - [x] 1.10 Heartbeat: `setInterval` every 30 seconds sending `: heartbeat\n\n` (SSE comment — not dispatched as event by EventSource, keeps connection alive without triggering client handlers). Clear interval on stream close
  - [x] 1.11 Terminal event detection: close stream after receiving any of `complete`, `error` (regardless of `isUserError`), or `timeout`. The worker guarantees these are the final event for any execution — no further events follow
  - [x] 1.12 Client disconnect handling: listen for `request.raw.on('close', ...)` to clean up subscriber connection and heartbeat interval
  - [x] 1.13 Write stream error handling: listen for `reply.raw.on('error', ...)` — log error, clean up subscriber and heartbeat (same as disconnect path). Prevents crash on broken pipe
  - [x] 1.14 Maximum stream duration: 5 minutes hard cap (matches Railway SSE timeout) — close stream and let client auto-reconnect via `EventSource`

- [x] Task 2: Implement Redis subscriber lifecycle (AC: #1, #3)
  - [x] 2.1 Create subscriber connection: `redis.duplicate()` — creates a new ioredis instance with same config for subscriber mode
  - [x] 2.2 On stream open: `subscriber.subscribe(`execution:${submissionId}`)` — enters subscriber mode
  - [x] 2.3 On message: `subscriber.on('message', (channel, message) => { ... })` — parse JSON, write SSE event to `reply.raw`
  - [x] 2.4 On stream close: `subscriber.unsubscribe()` then `subscriber.quit()` — clean up subscriber connection
  - [x] 2.5 Error handling on subscriber: `subscriber.on('error', ...)` — log error, close stream gracefully
  - [x] 2.6 Ensure subscriber cleanup happens in ALL paths: normal close, client disconnect, write error, timeout. Use a shared `cleanup()` function called once (guard with `isClosed` flag to prevent double-cleanup)

- [x] Task 3: Implement Last-Event-ID reconnection replay with double LRANGE (AC: #3)
  - [x] 3.1 Read `Last-Event-ID` from request headers (case-insensitive): `request.headers['last-event-id']`
  - [x] 3.2 If `Last-Event-ID` present: parse as number (it's the `sequenceId`)
  - [x] 3.3 **FIRST LRANGE:** `redis.lrange(`execution:${submissionId}:log`, 0, -1)` — initial replay
  - [x] 3.4 Parse each log entry as JSON `ExecutionEvent`
  - [x] 3.5 Filter: skip events where `sequenceId <= lastEventId` (already seen by client)
  - [x] 3.6 Special case: `queued` event has no `sequenceId` — always replay on fresh connect (no Last-Event-ID), skip on reconnect
  - [x] 3.7 Write replayed events to SSE stream, track `highestSequenceId` seen
  - [x] 3.8 **SUBSCRIBE** to Redis channel `execution:{submissionId}` (via duplicated subscriber from Task 2)
  - [x] 3.9 **SECOND LRANGE:** `redis.lrange(...)` again — replay any events with `sequenceId > highestSequenceId` that arrived between first LRANGE and SUBSCRIBE. This eliminates the race window
  - [x] 3.10 Process live events from subscription: if `sequenceId <= highestSequenceId`, skip (duplicate). Otherwise write to stream and update `highestSequenceId`

- [x] Task 4: Register stream route in execution plugin (AC: #1)
  - [x] 4.1 Update `apps/backend/src/plugins/execution/index.ts`:
    - Import `streamRoutes` from `./routes/stream.js`
    - Add `redis: Redis` to `ExecutionPluginOptions` interface
    - Register: `await fastify.register(streamRoutes, { db, redis: opts.redis })`
    - Remove the placeholder comment for Story 3.4
  - [x] 4.2 Update `apps/backend/src/app.ts`:
    - Pass `redis` to execution plugin options: `redis` (the existing singleton from `shared/redis.ts`)
    - Note: during `fastify.close()`, active SSE connections receive `close` events on `request.raw`, which triggers per-request subscriber cleanup (Task 1.12). No additional shutdown logic needed

- [x] Task 5: Create comprehensive tests for stream route (AC: #1, #3, #4, #5, #9, #10)
  - [x] 5.1 Create `apps/backend/src/plugins/execution/routes/stream.test.ts`
  - [x] 5.2 Test infrastructure: Create a `MockRedisSubscriber` that simulates ioredis subscriber behavior:
    - `subscribe(channel)` — tracks subscribed channels, returns Promise
    - `on('message', handler)` — stores handler, can be triggered manually in tests via `triggerMessage(channel, data)`
    - `unsubscribe()` / `quit()` — cleanup tracking with `vi.fn()`
    - Mock the main `redis` object's `duplicate()` to return this mock subscriber
    - Mock `redis.lrange()` to return seeded event log entries
  - [x] 5.3 Test cases:
    - **Happy path — replay + terminal**: Seed submission (status: `running`) + event log in Redis list. Mock subscriber to emit a `complete` event immediately after subscribe. Open SSE stream via `fastify.inject()` — stream closes after terminal event, `inject()` returns complete response. Parse SSE text, verify replay events + live `complete` event received
    - **Ownership verification — 403**: Seed submission with different `user_id`, open stream, assert 403 JSON error
    - **Not found — 404**: Open stream with non-existent submissionId, assert 404 JSON error
    - **Last-Event-ID reconnection**: Seed event log with events sequenceId 1-5, open stream with `Last-Event-ID: 3` header, mock subscriber emits `complete` immediately, verify only events with `sequenceId > 3` are in the SSE response
    - **Terminal event closes stream**: Seed submission (status: `running`), mock subscriber emits `complete` event, verify `fastify.inject()` returns and response contains the `complete` event
    - **Already completed submission**: Seed submission with status `completed` and event log, open stream, verify all events replayed and stream closes immediately without calling `redis.duplicate()` (subscriber not created)
    - **Auth required**: Attempt stream without Bearer token, assert 401
    - **Deduplication**: Seed event log with sequenceId 1-3, mock second LRANGE to return sequenceId 1-4, mock subscriber emits sequenceId 3 then 5. Verify response contains each sequenceId exactly once
    - **Heartbeat**: Use `vi.useFakeTimers()`, seed running submission, advance time by 30s before mock subscriber emits terminal event. Verify `: heartbeat` comment appears in response
    - **Subscriber cleanup on terminal**: Verify `subscriber.unsubscribe()` and `subscriber.quit()` are called after terminal event
  - [x] 5.4 **Testing strategy for SSE with `fastify.inject()`:** `fastify.inject()` returns the complete response only after the handler calls `reply.raw.end()`. For live-stream tests, the mock subscriber must emit a terminal event (which triggers stream close) so `inject()` can complete. This means all tests that involve live subscription MUST include a terminal event trigger. Tests for "still-streaming" behavior (heartbeat, client disconnect) use `vi.useFakeTimers()` and schedule the terminal event after the assertion window
  - [x] 5.5 Use `vi.useFakeTimers()` for heartbeat tests, `vi.restoreAllMocks()` in `afterEach`

- [x] Task 6: Integration test — round-trip validation (AC: #6, #7)
  - [x] 6.1 Create `apps/backend/src/plugins/execution/routes/stream.integration.test.ts`
  - [x] 6.2 Mark with `describe.skipIf(!process.env['MCC_FLY_API_TOKEN'])` — only runs when Fly credentials are available
  - [x] 6.3 Auth strategy: use `createMockFirebaseAuth` from test-utils (same as unit tests) — mock auth is sufficient since the integration test validates the execution pipeline, not the auth flow
  - [x] 6.4 Test: POST `/api/execution/submit` with valid Go code (`package main\nimport "fmt"\nfunc main() { fmt.Println("hello") }`), open SSE stream, assert `complete` event received within 5000ms timeout
  - [x] 6.5 This requires real Redis, real DB, real Fly.io — CI-skip, manual run

- [x] Task 7: Verify all tests pass and update sprint status
  - [x] 7.1 Run all backend tests: `pnpm --filter backend test`
  - [x] 7.2 Run typecheck: `pnpm typecheck`
  - [x] 7.3 Run lint: `pnpm lint`
  - [x] 7.4 Run full pipeline: `turbo lint && turbo typecheck && turbo test`

## Dev Notes

### Architecture Compliance

**Route:** `GET /api/execution/:submissionId/stream` — registered under the existing execution plugin prefix `/api/execution`.

**SSE approach:** `reply.raw` with manual SSE formatting. The architecture spec references `fastify-sse-v2`, but that library is NOT installed in this story because:
1. We need fine-grained control over when events are written (replay vs live vs heartbeat)
2. We need to manage the Redis subscriber lifecycle tied to the response lifecycle
3. The heartbeat pattern requires `setInterval` which doesn't fit cleanly into an async generator
4. Error handling needs to distinguish between subscriber errors and stream errors
5. YAGNI — Epic 6 (tutor SSE) can evaluate and install `fastify-sse-v2` when needed

This matches the project-context.md guidance: "Only use `reply.raw` for SSE streaming."

**Plugin isolation:** Stream route imports from `shared/` and `packages/*` only — never cross-plugin.

**Auth:** Inherits global `onRequest` hook from auth plugin. `request.uid` available in route handler.

**Response shape:** SSE stream (text/event-stream), not JSON. Error responses before stream opens use standard `{ error: { code, message } }` format.

**Naming conventions:**
- Route path: `GET /api/execution/:submissionId/stream` (kebab-case, param camelCase)
- SSE event types: `snake_case` matching `ExecutionEvent.type` (compile_output, compile_error, etc.)
- Redis channels: `execution:{submissionId}` (per ARCH-6)
- Redis event log: `execution:{submissionId}:log` (per ARCH-10)

### SSE Stream Implementation — Replay-Then-Subscribe Pattern

This is the core algorithm for the stream route. It handles both fresh connections and reconnections:

```
1. Validate ownership (query DB)
2. Check submission status — if terminal (completed/failed):
     a. LRANGE execution:{submissionId}:log 0 -1
     b. Replay all events as SSE
     c. Close stream — done
3. If NOT terminal:
     a. Read Last-Event-ID from headers (default: -1 for fresh connection)
     b. LRANGE execution:{submissionId}:log 0 -1 — get replay buffer
     c. Parse events, filter by sequenceId > lastEventId
     d. Write replay events to SSE stream
     e. Track highestSequenceId from replay
     f. Create subscriber: redis.duplicate()
     g. subscriber.subscribe(`execution:{submissionId}`)
     h. subscriber.on('message', (channel, msg) => {
          - Parse event
          - If event.sequenceId <= highestSequenceId: skip (duplicate)
          - Write event to SSE stream
          - Update highestSequenceId
          - If terminal event (complete/error/timeout): schedule stream close
        })
     i. Start heartbeat interval (30s)
     j. On request close: cleanup subscriber + heartbeat
```

**Race condition mitigation:** Between steps (b) and (g), the worker might publish events. These events land in both the Redis list AND the pub/sub channel. The deduplication logic (check sequenceId > highestSeen) ensures no duplicates. Events published between replay-read and subscribe-start are captured because they're in the list (replayed) AND in the channel (deduplicated).

**Edge case — missed window:** If an event is published AFTER the LRANGE but BEFORE the subscribe, it's still in the Redis list. The subscriber won't see it via pub/sub. Solution: after subscribing, do a SECOND LRANGE and replay any events with sequenceId > highestSeen. This eliminates the race window entirely.

```
REFINED ALGORITHM:
1. LRANGE (first read) → replay events after Last-Event-ID → track highestSeen
2. SUBSCRIBE to channel
3. LRANGE (second read) → replay any new events with sequenceId > highestSeen
4. Process live events from subscription (dedup by sequenceId)
```

### SSE Event Formatting

```typescript
function formatSSEEvent(event: ExecutionEvent): string {
  // sequenceId as the SSE event ID (for Last-Event-ID on reconnect)
  const id = 'sequenceId' in event ? event.sequenceId : ''
  const type = event.type
  const data = JSON.stringify(event)
  return `id: ${id}\nevent: ${type}\ndata: ${data}\n\n`
}

function formatHeartbeat(): string {
  return `: heartbeat\n\n`  // SSE comment — not dispatched as event by EventSource
}
```

### Redis Subscriber Connection Management

**CRITICAL:** ioredis enters "subscriber mode" when `subscribe()` is called. A connection in subscriber mode cannot execute regular commands (GET, SET, LRANGE, etc.). Therefore:

- Use the existing `redis` singleton for LRANGE (replay reads) — this is a regular command
- Create a NEW connection via `redis.duplicate()` for SUBSCRIBE — this enters subscriber mode
- The duplicated connection inherits all configuration from the original (URL, TLS, etc.)
- ALWAYS clean up: `subscriber.unsubscribe()` then `subscriber.quit()` in ALL exit paths

**Connection per request:** Each SSE connection creates one subscriber. At MVP scale (100 concurrent users), this means up to 100 Redis subscriber connections. ioredis handles this efficiently. Redis supports up to 10,000 connections by default.

### Fastify SSE Route Configuration

```typescript
fastify.get<{ Params: { submissionId: string } }>(
  '/:submissionId/stream',
  {
    schema: {
      params: {
        type: 'object',
        required: ['submissionId'],
        properties: {
          submissionId: { type: 'string', minLength: 1 },
        },
      },
    },
  },
  async (request, reply) => {
    // Disable socket idle timeout for SSE (architecture says "connectionTimeout: 0" but
    // that's a Fastify server-level config, not per-route. socket.setTimeout(0) is the
    // correct per-route approach to prevent Node.js from killing long-lived SSE connections)
    request.raw.socket.setTimeout(0)

    // Set SSE headers
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    })

    // ... stream logic using reply.raw.write() ...
    // DO NOT call reply.send() — reply.raw owns the response
  }
)
```

**Important:** After calling `reply.raw.writeHead()`, do NOT use Fastify's `reply.send()` — it will cause a "headers already sent" error. Use `reply.raw.write()` for SSE events and `reply.raw.end()` to close.

**`import type` reminder:** Use `import type { ExecutionEvent } from '@mycscompanion/execution'` for barrel imports (prevents circular dependency issues per Story 3.2/3.3 code review).

### Error Handling — Two Paths

**Before stream opens (HTTP errors):**
- 401 Unauthorized — missing/invalid Firebase token (auth hook)
- 403 Forbidden — submission belongs to different user
- 404 Not Found — submission doesn't exist
- 500 Internal Error — DB query failure

**After stream opens (SSE events):**
- User-code errors: `{ type: 'compile_error', ... }` or `{ type: 'error', isUserError: true, ... }` — part of normal event flow, displayed in terminal
- Platform errors: `{ type: 'error', isUserError: false, ... }` — indicates infrastructure failure
- Redis subscriber error: close stream, client auto-reconnects via EventSource

**User-code errors never trigger Sentry. Platform errors go to Sentry (handled by worker in Story 3.3).**

### Previous Story Intelligence (Story 3.3)

**Directly relevant patterns:**

1. **EventPublisher dual-write** (`shared/event-publisher.ts`): Publishes to both Redis channel AND Redis list. The SSE stream route reads from the list (replay) and subscribes to the channel (live). This is the exact pattern designed for Story 3.4.

2. **Submit route returns `{ submissionId }` with HTTP 202**: The client uses this `submissionId` to open the SSE stream at `GET /api/execution/:submissionId/stream`.

3. **`queued` event published by submit route**: Fire-and-forget in `submit.ts`. This is the FIRST event in the Redis list. It has no `sequenceId` — handle specially in replay logic.

4. **Execution processor publishes events with sequenceId**: Starting from 1, incrementing. The `queued` event from submit route has no sequenceId. All subsequent events (output, compile_error, complete, error, timeout) have sequenceId.

5. **Terminal events**: `complete`, `error`, `timeout` — the processor publishes one of these as the final event. The SSE stream should close after delivering a terminal event.

6. **Event log TTL**: 5 minutes (300 seconds) set by the processor after job completion, with a safety TTL of 600 seconds set on every publish. After TTL expires, the Redis list is gone — late reconnects will get empty replay.

7. **Dependency injection pattern**: `ExecutionPluginOptions` interface with all deps injectable. Follow same pattern — add `redis: Redis` for the subscriber connection factory.

8. **Code review fixes from 3.3**: No `as` casts — use type guards. Exact value assertions in tests. `import type` for barrel imports. Fire-and-forget with `.catch()` for non-critical publishes.

**Debug learnings from 3.3:**
- BullMQ disallows colons in queue names — actual queue name is `execution-run` (not `execution:run` as architecture spec'd)
- `fileParallelism: false` in vitest.config.ts prevents DB conflicts between test files
- `.js` extensions required in all internal imports (ESM)

### Git Intelligence

**Recent commit pattern:** `Implement Story X.Y: <title> with code review fixes`

**Files from Story 3.3:**
- Routes: `apps/backend/src/plugins/execution/routes/submit.ts` + `submit.test.ts`
- Shared: `apps/backend/src/shared/event-publisher.ts`, `queue.ts`, `rate-limiter.ts`
- Plugin: `apps/backend/src/plugins/execution/index.ts` — has placeholder comment for this story
- App wiring: `apps/backend/src/app.ts` — creates infrastructure, passes to plugins

**Code patterns established:**
- Narrow interface types for injected deps (e.g., `ExecutionQueueAdd` not full `Queue`)
- Mock factories for each dependency (e.g., `createMockEventPublisher()`)
- `seedUser()` for FK constraints in route tests
- `afterEach` cleanup: delete test rows, restore mocks
- JSON Schema validation at route boundary

### Latest Technical Information

**`fastify-sse-v2` (v4.2.1):**
- Latest stable on npm. Provides `reply.sse()` method for async iterable-based SSE
- NOT installed in this story — `reply.raw` gives more control for the replay-then-subscribe pattern
- Evaluate for Epic 6 (tutor SSE) which has simpler streaming requirements

**ioredis `duplicate()` pattern:**
- Creates a new Redis instance with identical configuration
- Standard pattern for pub/sub — one connection for commands, one for subscriber mode
- ioredis v5.x (current) — fully TypeScript, `.duplicate()` returns `Redis` type

**SSE browser API (`EventSource`):**
- Sends `Last-Event-ID` header on reconnection automatically
- Auto-reconnects on connection close (unless `.close()` called explicitly)
- Railway 5-minute hard timeout: EventSource auto-reconnects transparently

### Project Structure Notes

- Alignment with unified project structure: route at `apps/backend/src/plugins/execution/routes/stream.ts`
- No new packages directory created (exactly 4: ui, shared, execution, config)
- No new Zustand stores
- No new shared packages — stream route lives in the execution plugin
- Test co-located: `stream.test.ts` next to `stream.ts`
- Integration test in same directory: `stream.integration.test.ts`

### References

- [Source: _bmad-output/planning-artifacts/architecture.md — API & Communication Patterns, SSE Streaming]
- [Source: _bmad-output/planning-artifacts/architecture.md — Worker<->API Communication (Redis Pub/Sub + Event Log)]
- [Source: _bmad-output/planning-artifacts/architecture.md — SSE Client Pattern (useSSE)]
- [Source: _bmad-output/planning-artifacts/architecture.md — Code Execution Pipeline, Execution Flow]
- [Source: _bmad-output/planning-artifacts/architecture.md — Fastify Plugin Architecture, Plugin Isolation]
- [Source: _bmad-output/planning-artifacts/architecture.md — Error Classification (Two-Path)]
- [Source: _bmad-output/planning-artifacts/architecture.md — Railway SSE Constraint: 5-min timeout]
- [Source: _bmad-output/planning-artifacts/epics.md — Epic 3, Story 3.4 acceptance criteria]
- [Source: _bmad-output/project-context.md — SSE Routes: connectionTimeout override, 30s heartbeat]
- [Source: _bmad-output/project-context.md — Error Handling Two Paths, Testing Rules, Anti-Patterns]
- [Source: _bmad-output/implementation-artifacts/3-3-submission-queue-and-worker-process.md — EventPublisher, submit route, execution processor patterns]
- [Source: packages/execution/src/events.ts — ExecutionEvent discriminated union, ExecutionPhase]
- [Source: apps/backend/src/shared/event-publisher.ts — dual-write pub/sub + list pattern]
- [Source: apps/backend/src/plugins/execution/index.ts — Story 3.4 placeholder comment]
- [Source: apps/backend/src/shared/redis.ts — singleton Redis connection]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6 (claude-opus-4-6)

### Debug Log References

- socket.setTimeout guard: In inject (test) mode, `request.raw.socket` may lack `setTimeout`. Added optional chaining guard to prevent crash during tests while preserving production behavior.
- Heartbeat test strategy: `vi.useFakeTimers()` interferes with `fastify.inject()` async flow. Made heartbeat interval configurable via `StreamRoutesOptions.heartbeatIntervalMs` to test with short real-time intervals instead.

### Completion Notes List

- Implemented SSE stream route at `GET /api/execution/:submissionId/stream` with full replay-then-subscribe pattern using double LRANGE to eliminate race conditions
- Ownership verification: 404 for missing submission, 403 for wrong user
- Terminal submission optimization: completed/failed submissions replay from Redis list and close immediately without creating subscriber
- Redis subscriber lifecycle: duplicate() for subscriber mode, shared cleanup() with isClosed guard for all exit paths (terminal event, client disconnect, write error, max duration)
- Last-Event-ID reconnection: filters events by sequenceId, skips queued event on reconnect, deduplicates across replay and live subscription
- SSE format: id/event/data fields per event, heartbeat as SSE comment (`: heartbeat\n\n`)
- 12 unit tests covering: completed/failed replay, 403/404/401, reconnection, terminal events (complete/error/timeout), deduplication, heartbeat, subscriber cleanup, max stream duration
- 1 integration test (CI-skip, requires MCC_FLY_API_TOKEN + real infra)
- All 94 backend tests pass, typecheck clean, lint clean

### File List

- apps/backend/src/plugins/execution/routes/stream.ts (new)
- apps/backend/src/plugins/execution/routes/stream.test.ts (new)
- apps/backend/src/plugins/execution/routes/stream.integration.test.ts (new)
- apps/backend/src/plugins/execution/index.ts (modified — added redis to options, registered streamRoutes)
- apps/backend/src/app.ts (modified — pass redis to execution plugin)

### Change Log

- 2026-03-04: Implemented Story 3.4 — SSE stream route with replay-then-subscribe pattern, ownership verification, heartbeat, reconnection support, and comprehensive tests
- 2026-03-04: Code review fixes — Added tryParseEvent with try/catch to prevent JSON.parse crash in subscriber callback (H1), wrapped post-writeHead Redis operations in try/catch for graceful error handling (H2), fixed NaN propagation from malformed Last-Event-ID (M1), replaced unsafe `as` casts with validated parsing (M2), added max stream duration timeout test (M3), added backpressure warning in writeEvent (M4), omitted empty SSE id field for events without sequenceId (L2)
