# Story 4.3: Acceptance Criteria Evaluation & Display

Status: done

## Story

As a learner,
I want to see which acceptance criteria my code meets after each submission,
so that I know exactly what works and what still needs fixing.

## Acceptance Criteria

1. After execution completes, the evaluator parses execution output (stdout, stderr, exit code) against the structured assertion definitions from the milestone content (Story 4.1)
2. Each criterion is automatically scored as MET or NOT MET (FR6)
3. The evaluator handles assertion types: exact string match (`stdout-contains`), regex pattern match (`stdout-regex`), numeric comparison (`benchmark-threshold`), exit code check (`exit-code-equals`), and output line count (`output-line-count`)
4. If execution fails (compilation error or timeout), all criteria are marked NOT MET with the failure reason
5. The "Criteria" tab in the terminal panel displays results using the diagnostic template: "[Criteria name]: MET/NOT MET" with expected vs actual values (FR7, UX-13)
6. Met criteria show a green check icon; not-met criteria show a gray dash — no red anywhere (UX-9)
7. "NOT MET" is used instead of "FAILED" in all user-facing text (UX-13)
8. Criteria status updates are batched for screen reader announcements (UX-16)
9. Criteria evaluation results are persisted with the submission record in the `submissions.criteria_results` JSONB column
10. The criteria display maintains consistent ordering (by `order` field) across submissions

## Tasks / Subtasks

- [x] Task 1: Define CriterionResult type in shared package (AC: #2, #9)
  - [x] 1.1 Add `CriterionResultStatus` union type: `'met' | 'not-met'` to `packages/shared/src/types/curriculum.ts`
  - [x] 1.2 Add `CriterionResult` interface: `{ readonly name: string, readonly order: number, readonly status: CriterionResultStatus, readonly expected: string | number, readonly actual: string | number | null, readonly errorHint?: string }`
  - [x] 1.3 Export from `packages/shared/src/types/index.ts`
  - [x] 1.4 Add compile-time verification tests in `curriculum.test.ts`

- [x] Task 2: Add `criteria_results` event to SSE event types (AC: #1, #8)
  - [x] 2.1 Add new event variant to `ExecutionEvent` union in `packages/execution/src/events.ts`:
    ```typescript
    | Readonly<{
        type: 'criteria_results'
        results: ReadonlyArray<{
          name: string
          order: number
          status: 'met' | 'not-met'
          expected: string | number
          actual: string | number | null
          errorHint?: string
        }>
        data: string
        sequenceId: number
      }>
    ```
  - [x] 2.2 Update `packages/execution/src/events.test.ts` — add type-checking test for new `criteria_results` event variant
  - [x] 2.3 Verify discriminated union still type-checks with existing switch statements — update any exhaustive switch handlers that need a new case (check `use-submit-code.ts` handleSSEEvent switch)

- [x] Task 3: Implement criteria evaluator (AC: #1, #2, #3, #4)
  - [x] 3.1 Create `apps/backend/src/shared/criteria-evaluator.ts`
  - [x] 3.2 Implement `evaluateCriteria(criteria: ReadonlyArray<AcceptanceCriterion>, executionResult: ExecutionResult): ReadonlyArray<CriterionResult>` — pure function, no side effects
  - [x] 3.3 Implement assertion type handlers:
    - `stdout-contains`: Check if `executionResult.output` contains `expected` string (case-sensitive exact match)
    - `stdout-regex`: Test `executionResult.output` against `expected` as a RegExp pattern
    - `exit-code-equals`: Compare `executionResult.exitCode` against `expected` (as number)
    - `output-line-count`: Count non-empty lines in `executionResult.output`, compare against `expected` (as number)
    - `benchmark-threshold`: Compare numeric value extracted from output against `expected` minimum — NOT used in Milestone 1 criteria, but implement for completeness
  - [x] 3.4 Implement `evaluateAllNotMet(criteria: ReadonlyArray<AcceptanceCriterion>, reason: string): ReadonlyArray<CriterionResult>` — for compilation failure / timeout, returns all criteria as `not-met` with `actual` set to the failure reason
  - [x] 3.5 For `stdout-contains`, set `actual` to a relevant excerpt from output showing the match or closest miss (truncate to 200 chars max)
  - [x] 3.6 For `exit-code-equals`, set `actual` to the actual exit code (or `null` if unknown)
  - [x] 3.7 Include `errorHint` from the `AcceptanceCriterion` in the result when status is `not-met`
  - [x] 3.8 Create `apps/backend/src/shared/criteria-evaluator.test.ts` with comprehensive tests:
    - Test each assertion type with MET and NOT MET cases
    - Test compilation failure marks all criteria NOT MET
    - Test timeout marks all criteria NOT MET
    - Test null exit code handling
    - Test regex pattern with special characters
    - Test output line count with empty output
    - Test ordering is preserved from input criteria

- [x] Task 4: Integrate evaluator into execution processor (AC: #1, #4, #9)
  - [x] 4.1 Add `ContentLoader` to `ExecutionProcessorDeps` interface in `execution-processor.ts`:
    ```typescript
    readonly contentLoader: ContentLoader
    ```
  - [x] 4.2 After successful execution (status = 'completed'), before the DB update:
    - Look up milestone slug: `const milestone = await db.selectFrom('milestones').select('slug').where('id', '=', milestoneId).executeTakeFirst()`
    - Load criteria: `const criteria = milestone ? await contentLoader.loadAcceptanceCriteria(milestone.slug) : []`
    - Evaluate: `const criteriaResults = evaluateCriteria(criteria, executionResult)`
    - Publish SSE event: `await eventPublisher.publish(submissionId, { type: 'criteria_results', results: criteriaResults, data: '', sequenceId: sequenceId++ })`
    - Include in DB update: `criteria_results: JSON.stringify(criteriaResults)`
  - [x] 4.3 After failed execution (user error — compilation/runtime failure):
    - Same slug/criteria lookup
    - Call `evaluateAllNotMet(criteria, analysis.compilationSucceeded ? 'Runtime error' : 'Compilation failed')`
    - Publish SSE event with all NOT MET results
    - Include in DB update: `criteria_results: JSON.stringify(criteriaResults)`
  - [x] 4.4 After timeout:
    - Same slug/criteria lookup
    - Call `evaluateAllNotMet(criteria, 'Execution timed out')`
    - Publish SSE event, include in DB update
  - [x] 4.5 If milestone slug lookup fails (milestone not found in DB), skip criteria evaluation entirely — log a warning, do NOT fail the submission
  - [x] 4.6 Update `apps/backend/src/worker/worker.ts` (the worker entry point) to create a ContentLoader instance and inject it into the processor:
    ```typescript
    import { createContentLoader } from '../../plugins/curriculum/content-loader.js'
    const contentLoader = createContentLoader({ redis }) // log param is optional — omit or pass pino logger
    ```
    The worker already has a `redis` instance at line 35. Pass it to ContentLoader.
  - [x] 4.7 Update `execution-processor.test.ts` — add tests for criteria evaluation integration: successful execution evaluates criteria, failed execution marks all NOT MET, missing milestone gracefully skips

- [x] Task 5: Handle `criteria_results` event on frontend (AC: #5, #8, #10)
  - [x] 5.1 Update `use-submit-code.ts`:
    - Add new state: `criteriaResults` stored in TanStack Query cache key `['execution', 'criteria', submissionId]`
    - Add `criteria_results` case to `handleSSEEvent` switch: store `event.results` sorted by `order` in query cache
    - Expose `criteriaResults: ReadonlyArray<CriterionResult>` from hook return type
    - Reset criteria results on new submission
  - [x] 5.2 Batch screen reader announcement: `announceToScreenReader(`Criteria evaluated: ${metCount} of ${total} met`)` — single announcement, not per-criterion
  - [x] 5.3 Auto-switch to criteria tab when results arrive: call `useWorkspaceUIStore.getState().setActiveTerminalTab('criteria')` inside the `criteria_results` handler
  - [x] 5.4 Create `apps/webapp/src/hooks/use-submit-code.test.ts` (file does NOT exist yet) — test criteria_results event handling, screen reader announcement, tab switch. Follow existing test patterns in `Workspace.test.tsx` for mocking useSSE and TanStack Query.

- [x] Task 6: Update TerminalPanel criteria display (AC: #5, #6, #7, #10)
  - [x] 6.1 Update `TerminalPanel` props: add `criteriaResults: ReadonlyArray<CriterionResult> | null`
  - [x] 6.2 Rewrite `CriteriaContent` to display evaluation results when available:
    - When `criteriaResults` is `null` or empty AND criteria exist: show unevaluated state (current gray dash list)
    - When `criteriaResults` has entries: show evaluated state with status icons
  - [x] 6.3 Evaluated criterion display:
    - MET: green check icon (`<Check className="size-4 text-primary" />`) + criterion name + "MET"
    - NOT MET: gray dash (`<span className="text-muted-foreground">—</span>`) + criterion name + "NOT MET" (never "FAILED") + expected vs actual + error hint if available
  - [x] 6.4 Diagnostic template per criterion:
    ```
    [check/dash] criterion-name: MET / NOT MET
                 Expected: "PASS: put-and-get"
                 Actual: [excerpt or failure reason]
                 Hint: [errorHint if not-met]
    ```
  - [x] 6.5 Sort criteria by `order` field for consistent display
  - [x] 6.6 Use `aria-live="polite"` on the criteria list container for screen reader updates (batched via single region update, not per-item)
  - [x] 6.7 Update `TerminalPanel.test.tsx`:
    - Test unevaluated state (no results, criteria shown with dashes)
    - Test MET criteria shows green check and "MET" text
    - Test NOT MET criteria shows gray dash, "NOT MET", expected/actual, error hint
    - Test consistent ordering by `order` field
    - Test no red color classes anywhere in criteria output
    - Test aria-live region exists

- [x] Task 7: Wire criteriaResults through Workspace and WorkspaceLayout (AC: #5)
  - [x] 7.1 Update `WorkspaceLayout` props: add `criteriaResults: ReadonlyArray<CriterionResult> | null`
  - [x] 7.2 Pass `criteriaResults` from `WorkspaceLayout` to `TerminalPanel`
  - [x] 7.3 Update `Workspace.tsx`: get `criteriaResults` from `useSubmitCode()`, pass to `WorkspaceLayout`
  - [x] 7.4 Update `WorkspaceLayout.test.tsx` default props
  - [x] 7.5 Update `Workspace.test.tsx` — test criteria results flow from hook to terminal panel

## Dev Notes

### Existing Infrastructure (DO NOT recreate)

- **Execution pipeline exists** (Stories 3.2-3.4): `POST /api/execution/submit` → BullMQ → Fly.io machine → SSE stream. The worker processor is at `apps/backend/src/worker/processors/execution-processor.ts`.
- **`submissions.criteria_results` JSONB column exists**: Migration `004_add_submissions.ts` already defines it. The column is nullable and currently unused — this story populates it.
- **SSE event types exist**: `packages/execution/src/events.ts` — `ExecutionEvent` discriminated union. Has `test_result` and `benchmark_result` placeholders. Add `criteria_results` as a NEW event type (do NOT repurpose `test_result`).
- **ContentLoader exists** (Story 4.1): `apps/backend/src/plugins/curriculum/content-loader.ts` — `loadAcceptanceCriteria(slug)` returns `AcceptanceCriterion[]` from YAML files with Redis caching.
- **AcceptanceCriterion type exists**: `packages/shared/src/types/curriculum.ts` — includes `AssertionType`, `AcceptanceCriterionAssertion`, `AcceptanceCriterion`.
- **EventPublisher exists**: `apps/backend/src/shared/event-publisher.ts` — `publish(submissionId, event)` handles Redis pub/sub + log list.
- **ExecutionResult type exists**: `apps/backend/src/shared/execution-types.ts` — `{ exitCode, output, machineId, durationMs, compilationSucceeded }`.
- **TerminalPanel exists** (Story 3.7, updated 4.2): 3 tabs (brief/output/criteria). CriteriaContent shows unevaluated list with gray dashes.
- **`use-submit-code.ts` exists** (Story 3.4): Handles SSE events, outputs to TanStack Query cache. Already has `test_result` and `benchmark_result` cases (placeholders).
- **Screen reader utility exists**: `announceToScreenReader()` in `apps/webapp/src/components/workspace/workspace-a11y.ts`.
- **No `workspace-ui-store.test.ts` exists** — store behavior tested via component integration tests.

### Evaluator Design: Pure Function

The evaluator is a **pure function** — no DB, no Redis, no side effects. It takes criteria definitions and an execution result, returns evaluated results. This makes it trivially testable.

```typescript
// apps/backend/src/shared/criteria-evaluator.ts
import type { AcceptanceCriterion, CriterionResult } from '@mycscompanion/shared'
import type { ExecutionResult } from './execution-types.js'

export function evaluateCriteria(
  criteria: ReadonlyArray<AcceptanceCriterion>,
  executionResult: ExecutionResult,
): ReadonlyArray<CriterionResult> {
  return criteria.map((c) => evaluateSingle(c, executionResult))
}

export function evaluateAllNotMet(
  criteria: ReadonlyArray<AcceptanceCriterion>,
  reason: string,
): ReadonlyArray<CriterionResult> {
  return criteria.map((c) => ({
    name: c.name,
    order: c.order,
    status: 'not-met' as const,
    expected: c.assertion.expected,
    actual: reason,
    errorHint: c.errorHint,
  }))
}
```

### Assertion Type Implementation Details

For the 01-kv-store milestone, all criteria use `stdout-contains` or `exit-code-equals` (see `content/milestones/01-kv-store/acceptance-criteria.yaml`). The `commandArgs` field is `test` for all criteria — this is already handled at execution time (the Go binary runs with `test` arg inside the Fly machine). The evaluator just checks the output.

**`stdout-contains`**: Simple `output.includes(expected)` check. Set `actual` to `"Found"` when met, or `"Not found in output"` when not met (do NOT include full output — it could be massive).

**`stdout-regex`**: `new RegExp(expected).test(output)`. Wrap in try/catch for invalid regex patterns — treat as NOT MET with `actual: "Invalid regex pattern"`.

**`exit-code-equals`**: `executionResult.exitCode === Number(expected)`. Set `actual` to the actual exit code number, or `null` if exit code is unknown.

**`output-line-count`**: `output.split('\n').filter(l => l.trim()).length` compared to `Number(expected)`. Supports exact match only (not range).

**`benchmark-threshold`**: For future use — extract numeric value from output via regex, compare against expected minimum. Implement as a stub that returns NOT MET with `actual: "Benchmark evaluation not yet supported"` (Epic 7 will flesh this out).

### Worker ContentLoader Injection

The worker entry point is `apps/backend/src/worker/worker.ts`. It creates the processor at lines 51-59. The worker already has a `redis` instance (line 35) used for the EventPublisher — use the same one for ContentLoader:

```typescript
import { createContentLoader } from '../../plugins/curriculum/content-loader.js'

// In startWorker():
const contentLoader = createContentLoader({ redis })  // log param is optional
const processor = createExecutionProcessor({
  ...existingDeps,
  contentLoader,
})
```

The `ContentLoaderOptions.log` is optional (`log?: ContentLoaderLogger`). The interface requires only an `error(obj, msg)` method — pino logger is compatible if you want to pass it, but omitting is fine since the evaluator handles its own errors.

This is a cross-plugin import, which is normally prohibited — BUT the worker is NOT a plugin. The worker process is a separate entry point that can import from anywhere in the backend app. The plugin isolation rule applies to Fastify plugins only.

### Milestone ID → Slug Resolution

The execution processor has `milestoneId` (cuid2) from `job.data`. To load criteria, it needs the slug:

```typescript
const milestone = await db
  .selectFrom('milestones')
  .select('slug')
  .where('id', '=', milestoneId)
  .executeTakeFirst()
```

This is a single indexed lookup. If milestone is not found (deleted, bad ID), skip criteria evaluation — do NOT fail the submission.

### Frontend Criteria Results State

Do NOT add criteria results to Zustand (rule: no server data in Zustand). Store in TanStack Query cache:

```typescript
// In use-submit-code.ts
const { data: criteriaResults = null } = useQuery<ReadonlyArray<CriterionResult> | null>({
  queryKey: ['execution', 'criteria', submissionId],
  queryFn: () => Promise.resolve(null),
  enabled: !!submissionId,
  staleTime: Infinity,
})
```

Update via `queryClient.setQueryData` when `criteria_results` event arrives.

### Auto-Switch to Criteria Tab

When criteria results arrive, auto-switch to the criteria tab so the learner sees results immediately:

```typescript
case 'criteria_results':
  queryClient.setQueryData(...)
  useWorkspaceUIStore.getState().setActiveTerminalTab('criteria')
  announceToScreenReader(`Criteria evaluated: ${metCount} of ${total} met`)
  break
```

This is similar to the content-before-tools pattern in Story 4.2 — data-driven tab activation, not store default.

### Color Rules (Strict — UX-9)

- MET: `text-primary` (green) + `Check` icon from lucide-react (already imported in TerminalPanel)
- NOT MET: `text-muted-foreground` (gray) + dash character `—`
- NEVER use `text-destructive` (red) anywhere in criteria display
- Use "NOT MET" in text, never "FAILED", "ERROR", or "FAIL"

### Project Structure Notes

```
# Backend (new)
apps/backend/src/shared/criteria-evaluator.ts           # Pure evaluation logic
apps/backend/src/shared/criteria-evaluator.test.ts       # Evaluator unit tests

# Backend (modified)
apps/backend/src/worker/processors/execution-processor.ts  # Add criteria evaluation after execution
apps/backend/src/worker/processors/execution-processor.test.ts  # Add criteria integration tests
apps/backend/src/worker/worker.ts                          # Inject ContentLoader into processor deps

# Shared packages (modified)
packages/shared/src/types/curriculum.ts                  # Add CriterionResult type
packages/shared/src/types/curriculum.test.ts             # Add compile-time tests
packages/execution/src/events.ts                         # Add criteria_results event
packages/execution/src/events.test.ts                    # Update type verification tests

# Frontend (modified)
apps/webapp/src/hooks/use-submit-code.ts                 # Handle criteria_results event

# Frontend (new)
apps/webapp/src/hooks/use-submit-code.test.ts            # New test file (does NOT exist yet)
apps/webapp/src/components/workspace/TerminalPanel.tsx    # Enhanced criteria display
apps/webapp/src/components/workspace/TerminalPanel.test.tsx  # Updated tests
apps/webapp/src/components/workspace/WorkspaceLayout.tsx  # Pass criteriaResults prop
apps/webapp/src/components/workspace/WorkspaceLayout.test.tsx  # Updated defaultProps
apps/webapp/src/routes/Workspace.tsx                     # Wire criteriaResults
apps/webapp/src/routes/Workspace.test.tsx                # Updated tests
```

### Testing Requirements

- **Evaluator tests** (`criteria-evaluator.test.ts`): Pure function tests — no mocks needed for the evaluator itself. Test each assertion type (met/not-met), compilation failure, timeout, null exit code, regex edge cases, ordering.
- **Processor tests** (`execution-processor.test.ts`): Mock ContentLoader, verify criteria evaluation is called after execution, verify SSE event published, verify DB update includes `criteria_results`.
- **Frontend hook tests**: Mock SSE events, verify `criteria_results` event updates query cache, verify screen reader announcement, verify tab switch.
- **TerminalPanel tests**: Use `@testing-library/react` to verify criteria display states (unevaluated, met, not-met), color classes, text content ("NOT MET" not "FAILED"), ordering, aria-live.
- **Test syntax**: `describe()` + `it()`, never `test()`. `vi.restoreAllMocks()` in `afterEach`.
- **Import test utilities from `@mycscompanion/config/test-utils/`**: `createTestQueryClient()`, `TestProviders`.

### Anti-Patterns to Avoid

- Do NOT repurpose the existing `test_result` SSE event — create a new `criteria_results` event type
- Do NOT store criteria results in Zustand — use TanStack Query cache (server data rule)
- Do NOT use red (`text-destructive`) anywhere in criteria display — green check / gray dash only
- Do NOT use "FAILED" in user-facing text — always "NOT MET"
- Do NOT announce each criterion individually to screen readers — batch announcement
- Do NOT fail the submission if milestone lookup fails — skip criteria evaluation gracefully
- Do NOT import from other Fastify plugins in the evaluator — evaluator lives in `shared/`, imports only from `packages/*`
- Do NOT use `any` type — use `CriterionResult` and `AcceptanceCriterion` from `@mycscompanion/shared`
- Do NOT create a new Zustand store or add state to existing stores for criteria results
- Do NOT use `jest.fn()` — use `vi.fn()`
- Do NOT use default exports — named exports only
- Do NOT parse or re-read acceptance criteria YAML on the frontend — criteria definitions come from `useWorkspaceData`, evaluation results come from SSE

### Dependencies on Previous Work

- Execution pipeline with SSE streaming (Stories 3.2-3.4) - done
- Curriculum API with content loader (Story 4.1) - done
- Milestone brief and starter code loading (Story 4.2) - done
- Workspace layout with terminal panel (Stories 3.5, 3.7) - done
- Workspace state management (Story 3.8) - done
- Submissions table with `criteria_results` column (Story 3.3) - done

### Previous Story (4.2) Learnings

- `MilestoneContent.brief` type was changed from `string` to `string | null` during code review — be careful with nullable types on new fields
- `??` vs `||` matters for empty string fallbacks — code review caught this. Apply same care to criteria result `actual` field
- 1-hour TTL added to Redis cache — ContentLoader already handles caching efficiently for criteria lookups from worker
- Integration test isolation requires `vi.restoreAllMocks()` + fresh instances in `beforeEach`
- Content-before-tools pattern used `useEffect` + ref to activate tab once — follow same pattern for criteria tab auto-switch (but triggered by SSE event, not data load)

### Previous Story (4.1) Learnings

- Route tests returned 404 initially — ensure plugin prefix is correct when testing
- Inline `import('ioredis').Redis` caused lint errors — use `import type { Redis }` at top
- Content loader handles missing files gracefully — return null, never throw
- YAML snake_case to camelCase via `toCamelCase()` is critical — acceptance criteria already handled
- Code review found path traversal issues — slug validation (`VALID_SLUG` regex) already in ContentLoader

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Epic-4-Story-4.3]
- [Source: _bmad-output/planning-artifacts/architecture.md#Workspace-Data-Flow]
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#UX-9-Color-System]
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#UX-13-Criteria-Display]
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#UX-16-Screen-Reader]
- [Source: _bmad-output/planning-artifacts/prd.md#FR6-FR7]
- [Source: _bmad-output/implementation-artifacts/4-1-milestone-content-model-and-curriculum-api.md]
- [Source: _bmad-output/implementation-artifacts/4-2-milestone-brief-and-starter-code-loading.md]
- [Source: _bmad-output/project-context.md]
- [Source: content/milestones/01-kv-store/acceptance-criteria.yaml]
- [Source: apps/backend/migrations/004_add_submissions.ts]
- [Source: packages/execution/src/events.ts]
- [Source: apps/backend/src/worker/processors/execution-processor.ts]
- [Source: apps/backend/src/shared/execution-types.ts]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6

### Debug Log References

No debug issues encountered.

### Completion Notes List

- Task 1: Added `CriterionResultStatus` and `CriterionResult` types to `packages/shared/src/types/curriculum.ts` with 4 compile-time verification tests
- Task 2: Added `criteria_results` event variant to `ExecutionEvent` union in `packages/execution/src/events.ts` with type-narrowing test and exhaustive switch update
- Task 3: Created pure function `evaluateCriteria()` and `evaluateAllNotMet()` in `apps/backend/src/shared/criteria-evaluator.ts` with 19 unit tests covering all 5 assertion types, error cases, and edge cases
- Task 4: Integrated evaluator into execution processor — criteria evaluated after successful, failed, and timeout executions. Milestone slug lookup via DB. ContentLoader injected into processor deps and worker entry point. Added 3 integration tests (successful eval, failed eval, graceful skip on missing milestone)
- Task 5: Added `criteria_results` handler in `use-submit-code.ts` — stores results in TanStack Query cache, auto-switches to criteria tab, announces to screen reader with batched message. Added 4 new tests
- Task 6: Updated `TerminalPanel` CriteriaContent to show evaluated results (green check / MET, gray dash / NOT MET) with expected/actual/hint display, sorted by order field, `aria-live="polite"` region. Added 7 new tests
- Task 7: Wired `criteriaResults` prop through `Workspace` -> `WorkspaceLayout` -> `TerminalPanel`. Updated all test default props

### Change Log

- 2026-03-05: Implemented Story 4.3 — acceptance criteria evaluation and display
- 2026-03-05: Code review fixes — extracted duplicated criteria evaluation helper in execution-processor, added criteriaResults prop verification tests in Workspace.test.tsx and WorkspaceLayout.test.tsx, added readonly modifiers to events.ts inline type, improved stdout-contains excerpt for debugging, fixed submit deps array, strengthened DB criteria_results JSON verification, added TODO comment to benchmark-threshold stub

### File List

New files:
- apps/backend/src/shared/criteria-evaluator.ts
- apps/backend/src/shared/criteria-evaluator.test.ts

Modified files:
- packages/shared/src/types/curriculum.ts
- packages/shared/src/types/curriculum.test.ts
- packages/execution/src/events.ts
- packages/execution/src/events.test.ts
- apps/backend/src/worker/processors/execution-processor.ts
- apps/backend/src/worker/processors/execution-processor.test.ts
- apps/backend/src/worker/worker.ts
- apps/webapp/src/hooks/use-submit-code.ts
- apps/webapp/src/hooks/use-submit-code.test.tsx
- apps/webapp/src/components/workspace/TerminalPanel.tsx
- apps/webapp/src/components/workspace/TerminalPanel.test.tsx
- apps/webapp/src/components/workspace/WorkspaceLayout.tsx
- apps/webapp/src/components/workspace/WorkspaceLayout.test.tsx
- apps/webapp/src/routes/Workspace.tsx
- apps/webapp/src/routes/Workspace.test.tsx
- _bmad-output/implementation-artifacts/sprint-status.yaml
