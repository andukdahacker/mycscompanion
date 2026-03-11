# Story 6.6: Graceful Degradation & Availability

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a learner,
I want the core learning loop to work even if the AI tutor is unavailable,
so that I can keep building my database regardless of tutor status.

## Acceptance Criteria

1. Given the AI tutor service is unavailable (Anthropic API down, rate limit exceeded, or network issue), when a learner attempts to use the tutor or stuck detection triggers, then the core learning loop (edit → submit → evaluate criteria) continues to function fully without the tutor (NFR-R8)
2. Given the tutor service is unavailable, when the learner views the tutor panel, then a non-intrusive notice indicates temporary unavailability — no error modals, no blocking UI
3. Given the tutor service is unavailable, when stuck detection would normally trigger, then stuck detection pauses its proactive intervention behavior
4. Given the tutor is instrumented, when any tutor request is made, then the request outcome (success/failure) is logged with metrics tracking uptime percentage (NFR-R7, target >95%)
5. Given the tutor becomes available again after an outage, when the learner next interacts, then the panel automatically recovers without requiring a page refresh
6. Given a tutor error occurs, when the error is captured, then it is reported to Sentry with context (model used, request size, error type) — user-code errors never trigger Sentry
7. Given repeated Anthropic API failures, when the circuit breaker opens, then subsequent requests fail fast without waiting for timeout, and the circuit half-opens after a cooldown period to test recovery

## Tasks / Subtasks

- [x] Task 1: Implement circuit breaker for Anthropic API calls (AC: #1, #7)
  - [x] 1.1 Create `circuit-breaker.ts` in `apps/backend/src/plugins/tutor/services/` — generic circuit breaker with states: CLOSED (normal), OPEN (fail-fast), HALF_OPEN (test one request). Config: `failureThreshold` (default 3), `resetTimeoutMs` (default 30000), `halfOpenMaxAttempts` (default 1). Use simple in-memory state (single API server instance per Railway service). No external dependencies
  - [x] 1.2 Create `withCircuitBreaker(service: AnthropicService, cb: CircuitBreaker): AnthropicService` decorator function in `circuit-breaker.ts` — returns a new `AnthropicService` that checks circuit state before delegating. When OPEN, throw a typed `CircuitOpenError` with `retryAfterMs`. When HALF_OPEN, allow one test request through; success → CLOSED, failure → OPEN with extended reset timeout. Apply the decorator in `index.ts` after service creation (keeps `anthropic.ts` unchanged, follows existing DI composition pattern)
  - [x] 1.3 In `stream.ts` and `message.ts` route handlers, catch `CircuitOpenError` and return 503 with `{ error: { code: 'TUTOR_UNAVAILABLE', message: 'AI tutor temporarily unavailable', retryAfter: circuitBreaker.retryAfterSeconds() } }` and `Retry-After` header
  - [x] 1.4 Add request timeout to Anthropic SDK calls via `AbortController` with `signal` option — 30 second timeout for streaming initiation (TTFT), 120 second timeout for total stream duration. Timeout counts as a circuit breaker failure. Values configurable via `MCC_TUTOR_TTFT_TIMEOUT_MS` and `MCC_TUTOR_STREAM_TIMEOUT_MS` env vars (defaults: 30000, 120000)
  - [x] 1.5 Unit test: circuit breaker transitions CLOSED → OPEN after `failureThreshold` consecutive failures
  - [x] 1.6 Unit test: circuit breaker in OPEN state throws `CircuitOpenError` immediately without calling Anthropic
  - [x] 1.7 Unit test: circuit breaker transitions OPEN → HALF_OPEN after `resetTimeoutMs`
  - [x] 1.8 Unit test: circuit breaker HALF_OPEN → CLOSED on success, HALF_OPEN → OPEN on failure with extended reset timeout (exponential backoff: 30s → 60s → 120s, capped at 300s)
  - [x] 1.9 Unit test: request timeout triggers circuit breaker failure count
  - [x] 1.10 Unit test: `withCircuitBreaker` decorator delegates to underlying service when CLOSED and records success/failure
  - [x] 1.11 In `stream.ts` and `stuck-intervention.ts`, the `stream.on('error')` handler must also call `circuitBreaker.recordFailure()` — mid-stream Anthropic errors (not just connection-time errors) must count as circuit breaker failures. Pass `circuitBreaker` reference to the SSE event handler scope

- [x] Task 2: Instrument tutor availability metrics (AC: #4)
  - [x] 2.1 Create `tutor-metrics.ts` in `apps/backend/src/plugins/tutor/services/` — tracks tutor request outcomes in Redis. Uses Redis INCR on keys `tutor:metrics:requests:{YYYY-MM-DD}` and `tutor:metrics:failures:{YYYY-MM-DD}` with 7-day TTL. Provides `recordSuccess()`, `recordFailure(errorType)`, and `getAvailabilityRate(date?)` methods
  - [x] 2.2 Integrate metrics recording into route handlers (`stream.ts`, `message.ts`, `stuck-intervention.ts`) — call `recordSuccess()` on 200 response, `recordFailure(errorType)` on any error (503, timeout, circuit open)
  - [x] 2.3 Add `GET /api/tutor/health` route (auth required) returning `{ available: boolean, circuitState: string, availabilityRate: number, consecutiveFailures: number, retryAfterMs: number | null }`. This is NOT the server `/health` endpoint — it's tutor-specific operational info. Note: auth is required because the endpoint exposes internal state; the frontend recovery probe (Task 4.2) will always have a valid token since the user is actively in the workspace
  - [x] 2.4 Log tutor request outcomes at `info` level: `{ event: 'tutor_request', success: boolean, model: string, durationMs: number, errorType?: string }`. Never log conversation content (privacy rule)
  - [x] 2.5 Unit test: `recordSuccess` increments request counter
  - [x] 2.6 Unit test: `recordFailure` increments both request and failure counters
  - [x] 2.7 Unit test: `getAvailabilityRate` calculates correct percentage
  - [x] 2.8 Unit test: tutor health endpoint returns correct circuit breaker state

- [x] Task 3: Pause stuck detection during tutor unavailability (AC: #3)
  - [x] 3.1 In `use-stuck-intervention.ts`, check `tutorAvailable` from `useWorkspaceUIStore` before triggering stuck intervention — if `tutorAvailable === false`, skip the intervention request entirely. Do NOT reset the stuck timer; just suppress the API call so intervention fires immediately when tutor recovers
  - [x] 3.2 In `stuck-intervention.ts` backend route, if circuit breaker is OPEN, return 503 with `TUTOR_UNAVAILABLE` code (same pattern as message/stream routes) — this is the server-side guard in case frontend check is bypassed
  - [x] 3.3 Unit test: stuck intervention hook does not fire API call when `tutorAvailable` is false
  - [x] 3.4 Unit test: stuck intervention backend returns 503 when circuit breaker is OPEN

- [x] Task 4: Implement automatic recovery on frontend (AC: #5)
  - [x] 4.1 In `use-tutor-stream.ts`, add `setTutorAvailable(true)` call when a tutor request succeeds (receives `message_complete` event). This does NOT exist yet — the hook currently only calls `setTutorAvailable(false)` on `TUTOR_UNAVAILABLE` errors but never restores it on success. Add the call at the end of the `message_complete` handler (after DB persistence and screen reader announcement)
  - [x] 4.2 Add a recovery probe mechanism: when `tutorAvailable` is false, start a `setInterval` (every 30 seconds) that calls `GET /api/tutor/health`. On success with `available: true`, call `setTutorAvailable(true)` and clear the interval. Create this as `use-tutor-recovery.ts` hook in `apps/webapp/src/hooks/`
  - [x] 4.3 In `TutorPanel.tsx`, when showing unavailable state, display: "AI tutor temporarily unavailable. Retrying automatically..." with a subtle pulsing indicator. Keep existing retry button as manual override. When `tutorAvailable` transitions back to `true`, show brief "Tutor is back" toast/notice that auto-dismisses after 3 seconds
  - [x] 4.4 Wire `use-tutor-recovery.ts` into `TutorPanel.tsx` — start probe when panel mounts and `tutorAvailable` is false, cleanup on unmount
  - [x] 4.5 Unit test: recovery hook polls health endpoint when unavailable
  - [x] 4.6 Unit test: recovery hook sets tutorAvailable to true on successful health check
  - [x] 4.7 Unit test: recovery hook stops polling when tutorAvailable becomes true
  - [x] 4.8 Unit test: TutorPanel shows recovery message on availability transition

- [x] Task 5: Enhance Sentry error reporting with context (AC: #6)
  - [x] 5.1 In route handlers (`stream.ts`, `message.ts`, `stuck-intervention.ts`), enhance existing `Sentry.captureException(error, { extra: {...} })` calls with structured context: `{ model, promptTokenEstimate: systemPrompt.length, messageCount: messages.length, errorType: classifyError(error), circuitState }`. Follow existing inline `captureException` pattern — do NOT use `Sentry.withScope()` (not used elsewhere in the codebase)
  - [x] 5.2 Create `classifyError(error)` helper in `anthropic.ts` — maps Anthropic SDK errors to categories: `'rate_limit'` (429), `'overloaded'` (529), `'auth_error'` (401), `'timeout'`, `'network_error'`, `'api_error'` (other). These are platform errors (not user-code errors) so Sentry capture is appropriate
  - [x] 5.3 In route handlers, use `Sentry.captureException(error, { tags: { tutor_model: model, tutor_error_type: errorType }, extra: { requestSize, circuitState } })` — NOT `Sentry.captureMessage` (we want stack traces)
  - [x] 5.4 Ensure rate-limit errors from Anthropic (429) are logged at `warn` level (degraded state) not `error` — they're expected and transient. Only 500+ errors are `error` level
  - [x] 5.5 Unit test: Anthropic 429 errors are classified as `rate_limit`
  - [x] 5.6 Unit test: Anthropic 529 errors are classified as `overloaded`
  - [x] 5.7 Unit test: timeout errors are classified as `timeout`
  - [x] 5.8 Unit test: Sentry capture includes model and error type tags

- [x] Task 6: Verify core learning loop independence (AC: #1)
  - [x] 6.1 Create integration test file `apps/backend/src/plugins/tutor/routes/degradation.test.ts` — tests that verify workspace operations (submission creation, execution streaming, criteria evaluation, milestone completion) work when tutor plugin throws errors or circuit is OPEN. Use `fastify.inject()` to call workspace-related endpoints while tutor is degraded. Place in `routes/` directory (no `integration/` directory exists in tutor plugin — follow existing structure)
  - [x] 6.2 Extend existing `apps/webapp/src/components/workspace/WorkspaceLayout.test.tsx` — add a new `describe('graceful degradation')` block verifying that with `tutorAvailable: false`, the editor, submission, terminal, and criteria panels all render and function normally. TutorPanel shows unavailable state but doesn't block anything. File already exists with breakpoint tests, keyboard shortcuts, and component mocking — build on those patterns
  - [x] 6.3 Test that tutor SSE connection errors do NOT propagate to execution SSE connections — they are independent EventSource instances
  - [x] 6.4 Test that rate limit exhaustion on tutor endpoints does NOT affect submission/execution/curriculum endpoints — they use separate rate limit buckets. Note: app-level rate limiting (30 req/min per user) happens in route middleware BEFORE Anthropic is called — circuit breaker only wraps Anthropic SDK calls, not the rate limiter
  - [x] 6.5 Add mobile layout degradation test in `WorkspaceLayout.test.tsx` — verify mobile read-only TutorPanel shows unavailable notice when `tutorAvailable: false` (mobile renders with `readOnly={true}` and no intervention props)

- [x] Task 7: Add `Retry-After` header handling on frontend (AC: #2, #5)
  - [x] 7.1 In `use-tutor-stream.ts`, when receiving 503 with `Retry-After` header or `retryAfter` in response body, store the retry-after value and pass it to the unavailable UI. This extends the existing 429 rate-limit handling pattern
  - [x] 7.2 In `TutorInput.tsx`, when tutor is unavailable with a known `retryAfter`, show countdown: "Available in ~Xs" (same pattern as rate-limit countdown, reuse the `useEffect` timer pattern)
  - [x] 7.3 Unit test: 503 with Retry-After header is parsed and stored
  - [x] 7.4 Unit test: unavailable countdown displays and auto-clears

## Dev Notes

### Architecture Compliance

- **Circuit breaker is in-memory only** — acceptable for MVP. Railway runs a single API instance, so in-memory state is consistent. No need for Redis-backed circuit breaker (adds complexity for single-instance deployment). If scaling to multiple instances later, move to Redis-backed state
- **No fallback model provider** — per architecture decision: "if Anthropic is down, tutor is down" (no multi-provider fallback for MVP). This is explicitly deferred
- **Plugin isolation preserved** — circuit breaker and metrics live inside tutor plugin. No cross-plugin imports. Other plugins (execution, curriculum, progress) are completely independent of tutor state
- **Two error paths maintained** — user-code errors (compilation failures, test failures) flow through execution SSE events and never touch Sentry. Platform errors (Anthropic failures, infra issues) go to Sentry. Story 6.6 only deals with platform errors
- **No new Zustand stores** — `tutorAvailable` already exists in `useWorkspaceUIStore`. Recovery hook and probe use existing store actions
- **No new packages** — all work within `apps/backend` and `apps/webapp`

### Existing Implementation to Build On

**Already implemented (DO NOT duplicate):**

| What | Where | Status |
|---|---|---|
| `tutorAvailable` boolean state | `workspace-ui-store.ts` | Working — `setTutorAvailable(false)` called on TUTOR_UNAVAILABLE |
| Unavailable UI with retry button | `TutorPanel.tsx` lines 56-67 | Working — shows message when `tutorAvailable === false` |
| 503 on Anthropic errors | `stream.ts` + `message.ts` route handlers | Working — try-catch around API calls |
| TUTOR_UNAVAILABLE error code | `use-tutor-stream.ts` lines 189-197 | Working — SSE error event triggers `setTutorAvailable(false)` |
| Rate limiting (30/min) | Tutor routes via rate limiter plugin | Working — Redis sliding window |
| Context data fallbacks | `context-helpers.ts` | Working — placeholder strings for missing data |
| Plugin stub without API key | `index.ts` | Working — `unavailableService` fallback |
| Sentry error capture | Route handlers | Partial — captures exceptions but lacks structured context |

**Extend, don't replace:**
- `anthropic.ts` — wrap existing methods with circuit breaker, don't restructure the service
- `use-tutor-stream.ts` — add recovery logic alongside existing error handling
- `TutorPanel.tsx` — enhance unavailable state UI, don't redesign the panel
- Route handlers — add metrics calls around existing try-catch blocks

### Tutor Plugin File Structure

```
apps/backend/src/plugins/tutor/
├── index.ts                          # Plugin registration (inject circuit breaker + metrics)
├── routes/
│   ├── stream.ts                     # GET /api/tutor/:sessionId/stream (SSE) — add metrics + circuit breaker check
│   ├── message.ts                    # POST /api/tutor/:sessionId/message — add metrics + circuit breaker check
│   ├── history.ts                    # GET /api/tutor/:sessionId/messages — no changes
│   ├── stuck-intervention.ts         # POST /api/tutor/:sessionId/stuck — add circuit breaker guard
│   └── health.ts                     # GET /api/tutor/health — NEW (tutor-specific health)
└── services/
    ├── anthropic.ts                  # Wrap with circuit breaker + timeouts + error classification
    ├── circuit-breaker.ts            # NEW — generic circuit breaker implementation
    ├── tutor-metrics.ts              # NEW — Redis-based availability metrics
    ├── context-assembler.ts          # No changes
    ├── stuck-context-assembler.ts    # No changes
    ├── context-helpers.ts            # No changes
    └── conversation-history.ts       # No changes

apps/webapp/src/
├── hooks/
│   ├── use-tutor-stream.ts           # Add recovery on success + Retry-After handling
│   ├── use-tutor-recovery.ts         # NEW — health probe polling for auto-recovery
│   ├── use-stuck-intervention.ts     # Add tutorAvailable guard
│   └── use-tutor-messages.ts         # No changes
├── components/workspace/
│   ├── TutorPanel.tsx                # Enhanced unavailable UI + recovery feedback
│   └── TutorInput.tsx                # Retry-After countdown for 503
└── stores/
    └── workspace-ui-store.ts         # No changes (tutorAvailable already exists)
```

### Circuit Breaker Design

```typescript
type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN'

interface CircuitBreakerOptions {
  readonly failureThreshold: number    // Consecutive failures to open (default: 3)
  readonly resetTimeoutMs: number      // Initial time before half-open test (default: 30000)
  readonly halfOpenMaxAttempts: number  // Test requests in half-open (default: 1)
  readonly maxResetTimeoutMs: number   // Cap for exponential backoff (default: 300000 = 5 min)
}

// Created in app.ts, passed to tutorPlugin options:
const circuitBreaker = createCircuitBreaker({ failureThreshold: 3, resetTimeoutMs: 30_000 })

// Applied in index.ts via decorator (keeps anthropic.ts unchanged):
const wrappedService = withCircuitBreaker(anthropicService, circuitBreaker)

// withCircuitBreaker returns a new AnthropicService that:
// - Calls circuitBreaker.assertClosed() before delegating
// - Records success/failure after each call
// - Throws CircuitOpenError when OPEN (caught by existing route try-catch)

// Exponential backoff on repeated failures:
// HALF_OPEN → OPEN: resetTimeout doubles (30s → 60s → 120s → 300s cap)
// HALF_OPEN → CLOSED: resetTimeout resets to initial value
```

**Circuit breaker scope:** Only wraps Anthropic SDK calls. App-level rate limiting (30 req/min) happens upstream in route middleware and does NOT interact with the circuit breaker. Do NOT count app-level 429s as circuit failures.

### Error Classification Map

| Anthropic Error | Classification | Sentry Level | Circuit Impact |
|---|---|---|---|
| 429 (rate limited) | `rate_limit` | `warn` | Counts as failure |
| 529 (overloaded) | `overloaded` | `warn` | Counts as failure |
| 401 (auth) | `auth_error` | `error` | Counts as failure |
| 500+ (server) | `api_error` | `error` | Counts as failure |
| AbortError (timeout) | `timeout` | `warn` | Counts as failure |
| Network errors | `network_error` | `error` | Counts as failure |

### Testing Strategy

- **Circuit breaker tests:** Pure unit tests with `vi.useFakeTimers()` for timeout transitions. No external deps
- **Metrics tests:** Mock Redis (`vi.mock`) for INCR/GET commands. Test calculation logic
- **Route tests:** `fastify.inject()` with mock Anthropic service that throws specific errors. Verify 503 responses, Retry-After headers, Sentry calls
- **Frontend tests:** `@testing-library/react` with `createTestQueryClient()`. Mock `fetch` for health endpoint. Test `tutorAvailable` state transitions
- **Integration tests:** Full Fastify instance with mock Anthropic. Verify execution/curriculum routes work while tutor circuit is OPEN
- **Mock pattern:** Use existing `@mycscompanion/config/test-utils/` — DO NOT create ad-hoc mocks

### Key Patterns from Story 6.5

- `loadConceptExplainerMetadata` added Redis caching (code review fix M2) — follow same pattern for metrics if caching tutor health results
- `stripExplainerRefsForA11y` was refactored to use actual asset titles via assets map (code review fix M1) — shows pattern of threading data through hooks
- `conceptExplainerAssets` was added to MobileLayout (code review fix M3) — ensure degradation works on mobile too
- Module-level regex state was eliminated (code review fix H1) — avoid stateful module-level variables; circuit breaker state is per-instance via closure or class, not module-level singleton

### Project Structure Notes

- New files follow existing conventions: `kebab-case.ts` for services/utilities, `PascalCase.tsx` for components
- Test files co-located: `circuit-breaker.test.ts`, `tutor-metrics.test.ts`, `use-tutor-recovery.test.ts`, `degradation.test.ts`
- New route `health.ts` follows existing route file pattern in tutor plugin
- `WorkspaceLayout.test.tsx` already exists — extend it, do NOT overwrite
- No `integration/` directory exists in tutor plugin — place degradation tests in `routes/`
- No new database tables or migrations needed
- No new shared package types needed — error types are plugin-internal
- No new dependencies — circuit breaker is hand-rolled (simple enough, no npm package needed)
- Environment variables added: `MCC_TUTOR_TTFT_TIMEOUT_MS`, `MCC_TUTOR_STREAM_TIMEOUT_MS` (optional, with defaults)

### References

- [Source: _bmad-output/planning-artifacts/epics.md — Epic 6, Story 6.6]
- [Source: _bmad-output/planning-artifacts/architecture.md — ARCH-6 AI Tutor Architecture, Graceful Degradation section]
- [Source: _bmad-output/planning-artifacts/prd.md — NFR-R7 (>95% availability), NFR-R8 (graceful degradation)]
- [Source: _bmad-output/implementation-artifacts/6-5-tutor-surfaced-concept-explainers.md — Previous story patterns and code review fixes]
- [Source: _bmad-output/project-context.md — Project rules and conventions]
- [Source: apps/backend/src/plugins/tutor/services/anthropic.ts — Current Anthropic service wrapper]
- [Source: apps/backend/src/plugins/tutor/index.ts — Plugin initialization with dependency injection]
- [Source: apps/webapp/src/hooks/use-tutor-stream.ts — Current error handling and TUTOR_UNAVAILABLE flow]
- [Source: apps/webapp/src/stores/workspace-ui-store.ts — tutorAvailable state]
- [Source: apps/webapp/src/components/workspace/TutorPanel.tsx — Current unavailable UI]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6

### Debug Log References

None — clean implementation with no blocking issues.

### Completion Notes List

- Implemented in-memory circuit breaker with CLOSED/OPEN/HALF_OPEN states, exponential backoff (30s→60s→120s→300s cap), and configurable thresholds
- Created `withCircuitBreaker` decorator wrapping `AnthropicService` — applied in `index.ts` via DI composition, keeping `anthropic.ts` unchanged
- Added `CircuitOpenError` typed error caught by all route handlers returning 503 + `Retry-After` header
- Added request timeouts via `AbortController` + `signal` (30s TTFT, 120s total stream duration) configurable via `MCC_TUTOR_TTFT_TIMEOUT_MS` / `MCC_TUTOR_STREAM_TIMEOUT_MS`
- Created Redis-based `tutor-metrics.ts` tracking request/failure counts with 7-day TTL per day key
- Added `GET /api/tutor/health` endpoint returning circuit state, availability rate, consecutive failures, retryAfterMs
- Integrated metrics recording into all 3 route handlers (stream, message, stuck-intervention) on success/failure
- Added `classifyError()` helper mapping Anthropic SDK errors to categories (rate_limit, overloaded, auth_error, timeout, network_error, api_error)
- Enhanced Sentry capture with structured tags (`tutor_error_type`, `tutor_model`) and extra context (`circuitState`, `requestSize`)
- Rate-limit (429) and overloaded (529) errors logged at `warn` level, not `error`
- Added `tutorAvailable` guard in `use-stuck-intervention.ts` — suppresses API call when tutor is down, keeps timer running for immediate fire on recovery
- Added stuck-intervention backend guard returning 503 when circuit is OPEN
- Added `setTutorAvailable(true)` on successful `message_complete` in `use-tutor-stream.ts` (was missing — only `false` was set)
- Created `use-tutor-recovery.ts` hook polling `GET /api/tutor/health` every 30s when tutor unavailable
- Enhanced TutorPanel unavailable UI with "Retrying automatically..." pulsing indicator and "Tutor is back" recovery notice (auto-dismisses after 3s)
- Added 503 + Retry-After handling in `use-tutor-stream.ts` with countdown display in `TutorInput.tsx`
- All existing tests pass with zero regressions (389 backend, 514 webapp)

### Change Log

- 2026-03-11: Implemented Story 6.6 — Graceful Degradation & Availability (all 7 tasks complete)
- 2026-03-11: Code review fixes applied — created missing test files (degradation.test.ts, health.test.ts), added Sentry tags and timeout→circuit-breaker tests, fixed classifyError `as` cast, fixed catch-block log levels, removed console.warn from stuck-intervention hook, added immediate recovery probe, fixed Retry button to use health check

### File List

**New files:**
- `apps/backend/src/plugins/tutor/services/circuit-breaker.ts`
- `apps/backend/src/plugins/tutor/services/circuit-breaker.test.ts`
- `apps/backend/src/plugins/tutor/services/tutor-metrics.ts`
- `apps/backend/src/plugins/tutor/services/tutor-metrics.test.ts`
- `apps/backend/src/plugins/tutor/routes/health.ts`
- `apps/backend/src/plugins/tutor/routes/health.test.ts`
- `apps/backend/src/plugins/tutor/routes/degradation.test.ts`
- `apps/webapp/src/hooks/use-tutor-recovery.ts`
- `apps/webapp/src/hooks/use-tutor-recovery.test.ts`

**Modified files:**
- `apps/backend/src/plugins/tutor/services/anthropic.ts` — added `classifyError()`, request timeouts, `AnthropicRequestBody` type, `signal` support
- `apps/backend/src/plugins/tutor/services/anthropic.test.ts` — added `classifyError` tests, updated call expectations for `signal` arg
- `apps/backend/src/plugins/tutor/index.ts` — circuit breaker + metrics creation and DI wiring, health route registration
- `apps/backend/src/plugins/tutor/routes/stream.ts` — CircuitOpenError handling, Retry-After header, metrics recording, enhanced Sentry context
- `apps/backend/src/plugins/tutor/routes/message.ts` — CircuitOpenError handling, Retry-After header, metrics recording, enhanced Sentry context
- `apps/backend/src/plugins/tutor/routes/stuck-intervention.ts` — CircuitOpenError handling, Retry-After header, metrics recording, enhanced Sentry context
- `apps/webapp/src/hooks/use-tutor-stream.ts` — setTutorAvailable(true) on success, 503 Retry-After handling
- `apps/webapp/src/hooks/use-tutor-stream.test.ts` — added recovery and 503 tests
- `apps/webapp/src/hooks/use-stuck-intervention.ts` — tutorAvailable guard
- `apps/webapp/src/hooks/use-stuck-intervention.test.ts` — added guard test
- `apps/webapp/src/components/workspace/TutorPanel.tsx` — recovery hook, enhanced unavailable UI, recovery notice
- `apps/webapp/src/components/workspace/TutorPanel.test.tsx` — added recovery/unavailable tests, mocked recovery hook
- `apps/webapp/src/components/workspace/TutorInput.tsx` — TUTOR_UNAVAILABLE countdown support
- `apps/webapp/src/components/workspace/WorkspaceLayout.test.tsx` — added graceful degradation test block
