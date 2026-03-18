# Story 11.2: Backend Integration & Execution Processor Rewrite

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **developer**,
I want the BullMQ execution worker to call the persistent execution service via a single HTTP POST,
so that the execution pipeline is simplified from 5+ API calls to 1 and stdout capture works reliably.

## Acceptance Criteria

1. **AC1: ExecutionServiceClient** — A new `execution-service-client.ts` in `packages/execution/src/` encapsulates the HTTP POST to `/execute` with `ExecuteRequest` and `ExecuteResponse` types matching the Go server contract. `ExecuteRequest` has `readonly code: string` (base64), `readonly args: string[]`, `readonly timeoutSeconds: number`. `ExecuteResponse` has `readonly stdout: string`, `readonly stderr: string`, `readonly exitCode: number`, `readonly durationMs: number`, `readonly buildDurationMs: number`, `readonly runDurationMs: number`, `readonly timedOut: boolean`. The client uses Node `fetch` (no extra HTTP library). Non-200 responses throw `ExecutionServiceError` (custom error class with `readonly status: number` and `get isRetryable(): boolean` returning `true` for 503/429). On 200, parse as `ExecuteResponse`. On non-200 (400/401/503), parse as `{ error: string }` and throw — the Go server returns a simple error JSON object for non-200 status codes, NOT an `ExecuteResponse`.

2. **AC2: Execution processor rewrite** — The entire Fly Machine lifecycle in `execution-processor.ts` (create machine → wait started → wait stopped → fetch logs → get exit code → destroy machine) is replaced by a single call to `ExecutionServiceClient.execute()`. The processor drops from ~611 lines to ~250 lines.

3. **AC3: Stdout mapping** — `ExecuteResponse.stdout` is used directly for criteria evaluation (replaces broken log-fetched output). `ExecuteResponse.stderr` is used for compilation error display. `ExecuteResponse.exitCode` determines success/failure (replaces `analyzeOutput` + machine state inspection).

4. **AC4: SSE event preservation** — SSE event publishing is preserved with identical event types and shapes: `output` event with stdout, `compile_error` event with stderr, `complete` event with exit code and criteria results, `error` event for platform failures, `timeout` event for execution timeouts. Frontend receives exactly the same events — zero webapp changes.

5. **AC5: BullMQ preservation** — BullMQ job handling, retry logic, and concurrency settings are preserved unchanged. Job data shape unchanged. Worker concurrency stays at 10.

6. **AC6: Criteria evaluation preservation** — Criteria evaluation logic is preserved unchanged. It evaluates against stdout from the HTTP response instead of log messages. The `evaluateAndPublishCriteria()` helper and `CriteriaEvaluator` integration are untouched.

7. **AC7: Benchmark integration point** — Benchmark phase integration point is preserved. When benchmarks are needed, uses another `ExecutionServiceClient.execute()` call with reference code. `runBenchmarkOnMachine()` is rewritten to `runBenchmarkOnService()` using the execution service client instead of Fly Machine lifecycle. `parseBenchmarkOutput()` and `classifyBenchmarkError()` from `@mycscompanion/execution` remain unchanged.

8. **AC8: Database preservation** — Database updates to `submissions` table are preserved. Status transitions: `queued` → `running` → `completed`/`failed`. The `execution_result` JSON shape changes minimally: `machineId` field is removed (no machines), `compilationSucceeded` is derived from `exitCode !== 2`. The `ExecutionResult` type in `apps/backend/src/shared/execution-types.ts` is updated: remove `machineId: string`, keep `exitCode`, `output`, `durationMs`, `compilationSucceeded`. Any code reading historical `execution_result` from the DB must tolerate missing `machineId`.

9. **AC9: fly-config.ts simplification** — `fly-config.ts` is simplified to export only `executionServiceUrl` (from `MCC_EXECUTION_URL`), `executionSecret` (from `MCC_EXECUTION_SECRET`), and timeout settings. `DEFAULT_FLY_MACHINE_CONFIG`, `getExecutionImageRef`, `FlyMachineConfig` type, and `CpuKind`/`RestartPolicy` types are removed.

10. **AC10: Dead code removal** — The following files are deleted from `packages/execution/src/`: `fly-client.ts`, `fly-api-types.ts`, `machine-request-builder.ts`, `execute.ts`. The following inline functions are removed from `execution-processor.ts`: `fetchMachineLogs`, `readNdjsonMessages`, `analyzeOutput`, `truncateOutput`. All associated test files are also removed.

11. **AC11: Updated exports** — `packages/execution/src/index.ts` exports are updated to reflect the new module structure: exports `ExecutionServiceClient`, `ExecuteRequest`, `ExecuteResponse` from the new client; exports `ExecutionEvent` types (unchanged); exports `parseBenchmarkOutput`, `classifyBenchmarkError`, `BenchmarkRunResult` (unchanged); exports execution config from simplified `fly-config.ts`. Removed exports: `FlyClient`, `FlyApiError`, `FlyClientOptions`, all `Fly*` types, `buildMachineRequest`, `MAX_CODE_SIZE_BYTES`, `executeCode`, `ExecuteCodeOptions`, `DEFAULT_FLY_MACHINE_CONFIG`, `getExecutionImageRef`, `FlyMachineConfig`, `CpuKind`, `RestartPolicy`.

12. **AC12: New tests** — Existing tests for Fly Machine lifecycle are removed. New tests for ExecutionServiceClient use `msw` v2 HTTP handlers to mock the execution service. Execution processor tests verify: successful execution → correct SSE events published, compilation error → `compile_error` SSE event with stderr, timeout (`timedOut: true` in response) → `timeout` SSE event, service unavailable (ExecutionServiceError with status 503) → job left for BullMQ retry.

13. **AC13: Worker.ts update** — `worker.ts` reads `MCC_EXECUTION_URL` and `MCC_EXECUTION_SECRET` env vars (replacing `MCC_FLY_API_TOKEN`, `MCC_FLY_APP_NAME`, `MCC_FLY_LOGS_TOKEN`). Creates `ExecutionServiceClient` instance and passes it to the processor instead of `FlyClient`.

## Tasks / Subtasks

- [x] Task 0: Add `timed_out` field to Go execution server response (AC: #1 prerequisite)
  - [x] 0.1 In `infra/fly-execution/server/executor.go`: add `TimedOut bool \`json:"timed_out"\`` field to `ExecuteResponse` struct
  - [x] 0.2 Set `TimedOut: true` when `buildCtx.Err() == context.DeadlineExceeded` (build timeout, line ~144)
  - [x] 0.3 Set `TimedOut: true` when `runCtx.Err() == context.DeadlineExceeded` (run timeout, after line ~197)
  - [x] 0.4 Default `TimedOut: false` for all non-timeout responses (Go zero value handles this)
  - [x] 0.5 Update existing Go tests: verify `timed_out: true` in timeout test, `timed_out: false` in success/error tests
  - [x] 0.6 Run `cd infra/fly-execution/server && go test ./...` — verify all tests pass

- [x] Task 1: Create ExecutionServiceClient (AC: #1)
  - [x] 1.1 Create `packages/execution/src/execution-service-client.ts`
  - [x] 1.2 Define `ExecuteRequest` interface: `readonly code: string` (base64), `readonly args: string[]`, `readonly timeoutSeconds: number`
  - [x] 1.3 Define `ExecuteResponse` interface: `readonly stdout: string`, `readonly stderr: string`, `readonly exitCode: number`, `readonly durationMs: number`, `readonly buildDurationMs: number`, `readonly runDurationMs: number`, `readonly timedOut: boolean`
  - [x] 1.4 Define `ExecutionServiceError` class extending `Error` with `readonly status: number` and `get isRetryable(): boolean` (returns `true` for status 503 or 429)
  - [x] 1.5 Implement `ExecutionServiceClient` class with constructor taking `baseUrl: string` and `secret: string`
  - [x] 1.6 Implement `execute(request: ExecuteRequest): Promise<ExecuteResponse>` method — POST to `${baseUrl}/execute` with Bearer auth, JSON body mapping `timeoutSeconds` → `timeout_seconds` (snake_case for Go server). On HTTP 200: parse response body and manually map snake_case → camelCase (`exit_code` → `exitCode`, `duration_ms` → `durationMs`, `timed_out` → `timedOut`, etc.). Do NOT use `toCamelCase()` from shared (that's for DB→API). On non-200: parse `{ error: string }` body and throw `ExecutionServiceError` with status code and error message

- [x] Task 2: Create ExecutionServiceClient tests (AC: #12)
  - [x] 2.1 Create `packages/execution/src/execution-service-client.test.ts`
  - [x] 2.2 Set up `msw` v2 server with `http.post('*/execute', ...)` handler (NOT `rest.post` — msw v2 API)
  - [x] 2.3 Test: successful execution returns correctly typed ExecuteResponse with camelCase fields
  - [x] 2.4 Test: compilation error response (exit_code 2) maps correctly
  - [x] 2.5 Test: 401 unauthorized throws ExecutionServiceError with status 401
  - [x] 2.6 Test: 503 service unavailable throws ExecutionServiceError with status 503
  - [x] 2.7 Test: network error (service down) throws error
  - [x] 2.8 Test: request body sends snake_case fields (`timeout_seconds`, not `timeoutSeconds`)
  - [x] 2.9 Test: timeout response (`timed_out: true` in JSON) maps to `timedOut: true` in ExecuteResponse
  - [x] 2.10 Test: 400 bad request (code too large) throws ExecutionServiceError with status 400 and error message

- [x] Task 3: Simplify fly-config.ts (AC: #9)
  - [x] 3.1 Remove `DEFAULT_FLY_MACHINE_CONFIG`, `getExecutionImageRef()`, `FlyMachineConfig` type, `CpuKind`, `RestartPolicy`
  - [x] 3.2 Export `executionServiceConfig` object: `{ url: string, secret: string, defaultTimeoutSeconds: number, maxTimeoutSeconds: number }`
  - [x] 3.3 Read `MCC_EXECUTION_URL` and `MCC_EXECUTION_SECRET` from environment
  - [x] 3.4 Keep default timeout (30s) and max timeout (120s) constants
  - [x] 3.5 Remove or update `fly-config.test.ts` for new config shape

- [x] Task 4: Update packages/execution exports (AC: #11)
  - [x] 4.1 Remove all `Fly*` type exports from `index.ts`
  - [x] 4.2 Remove `FlyClient`, `FlyApiError`, `FlyClientOptions` exports
  - [x] 4.3 Remove `buildMachineRequest`, `MAX_CODE_SIZE_BYTES`, `BuildMachineRequestOptions`, `ReferenceFile` exports
  - [x] 4.4 Remove `executeCode`, `ExecuteCodeOptions` exports
  - [x] 4.5 Remove `DEFAULT_FLY_MACHINE_CONFIG`, `getExecutionImageRef` exports
  - [x] 4.6 Add `ExecutionServiceClient`, `ExecutionServiceError`, `ExecuteRequest`, `ExecuteResponse` exports
  - [x] 4.7 Add execution config exports from simplified `fly-config.ts`
  - [x] 4.8 Keep `ExecutionEvent`, `ExecutionPhase`, `ExecutionStatus` exports (unchanged)
  - [x] 4.9 Keep `parseBenchmarkOutput`, `classifyBenchmarkError`, `computeMedian`, `BenchmarkRunResult`, `BenchmarkErrorType` exports (unchanged)

- [x] Task 5: Rewrite execution-processor.ts (AC: #2, #3, #4, #5, #6, #7, #8)
  - [x] 5.1 Change `createExecutionProcessor` deps: replace `flyClient: FlyClient`, `flyConfig: FlyMachineConfig`, `flyApiToken: string`, `flyLogsToken: string`, `flyAppName: string` with `executionClient: ExecutionServiceClient`
  - [x] 5.2 Remove inline helper functions: `readNdjsonMessages`, `fetchMachineLogs`, `analyzeOutput`, `truncateOutput`
  - [x] 5.3 Rewrite main execution flow:
    - Publish `output` SSE event (phase: 'preparing')
    - Base64-encode user code: `Buffer.from(code).toString('base64')`
    - Validate code size against 64KB limit before sending (defense in depth — Go server also validates, but fail early to save a network round-trip)
    - Call `executionClient.execute({ code: base64Code, args: [], timeoutSeconds })`
    - Check `response.timedOut` first → timeout path
    - Then map: `exitCode === 0` → success, `exitCode === 2` → compilation error, other → runtime error
  - [x] 5.4 Publish SSE events based on response:
    - If `response.timedOut`: publish `timeout` SSE event, evaluate all criteria as not-met, mark submission `failed`
    - If `exitCode === 2`: publish `compile_error` with `response.stderr`
    - If `exitCode === 0`: publish `output` with `response.stdout` (phase: 'compiling' complete)
    - If `exitCode !== 0 && exitCode !== 2 && !timedOut`: publish `error` with `isUserError: true`, include stderr
  - [x] 5.5 Preserve criteria evaluation: call `evaluateAndPublishCriteria()` with `response.stdout` instead of `combinedOutput` from `analyzeOutput`
  - [x] 5.6 Update `RunBenchmarkFn` type signature: replace `flyClient: FlyClient`, `flyConfig: FlyMachineConfig`, `flyApiToken: string`, `flyAppName: string` with `executionClient: ExecutionServiceClient`. New signature:
    ```typescript
    type RunBenchmarkFn = (opts: {
      readonly executionClient: ExecutionServiceClient
      readonly code: string
      readonly submissionId: string
      readonly milestoneId: string
      readonly referenceMainGo: string
      readonly referenceGoMod: string
      readonly benchmark: { readonly name: string; readonly workload?: { readonly type?: string; readonly numOperations?: number; readonly keySizeBytes?: number; readonly valueSizeBytes?: number } }
      readonly warmup: number
      readonly iterations: number
      readonly logger: Logger
    }) => Promise<string>
    ```
  - [x] 5.7 Rewrite `runBenchmarkOnMachine` → `runBenchmarkOnService`: accept `ExecutionServiceClient` instead of `FlyClient`, call `executionClient.execute()` with benchmark code, return `response.stdout`. Currently returns `""` (stub) — keep as stub but with correct signature.
  - [x] 5.8 Preserve benchmark evaluation pipeline: `parseBenchmarkOutput()` → `classifyBenchmarkError()` → SSE events → `persistBenchmarkResult()`
  - [x] 5.9 Update `ExecutionResult` type in `apps/backend/src/shared/execution-types.ts`: remove `machineId: string` field. Keep `exitCode`, `output`, `durationMs`, `compilationSucceeded`. Set `compilationSucceeded` from `exitCode !== 2` instead of `analyzeOutput()`.
  - [x] 5.10 Preserve DB updates with updated execution_result shape (no machineId). Status transitions unchanged.
  - [x] 5.11 Update error handling — two error paths:
    - **HTTP 200 with `timedOut: true`** (inside try block, after successful HTTP call): publish `timeout` SSE event, evaluate all criteria as not-met, mark submission `failed`. The Go server returns 200 for timeouts with non-zero exitCode — it does NOT return HTTP 408.
    - **`ExecutionServiceError` catch** (thrown by client on non-200): check `err.isRetryable` (503/429) → reset submission to `queued`, re-throw for BullMQ retry. Otherwise → publish `error` SSE event (isUserError: false), mark `failed`.
  - [x] 5.12 Remove the `finally` block that destroys machines (no machines to destroy)
  - [x] 5.13 Remove `FlyApiError` import — replace with `ExecutionServiceError` handling

- [x] Task 6: Update worker.ts (AC: #13)
  - [x] 6.1 Remove `MCC_FLY_API_TOKEN`, `MCC_FLY_APP_NAME`, `MCC_FLY_LOGS_TOKEN` env var reads
  - [x] 6.2 Add `MCC_EXECUTION_URL` and `MCC_EXECUTION_SECRET` env var reads with validation (throw on missing)
  - [x] 6.3 Remove `FlyClient` instantiation and `flyConfig` object creation
  - [x] 6.4 Create `ExecutionServiceClient` instance: `new ExecutionServiceClient(executionUrl, executionSecret)`
  - [x] 6.5 Update `createExecutionProcessor()` call: pass `executionClient` instead of `flyClient`, `flyConfig`, `flyApiToken`, `flyLogsToken`, `flyAppName`
  - [x] 6.6 Update imports: remove `FlyClient`, `DEFAULT_FLY_MACHINE_CONFIG`, `getExecutionImageRef` — add `ExecutionServiceClient`

- [x] Task 7: Rewrite execution-processor tests (AC: #12)
  - [x] 7.1 Remove all existing Fly Machine lifecycle test setup (msw handlers for Machines API endpoints)
  - [x] 7.2 Create mock `ExecutionServiceClient` using `vi.fn()` — mock the `execute` method
  - [x] 7.3 Test: successful execution → `execute()` called with correct base64 code → `output` + `complete` SSE events published → submission status updated to `completed`
  - [x] 7.4 Test: compilation error (exitCode 2) → `compile_error` SSE event published with stderr → submission `failed` with `isUserError: true`
  - [x] 7.5 Test: runtime error (exitCode 1, timedOut false) → `error` SSE event with `isUserError: true`
  - [x] 7.6 Test: timeout (timedOut: true in ExecuteResponse) → `timeout` SSE event → all criteria not-met → submission `failed`
  - [x] 7.7 Test: service unavailable (ExecutionServiceError with status 503, isRetryable true) → submission reset to `queued`, error re-thrown for BullMQ retry
  - [x] 7.8 Test: criteria evaluation called with stdout from response
  - [x] 7.9 Test: benchmark execution uses ExecutionServiceClient.execute() with reference code
  - [x] 7.10 Test: DB submission record updated with correct execution_result JSON

- [x] Task 8: Delete dead code files (AC: #10)
  - [x] 8.1 Delete `packages/execution/src/fly-client.ts`
  - [x] 8.2 Delete `packages/execution/src/fly-client.test.ts`
  - [x] 8.3 Delete `packages/execution/src/fly-api-types.ts`
  - [x] 8.4 Delete `packages/execution/src/machine-request-builder.ts`
  - [x] 8.5 Delete `packages/execution/src/machine-request-builder.test.ts`
  - [x] 8.6 Delete `packages/execution/src/execute.ts`
  - [x] 8.7 Delete `packages/execution/src/execute.test.ts`

- [x] Task 9: Verify build and tests pass (AC: all)
  - [x] 9.1 Run `pnpm --filter @mycscompanion/execution typecheck` — verify no type errors
  - [x] 9.2 Run `pnpm --filter @mycscompanion/execution test` — verify new tests pass
  - [x] 9.3 Run `pnpm --filter backend typecheck` — verify no type errors from changed imports
  - [x] 9.4 Run `pnpm --filter backend test` — verify processor tests pass
  - [x] 9.5 Run `turbo typecheck` — verify no cross-package type errors
  - [x] 9.6 Run `turbo lint` — verify no lint errors from new code
  - [x] 9.7 Verify `pnpm --filter @mycscompanion/execution build` is not needed (internal package, no build step per project-context.md)

## Dev Notes

### Architecture Context

This is Phase 2 of Epic 11 — the architecture pivot from ephemeral Fly Machines to a persistent execution service. Story 11.1 created the Go HTTP server. This story rewrites the TypeScript backend to call it.

The core change: replace the 5+ API call Fly Machine lifecycle with a single HTTP POST to the persistent execution service. This fixes two critical production failures:
1. **~2 minute cold starts** → **<5 second round-trips**
2. **0% stdout capture** → **100% stdout capture** (directly in HTTP response)

**ADR:** `_bmad-output/implementation-artifacts/adr-persistent-execution-service.md`

### Critical Design Decisions

- **HTTP 200 from execution service always** — The Go server returns 200 for all execution results. `exit_code` conveys success/failure (0 = success, 2 = compilation failure, non-zero = runtime failure). Only platform errors (auth, service busy) use non-200 HTTP status codes. The TypeScript client must NOT treat non-zero exit codes as errors — only non-200 HTTP status.

- **Snake_case ↔ camelCase boundary** — The Go server uses `snake_case` JSON fields (`exit_code`, `duration_ms`, `timeout_seconds`). The TypeScript `ExecuteRequest` and `ExecuteResponse` use `camelCase`. The `ExecutionServiceClient` handles the conversion at the boundary. Do NOT use `toCamelCase()` from shared — it's for DB→API conversion. Write explicit field mapping in the client.

- **No `analyzeOutput` needed** — The Go server provides structured `exit_code` and separate `stdout`/`stderr`. The old `analyzeOutput()` function existed because Fly Machine logs mixed stdout and stderr into a single log stream with no exit code metadata. With the new service, classification is trivial: `exitCode === 0` → success, `exitCode === 2` → compilation error, other → runtime error.

- **No `truncateOutput` needed** — The Go server already truncates stdout and stderr to 1MB each (with `[output truncated]` suffix). The backend processor does NOT need to truncate again. The old 64KB truncation in the processor was a workaround for potentially huge log streams.

- **Benchmark stub stays as stub** — `runBenchmarkOnMachine()` currently returns `""` (empty string). Rewrite it to `runBenchmarkOnService()` which also returns `""` for now but uses the correct signature accepting `ExecutionServiceClient`. The benchmark implementation is a future story.

- **Timeout detection via response field, NOT HTTP status** — The Go server does NOT return HTTP 408 for timeouts. When `context.WithTimeout` fires, the subprocess is killed and the server returns **HTTP 200** with a non-zero `exit_code` and `timed_out: true`. The processor must check `response.timedOut` to distinguish timeout from runtime error. This is critical — without it, timeouts would be misclassified as runtime errors and publish `error` instead of `timeout` SSE events. **Requires adding `timed_out: boolean` field to the Go server's ExecuteResponse** (minor Story 11.1 amendment — see Task 0).

- **Error classification — two distinct paths** — The execution service has exactly 4 HTTP status codes:
  - 200: Execution completed (check `exit_code` + `timed_out` for result classification)
  - 400: Bad request (code too large, invalid base64, empty code) — returns `{ "error": "..." }`
  - 401: Unauthorized (wrong or missing token) — returns `{ "error": "unauthorized" }`
  - 503: Service busy (semaphore full) — returns `{ "error": "service busy" }`

  The processor maps these:
  - HTTP 200 + `timedOut: true` → `timeout` SSE event
  - HTTP 200 + `exitCode === 0` → success
  - HTTP 200 + `exitCode === 2` → `compile_error` SSE event
  - HTTP 200 + `exitCode !== 0` → `error` SSE event (isUserError: true)
  - HTTP 503 → retryable, reset to `queued`, re-throw for BullMQ
  - HTTP 400/401 → `error` SSE event (isUserError: false, platform error)

- **Mock strategy for processor tests** — Do NOT mock at the HTTP level in processor tests. Instead, mock the `ExecutionServiceClient.execute()` method directly with `vi.fn()`. HTTP-level mocking with msw belongs in the client's own test file. This follows the mock boundary rule: the processor owns the client, so it mocks the client. The client doesn't own fetch, so it mocks fetch via msw.

### What Changes — File by File

| File | Action | Details |
|---|---|---|
| `packages/execution/src/execution-service-client.ts` | **NEW** | ExecutionServiceClient class + types |
| `packages/execution/src/execution-service-client.test.ts` | **NEW** | msw v2 tests for HTTP client |
| `packages/execution/src/fly-config.ts` | **REWRITE** | Simplify to execution service URL + secret + timeouts |
| `packages/execution/src/fly-config.test.ts` | **REWRITE** | Update for new config shape |
| `packages/execution/src/index.ts` | **REWRITE** | Remove Fly exports, add execution service exports |
| `packages/execution/src/fly-client.ts` | **DELETE** | No longer calling Machines API |
| `packages/execution/src/fly-client.test.ts` | **DELETE** | |
| `packages/execution/src/fly-api-types.ts` | **DELETE** | No longer need Fly Machine types |
| `packages/execution/src/machine-request-builder.ts` | **DELETE** | Code sent as JSON, not injected via files |
| `packages/execution/src/machine-request-builder.test.ts` | **DELETE** | |
| `packages/execution/src/execute.ts` | **DELETE** | Unused high-level orchestrator |
| `packages/execution/src/execute.test.ts` | **DELETE** | |
| `packages/execution/src/events.ts` | **KEEP** | SSE event types unchanged |
| `packages/execution/src/benchmark-runner.ts` | **KEEP** | Benchmark parsing unchanged |
| `apps/backend/src/worker/processors/execution-processor.ts` | **REWRITE** | ~611 lines → ~250 lines |
| `apps/backend/src/worker/processors/execution-processor.test.ts` | **REWRITE** | Remove Fly mocks, add client mocks |
| `apps/backend/src/worker/worker.ts` | **MODIFY** | New env vars, new client instantiation |
| `apps/backend/src/shared/execution-types.ts` | **MODIFY** | Remove `machineId` field from `ExecutionResult` type |

### Files That Do NOT Change

- `apps/backend/src/shared/event-publisher.ts` — Same Redis pub/sub pattern
- `apps/backend/src/plugins/execution/routes/stream.ts` — Same SSE streaming
- `apps/backend/src/shared/criteria-evaluator.ts` — Same evaluation logic
- `apps/backend/src/shared/benchmark-persistence.ts` — Same DB persistence
- `apps/webapp/src/hooks/use-submit-code.ts` — Frontend untouched
- `apps/webapp/src/hooks/use-sse.ts` — Frontend untouched
- `packages/execution/src/events.ts` — Event types unchanged
- `packages/execution/src/benchmark-runner.ts` — Benchmark parsing unchanged

### Current Execution Processor Flow (Before — to be replaced)

```
1. buildMachineRequest(flyConfig, code, {...})
2. flyClient.createMachine(request)          → creates ephemeral Fly VM
3. flyClient.waitForState('started')         → 30-90s cold start
4. flyClient.waitForState('stopped')         → compile + run
5. fetchMachineLogs(appName, machineId, ...) → BROKEN: returns 0 bytes
6. machine.events → extract exit code       → unreliable
7. analyzeOutput(logs, exitCode)            → classify errors
8. truncateOutput(logs, 65536)              → cap output size
9. evaluateAndPublishCriteria(output)        → criteria check
10. flyClient.destroyMachine()              → cleanup
```

### New Execution Processor Flow (After)

```
1. base64Encode(code)
2. executionClient.execute({ code, args, timeoutSeconds })  → single HTTP POST, <5s
3. Map response.exitCode → success/compilation error/runtime error
4. Publish SSE events with response.stdout / response.stderr
5. evaluateAndPublishCriteria(response.stdout)              → criteria check (unchanged)
```

### Existing Processor Dependencies to Preserve

From the current `createExecutionProcessor` function signature:
```typescript
// KEEP these dependencies:
db: Kysely<DB>                    // Database access
eventPublisher: EventPublisher    // Redis SSE pub/sub
logger: Logger                    // Pino logger
contentLoader: ContentLoader      // Load milestone content for criteria
executeBenchmark?: (...)          // Injectable benchmark function

// REPLACE these dependencies:
flyClient: FlyClient              → executionClient: ExecutionServiceClient
flyConfig: FlyMachineConfig       → (removed — config in client)
flyApiToken: string               → (removed — secret in client)
flyLogsToken: string              → (removed)
flyAppName: string                → (removed)
```

### SSE Event Mapping — Old vs New

| Scenario | Old Events | New Events (identical) |
|---|---|---|
| Submission received | `output` (phase: 'preparing') | `output` (phase: 'preparing') |
| Compilation success | `output` (phase: 'compiling', data: stdout) | `output` (phase: 'compiling', data: response.stdout) |
| Compilation error | `compile_error` (data: stderr) | `compile_error` (data: response.stderr) |
| Runtime error | `error` (isUserError: true) | `error` (isUserError: true, message: response.stderr) |
| Criteria results | `criteria_results` (results: [...]) | `criteria_results` (results: [...]) |
| Benchmark progress | `benchmark_progress` | `benchmark_progress` |
| Benchmark result | `benchmark_result` | `benchmark_result` |
| Timeout | `timeout` (timeoutSeconds) | `timeout` (timeoutSeconds) |
| Platform error | `error` (isUserError: false) | `error` (isUserError: false) |
| Success | `complete` | `complete` |

### Environment Variable Changes

| Variable | Action | Notes |
|---|---|---|
| `MCC_FLY_API_TOKEN` | Remove from worker.ts | No longer calling Machines API |
| `MCC_FLY_LOGS_TOKEN` | Remove from worker.ts | No log fetching |
| `MCC_FLY_APP_NAME` | Remove from worker.ts | No machine creation |
| `MCC_EXECUTION_URL` | Add to worker.ts | URL of persistent execution service (e.g., `https://mcc-execution.fly.dev`) |
| `MCC_EXECUTION_SECRET` | Add to worker.ts | Shared secret for Bearer auth |

Note: Actually setting these in Railway is Story 11.3. This story only updates the code to read them.

### Testing Approach

**ExecutionServiceClient tests (`execution-service-client.test.ts`):**
- Use `msw` v2 with `http.post()` handlers (NOT `rest.post()` — that's msw v1)
- Mock the Go execution service's `/execute` endpoint
- Test request serialization (camelCase → snake_case)
- Test response deserialization (snake_case → camelCase)
- Test error status codes (400, 401, 503)
- Test network failures

**Execution processor tests (`execution-processor.test.ts`):**
- Mock `ExecutionServiceClient` at the class level with `vi.fn()` on `execute` method
- Do NOT use msw in processor tests — mock boundary is the client, not HTTP
- Test the processor's orchestration logic: SSE events, DB updates, error handling
- Use real DB (Kysely test transaction) per project-context.md rules
- Use `vi.restoreAllMocks()` in `afterEach`
- `it()` not `test()`, `describe` mirrors module structure

**Test file naming:** Co-located `{source}.test.ts` next to source. Never `.spec.ts`.

### Previous Story Intelligence (from Story 11.1)

**Key learnings from 11.1:**
- `select {}` in Go causes deadlock panic (exits immediately, not useful for timeout testing). Used `time.Sleep(60s)` instead.
- `ulimit -u 256` causes `sh: fork: Resource temporarily unavailable` on macOS. Added `MCC_DISABLE_ULIMIT` env var toggle. Production Dockerfile does NOT set this var.
- The Go server returns HTTP 200 for ALL execution results. exit_code conveys success/failure. Only platform errors use non-200 status.
- Non-blocking semaphore: `select { case sem <- struct{}{}: default: return 503 }` — NEVER blocks waiting.
- Output truncation happens server-side (1MB limit per stream). No need for backend truncation.
- Code size validation happens server-side (64KB limit). Backend can still validate too as defense in depth.

**Files created in 11.1 (the Go server this story calls):**
- `infra/fly-execution/server/main.go` — HTTP server, routing, auth, graceful shutdown
- `infra/fly-execution/server/executor.go` — Subprocess management, tmpdir lifecycle
- `infra/fly-execution/Dockerfile` — Multi-stage build

**Go server contract (from 11.1, amended by Task 0):**
- `POST /execute` — accepts `{ code, args, timeout_seconds }`, returns `{ stdout, stderr, exit_code, duration_ms, build_duration_ms, run_duration_ms, timed_out }`
- `GET /health` — returns 200 OK
- Auth: `Authorization: Bearer <MCC_EXECUTION_SECRET>`
- HTTP 200 always for execution results (including timeouts — check `timed_out` field). Non-200 only for platform errors: 400 (bad request), 401 (auth failure), 503 (semaphore full)
- Non-200 responses return `{ "error": "<message>" }` JSON — NOT an ExecuteResponse object

### Git Intelligence

Last 10 commits are all related to the broken stdout capture that this epic fixes:
```
15db9e5 Add Go execution server and multi-stage Dockerfile (Story 11.1)  ← THE FIX
c92bcd6 Add MCC_FLY_LOGS_TOKEN for platform logs API authentication     ← failed workaround
8042169 Add comprehensive log fetch debugging                            ← failed workaround
d6a2908 Fix connection pool contention: fetch logs sequentially          ← failed workaround
c4c2ac7 Switch log fetching to Machines API endpoint                     ← failed workaround
11e95d7 Fix log capture race: stream logs concurrently                   ← failed workaround
9c6ba7a Fix log fetching: read Fly streaming NDJSON                      ← failed workaround
```

All the workaround code (log fetching, NDJSON parsing, dual-endpoint fallback) is removed in this story.

### Project Structure Notes

- `packages/execution/` is an internal package — TypeScript source, NO build step. Imported via `@mycscompanion/execution`.
- Named exports only — no default exports.
- `ExecutionServiceClient` follows dependency injection pattern: instantiated in `worker.ts`, passed to processor via options.
- Error types: no TS `enum` — use union types or class hierarchy.
- Import conventions: `import { ExecutionServiceClient } from '@mycscompanion/execution'` (barrel import from index.ts).
- Async: always `async/await`, no `.then()` chains.
- No `any` type, including tests. Use `Partial<T>` or mock factories.

### References

- [Source: _bmad-output/implementation-artifacts/adr-persistent-execution-service.md] — Full ADR with architecture, API contract, trade-offs
- [Source: _bmad-output/implementation-artifacts/11-1-go-execution-server-and-dockerfile.md] — Previous story with Go server details and learnings
- [Source: _bmad-output/planning-artifacts/epics.md#Story-11.2] — Epic acceptance criteria
- [Source: _bmad-output/project-context.md] — 65 project rules (testing, naming, architecture)
- [Source: packages/execution/src/index.ts] — Current exports to be updated
- [Source: packages/execution/src/fly-client.ts] — Code to be deleted
- [Source: packages/execution/src/fly-api-types.ts] — Code to be deleted
- [Source: packages/execution/src/machine-request-builder.ts] — Code to be deleted
- [Source: packages/execution/src/execute.ts] — Code to be deleted (unused)
- [Source: packages/execution/src/fly-config.ts] — Code to be simplified
- [Source: packages/execution/src/events.ts] — SSE event types (unchanged)
- [Source: packages/execution/src/benchmark-runner.ts] — Benchmark parsing (unchanged)
- [Source: apps/backend/src/worker/processors/execution-processor.ts] — Main rewrite target (611 lines → ~250)
- [Source: apps/backend/src/worker/worker.ts] — Worker setup to be updated
- [Source: apps/backend/src/shared/event-publisher.ts] — Event publishing (unchanged)
- [Source: apps/backend/src/shared/execution-types.ts] — ExecutionResult type (remove machineId field)
- [Source: apps/backend/src/shared/criteria-evaluator.ts] — Criteria evaluation (unchanged, imports BenchmarkRunResult type)
- [Source: apps/backend/src/shared/benchmark-persistence.ts] — Benchmark DB persistence (unchanged, imports BenchmarkRunResult type)
- [Source: apps/backend/src/plugins/execution/routes/stream.ts] — SSE streaming (unchanged)
- [Source: infra/fly-execution/server/executor.go] — Go executor (add timed_out field to response)
- [Source: infra/fly-execution/server/main.go] — Go HTTP handler (non-200 returns { error: string }, NOT ExecuteResponse)

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6 (1M context)

### Debug Log References

### Completion Notes List

- Task 0: Added `TimedOut bool` field to Go `ExecuteResponse` struct. Set on build/run context deadline exceeded. All 13 Go tests pass with `timed_out` verification.
- Tasks 1-2: Created `ExecutionServiceClient` with `ExecuteRequest`/`ExecuteResponse` types, `ExecutionServiceError` class, and explicit snake_case/camelCase mapping. 9 msw v2 tests cover success, errors, timeout, network failure, and request serialization.
- Task 3: Simplified `fly-config.ts` to export `executionServiceConfig` with URL, secret, and timeout settings. 6 tests verify env var reads and defaults.
- Task 4: Rewrote `index.ts` exports — removed all `Fly*` types, added `ExecutionServiceClient`, `ExecutionServiceError`, `ExecuteRequest`, `ExecuteResponse`, `executionServiceConfig`.
- Task 5: Rewrote `execution-processor.ts` from ~611 lines to ~290 lines. Replaced 5+ Fly Machine API calls with single `executionClient.execute()`. Response classification via `exitCode` (0=success, 2=compile error, other=runtime error) and `timedOut` field. Removed `readNdjsonMessages`, `fetchMachineLogs`, `analyzeOutput`, `truncateOutput`. Updated `RunBenchmarkFn` signature to accept `ExecutionServiceClient`. Error handling: retryable (503/429) → reset to queued + re-throw, non-retryable → mark failed.
- Task 5.9: Removed `machineId` field from `ExecutionResult` type. Updated criteria-evaluator test factory.
- Task 6: Updated `worker.ts` — reads `MCC_EXECUTION_URL` and `MCC_EXECUTION_SECRET` instead of `MCC_FLY_API_TOKEN`/`MCC_FLY_APP_NAME`/`MCC_FLY_LOGS_TOKEN`. Creates `ExecutionServiceClient` instead of `FlyClient`.
- Task 7: Rewrote processor tests — mock `ExecutionServiceClient.execute()` directly (no msw). 11 tests cover success, compile error, runtime error, timeout, retryable/non-retryable service errors, criteria evaluation, benchmark integration, DB result shape.
- Task 8: Deleted 7 dead code files: `fly-client.ts`, `fly-client.test.ts`, `fly-api-types.ts`, `machine-request-builder.ts`, `machine-request-builder.test.ts`, `execute.ts`, `execute.test.ts`.
- Task 9: All checks pass — `turbo typecheck` (9/9), `turbo lint` (9/9), `turbo test` (6/6, 576+ tests total).

### Senior Developer Review (AI)

**Reviewer:** Claude Opus 4.6 — Adversarial code review
**Date:** 2026-03-18
**Outcome:** Approved (after fixes)

**Issues found: 3 HIGH, 3 MEDIUM, 1 LOW — all HIGH and MEDIUM fixed automatically**

| # | Severity | Issue | Fix |
|---|---|---|---|
| H1 | HIGH | Client tests silently pass if error not thrown (try/catch with no assertion guard) | Replaced try/catch with `.catch()` pattern ensuring assertions always run; added non-JSON proxy error test |
| H2 | HIGH | Hardcoded `timeoutSeconds = 30` in processor disconnected from `executionServiceConfig` | Added `defaultTimeoutSeconds` to `ExecutionProcessorDeps`; worker passes from config |
| H3 | HIGH | No `execution_result` stored for timed-out submissions | Construct and persist `ExecutionResult` in timeout path; added test |
| M1 | MEDIUM | `response.json()` on non-200 has no fallback for non-JSON proxy errors | Wrapped in try/catch; falls back to `statusText` |
| M2 | MEDIUM | No test for 64KB code size validation branch | Added test: verifies error SSE event, submission marked failed, execute not called |
| M3 | MEDIUM | `executionServiceConfig` exported but unused by worker | Worker now imports and uses `executionServiceConfig.defaultTimeoutSeconds` |
| L1 | LOW | `as` casting in test files | Not fixed — pragmatic for test mocking, minimal risk |

**Verification:** All tests pass (50 execution, 529 backend), typecheck 9/9, lint 9/9.

### Change Log

- 2026-03-18: Code review fixes — non-silent test assertions, configurable timeout injection, execution_result for timeouts, non-JSON error fallback, code size validation test.
- 2026-03-18: Story 11.2 implementation complete — backend integration and execution processor rewrite from Fly Machine lifecycle to persistent execution service HTTP client.

### File List

**New files:**
- `packages/execution/src/execution-service-client.ts`
- `packages/execution/src/execution-service-client.test.ts`

**Modified files:**
- `infra/fly-execution/server/executor.go` — added `TimedOut` field to `ExecuteResponse`, set on timeout
- `infra/fly-execution/server/executor_test.go` — added `timed_out` assertions to existing tests
- `packages/execution/src/fly-config.ts` — simplified to execution service config
- `packages/execution/src/fly-config.test.ts` — rewritten for new config shape
- `packages/execution/src/index.ts` — removed Fly exports, added execution service exports
- `apps/backend/src/worker/processors/execution-processor.ts` — rewritten: single HTTP POST replaces 5+ Fly API calls
- `apps/backend/src/worker/processors/execution-processor.test.ts` — rewritten: mock client directly instead of msw
- `apps/backend/src/worker/worker.ts` — new env vars and ExecutionServiceClient
- `apps/backend/src/shared/execution-types.ts` — removed `machineId` field
- `apps/backend/src/shared/criteria-evaluator.test.ts` — removed `machineId` from test factory

**Deleted files:**
- `packages/execution/src/fly-client.ts`
- `packages/execution/src/fly-client.test.ts`
- `packages/execution/src/fly-api-types.ts`
- `packages/execution/src/machine-request-builder.ts`
- `packages/execution/src/machine-request-builder.test.ts`
- `packages/execution/src/execute.ts`
- `packages/execution/src/execute.test.ts`
