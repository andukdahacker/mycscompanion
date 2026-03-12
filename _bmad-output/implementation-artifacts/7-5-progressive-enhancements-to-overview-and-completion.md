# Story 7.5: Progressive Enhancements to Overview & Completion

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a learner,
I want benchmark data integrated into my milestone completion and overview screens,
so that my performance narrative is woven throughout the experience.

## Acceptance Criteria

1. Given a learner completes a milestone with benchmark data available, when the milestone completion view displays, then the trajectory chart includes an entry animation that draws the line and reveals data points sequentially (UX-21)
2. Given the trajectory chart animation plays, when the user has `prefers-reduced-motion` enabled, then the animation is skipped and all data renders instantly (UX-25)
3. Given a learner completes a milestone, when the completion view loads, then a benchmark summary section shows key metrics for the completed milestone (best ops/sec, normalized ratio, total benchmark runs)
4. Given a returning learner views the contextual overview (milestone-start variant), when the overview loads, then the benchmark data slot shows the last benchmark ops/sec number and a trend indicator (up/down/flat arrow) instead of an em-dash (UX-20)
5. Given a learner views the overall progress view, when progress data loads, then per-milestone benchmark data (best ops/sec) is displayed alongside completion status instead of an em-dash

## Tasks / Subtasks

- [x]Task 1: Update `OverviewData` and `MilestoneProgressInfo` types to support benchmark data (AC: #4, #5)
  - [x]1.1 Update `packages/shared/src/types/api.ts`:
    ```typescript
    // Replace placeholder types
    export interface OverviewBenchmarkData {
      readonly opsPerSec: number              // Latest benchmark ops/sec
      readonly normalizedRatio: number        // Latest normalized ratio
      readonly trend: 'up' | 'down' | 'flat' // Compared to previous benchmark
    }

    export interface OverviewData {
      // ... existing fields unchanged
      readonly lastBenchmark: OverviewBenchmarkData | null  // Was: null literal
      readonly benchmarkTrend: null                         // REMOVE this field — trend is inside lastBenchmark
    }
    ```
    **IMPORTANT:** Remove `benchmarkTrend` as a separate field. Trend is part of `OverviewBenchmarkData`. The two placeholders (`lastBenchmark: null`, `benchmarkTrend: null`) collapse into one: `lastBenchmark: OverviewBenchmarkData | null`.
  - [x]1.2 Update `MilestoneProgressInfo` in same file:
    ```typescript
    export interface MilestoneProgressInfo {
      // ... existing fields unchanged
      readonly lastBenchmark: MilestoneProgressBenchmark | null  // Was: null literal
    }

    export interface MilestoneProgressBenchmark {
      readonly bestOpsPerSec: number
    }
    ```
    **Note:** Progress view shows best ops/sec only (not trend) — per-milestone summary, not session-level detail.
  - [x]1.3 Update `packages/shared/src/types/api.test.ts`:
    - Update existing `OverviewData` type compilation tests — remove `benchmarkTrend` field, change `lastBenchmark` from `null` to `OverviewBenchmarkData | null`.
    - **CREATE NEW** `MilestoneProgressInfo` and `MilestoneProgressBenchmark` type compilation tests — no existing tests for these types. Add `it('should compile MilestoneProgressInfo with benchmark data')` and `it('should compile MilestoneProgressInfo with null benchmark')`.
    - Update existing mock data in `MilestoneStartOverview.test.tsx` MOCK_DATA object — it contains `benchmarkTrend: null` which must be removed to match the new type.

- [x]Task 2: Populate benchmark data in backend overview endpoint (AC: #4)
  - [x]2.1 Update `apps/backend/src/plugins/progress/routes/overview.ts`:
    - After the existing `Promise.all` block that loads `brief`, `metadata`, and `latestSummary` (around line 113), add a query to fetch the **two most recent** benchmark results for the active milestone:
    ```typescript
    // Fetch last 2 benchmark results for trend calculation
    const recentBenchmarks = await db
      .selectFrom('benchmark_results')
      .select(['raw_metrics', 'normalized_ratio'])
      .where('user_id', '=', uid)
      .where('milestone_id', '=', activeMilestone.id)
      .orderBy('created_at', 'desc')
      .limit(2)
      .execute()
    ```
    - Calculate `lastBenchmark`:
      - If `recentBenchmarks.length === 0` → `null`
      - If `recentBenchmarks.length === 1` → `{ opsPerSec, normalizedRatio, trend: 'flat' }` (no previous to compare)
      - If `recentBenchmarks.length >= 2` → compare `recentBenchmarks[0].opsPerSec` vs `recentBenchmarks[1].opsPerSec`:
        - Current > Previous → `'up'`
        - Current < Previous → `'down'`
        - Equal → `'flat'`
    - Use `parseRawMetrics()` from `benchmark-results.ts` — but **DO NOT import cross-plugin**. Instead, inline a simple extraction:
      ```typescript
      const raw = typeof row.raw_metrics === 'string' ? JSON.parse(row.raw_metrics) : row.raw_metrics
      const opsPerSec = typeof raw?.opsPerSec === 'number' ? raw.opsPerSec : 0
      const normalizedRatio = parseFloat(String(row.normalized_ratio))  // numeric(8,4) → string in Kysely → parseFloat
      ```
      The `normalized_ratio` column is `numeric(8,4)` in PostgreSQL, which Kysely returns as `string`. You MUST call `parseFloat()` — do not assume it's already a number.
    - Remove `benchmarkTrend: null` from the response. Only `lastBenchmark` remains.
  - [x]2.2 Unit test (backend): returns `lastBenchmark` with ops/sec and trend when benchmark results exist
  - [x]2.3 Unit test (backend): returns `lastBenchmark: null` when no benchmark results
  - [x]2.4 Unit test (backend): trend is `'up'` when latest ops/sec > previous
  - [x]2.5 Unit test (backend): trend is `'down'` when latest ops/sec < previous
  - [x]2.6 Unit test (backend): trend is `'flat'` when only one benchmark result exists
  - [x]2.7 Unit test (backend): trend is `'flat'` when latest equals previous

- [x]Task 3: Populate benchmark data in backend track-progress endpoint (AC: #5)
  - [x]3.1 Update `apps/backend/src/plugins/progress/routes/track-progress.ts`:
    - After building the milestone list, batch-fetch best benchmark ops/sec per milestone:
    ```typescript
    // Fetch best benchmark ops/sec per milestone for all non-upcoming milestones
    const milestoneIdsWithActivity = milestones
      .filter((m) => completionMap.has(m.id) || (firstIncompleteMilestone && m.id === firstIncompleteMilestone.id))
      .map((m) => m.id)

    const benchmarkMap = new Map<string, number>()
    if (milestoneIdsWithActivity.length > 0) {
      const benchmarkRows = await db
        .selectFrom('benchmark_results')
        .select(['milestone_id', 'raw_metrics'])
        .where('user_id', '=', uid)
        .where('milestone_id', 'in', milestoneIdsWithActivity)
        .execute()

      for (const row of benchmarkRows) {
        const raw = typeof row.raw_metrics === 'string' ? JSON.parse(row.raw_metrics) : row.raw_metrics
        const ops = typeof raw?.opsPerSec === 'number' ? raw.opsPerSec : 0
        const existing = benchmarkMap.get(row.milestone_id) ?? 0
        if (ops > existing) {
          benchmarkMap.set(row.milestone_id, ops)
        }
      }
    }
    ```
    - In the milestone progress mapping, replace `lastBenchmark: null` with:
    ```typescript
    lastBenchmark: benchmarkMap.has(m.id)
      ? { bestOpsPerSec: benchmarkMap.get(m.id)! }
      : null
    ```
    **NOTE:** Using `!` non-null assertion here is safe because we checked `.has()`. Alternatively use `const ops = benchmarkMap.get(m.id); lastBenchmark: ops !== undefined ? { bestOpsPerSec: ops } : null`.
  - [x]3.2 Unit test (backend): returns `lastBenchmark` with bestOpsPerSec for milestone with benchmark data
  - [x]3.3 Unit test (backend): returns `lastBenchmark: null` for milestone without benchmarks
  - [x]3.4 Unit test (backend): returns best (max) ops/sec across multiple benchmark runs

- [x]Task 4: Update MilestoneStartOverview to display benchmark data (AC: #4)
  - [x]4.1 Update `apps/webapp/src/components/overview/MilestoneStartOverview.tsx`:
    - Replace the hardcoded em-dash benchmark section (line 55-58) with dynamic data:
    ```tsx
    <div aria-label="Benchmark">
      <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Benchmark</span>
      {data.lastBenchmark ? (
        <p className="text-sm font-semibold text-foreground">
          {new Intl.NumberFormat().format(data.lastBenchmark.opsPerSec)} ops/sec
          <span
            className="ml-1"
            aria-label={`Trend: ${data.lastBenchmark.trend}`}
          >
            {data.lastBenchmark.trend === 'up' ? '\u2191' : data.lastBenchmark.trend === 'down' ? '\u2193' : '\u2192'}
          </span>
        </p>
      ) : (
        <p className="text-sm text-muted-foreground">No benchmarks yet</p>
      )}
    </div>
    ```
    - **Engineering language:** "12,400 ops/sec" — use `Intl.NumberFormat` for comma formatting (same pattern as `BenchmarkHeroDisplay.tsx`).
    - **Trend arrows:** Unicode arrows `\u2191` (up), `\u2193` (down), `\u2192` (flat/right). Include `aria-label` for screen readers.
    - **Color is never sole signal** (UX-9): arrows + text label, not color-coded.
  - [x]4.2 Unit test: renders ops/sec with comma formatting when lastBenchmark present
  - [x]4.3 Unit test: renders up arrow when trend is 'up'
  - [x]4.4 Unit test: renders down arrow when trend is 'down'
  - [x]4.5 Unit test: renders right arrow when trend is 'flat'
  - [x]4.6 Unit test: renders "No benchmarks yet" when lastBenchmark is null
  - [x]4.7 Update existing tests that assert em-dash placeholder — replace with new assertions

- [x]Task 5: Update MilestoneProgressItem to display benchmark data (AC: #5)
  - [x]5.1 Update `apps/webapp/src/components/progress/MilestoneProgressItem.tsx`:
    - Replace the hardcoded em-dash benchmark section (line 46-49) with dynamic data:
    ```tsx
    <div>
      <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Benchmark</span>
      {milestone.lastBenchmark ? (
        <p className="text-sm font-semibold text-foreground">
          {new Intl.NumberFormat().format(milestone.lastBenchmark.bestOpsPerSec)} ops/sec
        </p>
      ) : (
        <p className="text-sm text-muted-foreground">—</p>
      )}
    </div>
    ```
    - **Keep em-dash for milestones with NO benchmarks** — this is the correct fallback for "no data" in progress view context. Only `MilestoneStartOverview` says "No benchmarks yet" (different context — it's an invitation to act).
  - [x]5.2 Unit test: renders formatted ops/sec when lastBenchmark present
  - [x]5.3 Unit test: renders em-dash when lastBenchmark is null
  - [x]5.4 Update existing tests that assert em-dash to test both states

- [x]Task 6: Add trajectory chart entry animation for completion view (AC: #1, #2)
  - [x]6.1 Update `apps/webapp/src/components/overview/TrajectoryChart.tsx`:
    - Add an `animate` prop (default: `false`) to `TrajectoryChartProps` (already exported at bottom of file via `export type { TrajectoryChartProps, ... }`):
    ```typescript
    interface TrajectoryChartProps {
      readonly dataPoints: ReadonlyArray<TrajectoryDataPointInput>
      readonly currentMilestoneNumber?: number
      readonly className?: string
      readonly animate?: boolean  // NEW — enables entry animation
    }
    ```
    - When `animate === true` AND `prefers-reduced-motion` is NOT set:
      - Use CSS animation classes on SVG elements:
        - Polyline: `stroke-dasharray` + `stroke-dashoffset` animation (line draws from left to right). Use `@keyframes` in a `<style>` tag inside the SVG (React supports this).
        - Data point circles: `opacity: 0` → `opacity: 1` with staggered `animation-delay` per data point (e.g., each point 200ms after previous).
        - Value labels: same stagger as circles.
      - Total animation duration: ~1-1.5 seconds for a 3-5 point chart.
    - When `prefers-reduced-motion` is active OR `animate === false`:
      - All elements render immediately with `opacity: 1`, no animation.
      - Use the existing `prefersReducedMotion` check already in the component.
    - **IMPORTANT:** Do NOT use `framer-motion`, `react-spring`, or any animation library. Use CSS `@keyframes` only — consistent with the existing SVG approach and zero additional dependencies.
    - **Implementation approach:**
      ```tsx
      // Inside SVG, before other elements
      {animate && !prefersReducedMotion ? (
        <style>{`
          @keyframes drawLine { from { stroke-dashoffset: var(--line-length) } to { stroke-dashoffset: 0 } }
          @keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }
        `}</style>
      ) : null}
      ```
      - Set `stroke-dasharray` and `stroke-dashoffset` on polyline via inline style.
      - Calculate approximate line length from point coordinates (sum of segment lengths).
      - Use `animationDelay` on each circle/text group: `${index * 200}ms`.
  - [x]6.2 Unit test: renders all elements immediately when `animate` is false
  - [x]6.3 Unit test: renders all elements immediately when `prefers-reduced-motion` is active (even if `animate` is true)
  - [x]6.4 Unit test: applies animation classes/styles when `animate` is true and motion not reduced
  - [x]6.5 Unit test: polyline has `stroke-dasharray` style when animating
  - [x]6.6 Unit test: data points have staggered animation delay

- [x]Task 7: Pass `animate={true}` from Completion view to TrajectoryChart (AC: #1)
  - [x]7.1 Update `apps/webapp/src/routes/Completion.tsx`:
    - Add `animate` prop to `TrajectoryChart` invocation (line 84-87):
    ```tsx
    <TrajectoryChart
      dataPoints={trajectoryDataPoints}
      currentMilestoneNumber={data.milestoneNumber}
      animate
    />
    ```
    - That's it. The `TrajectoryChart` component handles `prefers-reduced-motion` internally.
  - [x]7.2 Unit test: Completion view passes `animate` prop to TrajectoryChart

- [x]Task 8: Add benchmark summary section to Completion view (AC: #3)
  - [x]8.1 Update `apps/webapp/src/routes/Completion.tsx`:
    - After the criteria summary section (line 67), add a benchmark summary section:
    ```tsx
    {/* Benchmark Summary */}
    {currentMilestoneBenchmark ? (
      <section aria-label="Benchmark summary">
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-muted-foreground">
          Benchmark Performance
        </h2>
        <div className="flex items-baseline gap-6">
          <div>
            <span className="text-xs text-muted-foreground">Best</span>
            <p className="text-lg font-semibold text-foreground">
              {new Intl.NumberFormat().format(currentMilestoneBenchmark.bestOpsPerSec)} ops/sec
            </p>
          </div>
          <div>
            <span className="text-xs text-muted-foreground">Ratio</span>
            <p className="text-sm font-semibold text-foreground">
              {currentMilestoneBenchmark.bestNormalizedRatio.toFixed(2)}x ref
            </p>
          </div>
          <div>
            <span className="text-xs text-muted-foreground">Runs</span>
            <p className="text-sm font-semibold text-foreground">
              {currentMilestoneBenchmark.totalSubmissions}
            </p>
          </div>
        </div>
      </section>
    ) : null}
    ```
    - Extract `currentMilestoneBenchmark` from `trajectoryDataPoints`:
    ```typescript
    const currentMilestoneBenchmark = trajectoryDataPoints.find(
      (dp) => dp.milestoneNumber === data.milestoneNumber
    ) ?? null
    ```
    - This reuses the trajectory data already fetched — no new API endpoint needed. The trajectory endpoint returns `bestOpsPerSec`, `bestNormalizedRatio`, and `totalSubmissions` per milestone.
  - [x]8.2 Unit test: renders benchmark summary when trajectory data contains current milestone
  - [x]8.3 Unit test: does not render benchmark summary when no trajectory data for current milestone
  - [x]8.4 Unit test: displays formatted ops/sec, ratio, and run count

- [x]Task 9: Invalidate overview and track-progress caches on benchmark completion (AC: #4, #5)
  - [x]9.1 Update `apps/webapp/src/hooks/use-submit-code.ts`:
    - In the `benchmark_result` SSE event handler, add invalidation for overview and track-progress:
    ```typescript
    case 'benchmark_result':
      // Existing invalidations (from Stories 7.2, 7.3, 7.4)
      queryClient.setQueryData<BenchmarkResultData>(...)
      queryClient.invalidateQueries({ queryKey: ['benchmark', 'history'] })
      queryClient.invalidateQueries({ queryKey: ['benchmark', 'previous'] })
      queryClient.invalidateQueries({ queryKey: ['benchmark', 'trajectory'] })

      // NEW: Invalidate overview and progress so benchmark data refreshes
      queryClient.invalidateQueries({ queryKey: ['progress', 'overview'] })
      queryClient.invalidateQueries({ queryKey: ['progress', 'track-progress'] })

      announceToScreenReader(...)
      break
    ```
    - **Rationale:** When a new benchmark completes, the overview's `lastBenchmark` may change, and the progress view's per-milestone benchmark may change. Background invalidation ensures stale data doesn't persist.
  - [x]9.2 Unit test: `benchmark_result` event invalidates `['progress', 'overview']` queries
  - [x]9.3 Unit test: `benchmark_result` event invalidates `['progress', 'track-progress']` queries

## Dev Notes

### Architecture Compliance

- **No new Zustand stores** — all benchmark data flows through TanStack Query (existing overview and track-progress hooks)
- **Plugin isolation preserved** — overview and track-progress routes query `benchmark_results` table directly via Kysely (this is a database query, NOT a cross-plugin import). Same pattern as `completion` plugin querying `milestones` table directly
- **No cross-plugin import** — do NOT import `parseRawMetrics` from execution plugin. Inline the JSONB extraction in progress routes
- **Named exports only** — `OverviewBenchmarkData`, `MilestoneProgressBenchmark` types use named exports
- **No `as` casting** — use proper type narrowing for `raw_metrics` JSONB extraction
- **No charting library** — animation uses CSS `@keyframes` only, no framer-motion/react-spring
- **`toCamelCase()` NOT needed** — manually map benchmark fields (consistent with benchmark-results.ts pattern)
- **`Intl.NumberFormat` for number display** — reuse existing pattern from `BenchmarkHeroDisplay.tsx`
- **Engineering-grade language only** — "12,400 ops/sec", never "Great job!" or gamified text
- **Color is never the sole signal** (UX-9) — trend arrows include `aria-label`

### Existing Implementation to Build On

| What | Where | Status |
|---|---|---|
| `TrajectoryChart` component | `apps/webapp/src/components/overview/TrajectoryChart.tsx` | Complete — add `animate` prop |
| `TrajectoryDataTable` component | Same file | Complete — no changes needed |
| `useTrajectoryData` hook | `apps/webapp/src/hooks/use-trajectory-data.ts` | Complete — reuse for benchmark summary extraction |
| `usePreviousBenchmark` hook | `apps/webapp/src/hooks/use-previous-benchmark.ts` | Complete — NOT needed here (overview endpoint handles trend internally) |
| `Intl.NumberFormat` pattern | `BenchmarkHeroDisplay.tsx` line 11 | Complete — reuse for ops/sec formatting |
| `motion-reduce:animate-none` pattern | `TrajectoryChart.tsx`, `BenchmarkHeroDisplay.tsx` | Complete — extend for entry animation |
| `prefersReducedMotion` check | `TrajectoryChart.tsx` line 7-12 | Complete — reuse for animation gating |
| Overview endpoint | `apps/backend/src/plugins/progress/routes/overview.ts` | Complete — add benchmark query |
| Track-progress endpoint | `apps/backend/src/plugins/progress/routes/track-progress.ts` | Complete — add benchmark batch query |
| `benchmark_results` table with `(user_id, milestone_id)` index | Migration `009_add_benchmark_results.ts` | Complete — supports per-milestone queries |
| `OverviewData` type placeholders | `packages/shared/src/types/api.ts` lines 96-97 | Placeholders to replace |
| `MilestoneProgressInfo.lastBenchmark` placeholder | `packages/shared/src/types/api.ts` line 114 | Placeholder to replace |
| Em-dash in MilestoneStartOverview | `apps/webapp/src/components/overview/MilestoneStartOverview.tsx` line 57 | Replace with dynamic benchmark |
| Em-dash in MilestoneProgressItem | `apps/webapp/src/components/progress/MilestoneProgressItem.tsx` line 48 | Replace with dynamic benchmark |
| Overview cache key | `useOverviewData` hook | Key: `['progress', 'overview']` — invalidate on benchmark |
| Track-progress cache key | `useTrackProgress` hook | Key: `['progress', 'track-progress']` — invalidate on benchmark |
| `benchmark_result` SSE handler | `apps/webapp/src/hooks/use-submit-code.ts` | Extend with overview/progress invalidation |

### Data Flow

```
Backend Overview Route:
  Query benchmark_results for active milestone (last 2 results)
  → Calculate trend (up/down/flat)
  → Return OverviewData.lastBenchmark = { opsPerSec, normalizedRatio, trend }

Backend Track-Progress Route:
  Batch-query benchmark_results for all active milestones
  → Find best ops/sec per milestone
  → Return MilestoneProgressInfo.lastBenchmark = { bestOpsPerSec }

Frontend MilestoneStartOverview:
  OverviewData.lastBenchmark → "12,400 ops/sec ↑"

Frontend MilestoneProgressItem:
  MilestoneProgressInfo.lastBenchmark → "12,400 ops/sec"

Frontend Completion.tsx:
  TrajectoryChart with animate prop → CSS keyframe animation
  trajectoryDataPoints.find(current milestone) → Benchmark summary section

SSE benchmark_result event:
  → Invalidates ['progress', 'overview'], ['progress', 'track-progress'], ['benchmark', 'trajectory']
  → All views get fresh data on next render
```

### Component Insertion Order (Completion.tsx)

```
Completion.tsx (route: /completion/:milestoneId)
  ├── Header (unchanged)
  ├── Criteria summary (unchanged)
  ├── Benchmark summary (best ops/sec, ratio, runs)       ← NEW (Task 8, insert after criteria)
  ├── TrajectoryChart(animate=true)                        ← MODIFIED (Task 7, add animate prop)
  ├── TrajectoryDataTable (unchanged)
  ├── Next milestone preview (unchanged)
  └── Action button (unchanged)
```

### Previous Story Intelligence (from 7.4)

1. **`parseRawMetrics()` for JSONB extraction** — extracts `opsPerSec` from `raw_metrics` JSONB. Do NOT import cross-plugin. Inline the extraction in progress routes.
2. **`prefersReducedMotion` hook** — already implemented in `TrajectoryChart.tsx`. Uses `useMemo` + `matchMedia`. Reuse for animation gating.
3. **SVG filter unique IDs** — `useId()` generates unique filter IDs to prevent collisions. Already handled in TrajectoryChart.
4. **Test determinism** — use fixed timestamps in seed data, not `Date.now()`. Apply to overview/track-progress benchmark tests.
5. **`normalized_ratio` is `numeric(8,4)` in DB → `string` in Kysely → `parseFloat()` on read.** Apply to overview route.
6. **Cleanup in afterEach** — always `vi.restoreAllMocks()` in `afterEach`. Add `cleanup()` for React component tests.

### Git Intelligence (Recent Commits)

```
544d8fa Implement Story 7.4: Benchmark Trajectory Visualization with code review fixes
1f8dfcf Implement Story 7.3: Historical Benchmark Results with code review fixes
71ae75a Implement Story 7.2: Benchmark Results Display with code review fixes
0f8aac2 Implement Story 7.1: Benchmark Runner & Reference Normalization with code review fixes
```

**Patterns established:**
- All benchmark routes in `apps/backend/src/plugins/execution/routes/benchmark-results.ts`
- Overview/progress routes in `apps/backend/src/plugins/progress/routes/`
- Frontend benchmark hooks in `apps/webapp/src/hooks/use-*.ts`
- `Intl.NumberFormat` for comma-separated number display
- `motion-reduce:animate-none` for respecting reduced motion
- Co-located `*.test.ts(x)` files next to source

### Testing Strategy

- **Backend overview tests:** Extend `apps/backend/src/plugins/progress/routes/overview.test.ts` — add tests for `lastBenchmark` population. Insert benchmark results into `benchmark_results` table for active milestone, verify response includes ops/sec and trend
- **Backend track-progress tests:** Extend `apps/backend/src/plugins/progress/routes/track-progress.test.ts` — add tests for per-milestone `lastBenchmark`. Insert benchmark results across multiple milestones, verify best ops/sec
- **Type tests:** Update `packages/shared/src/types/api.test.ts` — remove `benchmarkTrend` references, add `OverviewBenchmarkData` and `MilestoneProgressBenchmark` compilation tests
- **MilestoneStartOverview tests:** Update `apps/webapp/src/components/overview/MilestoneStartOverview.test.tsx` — replace em-dash assertions with benchmark data rendering tests
- **MilestoneProgressItem tests:** Update `apps/webapp/src/components/progress/MilestoneProgressItem.test.tsx` — add benchmark data rendering tests
- **TrajectoryChart animation tests:** Extend `apps/webapp/src/components/overview/TrajectoryChart.test.tsx` — add tests for `animate` prop, CSS animation classes, reduced motion bypass
- **Completion integration tests:** Extend `apps/webapp/src/routes/Completion.test.tsx` — add tests for `animate` prop, benchmark summary section
- **Cache invalidation tests:** Extend `apps/webapp/src/hooks/use-submit-code.test.ts` (NOT `.test.tsx` — there are two test files; benchmark tests are in the `.test.ts` file) — add tests for overview/track-progress invalidation
- **No snapshot tests** — explicit behavioral assertions only
- **Import test utils from `@mycscompanion/config/test-utils/`** — never create ad-hoc mocks

### Project Structure Notes

**Modified files:**
- `packages/shared/src/types/api.ts` — update OverviewData, MilestoneProgressInfo types
- `packages/shared/src/types/api.test.ts` — update type compilation tests
- `apps/backend/src/plugins/progress/routes/overview.ts` — populate lastBenchmark
- `apps/backend/src/plugins/progress/routes/overview.test.ts` — add benchmark tests
- `apps/backend/src/plugins/progress/routes/track-progress.ts` — populate lastBenchmark
- `apps/backend/src/plugins/progress/routes/track-progress.test.ts` — add benchmark tests
- `apps/webapp/src/components/overview/MilestoneStartOverview.tsx` — render benchmark data
- `apps/webapp/src/components/overview/MilestoneStartOverview.test.tsx` — update tests
- `apps/webapp/src/components/overview/TrajectoryChart.tsx` — add animate prop + CSS animation
- `apps/webapp/src/components/overview/TrajectoryChart.test.tsx` — add animation tests
- `apps/webapp/src/components/progress/MilestoneProgressItem.tsx` — render benchmark data
- `apps/webapp/src/components/progress/MilestoneProgressItem.test.tsx` — update tests
- `apps/webapp/src/routes/Completion.tsx` — add animate prop, benchmark summary section
- `apps/webapp/src/routes/Completion.test.tsx` — add animation + summary tests
- `apps/webapp/src/hooks/use-submit-code.ts` — add overview/progress cache invalidation
- `apps/webapp/src/hooks/use-submit-code.test.ts` — add invalidation tests (NOTE: both `.test.ts` and `.test.tsx` exist; benchmark tests are in the `.test.ts` file)

**No new files created** — all changes extend existing files.

**All modified component files use `PascalCase.tsx`, all hooks use `kebab-case.ts`**
**Co-located tests: `*.test.ts(x)` next to source**

### References

- [Source: _bmad-output/planning-artifacts/epics.md — Epic 7, Story 7.5 acceptance criteria]
- [Source: _bmad-output/project-context.md — All project rules and anti-patterns]
- [Source: _bmad-output/implementation-artifacts/7-4-benchmark-trajectory-visualization.md — Previous story learnings]
- See "Existing Implementation to Build On" table above for all file paths and line numbers

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6

### Debug Log References

None — clean implementation with no blocking issues.

### Completion Notes List

- Task 1: Updated `OverviewData` type — removed `benchmarkTrend` field, added `OverviewBenchmarkData` interface with `opsPerSec`, `normalizedRatio`, `trend`. Updated `MilestoneProgressInfo` — added `MilestoneProgressBenchmark` interface with `bestOpsPerSec`. Updated type compilation tests and all consumer files referencing `benchmarkTrend`.
- Task 2: Added benchmark query to overview endpoint — fetches last 2 benchmark results for active milestone, calculates trend (up/down/flat) by comparing latest vs previous `opsPerSec`. Uses inline JSONB extraction (no cross-plugin import). `normalized_ratio` parsed with `parseFloat()` for `numeric(8,4)` → string conversion.
- Task 3: Added batch benchmark query to track-progress endpoint — fetches all benchmark results for active milestones, finds best (max) `opsPerSec` per milestone. Uses same inline JSONB extraction pattern.
- Task 4: Updated MilestoneStartOverview — replaced em-dash placeholder with dynamic benchmark display showing comma-formatted ops/sec and Unicode trend arrows (↑↓→) with `aria-label` for accessibility. Shows "No benchmarks yet" when null.
- Task 5: Updated MilestoneProgressItem — replaced em-dash placeholder with formatted `bestOpsPerSec`. Keeps em-dash for milestones with no benchmark data.
- Task 6: Added CSS `@keyframes` entry animation to TrajectoryChart via `animate` prop — polyline draws with `stroke-dasharray`/`stroke-dashoffset`, data points fade in with staggered delay (200ms per point). Respects `prefers-reduced-motion` — all elements render immediately when motion reduced.
- Task 7: Passed `animate` prop from Completion view to TrajectoryChart.
- Task 8: Added benchmark summary section to Completion view — shows best ops/sec, normalized ratio, and total runs extracted from existing trajectory data.
- Task 9: Added `['progress', 'overview']` and `['progress', 'track-progress']` cache invalidation in `benchmark_result` SSE handler.

### Change Log

- 2026-03-12: Implemented Story 7.5 — Progressive Enhancements to Overview & Completion. All 9 tasks completed with full test coverage.

### File List

- `packages/shared/src/types/api.ts` — Added `OverviewBenchmarkData`, `MilestoneProgressBenchmark` types; updated `OverviewData` (removed `benchmarkTrend`), `MilestoneProgressInfo`
- `packages/shared/src/types/api.test.ts` — Updated type compilation tests; added `MilestoneProgress` tests
- `apps/backend/src/plugins/progress/routes/overview.ts` — Added benchmark query + trend calculation; removed `benchmarkTrend` from response
- `apps/backend/src/plugins/progress/routes/overview.test.ts` — Added 5 benchmark tests (lastBenchmark, trend up/down/flat/equal)
- `apps/backend/src/plugins/progress/routes/track-progress.ts` — Added batch benchmark query; populate `lastBenchmark.bestOpsPerSec`
- `apps/backend/src/plugins/progress/routes/track-progress.test.ts` — Added 3 benchmark tests (with data, null, max ops/sec)
- `apps/webapp/src/components/overview/MilestoneStartOverview.tsx` — Replaced em-dash with dynamic benchmark display + trend arrows
- `apps/webapp/src/components/overview/MilestoneStartOverview.test.tsx` — Updated mock data; replaced em-dash test with 6 benchmark display tests
- `apps/webapp/src/components/overview/TrajectoryChart.tsx` — Added `animate` prop with CSS `@keyframes` entry animation
- `apps/webapp/src/components/overview/TrajectoryChart.test.tsx` — Added 6 animation tests
- `apps/webapp/src/components/progress/MilestoneProgressItem.tsx` — Replaced em-dash with dynamic benchmark display
- `apps/webapp/src/components/progress/MilestoneProgressItem.test.tsx` — Updated em-dash test; added benchmark data test
- `apps/webapp/src/routes/Completion.tsx` — Added `animate` prop to TrajectoryChart; added benchmark summary section
- `apps/webapp/src/routes/Completion.test.tsx` — Added 3 tests (animate prop, benchmark summary, no summary)
- `apps/webapp/src/hooks/use-submit-code.ts` — Added overview/progress cache invalidation on `benchmark_result`
- `apps/webapp/src/hooks/use-submit-code.test.ts` — Added 2 cache invalidation tests
- `apps/webapp/src/routes/Overview.test.tsx` — Removed `benchmarkTrend` from mock data
- `apps/webapp/src/hooks/use-overview-data.test.tsx` — Removed `benchmarkTrend` from mock data
