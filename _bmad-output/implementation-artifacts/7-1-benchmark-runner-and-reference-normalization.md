# Story 7.1: Benchmark Runner & Reference Normalization

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a developer,
I want a benchmark execution pipeline that produces consistent, reference-normalized results,
so that learners can meaningfully compare their performance across submissions and milestones.

## Acceptance Criteria

1. Given a learner triggers a benchmark run, when the benchmark workload executes against the learner's code, then standardized benchmark workloads run against the learner's compiled code in the Fly.io execution environment (FR23)
2. Given a benchmark execution completes, when results are computed, then the same workloads run against a pinned reference implementation to produce a normalization baseline — both runs happen on the **same Fly Machine** to eliminate host-level variance
3. Given benchmark results are computed, when delivered to the client, then results include both raw absolute numbers (ops/sec, latency) and a normalized ratio against the reference (`user_median / reference_median`, stored as decimal — e.g., 1.15 = 15% slower)
4. Given a reference implementation exists, when it is used for normalization, then the reference implementation is pinned per track version and updated only with historical score migration (NFR-R3)
5. Given identical code is submitted twice within a session, when benchmarks run, then normalized ratio variance is within ±5% (NFR-R2). Warm-up: 2 iterations discarded, then N measured (N configurable per milestone, default 10)
6. Given benchmark logic is implemented, when reviewing code location, then benchmark execution logic resides in `packages/execution` as shared code (ARCH-9)
7. Given a benchmark completes, when results are persisted, then a migration creates the `benchmark_results` table with: result ID (cuid2), submission ID, user ID, milestone ID, raw metrics (JSON), normalized ratio, reference version, and timestamp
8. Given results are stored, when queried, then `kysely-codegen` is re-run to update TypeScript types after migration

## Tasks / Subtasks

- [x] Task 1: Create `benchmark_results` database migration (AC: #7, #8)
  - [x] 1.1 Create migration `009_add_benchmark_results.ts` in `apps/backend/migrations/`. Table schema:
    ```sql
    benchmark_results (
      id           text PRIMARY KEY,        -- cuid2
      submission_id text NOT NULL REFERENCES submissions(id),
      user_id      text NOT NULL REFERENCES users(id),
      milestone_id text NOT NULL REFERENCES milestones(id),
      raw_metrics  jsonb NOT NULL,          -- { userMedian, referenceMedian, opsPerSec, p50LatencyUs, p99LatencyUs }
      normalized_ratio numeric(8,4) NOT NULL, -- user_median / reference_median (decimal, e.g. 1.15)
      reference_version text NOT NULL,      -- git tag or commit pinned in benchmark config
      created_at   timestamptz NOT NULL DEFAULT now()
    )
    ```
    Indexes: `idx_benchmark_results_submission_id` on `submission_id`, `idx_benchmark_results_user_id_milestone_id` on `(user_id, milestone_id)` for historical queries (Story 7.3)
  - [x] 1.2 Run `pnpm --filter backend db:migrate` then `pnpm --filter shared db:types` to regenerate `db.ts` via `kysely-codegen`
  - [x] 1.3 Verify generated types include `BenchmarkResults` table with correct column types

- [x] Task 2: Implement benchmark runner in `packages/execution` (AC: #1, #2, #5, #6)
  - [x] 2.1 Create `packages/execution/src/benchmark-runner.ts` with:
    ```typescript
    // DO NOT reuse the name `BenchmarkConfig` — it already exists in @mycscompanion/shared
    // (curriculum.ts: `BenchmarkConfig = { benchmarks: readonly Benchmark[] }`).
    // Use the existing `Benchmark` type from shared as the input to the runner.
    import type { Benchmark } from '@mycscompanion/shared'

    export interface BenchmarkRunResult {
      readonly benchmarkName: string        // e.g., "sequential-inserts"
      readonly userMedian: number           // Median ops/sec from user implementation
      readonly referenceMedian: number      // Median ops/sec from reference implementation
      readonly normalizedRatio: number      // userMedian / referenceMedian
      readonly rawUserTimings: readonly number[]
      readonly rawReferenceTimings: readonly number[]
      readonly opsPerSec: number            // User absolute ops/sec (hero number)
      readonly p50LatencyUs: number | null
      readonly p99LatencyUs: number | null
    }
    ```
    **NAMING WARNING:** `BenchmarkConfig` is already exported from `@mycscompanion/shared` (curriculum.ts line 77). It wraps an array: `{ benchmarks: readonly Benchmark[] }`. The runner should accept a single `Benchmark` object (one benchmark at a time), not create a new config type. The processor iterates the array and calls the runner per benchmark.
  - [x] 2.2 Implement `parseBenchmarkOutput(stdout: string): BenchmarkRunResult` — parses the complete structured JSON output from the Go benchmark harness. This function does NOT execute anything — the execution processor runs the Go process on the Fly Machine and passes stdout here for parsing. The Go harness handles iteration timing internally; Node.js only parses results.
    Expected Go output format (structured JSON, one line per event):
    ```json
    {"type":"benchmark_iteration","target":"user","iteration":1,"total":12,"ops_per_sec":8500,"p50_latency_us":117,"p99_latency_us":450}
    {"type":"benchmark_iteration","target":"reference","iteration":1,"total":12,"ops_per_sec":10200,"p50_latency_us":98,"p99_latency_us":380}
    ...
    {"type":"benchmark_complete","user_median_ops":8200,"reference_median_ops":10100,"normalized_ratio":0.8119,"user_p50_us":120,"user_p99_us":445,"ref_p50_us":100,"ref_p99_us":385}
    ```
    Parse iteration lines to extract `rawUserTimings` and `rawReferenceTimings`. Parse the `benchmark_complete` line for final metrics. If `benchmark_complete` line is missing, compute medians from iteration data using `computeMedian`.
  - [x] 2.3 Implement `computeMedian(values: readonly number[]): number` — sorts and returns middle value (or average of two middle values for even counts)
  - [x] 2.4 Implement `classifyBenchmarkError(error: unknown): BenchmarkErrorType` — categorize benchmark failures:
    ```typescript
    export type BenchmarkErrorType = 'timeout' | 'output_parse_error' | 'reference_missing' | 'compilation_error' | 'unknown'
    ```
  - [x] 2.5 Export new types and functions from `packages/execution/src/index.ts`
  - [x] 2.6 Unit test: `computeMedian` with odd/even arrays, single element, sorted/unsorted inputs
  - [x] 2.7 Unit test: `parseBenchmarkOutput` parses valid structured JSON with iteration + complete lines
  - [x] 2.8 Unit test: `parseBenchmarkOutput` handles malformed lines gracefully (skips bad lines, still parses valid ones)
  - [x] 2.9 Unit test: `parseBenchmarkOutput` computes medians from iteration data when `benchmark_complete` line is missing
  - [x] 2.10 Unit test: normalized ratio calculated correctly (e.g., user 8000 ops/s, reference 10000 ops/s → ratio 0.80)
  - [x] 2.11 Unit test: benchmark with identical user and reference timings produces ratio ~1.0
  - [x] 2.12 Unit test: `classifyBenchmarkError` maps error types correctly

- [x] Task 3: Integrate benchmark phase into execution processor (AC: #1, #2, #3)
  - [x] 3.1 Modify `apps/backend/src/worker/processors/execution-processor.ts` — after successful compilation + test pass + milestone has benchmark config, add benchmark phase:
    - Load benchmark config via `contentLoader.loadBenchmarkConfig(milestone.slug)`
    - If benchmark config is null or `benchmarks` array is empty, skip benchmark phase entirely
    - **Iterate over `benchmarkConfig.benchmarks` array** — `loadBenchmarkConfig` returns `BenchmarkConfig = { benchmarks: readonly Benchmark[] }`, not a single benchmark. For MVP, run all benchmarks sequentially. Store one `benchmark_results` row per benchmark.
    - Load reference implementation source files from `content/milestones/{slug}/reference-impl/` — read **both** `main.go` AND `go.mod` (both are required for Go compilation). Use `fs.readFile()` in the processor (not ContentLoader — this is raw file I/O, not cached curriculum content)
    - Upload reference source to same Fly Machine alongside user code
    - Publish `benchmark_progress` events during execution (iteration count updates)
    - Execute benchmark via Go harness on the **same Fly Machine** — parse stdout with `parseBenchmarkOutput` from `packages/execution`
    - Publish `benchmark_result` event with `userMedian`, `referenceMedian`, `normalizedRatio`, `opsPerSec`
    - Store results in `benchmark_results` table via Kysely
    **CRITICAL:** Benchmark runs on the SAME machine that compiled the user code — do NOT create a second machine. The architecture mandates same-host execution for variance elimination.
  - [x] 3.2 `ExecutionProcessorDeps.contentLoader` is already present — verify `loadBenchmarkConfig` method exists on `ContentLoader` interface (it does — from Story 4.1)
  - [x] 3.3 Extend `buildMachineRequest` in `packages/execution/src/machine-request-builder.ts` to accept optional reference source files: `referenceFiles?: ReadonlyArray<{ filename: string; content: string }>`. Upload as separate files in the Fly Machine filesystem (e.g., `/reference/main.go`, `/reference/go.mod`). Do NOT change existing user code upload logic.
  - [x] 3.4 Load reference code on-demand in the processor via `fs.readFile()` — do NOT bloat `ExecutionJobData` with reference source. Read from `content/milestones/{slug}/reference-impl/main.go` and `content/milestones/{slug}/reference-impl/go.mod`. Handle missing files gracefully (log warning, skip benchmark)
  - [x] 3.5 Define the Go execution image `--benchmark` CLI contract (actual Go image changes are a parallel workstream):
    ```
    ./run --benchmark --workload=inserts --operations=1000 --key-size=16 --value-size=64 --warmup=2 --iterations=10
    ```
    User code at `/code/main.go`, reference at `/reference/main.go`. Go harness compiles both, runs benchmarks sequentially on same host, outputs structured JSON (see Task 2.2 format).
    **For this story:** Use fixture/mock Go output in tests. If the Go image doesn't support `--benchmark` yet, the benchmark phase should gracefully skip (log warning, don't fail the submission).
  - [x] 3.6 Create `apps/backend/src/shared/benchmark-persistence.ts`:
    ```typescript
    export async function persistBenchmarkResult(
      db: Kysely<DB>,
      params: {
        readonly submissionId: string
        readonly userId: string
        readonly milestoneId: string
        readonly benchmarkName: string
        readonly result: BenchmarkRunResult
        readonly referenceVersion: string
      }
    ): Promise<string>  // Returns benchmark result ID
    ```
    Uses `createId()` from `@paralleldrive/cuid2` for ID generation (same pattern as submissions). Stores `raw_metrics` as JSONB. **Important:** `normalized_ratio` column is `numeric(8,4)` which Kysely types as `string`. Convert with `.toString()` on insert and `parseFloat()` on read.
  - [x] 3.7 Unit test: execution processor skips benchmark phase when `loadBenchmarkConfig` returns null
  - [x] 3.8 Unit test: execution processor skips benchmark phase when `benchmarks` array is empty
  - [x] 3.9 Unit test: execution processor runs benchmark phase after successful compilation + tests pass
  - [x] 3.10 Unit test: execution processor does NOT run benchmarks when compilation fails
  - [x] 3.11 Unit test: execution processor does NOT run benchmarks when tests fail
  - [x] 3.12 Unit test: benchmark results are persisted to `benchmark_results` table with correct fields (including `normalized_ratio` as string)
  - [x] 3.13 Unit test: `benchmark_progress` events are published with iteration counts
  - [x] 3.14 Unit test: `benchmark_result` event is published with correct metrics including `opsPerSec`
  - [x] 3.15 Unit test: benchmark timeout (>60s) is handled gracefully — submission still completes with test results, benchmark marked as timed out
  - [x] 3.16 Unit test: missing reference implementation files are handled gracefully (benchmark skipped, not crashed)
  - [x] 3.17 Unit test: multiple benchmarks in `benchmarks` array are all executed and persisted

- [x] Task 4: Implement `benchmark-threshold` criteria evaluation (AC: #1)
  - [x] 4.1 In `apps/backend/src/shared/criteria-evaluator.ts`, implement the `benchmark-threshold` case (currently a TODO at line ~57). Both `evaluateCriteria` AND the private `evaluateSingle` function need signature changes — `evaluateSingle` is where the switch/case lives, and `evaluateCriteria` delegates to it via `.map()`.
    Update `evaluateSingle`:
    ```typescript
    function evaluateSingle(
      criterion: AcceptanceCriterion,
      executionResult: ExecutionResult,
      benchmarkResult?: BenchmarkRunResult | null,  // NEW param
    ): CriterionResult {
      // ... existing cases unchanged ...
      case 'benchmark-threshold': {
        const threshold = Number(criterion.assertion.expected)
        const userOpsPerSec = benchmarkResult?.opsPerSec ?? 0
        status = userOpsPerSec >= threshold ? 'met' : 'not-met'
        actual = userOpsPerSec > 0 ? `${userOpsPerSec} ops/sec` : 'No benchmark data'
        break
      }
    }
    ```
    **Note:** Use `Number(criterion.assertion.expected)` not `as number` — avoid `as` casting per project rules.
  - [x] 4.2 Update `evaluateCriteria` to accept and pass through `benchmarkResult`:
    ```typescript
    export function evaluateCriteria(
      criteria: ReadonlyArray<AcceptanceCriterion>,
      executionResult: ExecutionResult,
      benchmarkResult?: BenchmarkRunResult | null,
    ): ReadonlyArray<CriterionResult> {
      return criteria.map((c) => evaluateSingle(c, executionResult, benchmarkResult))
    }
    ```
    Existing callers pass only 2 args — the new param is optional, so no changes needed at call sites until benchmark results are available.
  - [x] 4.3 Unit test: `benchmark-threshold` criterion returns `met` when ops/sec exceeds threshold
  - [x] 4.4 Unit test: `benchmark-threshold` criterion returns `not-met` when ops/sec is below threshold
  - [x] 4.5 Unit test: `benchmark-threshold` criterion returns `not-met` with "No benchmark data" when no benchmark result available
  - [x] 4.6 Existing criteria tests continue to pass (no regressions)

- [x] Task 5: Add benchmark API query endpoint (AC: #7)
  - [x] 5.1 Create `apps/backend/src/plugins/execution/routes/benchmark-results.ts` — `GET /api/execution/submissions/:submissionId/benchmark` returns benchmark result for a specific submission. Response shape:
    ```typescript
    {
      id: string
      submissionId: string
      opsPerSec: number          // Hero number (absolute)
      normalizedRatio: number    // Secondary metric
      userMedian: number
      referenceMedian: number
      p50LatencyUs: number | null
      p99LatencyUs: number | null
      referenceVersion: string
      createdAt: string          // ISO 8601
    }
    ```
    Auth required — verify `request.uid` matches submission's `user_id`. Return 404 if no benchmark result exists for this submission.
  - [x] 5.2 Register route in `apps/backend/src/plugins/execution/index.ts`
  - [x] 5.3 Use `toCamelCase()` from `@mycscompanion/shared` for DB→API conversion (snake_case → camelCase)
  - [x] 5.4 Unit test: returns benchmark result for valid submission owned by user
  - [x] 5.5 Unit test: returns 404 when no benchmark result exists
  - [x] 5.6 Unit test: returns 403 when submission belongs to different user
  - [x] 5.7 Unit test: response fields are camelCase (not snake_case)

## Dev Notes

### Architecture Compliance

- **Benchmark logic in `packages/execution`** — per ARCH-9, benchmark runner (warm-up, iterations, normalization) lives in the shared execution package. Imported by worker (full package) and content CI (full package).
- **Same Fly Machine for user + reference** — architecture mandates sequential execution on the same machine to eliminate host-level variance. Do NOT create a second machine for the reference run.
- **Plugin isolation preserved** — benchmark persistence is a shared utility. The execution plugin handles the route. No cross-plugin imports.
- **`cuid2` for IDs** — per project context, all entity IDs use cuid2. Never auto-increment, never UUID.
- **Cursor-based pagination** ready — index on `(user_id, milestone_id)` supports the historical queries in Story 7.3.
- **No new Zustand stores** — this is a backend-only story. Frontend display is Story 7.2.
- **No new packages** — all work within existing `packages/execution`, `apps/backend`, and `packages/shared`.

### Existing Implementation to Build On

**Already implemented (DO NOT duplicate):**

| What | Where | Status |
|---|---|---|
| `ExecutionEvent` discriminated union with `benchmark_progress` and `benchmark_result` types | `packages/execution/src/events.ts` | Defined — needs `opsPerSec` added to `benchmark_result` variant |
| `BenchmarkConfig = { benchmarks: readonly Benchmark[] }` (array wrapper) | `packages/shared/src/types/curriculum.ts` | Defined — DO NOT create another `BenchmarkConfig` type. Use `Benchmark` for single items |
| `loadBenchmarkConfig(slug)` method | `apps/backend/src/plugins/curriculum/content-loader.ts` | Working — loads from YAML, caches in Redis |
| `benchmark-threshold` assertion type placeholder | `apps/backend/src/shared/criteria-evaluator.ts` line ~57 | TODO stub — needs implementation |
| `benchmark-config.yaml` for milestone 1 | `content/milestones/01-kv-store/benchmark-config.yaml` | Populated — sequential-inserts, 1000 ops, target 100 ops/sec |
| Reference implementation for milestone 1 | `content/milestones/01-kv-store/reference-impl/` | Contains `main.go` AND `go.mod` — both must be uploaded to Fly Machine |
| Benchmark config JSON schema | `content/schema/benchmark-config.schema.json` | Defined — validates YAML structure |
| `EventPublisher` for SSE events | `apps/backend/src/shared/event-publisher.ts` | Working — publishes to Redis pub/sub |
| Execution processor (compile → test → criteria) | `apps/backend/src/worker/processors/execution-processor.ts` | Working — extend with benchmark phase |
| `OverviewData` placeholder fields | `packages/shared/src/types/api.ts` | Placeholder — `lastBenchmark: null`, `benchmarkTrend: null` |

**Extend, don't replace:**
- `execution-processor.ts` — add benchmark phase AFTER successful tests, don't restructure existing compile/test flow
- `criteria-evaluator.ts` — implement the existing TODO case, add optional param, don't change other assertion types
- `machine-request-builder.ts` — add optional reference code parameter, don't change existing code upload logic
- `events.ts` — `benchmark_result` event type needs `opsPerSec` field added (hero number for frontend). Current type only has `userMedian`, `referenceMedian`, `normalizedRatio`. Add `opsPerSec: number` to the `benchmark_result` variant in the discriminated union. Story 7.2 will consume this via SSE for the hero display
- `content-loader.ts` — `loadBenchmarkConfig` already works, no changes needed

### Execution Pipeline Flow (Updated with Benchmark)

```
Current:  submit → queue → provision machine → compile → test → evaluate criteria → complete
Updated:  submit → queue → provision machine → compile → test → evaluate criteria → [benchmark phase] → complete

Benchmark phase (only when milestone has benchmark config):
  → Load benchmark config for milestone
  → Load reference implementation source
  → Upload reference code to same machine
  → Run user benchmark (2 warmup + N measured iterations)
  → Publish benchmark_progress events (iteration X/N)
  → Run reference benchmark (2 warmup + N measured iterations)
  → Parse structured JSON output from Go harness
  → Compute normalized ratio (user_median / reference_median)
  → Publish benchmark_result event
  → Persist to benchmark_results table
  → Evaluate benchmark-threshold criteria if any
  → Continue to complete event
```

### Go Execution Image Contract

See Task 2.2 and Task 3.5 for the complete CLI interface and JSON output format. The Go image update is a parallel workstream — for this story, use fixture/mock Go output in tests. If the Go image doesn't support `--benchmark` yet, the benchmark phase should gracefully skip (log warning, don't fail the submission).

### Database Migration Notes

- Migration `009_add_benchmark_results.ts` follows existing Kysely migration pattern (see `001_initial_schema.ts` through `008_add_tutor_messages.ts`)
- Use `numeric(8,4)` for `normalized_ratio` — precision sufficient for ±0.0001 accuracy
- `raw_metrics` stored as JSONB for flexibility — can store additional metrics without schema changes
- Foreign keys reference existing tables (submissions, users, milestones)
- Down migration: `DROP TABLE benchmark_results`

### Benchmark Config from Content (Milestone 1)

Actual structure from `content/milestones/01-kv-store/benchmark-config.yaml`:
```yaml
milestone: 01-kv-store

benchmarks:                          # ← ARRAY of benchmarks, not flat!
  - name: sequential-inserts
    description: >
      Sequential insertion of 1,000 key-value pairs with 16-byte keys
      and 64-byte values. Measures raw write throughput including
      disk persistence on every Put.
    warmup_iterations: 2
    measured_iterations: 10
    workload:
      type: inserts
      num_operations: 1000
      key_size_bytes: 16
      value_size_bytes: 64
    target_metrics:
      ops_per_sec: 100
    reference_version: milestone-1-v1   # Pinned reference tag
```
**Key:** `loadBenchmarkConfig()` returns `BenchmarkConfig = { benchmarks: readonly Benchmark[] }`. Iterate the array — milestone 1 has one benchmark, but future milestones may have multiple.

### Testing Strategy

- **Benchmark runner tests:** Pure unit tests in `packages/execution/src/benchmark-runner.test.ts` — mock Go process output, test median computation, test warmup discarding, test ratio calculation
- **Execution processor tests:** Extend `execution-processor.test.ts` — mock `contentLoader.loadBenchmarkConfig()`, mock benchmark runner output, verify event publishing and DB persistence. Use `fastify.inject()` pattern is not applicable here (processor is BullMQ worker, not HTTP route) — test the processor function directly
- **Criteria evaluator tests:** Extend `criteria-evaluator.test.ts` — test `benchmark-threshold` case with various ops/sec values
- **API route tests:** `fastify.inject()` for `GET /api/execution/submissions/:id/benchmark` — test auth, 404, response shape
- **Migration test:** Verify migration runs successfully, table created with correct schema (manual verification after `db:migrate`)
- **Mock pattern:** Use existing `@mycscompanion/config/test-utils/` — DO NOT create ad-hoc mocks. For benchmark output fixtures, create a `benchmark-fixtures.ts` in test-utils if reusable across multiple test files

### Key Patterns from Previous Stories

- Follow DI composition pattern from Story 6.6 (`withCircuitBreaker` in `index.ts`) — benchmark runner should be created outside and injected into processor deps
- Follow `classifyError` pattern for benchmark error categorization (Task 2.4)

### Project Structure Notes

- New files follow existing conventions: `kebab-case.ts` for services/utilities
- Test files co-located: `benchmark-runner.test.ts` next to `benchmark-runner.ts`
- No `integration/` directories — place all tests alongside source
- `numeric(8,4)` column type — Kysely handles this as `string` in TypeScript (Postgres numeric). Convert to `number` with `parseFloat()` in API response
- `toCamelCase()` from `@mycscompanion/shared` handles snake_case DB → camelCase API conversion

### Architecture File Tree Discrepancy

The architecture document's file tree (lines ~915-922) places `benchmark-runner.ts` inside `apps/backend/src/worker/processors/`, but the ARCH-9 descriptive text says benchmark runner logic belongs in `packages/execution`. **Follow ARCH-9 text** — place in `packages/execution/src/benchmark-runner.ts`. The file tree is the inconsistent artifact.

### References

- [Source: _bmad-output/planning-artifacts/epics.md — Epic 7, Story 7.1]
- [Source: _bmad-output/planning-artifacts/architecture.md — Benchmark Architecture section, Execution Pipeline, Core Schema]
- [Source: _bmad-output/planning-artifacts/prd.md — FR9, FR10, FR11, FR23; NFR-P2, NFR-R2, NFR-R3]
- [Source: _bmad-output/project-context.md — Project rules and conventions]
- [Source: packages/execution/src/events.ts — ExecutionEvent discriminated union]
- [Source: packages/shared/src/types/curriculum.ts — Benchmark, BenchmarkConfig, BenchmarkWorkload types]
- [Source: apps/backend/src/shared/criteria-evaluator.ts — benchmark-threshold TODO at line ~57]
- [Source: apps/backend/src/worker/processors/execution-processor.ts — Current execution pipeline]
- [Source: content/milestones/01-kv-store/ — benchmark-config.yaml, reference-impl/{main.go, go.mod}]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6

### Debug Log References

### Completion Notes List

- Task 1: Created migration `009_add_benchmark_results.ts` with correct schema (cuid2 PK, JSONB raw_metrics, numeric(8,4) normalized_ratio, FK constraints, indexes for submission_id and (user_id, milestone_id)). Ran migration and regenerated `kysely-codegen` types. `BenchmarkResults` interface verified in `db.ts`.
- Task 2: Created `packages/execution/src/benchmark-runner.ts` with `BenchmarkRunResult` interface, `computeMedian()`, `parseBenchmarkOutput()` (parses structured JSON from Go harness with fallback to iteration-based median computation), and `classifyBenchmarkError()`. 17 unit tests all passing.
- Task 3: Integrated benchmark phase into `execution-processor.ts` — loads benchmark config, loads reference implementation files, publishes `benchmark_progress` events. Currently skips actual Go image benchmark execution (parallel workstream — logs info and skips gracefully). Extended `buildMachineRequest` to accept optional `referenceFiles`. Created `benchmark-persistence.ts` utility. Added `opsPerSec` field to `benchmark_result` event type. 4 new integration tests for skip conditions and missing reference handling.
- Task 4: Implemented `benchmark-threshold` case in `criteria-evaluator.ts` — compares `opsPerSec` against threshold. Updated both `evaluateSingle` and `evaluateCriteria` to accept optional `BenchmarkRunResult` parameter. 4 new tests (met, not-met, no data, exact threshold). All existing criteria tests pass without changes.
- Task 5: Created `GET /api/execution/submissions/:submissionId/benchmark` route in `benchmark-results.ts`. Returns camelCase response with `opsPerSec` (hero number), `normalizedRatio`, latency metrics. Auth enforcement (403 for wrong user), 404 when no result exists. Registered in execution plugin. 4 route tests all passing.

### Change Log

- 2026-03-11: Implemented Story 7.1 — Benchmark Runner & Reference Normalization (all 5 tasks)
- 2026-03-11: Code review fixes — completed benchmark pipeline (parse/persist/publish), added 7 missing tests, fixed `as` casting violations, added `benchmark_name` column, fixed reference file path resolution, deduplicated milestone slug lookup, added injectable `runBenchmark` for testability

### File List

**New files:**
- `apps/backend/migrations/009_add_benchmark_results.ts` — benchmark_results table migration (includes `benchmark_name` column)
- `packages/execution/src/benchmark-runner.ts` — benchmark output parser, median computation, error classification
- `packages/execution/src/benchmark-runner.test.ts` — 17 unit tests for benchmark runner
- `apps/backend/src/shared/benchmark-persistence.ts` — persist benchmark results to DB
- `apps/backend/src/plugins/execution/routes/benchmark-results.ts` — GET benchmark result API route
- `apps/backend/src/plugins/execution/routes/benchmark-results.test.ts` — 4 route tests

**Modified files:**
- `packages/execution/src/events.ts` — added `opsPerSec` field to `benchmark_result` event type
- `packages/execution/src/events.test.ts` — updated benchmark_result test to include `opsPerSec`
- `packages/execution/src/index.ts` — exported benchmark runner types and functions, ReferenceFile type
- `packages/execution/src/machine-request-builder.ts` — added optional `referenceFiles` to `BuildMachineRequestOptions`
- `apps/backend/src/shared/criteria-evaluator.ts` — implemented `benchmark-threshold` case, added optional `benchmarkResult` parameter
- `apps/backend/src/shared/criteria-evaluator.test.ts` — replaced stub test with 4 benchmark-threshold tests
- `apps/backend/src/worker/processors/execution-processor.ts` — integrated benchmark phase with complete parse/persist/publish pipeline, injectable `runBenchmark` for testability
- `apps/backend/src/worker/processors/execution-processor.test.ts` — 11 benchmark integration tests (4 skip conditions + 7 positive-path tests)
- `apps/backend/src/plugins/execution/index.ts` — registered benchmark results route
- `packages/shared/src/types/db.ts` — regenerated (includes BenchmarkResults table types with benchmark_name)
