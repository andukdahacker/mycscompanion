# Story 11.5: Wire Command Args to Execution Service

Status: done

## Story

As a **learner**,
I want my submitted code to be executed with the correct command-line arguments specified in the milestone acceptance criteria,
so that acceptance criteria evaluation works correctly for milestones that require specific arguments (e.g., `./main test`).

## Acceptance Criteria

1. **AC1: Extract commandArgs from criteria** — Before calling the execution service, the execution processor reads the milestone's acceptance criteria and extracts the `commandArgs` value. All criteria for a given milestone share the same `commandArgs` value (e.g., `"test"` for `01-kv-store`).

2. **AC2: Pass args to execution service** — The `executionClient.execute()` call in the execution processor passes `args: [commandArgs]` instead of `args: []` when `commandArgs` is defined. When `commandArgs` is undefined or empty, `args` remains `[]`.

3. **AC3: Criteria loading order** — Acceptance criteria are loaded BEFORE the execution service call so that `commandArgs` is available at execution time. The current code loads criteria after execution — this ordering must change.

4. **AC4: No regression on evaluation** — The criteria evaluator (`criteria-evaluator.ts`) continues to work unchanged — it evaluates against execution results (stdout/exitCode), not against commandArgs. No changes to the evaluator.

5. **AC5: Unit tests** — Tests verify: (a) args are passed when commandArgs is present, (b) args remain empty when commandArgs is absent, (c) criteria loading happens before execution.

## Tasks / Subtasks

- [x] Task 1: Move slug lookup and criteria loading before execution (AC: #1, #3)
  - [x] 1.1 Move the milestone slug DB query (currently at lines ~241-251 in `execution-processor.ts`) to BEFORE the `executionClient.execute()` call. The `milestoneId` is available from `job.data` (line 80), so the query can run immediately after status update.
  - [x] 1.2 Call `contentLoader.loadAcceptanceCriteria(slug)` BEFORE execute — this is a NEW standalone call, separate from the existing `evaluateAndPublishCriteria` helper.
  - [x] 1.3 Extract `commandArgs` from loaded criteria: find the first criterion with a non-empty `assertion.commandArgs` value.
  - [x] 1.4 Store loaded criteria in a variable for reuse in the post-execution evaluation step (avoid double-loading).

- [x] Task 2: Refactor evaluateAndPublishCriteria to accept pre-loaded criteria (AC: #3, #4)
  - [x] 2.1 The `evaluateAndPublishCriteria` helper (lines ~84-107) currently bundles loading + evaluating + publishing. It calls `contentLoader.loadAcceptanceCriteria(slug)` internally (line ~92). Modify it to accept pre-loaded criteria as a parameter instead of loading them itself.
  - [x] 2.2 Update the timeout path (lines ~159-167) to use the pre-loaded slug and criteria instead of its own independent DB query (lines ~159-163). This eliminates a redundant DB call.
  - [x] 2.3 Update the normal evaluation call (lines ~331-335) to pass pre-loaded criteria.

- [x] Task 3: Pass commandArgs to execution service (AC: #1, #2)
  - [x] 3.1 Replace `args: []` (line ~150) with `args: commandArgs ? [commandArgs] : []`
  - [x] 3.2 The `commandArgs` field is a `string` (not `string[]`) per `AcceptanceCriterionAssertion` type — wrap in array for the `ExecuteRequest.args: string[]` field

- [x] Task 4: Write tests (AC: #5)
  - [x] 4.1 Test that when criteria have `commandArgs: 'test'`, the execution client receives `args: ['test']`
  - [x] 4.2 Test that when criteria have no `commandArgs`, the execution client receives `args: []`
  - [x] 4.3 Test that criteria are loaded before execution using mock invocation call order:
    ```typescript
    const loadOrder = mockContentLoader.loadAcceptanceCriteria.mock.invocationCallOrder[0]
    const executeOrder = mockExecutionClient.execute.mock.invocationCallOrder[0]
    expect(loadOrder).toBeLessThan(executeOrder)
    ```

- [x] Task 5: Verify no regression (AC: #4)
  - [x] 5.1 Run `turbo typecheck` — no type errors
  - [x] 5.2 Run `turbo test` — all tests pass
  - [x] 5.3 Verify criteria-evaluator tests still pass unchanged

## Dev Notes

### Architecture Context

This is a gap discovered during the Story 11.3 code review. The execution pipeline was rewritten in Story 11.2 to call a persistent HTTP service instead of Fly Machines. During the rewrite, `args: []` was hardcoded because the old Fly Machine approach also didn't wire args. The Go execution server (Story 11.1) already supports args — it shell-escapes and appends them to `./main` (see `executor.go:183-187`).

### Critical Design Decisions

- **Single commandArgs per milestone:** All criteria in `01-kv-store/acceptance-criteria.yaml` use `command_args: test`. Extract the FIRST non-empty `commandArgs` from the criteria array — they should all be identical for a given milestone.
- **commandArgs is `string`, not `string[]`:** The `AcceptanceCriterionAssertion.commandArgs` type is `string | undefined`. Wrap in array: `args: commandArgs ? [commandArgs] : []`.
- **No criteria-evaluator changes:** The evaluator checks stdout/exitCode against `assertion.expected`. It doesn't need to know about `commandArgs` — that's the execution concern only.
- **No Go server changes:** `executor.go` already handles args correctly — shell-escapes each arg and appends to the command.

### Refactoring Guide: evaluateAndPublishCriteria

The `evaluateAndPublishCriteria` helper (lines ~84-107) currently **bundles three concerns**: loading criteria, evaluating them, and publishing SSE results. This story requires splitting the loading step out:

**Current structure:**
```
evaluateAndPublishCriteria(slug, evaluateFn)
  → contentLoader.loadAcceptanceCriteria(slug)  // LOAD
  → evaluateFn(criteria)                         // EVALUATE
  → eventPublisher.publish(criteria_results)     // PUBLISH
```

**Target structure:**
```
// BEFORE execute:
criteria = contentLoader.loadAcceptanceCriteria(slug)
commandArgs = criteria[0]?.assertion.commandArgs

// AFTER execute:
evaluateAndPublishCriteria(criteria, evaluateFn)  // accepts pre-loaded criteria
  → evaluateFn(criteria)                           // EVALUATE
  → eventPublisher.publish(criteria_results)       // PUBLISH
```

The timeout path (lines ~157-198) has its own independent slug lookup (lines ~159-163) and `evaluateAndPublishCriteria` call (lines ~165-167). After refactoring, this path should reuse the pre-loaded slug and criteria.

### Execution Flow (Current → Target)

**Current:**
```
job.data → status update → code validation → execute({ args: [] })
  → slug lookup (DB) → benchmark → evaluateAndPublishCriteria(slug) [loads+evaluates] → DB update
```

**Target:**
```
job.data → status update → slug lookup (DB) → loadCriteria(slug) → extract commandArgs
  → code validation → execute({ args: [commandArgs] })
  → benchmark → evaluateAndPublishCriteria(preloadedCriteria) [evaluates only] → DB update
```

### Key File Locations

- `apps/backend/src/worker/processors/execution-processor.ts` — **PRIMARY CHANGE**: `evaluateAndPublishCriteria` helper (~lines 84-107), slug lookup (~lines 241-251), `args: []` (~line 150), timeout path (~lines 157-198), evaluation call (~lines 331-335)
- `apps/backend/src/worker/processors/execution-processor.test.ts` — **UPDATE**: 17 existing tests, add new tests for args wiring and load ordering
- `packages/execution/src/execution-service-client.ts` — **NO CHANGES**: already supports `args: string[]` in `ExecuteRequest` type
- `packages/shared/src/types/curriculum.ts:16-20` — `AcceptanceCriterionAssertion` with `commandArgs?: string`
- `apps/backend/src/plugins/curriculum/content-loader.ts` — `loadAcceptanceCriteria()` returns criteria with `commandArgs` populated from YAML `command_args` via `toCamelCase()`
- `apps/backend/src/shared/criteria-evaluator.ts` — **NO CHANGES**: evaluates results, not args
- `infra/fly-execution/server/executor.go:183-187` — **NO CHANGES**: already appends args to `./main`
- `content/milestones/01-kv-store/acceptance-criteria.yaml` — **NO CHANGES**: already specifies `command_args: test` on all criteria

### Previous Story Intelligence (from Story 11.2/11.3)

- `execution-processor.ts` was fully rewritten in Story 11.2 (commit `89720ec`)
- The processor uses dependency injection — `executionClient` is passed via `deps` parameter
- Tests mock the execution client via `vi.fn()` — follow the same pattern
- The content loader is also injected via `deps` — mockable in tests
- `ExecutionProcessorDeps` interface (lines ~41-49): `executionClient`, `db`, `eventPublisher`, `logger`, `contentLoader`, `defaultTimeoutSeconds`, optional `runBenchmark`
- Test file has mock factories: `createMockExecutionClient`, `createMockEventPublisher`, `createMockContentLoader`, `createTestJob`, `seedUserAndSubmission`

### References

- [Source: apps/backend/src/worker/processors/execution-processor.ts] — Primary change target
- [Source: apps/backend/src/worker/processors/execution-processor.test.ts] — Test file (17 existing tests)
- [Source: packages/execution/src/execution-service-client.ts#ExecuteRequest] — Already supports args
- [Source: packages/shared/src/types/curriculum.ts#AcceptanceCriterionAssertion] — commandArgs type
- [Source: infra/fly-execution/server/executor.go#Execute] — Args handling in Go server
- [Source: content/milestones/01-kv-store/acceptance-criteria.yaml] — command_args: test
- [Source: _bmad-output/project-context.md] — 65 project rules

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6 (1M context)

### Debug Log References

No issues encountered.

### Completion Notes List

- Moved milestone slug DB lookup from post-execution (line ~241) to pre-execution (after code size validation), eliminating the redundant timeout-path slug lookup
- Added pre-execution criteria loading via `contentLoader.loadAcceptanceCriteria(slug)` to extract `commandArgs` before calling the execution service
- Refactored `evaluateAndPublishCriteria` helper: changed first parameter from `slug: string | null` to `criteria: ReadonlyArray<AcceptanceCriterion>`, removing internal criteria loading — now accepts pre-loaded criteria
- Updated timeout path to use `preloadedCriteria` directly instead of its own independent slug lookup + load
- Updated normal evaluation call to pass `preloadedCriteria` instead of `milestoneSlug`
- Changed `args: []` to `args: commandArgs ? [commandArgs] : []` in the `executionClient.execute()` call
- Added 3 new tests: args passed with commandArgs, empty args without commandArgs, criteria loaded before execution (invocation call order verification)
- All 532 tests pass (17 in execution-processor, 22 in criteria-evaluator unchanged), typecheck clean, lint clean

### Change Log

- 2026-03-18: Wire commandArgs from acceptance criteria to execution service, refactor criteria loading to pre-execution phase

### File List

- `apps/backend/src/worker/processors/execution-processor.ts` — Modified: moved slug lookup + criteria loading before execute, refactored evaluateAndPublishCriteria to accept pre-loaded criteria, pass commandArgs to execute
- `apps/backend/src/worker/processors/execution-processor.test.ts` — Modified: added 3 new tests for commandArgs wiring and criteria load ordering
