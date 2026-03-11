# Story 7.2: Benchmark Results Display

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a learner,
I want to see my benchmark results presented clearly after each run,
so that I understand how my database implementation performs.

## Acceptance Criteria

1. Given a benchmark execution completes, when results are delivered to the client, then the display shows a hero absolute number (large font, green text for improvement over previous run, white for regression) with a "(this session)" qualifier (FR9, UX-6)
2. Given benchmark results are displayed, when a secondary metric is shown, then a normalized ratio is displayed below the hero number (UX-6)
3. Given a benchmark is running, when the user waits for results, then progressive loading states are driven by a shared `useBenchmarkProgress` hook implementing the 5-stage time-driven state machine: 0-2s spinner, 2-5s elapsed timer, 5-10s contextual message, 10-59s extended wait message, 60s timeout with diagnostic framing (UX-12, UX-18)
4. Given benchmark results are displayed, when text is shown, then results use engineering-grade language (e.g., "12,400 range scan ops/sec") — no casual or gamified language (UX-8)
5. Given benchmark results show improvement or regression, when color is used, then color is never the sole signal — text or icon also indicates direction (UX-9)
6. Given a benchmark completes, when the user has `prefers-reduced-motion` enabled, then all animations respect reduced motion (UX-25)
7. Given a benchmark completes, when results are shown, then screen reader live regions announce benchmark completion and results (UX-16)
8. Given a benchmark completes, when round-trip timing is measured, then benchmark round-trip completes in <10 seconds (NFR-P2); failure threshold is >10% of runs exceeding 15s. An integration test validates this for a standard workload
9. Given the user presses `Cmd+Shift+Enter` (or `Ctrl+Shift+Enter`), when the workspace is active, then a benchmark submission is triggered end-to-end (UX-22)
10. Given benchmark submissions are recorded, when engagement is analyzed, then benchmark-run frequency per milestone per user is derivable from the `benchmark_results` table as an engagement metric (UX Experience Instrumentation)

## Tasks / Subtasks

- [x] Task 1: Create `BenchmarkHeroDisplay` component (AC: #1, #2, #4, #5, #6, #7)
  - [x]1.1 Create `apps/webapp/src/components/workspace/BenchmarkHeroDisplay.tsx` — pure display component with props:
    ```typescript
    interface BenchmarkHeroDisplayProps {
      readonly value: number           // Hero number (opsPerSec)
      readonly unit: string            // e.g., "ops/sec"
      readonly normalizedRatio: number // e.g., 0.82
      readonly trendText?: string      // e.g., "↑ from 8,200 ops/sec" (pre-formatted by caller, uses Unicode arrows)
      readonly isFirstRun: boolean     // No trend to show
    }
    ```
    **States:** `improvement` (green hero + up arrow), `regression` (white hero + down arrow), `first-run` (green hero, no trend). Determine state by comparing current value with previous (passed via `trendText` presence + caller logic).
    **Typography:** Hero number `font-mono text-4xl font-bold` (36px at desktop). Unit label `text-sm text-muted-foreground`. Session qualifier "(this session)" in `text-secondary-foreground`. Normalized ratio `font-mono text-sm text-muted-foreground`.
    **Responsive:** Desktop (>=1280px) 36px hero. Small desktop (1024-1279px) 28px hero, trend wraps below. Mobile: 24px (progress view only — not shown in workspace).
    **Color + redundant signal:** Improvement = `text-primary` (green) + `ArrowUp` icon + "↑" prefix in trend text. Regression = `text-foreground` (white) + `ArrowDown` icon + "↓" prefix in trend text. First run = `text-primary` + no arrow, no trend text. Session qualifier "(this session)" uses `text-secondary-foreground` (NOT `text-muted-foreground` — must be legible in low light).
    **Engineering language:** Format numbers with `Intl.NumberFormat` for commas (e.g., "12,400"). Never "great job" or casual language.
    **Accessibility:** Wrap in `aria-live="polite"` region. Include `aria-label` with full benchmark description for screen readers.
    **Reduced motion:** Apply `motion-reduce:animate-none` to any entry animations.
  - [x]1.2 Unit test: renders hero number with correct formatting (commas for thousands)
  - [x]1.3 Unit test: renders normalized ratio below hero (e.g., "0.82x reference implementation")
  - [x]1.4 Unit test: improvement state shows green text + up arrow icon
  - [x]1.5 Unit test: regression state shows white text + down arrow icon
  - [x]1.6 Unit test: first-run state shows green text, no trend text or arrow
  - [x]1.7 Unit test: aria-live region present for screen reader announcement
  - [x]1.8 Unit test: "(this session)" qualifier is displayed

- [x] Task 2: Create `useBenchmarkProgress` hook (AC: #3, #6)
  - [x]2.1 Create `apps/webapp/src/hooks/use-benchmark-progress.ts` — time-driven state machine:
    ```typescript
    type BenchmarkProgressState = 'idle' | 'running' | 'elapsed' | 'context' | 'extended' | 'timeout'

    interface UseBenchmarkProgressResult {
      readonly state: BenchmarkProgressState
      readonly elapsedSeconds: number
    }

    function useBenchmarkProgress(isActive: boolean): UseBenchmarkProgressResult
    ```
    **State transitions (time-driven):**
    - `idle` (not active)
    - 0-2s: `running` — show spinner + "Running benchmark..."
    - 2-5s: `elapsed` — show elapsed timer: "Running benchmark... 3s"
    - 5-10s: `context` — show: "Executing 1,000 operations..."
    - 10-59s: `extended` — show: "Still running. Large datasets take longer."
    - 60s: `timeout` — terminal state: "Benchmark timed out. Your code may have an infinite loop or very slow operation. Check your implementation and try again."
    **Implementation:** `useEffect` with `setInterval(1000)`. Clear interval on unmount or when `isActive` becomes false. Reset `elapsedSeconds` to 0 when `isActive` transitions from false to true.
  - [x]2.2 Unit test: returns `idle` when `isActive` is false
  - [x]2.3 Unit test: transitions through states at correct thresholds (use `vi.useFakeTimers()` + `vi.advanceTimersByTime()`)
  - [x]2.4 Unit test: resets elapsed time when `isActive` toggles false then true
  - [x]2.5 Unit test: stops at `timeout` state and does not advance further

- [x] Task 3: Integrate benchmark display into workspace SSE flow (AC: #1, #2, #3, #7)
  - [x]3.1 Extend `useSubmitCode` hook in `apps/webapp/src/hooks/use-submit-code.ts`:
    - Add `benchmarkResult` to the return type. **Note:** `BenchmarkResultData` is a display-only subset of the full API response (which also includes `id`, `benchmarkName`, `p50LatencyUs`, `p99LatencyUs`, `referenceVersion`, `createdAt`). The backend still returns the full response; the frontend extracts only what the hero display needs:
      ```typescript
      interface BenchmarkResultData {
        readonly opsPerSec: number
        readonly normalizedRatio: number
        readonly userMedian: number
        readonly referenceMedian: number
      }
      ```
    - Add TanStack Query cache key: `['execution', 'benchmark', submissionId]`
    - In `handleSSEEvent`, update `benchmark_result` case to store in cache via `queryClient.setQueryData`:
      ```typescript
      case 'benchmark_result':
        queryClient.setQueryData<BenchmarkResultData>(
          ['execution', 'benchmark', subId],
          { opsPerSec: event.opsPerSec, normalizedRatio: event.normalizedRatio,
            userMedian: event.userMedian, referenceMedian: event.referenceMedian }
        )
        announceToScreenReader(
          `Benchmark complete: ${Intl.NumberFormat().format(event.opsPerSec)} ops per second, ` +
          `${event.normalizedRatio.toFixed(2)}x reference implementation`
        )
        break
      ```
    - In `benchmark_progress` case, also store iteration progress in cache key `['execution', 'benchmark-progress', submissionId]` for the progress hook to consume (or simply keep the current status-line approach — the `useBenchmarkProgress` hook is time-driven, not event-driven).
    - Add `isBenchmarking` boolean derived from the latest SSE event phase — set to `true` when `benchmark_progress` arrives, `false` on `complete`/`error`/`timeout`.
    - Reset benchmark cache keys in `submit()` function alongside existing resets.
  - [x]3.2 Export `BenchmarkResultData` type from the hook file.
  - [x]3.3 Unit test: `benchmark_result` SSE event stores data in TanStack Query cache
  - [x]3.4 Unit test: `benchmark_result` triggers screen reader announcement
  - [x]3.5 Unit test: `isBenchmarking` is true during benchmark phase, false after completion
  - [x]3.6 Unit test: benchmark cache is reset on new submission

- [x] Task 4: Wire `handleBenchmark` in Workspace route (AC: #1, #3, #9)
  - [x]4.1 Update `handleBenchmark` in `apps/webapp/src/routes/Workspace.tsx` — currently a no-op. Wire it to call `submit` with the same `milestoneId` and current editor code, identical to `handleRun`. The backend execution processor already differentiates — the benchmark phase runs when the milestone has benchmark config. The `Cmd+Shift+Enter` keyboard shortcut is already bound in `WorkspaceLayout.tsx`.
    **Note:** For MVP, "Run Benchmark" triggers the same submission pipeline. The difference is that the benchmark phase is always part of the pipeline when a milestone has benchmark config. In the future, a separate benchmark-only endpoint could be added, but for now both Run and Benchmark trigger the full pipeline.
  - [x]4.2 Unit test: `handleBenchmark` calls `submit` with correct params (not a no-op)
  - [x]4.3 Unit test: `Cmd+Shift+Enter` keydown event triggers `onBenchmark` callback (already bound in WorkspaceLayout — verify end-to-end in component test)

- [x] Task 5: Render `BenchmarkHeroDisplay` in TerminalPanel output area (AC: #1, #2, #3, #4, #5)
  - [x]5.1 Update `apps/webapp/src/components/workspace/TerminalPanel.tsx` to accept and render benchmark data:
    - Add props to `TerminalPanelProps`:
      ```typescript
      readonly benchmarkResult: BenchmarkResultData | null
      readonly isBenchmarking: boolean
      readonly previousBenchmarkOpsPerSec: number | null  // For trend comparison
      ```
    - In the Output tab content, after `OutputContent`, conditionally render:
      1. While `isBenchmarking` and no `benchmarkResult`: render the `useBenchmarkProgress` inline states (5 lines of conditional JSX — NOT a standalone component per UX spec)
      2. When `benchmarkResult` is available: render `<BenchmarkHeroDisplay>` with:
         - `value={benchmarkResult.opsPerSec}`
         - `unit` derived from benchmark name where possible (e.g., "sequential-inserts" → "insert ops/sec", "range-scans" → "range scan ops/sec"). Default fallback: "ops/sec". The `benchmark_result` SSE event currently does not include the benchmark name — for MVP, use "ops/sec" and add benchmark name to the SSE event in a follow-up if needed
         - `normalizedRatio={benchmarkResult.normalizedRatio}`
         - `trendText` computed from `previousBenchmarkOpsPerSec` (e.g., "↑ from 8,200 ops/sec" or "↓ from 15,000 ops/sec")
         - `isFirstRun={previousBenchmarkOpsPerSec === null}`
    - The benchmark display renders inline within the Output tab, below the terminal output — not in a separate tab.
  - [x]5.2 Update `WorkspaceLayout.tsx` to pass benchmark props through to `TerminalPanel`
  - [x]5.3 Update `Workspace.tsx` to pass `benchmarkResult`, `isBenchmarking`, and `previousBenchmarkOpsPerSec` from `useSubmitCode` to `WorkspaceLayout`
  - [x]5.4 Unit test: benchmark progress states render correctly in output area (spinner at 0s, elapsed at 3s, context at 7s, extended at 15s, timeout at 60s)
  - [x]5.5 Unit test: `BenchmarkHeroDisplay` renders when benchmark result is available
  - [x]5.6 Unit test: benchmark display shows improvement (green + up) when current > previous
  - [x]5.7 Unit test: benchmark display shows regression (white + down) when current < previous

- [x] Task 6: Fetch previous benchmark for trend comparison (AC: #1)
  - [x]6.1 Create `apps/webapp/src/hooks/use-previous-benchmark.ts`:
    ```typescript
    function usePreviousBenchmark(milestoneId: string | undefined): {
      readonly previousOpsPerSec: number | null
      readonly isLoading: boolean
    }
    ```
    Calls `GET /api/execution/benchmark-results/latest/:milestoneId` (see Task 6.2). Uses TanStack Query with `staleTime: 5 * 60_000` (5 min). Query key: `['benchmark', 'previous', milestoneId]`. Returns `null` for first run (404 from backend).
  - [x]6.2 Create `GET /api/execution/benchmark-results/latest/:milestoneId` backend route in `apps/backend/src/plugins/execution/routes/benchmark-results.ts` (extend existing file). Path follows existing convention — path-parameter scoped like `/submissions/:submissionId/benchmark`. Returns the most recent benchmark result for the authenticated user and milestone. Response shape same as existing benchmark result endpoint. Query: `SELECT * FROM benchmark_results WHERE user_id = ? AND milestone_id = ? ORDER BY created_at DESC LIMIT 1`. Return 404 if none found. Auth required — verify `request.uid`.
  - [x]6.3 Register the new route in `apps/backend/src/plugins/execution/index.ts`
  - [x]6.4 Wire `usePreviousBenchmark` into `Workspace.tsx` — pass `previousOpsPerSec` down through layout to terminal panel
  - [x]6.5 Unit test (backend): returns latest benchmark result for user+milestone
  - [x]6.6 Unit test (backend): returns 404 when no benchmark results exist
  - [x]6.7 Unit test (backend): returns 401 for unauthenticated request
  - [x]6.8 Unit test (frontend): `usePreviousBenchmark` returns null when no previous benchmark

- [x] Task 7: Benchmark engagement metric tracking (AC: #10)
  - [x]7.1 Verify engagement metric is derivable: benchmark-run frequency per milestone per user can be queried from `benchmark_results` table (`SELECT COUNT(*), milestone_id FROM benchmark_results WHERE user_id = ? GROUP BY milestone_id`). No additional frontend tracking code needed — the backend already persists every benchmark result (Story 7.1). The metric signals whether the emotional core (benchmark moment) is landing — users completing criteria without voluntarily running benchmarks indicates weak engagement.

- [x] Task 8: Performance integration test (AC: #8)
  - [x]8.1 Create `apps/webapp/e2e/benchmark-roundtrip.spec.ts` (Playwright E2E test). Validates that a benchmark submission round-trip (button click → SSE benchmark_result event received) completes in <10 seconds for a standard workload. Uses a real submission against the local dev environment.
    **Note:** If the Go execution image doesn't support `--benchmark` yet (parallel workstream), this test should be marked with `// TODO(7-2): Enable when Go benchmark harness is deployed` and `test.skip()`. The test structure should be in place even if skipped.
  - [x]8.2 The test should assert: time from submission POST to `benchmark_result` SSE event is <10,000ms
  - [x]8.3 Failure threshold: flag if >10% of test runs exceed 15s (run 3 iterations minimum)

## Dev Notes

### Architecture Compliance

- **No new Zustand stores** — benchmark data flows through TanStack Query cache, not Zustand (per project rules: exactly 2 stores only)
- **Plugin isolation preserved** — new backend route extends existing `execution` plugin's `benchmark-results.ts` file
- **Named exports only** — no default exports except React.lazy components
- **`apiFetch` in `apps/webapp/src/lib/api-fetch.ts`** — NOT in shared package (depends on Firebase client SDK)
- **Component organization by feature** — `BenchmarkHeroDisplay.tsx` goes in `components/workspace/` alongside existing workspace components
- **No `@/` import aliases** — use relative paths within the webapp

### Existing Implementation to Build On

**Already implemented (DO NOT duplicate):**

| What | Where | Status |
|---|---|---|
| `benchmark_progress` + `benchmark_result` SSE event types | `packages/execution/src/events.ts` | Complete — includes `opsPerSec` field |
| `benchmark_result` handling in `useSubmitCode` | `apps/webapp/src/hooks/use-submit-code.ts` line 171-173 | Minimal — just appends stdout. **REPLACE** with cache write |
| `benchmark_progress` handling in `useSubmitCode` | `apps/webapp/src/hooks/use-submit-code.ts` line 164-169 | Appends status line. **KEEP** but also track `isBenchmarking` state |
| `handleBenchmark` in Workspace.tsx | `apps/webapp/src/routes/Workspace.tsx` line 133-136 | No-op placeholder. **REPLACE** with actual submit call |
| Keyboard shortcut `Cmd+Shift+Enter` → `onBenchmark` | `apps/webapp/src/components/workspace/WorkspaceLayout.tsx` line 97-101 | Working — already bound |
| Benchmark button in `WorkspaceTopBar` | `apps/webapp/src/components/workspace/WorkspaceTopBar.tsx` | Working — BarChart3 icon + "Benchmark" label |
| `announceToScreenReader(message)` utility | `apps/webapp/src/components/workspace/workspace-a11y.ts` | Working — injects into `#workspace-announcer` live region |
| `motion-reduce:animate-none` Tailwind pattern | Multiple workspace components | Established pattern — use same approach |
| `GET /api/execution/submissions/:submissionId/benchmark` | `apps/backend/src/plugins/execution/routes/benchmark-results.ts` | Working — returns single submission's benchmark result |
| `benchmark_results` table | Migration `009_add_benchmark_results.ts` | Schema has `user_id`, `milestone_id`, `created_at` — supports ORDER BY for latest query |
| `toCamelCase()` from `@mycscompanion/shared` | `packages/shared/src/utils/case-conversion.ts` | For snake_case DB → camelCase API |
| `Intl.NumberFormat` | Built-in JavaScript API | Use for formatting hero numbers with commas |
| `lastBenchmark: null` placeholder in `OverviewData` | `packages/shared/src/types/api.ts` line 96-97 | Placeholder — Story 7.5 will populate |

### Data Flow for Benchmark Display

```
User clicks "Benchmark" (Cmd+Shift+Enter)
    |
    v
handleBenchmark() in Workspace.tsx
    |
    v
submit({ milestoneId, code }) — same submission pipeline
    |
    v
SSE stream connects → handleSSEEvent
    |
    +-- benchmark_progress events → isBenchmarking = true
    |       → useBenchmarkProgress hook drives loading states (time-driven, NOT event-driven)
    |       → TerminalPanel shows progressive loading inline in Output tab
    |
    +-- benchmark_result event → store in ['execution', 'benchmark', submissionId] cache
    |       → announceToScreenReader with formatted result
    |       → TerminalPanel renders BenchmarkHeroDisplay
    |       → Trend computed from usePreviousBenchmark (GET latest)
    |
    +-- complete event → isBenchmarking = false
```

### Component Hierarchy

```
Workspace.tsx
  └── WorkspaceLayout
        └── TerminalPanel (Output tab)
              ├── OutputContent (existing terminal output lines)
              ├── BenchmarkProgressInline (conditional, 5 lines of JSX — NOT a component)
              └── BenchmarkHeroDisplay (conditional, after benchmark_result received)
```

### UX Design Compliance

**Epic 7 UX scope for this story:** UX-6, UX-8, UX-9, UX-12, UX-16, UX-18, UX-22, UX-25. **Out-of-scope for 7.2:** UX-21 (trajectory chart on milestone completion — belongs to Stories 7.4/7.5).

**BenchmarkHeroDisplay anatomy (from UX spec):**
- Hero number: `font-mono`, 36px, bold. `text-primary` (green) for improvement, `text-foreground` (white) for regression
- Unit label: e.g., "ops/sec", 13px, `text-muted-foreground`. Session qualifier "(this session)" in `text-secondary-foreground` (NOT `text-muted-foreground` — higher contrast for legibility)
- Normalized ratio: "0.82x reference implementation", `font-mono`, 14px, `text-muted-foreground`
- Trend text: Pre-formatted string with Unicode arrow. E.g., "↑ from 8,200 ops/sec", `text-secondary-foreground`

**Loading states inline JSX pattern (from UX spec):**
```tsx
{state === 'running' && <Loader2 className="animate-spin motion-reduce:animate-none" />}
{state === 'running' && 'Running benchmark...'}
{state === 'elapsed' && `Running benchmark... ${elapsedSeconds}s`}
{state === 'context' && 'Executing 1,000 operations...'}
{state === 'extended' && 'Still running. Large datasets take longer.'}
{state === 'timeout' && 'Benchmark timed out. Your code may have an infinite loop or very slow operation. Check your implementation and try again.'}
```

### Testing Strategy

- **Component tests:** `BenchmarkHeroDisplay.test.tsx` — Vitest + `@testing-library/react`. Use `createTestQueryClient()` from `@mycscompanion/config/test-utils/`. Test rendering states, accessibility attributes, number formatting.
- **Hook tests:** `use-benchmark-progress.test.ts` — Vitest with `vi.useFakeTimers()`. Test state transitions at exact time boundaries.
- **Integration in `use-submit-code`:** Create NEW test file `apps/webapp/src/hooks/use-submit-code.test.ts` (does not exist yet). Mock SSE events, verify cache writes and screen reader announcements.
- **Backend route tests:** `benchmark-results.test.ts` — extend existing file with tests for the new `GET /latest` endpoint. Use `fastify.inject()`.
- **No snapshot tests** — use explicit behavioral assertions per project rules.
- **Import test utils from `@mycscompanion/config/test-utils/`** — never create ad-hoc mocks.
- **Test names describe behavior:** `it('should display green hero number when ops/sec improved')` — good. `it('should render correctly')` — bad.

### Key Patterns from Story 7.1

- Story 7.1 added `opsPerSec` to the `benchmark_result` event type — this is the hero number
- `normalized_ratio` stored as `numeric(8,4)` in DB → `string` in Kysely → `parseFloat()` on read → `number` in API response
- `benchmark_results` table has `idx_benchmark_results_user_id_milestone_id` index — efficient for "latest by user+milestone" query
- `benchmark-persistence.ts` stores per-benchmark-name results — a milestone may have multiple benchmarks. For hero display, show the primary benchmark result (first in array, or aggregate)
- Reference file loading uses `fs.readFile()` in the processor — not ContentLoader

### Responsive Breakpoints

| Breakpoint | Hero Size | Layout |
|---|---|---|
| >=1280px (Desktop) | 36px (`text-4xl`) | Full layout with trend |
| 1024-1279px (Small Desktop) | 28px (`text-3xl`) | Trend wraps below hero |
| <768px (Mobile) | N/A | Not shown in workspace (display-only mobile layout) |

### Project Structure Notes

- New files: `BenchmarkHeroDisplay.tsx`, `BenchmarkHeroDisplay.test.tsx`, `use-benchmark-progress.ts`, `use-benchmark-progress.test.ts`, `use-previous-benchmark.ts`, `use-previous-benchmark.test.ts`, `use-submit-code.test.ts` (NEW — does not exist yet), `apps/webapp/e2e/benchmark-roundtrip.spec.ts` (Playwright E2E)
- Modified files: `use-submit-code.ts`, `TerminalPanel.tsx`, `WorkspaceLayout.tsx`, `Workspace.tsx`, `benchmark-results.ts` (backend — add latest route), `execution/index.ts` (backend — register new route)
- All new component files use `PascalCase.tsx`, all hooks use `kebab-case.ts`
- Co-located tests: `*.test.ts(x)` next to source

### References

- [Source: _bmad-output/planning-artifacts/epics.md — Epic 7, Story 7.2]
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md — BenchmarkHeroDisplay component spec, useBenchmarkProgress hook, UX-6, UX-8, UX-9, UX-12, UX-16, UX-25]
- [Source: _bmad-output/planning-artifacts/architecture.md — Benchmark Architecture section, ARCH-9]
- [Source: _bmad-output/planning-artifacts/prd.md — FR9, NFR-P2]
- [Source: _bmad-output/project-context.md — TanStack Query patterns, Zustand store rules, testing rules]
- [Source: apps/webapp/src/hooks/use-submit-code.ts — Current SSE event handling for benchmark events]
- [Source: apps/webapp/src/components/workspace/TerminalPanel.tsx — Current terminal panel structure]
- [Source: apps/webapp/src/components/workspace/WorkspaceLayout.tsx — Keyboard shortcut bindings]
- [Source: apps/webapp/src/routes/Workspace.tsx — handleBenchmark no-op placeholder]
- [Source: packages/execution/src/events.ts — benchmark_progress, benchmark_result event types]
- [Source: apps/backend/src/plugins/execution/routes/benchmark-results.ts — Existing benchmark route to extend]
- [Source: _bmad-output/implementation-artifacts/7-1-benchmark-runner-and-reference-normalization.md — Previous story learnings]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6

### Debug Log References

None

### Completion Notes List

- Task 1: Created `BenchmarkHeroDisplay` component with hero number (Intl.NumberFormat), normalized ratio, trend display (improvement/regression/first-run states), aria-live region, reduced motion support. 9 unit tests.
- Task 2: Created `useBenchmarkProgress` hook with 5-stage time-driven state machine (idle/running/elapsed/context/extended/timeout). 4 unit tests with fake timers.
- Task 3: Updated `useSubmitCode` to store benchmark results in TanStack Query cache, added `isBenchmarking` state, screen reader announcements, benchmark cache reset on new submission. Exported `BenchmarkResultData` type. 4 new unit tests (19 total including existing).
- Task 4: Wired `handleBenchmark` in Workspace.tsx to call `submit` with milestoneId and current editor code (replacing no-op). 2 new unit tests (44 total).
- Task 5: Integrated BenchmarkHeroDisplay into TerminalPanel output tab with inline progress states and trend computation. Props passed through WorkspaceLayout. 4 new unit tests (37 total).
- Task 6: Created `GET /api/execution/benchmark-results/latest/:milestoneId` backend route. Created `usePreviousBenchmark` frontend hook with 5-min staleTime. Wired into Workspace. 3 backend tests + 3 frontend tests.
- Task 7: Verified engagement metric (benchmark-run frequency per milestone per user) is derivable from existing `benchmark_results` table. No additional code needed.
- Task 8: Created Playwright E2E test skeleton for benchmark round-trip performance (<10s). Test skipped pending Go benchmark harness deployment.

### Change Log

- 2026-03-11: Implemented Story 7.2 — Benchmark Results Display (all 8 tasks)
- 2026-03-11: Code review fixes — H1: Fixed trend `>=` to `>` (equal perf treated as first-run, no misleading arrow). H2+H3: Extracted `parseRawMetrics()` and `mapBenchmarkRow()` helpers in benchmark-results.ts (eliminated double JSON.parse and duplicated mapping). M1: Added benchmark props to Workspace.test.tsx mock TerminalPanel + 2 new tests verifying prop flow. M2: Fixed ApiError mock constructor in use-previous-benchmark.test.ts to match real signature `(status, code, message)`. M3: Expanded `PreviousBenchmarkResponse` to full API shape. M4: Added `afterAll(vi.useRealTimers)` to use-benchmark-progress.test.ts. L1: Removed redundant `xl:text-4xl` Tailwind class.

### File List

New files:
- `apps/webapp/src/components/workspace/BenchmarkHeroDisplay.tsx`
- `apps/webapp/src/components/workspace/BenchmarkHeroDisplay.test.tsx`
- `apps/webapp/src/hooks/use-benchmark-progress.ts`
- `apps/webapp/src/hooks/use-benchmark-progress.test.ts`
- `apps/webapp/src/hooks/use-previous-benchmark.ts`
- `apps/webapp/src/hooks/use-previous-benchmark.test.ts`
- `apps/webapp/src/hooks/use-submit-code.test.ts`
- `apps/webapp/e2e/benchmark-roundtrip.spec.ts`

Modified files:
- `apps/webapp/src/hooks/use-submit-code.ts`
- `apps/webapp/src/components/workspace/TerminalPanel.tsx`
- `apps/webapp/src/components/workspace/WorkspaceLayout.tsx`
- `apps/webapp/src/routes/Workspace.tsx`
- `apps/backend/src/plugins/execution/routes/benchmark-results.ts`
- `apps/webapp/src/components/workspace/TerminalPanel.test.tsx`
- `apps/webapp/src/routes/Workspace.test.tsx`
- `apps/backend/src/plugins/execution/routes/benchmark-results.test.ts`
