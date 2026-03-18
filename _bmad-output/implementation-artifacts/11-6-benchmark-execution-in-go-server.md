# Story 11.6: Benchmark Execution in Go Server

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **learner**,
I want benchmark workloads to run against my code and a reference implementation after each submission,
so that I can see how my database performs compared to the reference and track my performance improvements over time.

## Acceptance Criteria

1. **AC1: Benchmark harness Go program** — `runBenchmarkOnService()` in `apps/backend/src/worker/processors/execution-processor.ts` (lines 56-71) is implemented. It generates a self-contained benchmark harness Go program that embeds both user code and reference code, compiles and runs both via the existing `/execute` endpoint, collects per-iteration timing, and outputs structured JSON to stdout.

2. **AC2: Structured JSON output** — The benchmark harness outputs newline-delimited JSON matching the format expected by `parseBenchmarkOutput()` (already working in `packages/execution/src/benchmark-runner.ts:125-183`): `{"type":"benchmark_iteration","target":"user"|"reference","iteration":N,"total":T,"ops_per_sec":F,"p50_latency_us":F,"p99_latency_us":F}` for each measured iteration, and `{"type":"benchmark_complete","user_median_ops":F,"reference_median_ops":F,"normalized_ratio":F,"user_p50_us":F,"user_p99_us":F,"ref_p50_us":F,"ref_p99_us":F}` as the final line.

3. **AC3: Reference implementation JSON output** — The reference implementation in `content/milestones/01-kv-store/reference-impl/main.go` is updated: the `runBenchmark()` function (lines 298-342) outputs per-iteration JSON lines instead of plain text. The `test` subcommand output is unchanged.

4. **AC4: Workload parameterization** — The benchmark harness passes workload config (numOperations, keySizeBytes, valueSizeBytes) as command-line args to each binary (e.g., `./main benchmark --ops=1000 --key-size=16 --value-size=64`). Both user and reference implementations parse these args.

5. **AC5: Process isolation** — User and reference binaries compile and run in separate temporary directories with the same isolation as `/execute`: `context.WithTimeout`, isolated tmpdir. They never share filesystem state.

6. **AC6: Error handling** — Compilation errors in user or reference code produce an error in the benchmark stdout (not benchmark results). Timeouts produce `timed_out: true` in the execution response. Benchmark errors do NOT fail the overall submission (existing behavior in execution-processor.ts:331-334 preserved).

7. **AC7: Wire runBenchmark in worker.ts** — The real `runBenchmarkOnService` function is injected into `createExecutionProcessor()` in `apps/backend/src/worker/worker.ts` (lines 53-60) via the `runBenchmark` dep, replacing the current default stub.

8. **AC8: Unit tests (Go reference-impl)** — The updated reference implementation's `benchmark` subcommand is tested manually: `go run main.go benchmark` outputs valid JSON lines that can be validated with `jq`.

9. **AC9: Unit tests (TypeScript)** — Tests in `apps/backend/src/worker/processors/execution-processor.test.ts` verify end-to-end benchmark flow: benchmark config loaded → `runBenchmarkOnService()` called with correct args (user code, reference code, workload) → stdout parsed → `benchmark_result` SSE event published → result persisted to `benchmark_results` table. The existing `BENCHMARK_STDOUT` test constant (line 414-418) validates the expected format.

10. **AC10: Scope** — This story targets `01-kv-store` only. Other milestones (02-05) have empty `reference-impl/` directories and empty benchmark config arrays — they are unaffected.

## Tasks / Subtasks

- [x] Task 1: Update reference implementation to output JSON (AC: #3, #4)
  - [x] 1.1 In `content/milestones/01-kv-store/reference-impl/main.go`, modify `runBenchmark()` (lines 298-342) to output JSON lines instead of plain text
  - [x] 1.2 Each measured iteration outputs: `{"type":"benchmark_iteration","target":"self","iteration":N,"total":T,"ops_per_sec":F,"p50_latency_us":F,"p99_latency_us":F}`
  - [x] 1.3 Add p50/p99 latency tracking per iteration (currently only tracks avg duration — need to record per-operation latencies and compute percentiles)
  - [x] 1.4 Add command-line flag parsing for `--ops`, `--key-size`, `--value-size` so the harness can parameterize the workload
  - [x] 1.5 Keep the `test` subcommand interface and output format unchanged
  - [x] 1.6 Verify: `go run main.go benchmark` outputs valid JSON, `go run main.go test` still prints `PASS:`/`FAIL:` lines

- [x] Task 2: Implement runBenchmarkOnService (AC: #1, #2, #5)
  - [x] 2.1 In `apps/backend/src/worker/processors/execution-processor.ts`, replace the stub at lines 56-71 with a real implementation
  - [x] 2.2 The function generates a benchmark harness Go program that: (a) writes user `main.go` and reference `main.go` to separate subdirectories, (b) compiles both with `go build`, (c) runs warmup iterations (discard output), (d) runs measured iterations capturing per-iteration timing, (e) outputs JSON lines for each iteration and a final `benchmark_complete` summary
  - [x] 2.3 The harness Go code is a string template in TypeScript — user code and reference code are embedded as string literals (escaped) and written to disk at runtime
  - [x] 2.4 Call `opts.executionClient.execute()` with the harness code (base64-encoded), `args: []`, and appropriate timeout (warmup + measured iterations * estimated time per iteration + buffer)
  - [x] 2.5 Return `stdout` from the execution response — `parseBenchmarkOutput()` handles the rest
  - [x] 2.6 The `RunBenchmarkFn` type signature (lines 28-39) already matches: receives `executionClient`, `code`, `referenceMainGo`, `referenceGoMod`, `benchmark` (with workload), `warmup`, `iterations`

- [x] Task 3: Wire runBenchmark into worker.ts (AC: #7)
  - [x] 3.1 In `apps/backend/src/worker/worker.ts` (lines 53-60), add `runBenchmark: runBenchmarkOnService` to the `createExecutionProcessor()` call
  - [x] 3.2 Import `runBenchmarkOnService` — it must be exported from `execution-processor.ts` (currently a private function, needs `export`)

- [x] Task 4: Write TypeScript tests (AC: #9)
  - [x] 4.1 In `execution-processor.test.ts`, update the existing benchmark test (around line 410) that uses `BENCHMARK_STDOUT` — ensure it tests the full flow with a mock `runBenchmark` that returns benchmark JSON
  - [x] 4.2 Test that `runBenchmarkOnService()` calls `executionClient.execute()` with a base64-encoded Go harness program containing both user and reference code
  - [x] 4.3 Test that when `runBenchmarkOnService()` returns valid JSON, the processor publishes `benchmark_result` SSE event and persists to DB
  - [x] 4.4 Test that when `runBenchmarkOnService()` returns empty stdout (e.g., compilation error), the processor logs `benchmark_produced_no_results` and does NOT fail the submission
  - [x] 4.5 Verify existing `parseBenchmarkOutput()` tests still pass (no changes to parser)

- [x] Task 5: Verify no regression (AC: #6, #10)
  - [x] 5.1 Run `turbo typecheck` — no type errors
  - [x] 5.2 Run `turbo test` — all tests pass
  - [x] 5.3 Verify benchmark errors don't fail submissions (existing error handling in lines 331-334 preserved)
  - [x] 5.4 Verify milestones 02-05 are unaffected (empty benchmark configs → no benchmark phase runs)

## Dev Notes

### Architecture Context

This story completes the benchmark execution pipeline. Epic 7 (Stories 7.1-7.5) built all downstream infrastructure: frontend display (`BenchmarkHeroDisplay`), API routes (`benchmark-results.ts`), DB persistence (`benchmark-persistence.ts`), output parser (`parseBenchmarkOutput()`), and SSE event handling. The actual execution was stubbed because the Go execution server didn't exist yet. Now that the Go server is deployed (Stories 11.1-11.5), we implement the missing piece.

### Critical Design Decision: Harness-via-Execute, NOT Separate Endpoint

**DO NOT add a `/benchmark` endpoint to the Go server.** Instead, reuse the existing `/execute` endpoint:

1. `runBenchmarkOnService()` generates a self-contained benchmark harness Go program in TypeScript
2. The harness embeds both user code and reference code as string literals
3. The harness is sent to `/execute` via `executionClient.execute()` — the Go server compiles and runs it like any other Go program
4. The harness's stdout contains the JSON benchmark output
5. `parseBenchmarkOutput()` handles the rest

**Why:** The `RunBenchmarkFn` type (lines 28-39) already receives `executionClient: ExecutionServiceClient` as a parameter. The function is designed to call `executionClient.execute()` and return stdout. Adding a separate `/benchmark` endpoint would require changes to the Go server, a new client method, new types, and deployment — all unnecessary when `/execute` already handles compiling and running arbitrary Go code.

### Where runBenchmarkOnService Lives

The stub is in `apps/backend/src/worker/processors/execution-processor.ts` lines 56-71 (NOT in `packages/execution/src/benchmark-runner.ts` — that file only has `parseBenchmarkOutput()` and types). The real implementation stays in the same file, next to its type definition `RunBenchmarkFn` (lines 28-39).

### Benchmark Harness Go Program Template

The harness Go program generated by `runBenchmarkOnService()` should:
```
1. Write user main.go + go.mod to /tmp/user/
2. Write reference main.go + go.mod to /tmp/ref/
3. Compile both: go build -o user/main . && go build -o ref/main .
4. Run warmup iterations (discard output)
5. For each measured iteration:
   a. Run user binary with benchmark args → capture JSON iteration line → re-tag target as "user"
   b. Run reference binary with benchmark args → capture JSON iteration line → re-tag target as "reference"
   c. Print both iteration lines to stdout
6. Compute medians, normalized ratio
7. Print benchmark_complete JSON line
```

The harness imports only stdlib (`os`, `os/exec`, `encoding/json`, `math`, `sort`, `fmt`, `path/filepath`).

### Worker.ts Wiring Gap

`apps/backend/src/worker/worker.ts` lines 53-60 creates the processor WITHOUT injecting `runBenchmark`:
```typescript
const processor = createExecutionProcessor({
  executionClient, db, eventPublisher, logger, contentLoader,
  defaultTimeoutSeconds: executionServiceConfig.defaultTimeoutSeconds,
  // runBenchmark is NOT passed — defaults to stub
})
```
After implementing, add `runBenchmark: runBenchmarkOnService` here and export the function.

### Reference Implementation Current vs Target Output

**Current** (`content/milestones/01-kv-store/reference-impl/main.go:298-342`) — plain text:
```
Warming up...
Benchmarking sequential inserts...
Results: 1000 inserts, avg 123.45ms, 8094.75 ops/sec
```

**Target** — JSON lines (one per measured iteration):
```json
{"type":"benchmark_iteration","target":"self","iteration":1,"total":10,"ops_per_sec":8094.75,"p50_latency_us":117,"p99_latency_us":450}
```

The `test` subcommand output (`PASS:`/`FAIL:` lines) must NOT change.

### Reference-Impl Loading

Reference files are loaded via direct `readFile()` at execution-processor.ts lines 266-276 (NOT through ContentLoader):
```typescript
const contentBase = resolve(process.cwd(), '..', '..', 'content', 'milestones', milestoneSlug, 'reference-impl')
referenceMainGo = await readFile(join(contentBase, 'main.go'), 'utf-8')
referenceGoMod = await readFile(join(contentBase, 'go.mod'), 'utf-8')
```
This is already working. Do NOT refactor this loading — keep it as-is.

### Expected Test Constant Format

The existing test constant at `execution-processor.test.ts:414-418` shows the exact JSON format:
```typescript
const BENCHMARK_STDOUT = [
  '{"type":"benchmark_iteration","target":"user","iteration":1,"total":12,"ops_per_sec":8500,"p50_latency_us":117,"p99_latency_us":450}',
  '{"type":"benchmark_iteration","target":"reference","iteration":1,"total":12,"ops_per_sec":10200,"p50_latency_us":98,"p99_latency_us":380}',
  '{"type":"benchmark_complete","user_median_ops":8200,"reference_median_ops":10100,"normalized_ratio":0.8119,"user_p50_us":120,"user_p99_us":445,"ref_p50_us":100,"ref_p99_us":385}',
].join('\n')
```

### Key File Locations

- `apps/backend/src/worker/processors/execution-processor.ts` — **PRIMARY CHANGE**: `runBenchmarkOnService()` stub (lines 56-71), `RunBenchmarkFn` type (lines 28-39), benchmark flow (lines 260-335)
- `apps/backend/src/worker/processors/execution-processor.test.ts` — **UPDATE**: benchmark tests around line 410, `BENCHMARK_STDOUT` constant (lines 414-418)
- `apps/backend/src/worker/worker.ts` — **UPDATE**: wire `runBenchmark` into processor deps (lines 53-60)
- `content/milestones/01-kv-store/reference-impl/main.go` — **UPDATE**: `runBenchmark()` output format (lines 298-342)
- `content/milestones/01-kv-store/reference-impl/go.mod` — **NO CHANGES**: `module tycs/kv-store-reference`, `go 1.21.4`
- `packages/execution/src/benchmark-runner.ts` — **NO CHANGES**: `parseBenchmarkOutput()` already works
- `packages/execution/src/execution-service-client.ts` — **NO CHANGES**: `execute()` method already sufficient
- `infra/fly-execution/server/` — **NO CHANGES**: `/execute` endpoint handles benchmark harness as regular Go code
- `apps/backend/src/shared/benchmark-persistence.ts` — **NO CHANGES**: persistence already working

### Previous Story Intelligence (from Story 11.5)

- `execution-processor.ts` uses dependency injection — `executionClient`, `contentLoader`, `runBenchmark` all injected via `deps` (line 48: `runBenchmark?: RunBenchmarkFn`)
- Default fallback: `const executeBenchmark = deps.runBenchmark ?? runBenchmarkOnService` (line 77)
- Test mock factories: `createMockExecutionClient`, `createMockContentLoader`, `createTestJob`, `seedUserAndSubmission`
- User code is available as `code` string (from `job.data.code`) — already base64-decoded
- Reference code is loaded as `referenceMainGo` and `referenceGoMod` strings (lines 266-276)
- The harness needs to re-encode both as base64 when calling `executionClient.execute()`

### References

- [Source: apps/backend/src/worker/processors/execution-processor.ts#runBenchmarkOnService] — Stub to implement (lines 56-71)
- [Source: apps/backend/src/worker/processors/execution-processor.ts#RunBenchmarkFn] — Type definition (lines 28-39)
- [Source: apps/backend/src/worker/processors/execution-processor.ts] — Benchmark flow (lines 260-335)
- [Source: apps/backend/src/worker/processors/execution-processor.test.ts#BENCHMARK_STDOUT] — Expected JSON format (lines 414-418)
- [Source: apps/backend/src/worker/worker.ts] — Processor creation missing runBenchmark (lines 53-60)
- [Source: packages/execution/src/benchmark-runner.ts#parseBenchmarkOutput] — JSON parser (lines 125-183), DO NOT CHANGE
- [Source: packages/execution/src/benchmark-runner.ts#BenchmarkRunResult] — Result type (lines 8-18)
- [Source: packages/execution/src/execution-service-client.ts] — NO CHANGES needed, execute() is sufficient
- [Source: content/milestones/01-kv-store/reference-impl/main.go#runBenchmark] — Plain text → JSON (lines 298-342)
- [Source: content/milestones/01-kv-store/benchmark-config.yaml] — Workload config (sequential-inserts, 1000 ops)
- [Source: packages/shared/src/types/curriculum.ts] — BenchmarkConfig, Benchmark, BenchmarkWorkload types (lines 43-79)
- [Source: apps/backend/src/shared/benchmark-persistence.ts] — DB persistence (already working)
- [Source: apps/webapp/e2e/benchmark-roundtrip.spec.ts] — Skipped E2E test (unskip is optional — depends on deployed Go server)
- [Source: _bmad-output/project-context.md] — 65 project rules

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6 (1M context)

### Debug Log References

### Completion Notes List

- Task 1: Updated reference-impl `runBenchmark()` to output per-iteration JSON with `target:"self"`, p50/p99 latency tracking via per-operation timing, and `--ops`/`--key-size`/`--value-size` flag parsing. `test` subcommand output unchanged. Verified with `go build` + manual run.
- Task 2: Replaced `runBenchmarkOnService()` stub with real implementation. Generates a self-contained benchmark harness Go program in TypeScript that embeds user/reference code as string literals, compiles both in isolated tempdirs, runs warmup + measured iterations, re-tags targets, and outputs JSON lines + summary. Sent to `/execute` via `executionClient.execute()` — no new Go server endpoint needed.
- Task 3: Wired `runBenchmark: runBenchmarkOnService` into `createExecutionProcessor()` in `worker.ts`. Exported `runBenchmarkOnService` from `execution-processor.ts`.
- Task 4: Added 3 new tests: (1) `runBenchmarkOnService` calls `execute()` with base64-encoded harness containing embedded user/reference code and workload params; (2) full flow test verifying `benchmark_result` SSE event + `benchmark_results` DB persistence; (3) empty stdout from benchmark doesn't fail submission. All 19 execution-processor tests pass.
- Task 5: `turbo typecheck` and `turbo test` pass (535 tests, 0 failures). Benchmark error handling preserved. Milestones 02-05 unaffected (empty benchmark arrays).

### Change Log

- 2026-03-18: Implemented benchmark execution in Go server (Story 11.6)
- 2026-03-18: Code review fixes — (1) CRITICAL: added cmd.Dir on go build commands in harness so compilation targets correct source dirs, (2) aggregated p50/p99 latencies across iterations via median instead of using only last iteration, (3) added structural test assertions verifying harness correctness (Dir set, median aggregation), (4) reduced timeout estimate from 30s to 5s per binary run, (5) added sprint-status.yaml to File List

### File List

- content/milestones/01-kv-store/reference-impl/main.go — Updated `runBenchmark()` to JSON output with p50/p99 and flag parsing
- apps/backend/src/worker/processors/execution-processor.ts — Replaced `runBenchmarkOnService()` stub with real harness-based implementation, added `export`
- apps/backend/src/worker/processors/execution-processor.test.ts — Added 3 new benchmark tests (harness verification, SSE+DB flow, empty stdout)
- apps/backend/src/worker/worker.ts — Wired `runBenchmark: runBenchmarkOnService` into processor deps
- _bmad-output/implementation-artifacts/sprint-status.yaml — Added 11-6 story status entry
