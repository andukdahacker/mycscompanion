# Story 7.4: Benchmark Trajectory Visualization

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a learner,
I want to see how my database has improved across all milestones,
so that I can appreciate the full arc of what I've built — and share it.

## Acceptance Criteria

1. Given a learner has completed benchmarks across multiple milestones, when they view the trajectory visualization, then a chart shows their database's performance trajectory across milestones over time (FR11)
2. Given the trajectory chart is displayed, when metrics are shown, then the chart uses engineering language with specific metrics (e.g., "12,400 range scan ops/sec") — not abstract scores (UX-8)
3. Given the trajectory chart is displayed, when the user considers sharing, then the visualization is designed as a shareable artifact: portfolio-grade, self-contained context for screenshots (UX-8)
4. Given the trajectory chart is displayed on any device, when the viewport changes, then the chart is responsive and readable at all three breakpoints (UX-14)
5. Given the trajectory chart is displayed, when accessibility is needed, then the chart has a data table alternative for screen reader accessibility (NFR-A5)
6. Given the trajectory chart has animations, when the user has `prefers-reduced-motion` enabled, then chart animations respect the preference — glow effects removed when active (UX-25)
7. Given a learner is on the workspace, when they press `⌘+Shift+Enter` (or `Ctrl+Shift+Enter`), then Run Benchmark executes (UX-22) — **ALREADY IMPLEMENTED in Story 7.2, verify only**

## Tasks / Subtasks

- [x] Task 1: Create trajectory data API endpoint (AC: #1)
  - [x] 1.1 Add `GET /api/execution/benchmark-results/trajectory` route in `apps/backend/src/plugins/execution/routes/benchmark-results.ts` (extend existing file — reuse `mapBenchmarkRow` and `parseRawMetrics` helpers).
    ```typescript
    // Response shape
    interface TrajectoryResponse {
      readonly dataPoints: ReadonlyArray<{
        readonly milestoneId: string
        readonly milestoneName: string       // e.g., "KV Store", "B-Tree Indexing"
        readonly milestoneNumber: number      // 1-based index for display ordering
        readonly benchmarkName: string        // e.g., "sequential-inserts"
        readonly bestOpsPerSec: number        // Best ops/sec across all submissions for this milestone
        readonly bestNormalizedRatio: number   // Corresponding normalized ratio
        readonly totalSubmissions: number      // How many benchmark runs for this milestone
        readonly achievedAt: string           // ISO 8601 timestamp of best result
      }>
    }
    ```
    **Query logic:**
    - For each milestone with completed benchmarks, select the **best** result (highest `ops_per_sec` extracted from `raw_metrics` JSONB).
    - Query: Get all distinct `milestone_id` values for the user from `benchmark_results`, then for each, find the row with highest ops/sec. Use a Kysely subquery or window function (`ROW_NUMBER() OVER (PARTITION BY milestone_id ORDER BY ...)`).
    - **Simpler approach:** Since milestone count is small (max ~5-10), query all results grouped by milestone and pick best in application code. Avoid complex SQL.
    - **JOIN with `milestones` table** on `milestones.id = benchmark_results.milestone_id`. Use `milestones.title` for `milestoneName` and `milestones.position` for `milestoneNumber` ordering. This matches the pattern in `completion/routes/completion.ts` (line 83: `milestoneName: milestone.title`).
    - Querying the `milestones` table directly via Kysely is allowed — this is a database query, not a cross-plugin import. Same pattern as the `completion` plugin which queries `milestones` directly.
    - Auth required — filter by `request.uid`.
    - Reuse `parseRawMetrics()` to extract `opsPerSec` from JSONB `raw_metrics` column.
    - **No pagination needed** — trajectory data is small (one point per milestone, max ~10 milestones).
    - `toCamelCase()` NOT needed — manually map fields like `mapBenchmarkRow()` does.
  - [x] 1.2 Unit test (backend): returns trajectory data points ordered by milestone number
  - [x] 1.3 Unit test (backend): returns best ops/sec per milestone (not latest, not average)
  - [x] 1.4 Unit test (backend): returns empty array when no benchmark results exist
  - [x] 1.5 Unit test (backend): returns 401 for unauthenticated request
  - [x] 1.6 Unit test (backend): handles single milestone with multiple benchmark results correctly
  - [x] 1.7 Unit test (backend): handles multiple milestones with different benchmark names

- [x] Task 2: Create `useTrajectoryData` frontend hook (AC: #1)
  - [x] 2.1 Create `apps/webapp/src/hooks/use-trajectory-data.ts`:
    ```typescript
    import { useQuery } from '@tanstack/react-query'
    import { apiFetch } from '../lib/api-fetch'

    interface TrajectoryDataPoint {
      readonly milestoneId: string
      readonly milestoneName: string
      readonly milestoneNumber: number
      readonly benchmarkName: string
      readonly bestOpsPerSec: number
      readonly bestNormalizedRatio: number
      readonly totalSubmissions: number
      readonly achievedAt: string
    }

    interface UseTrajectoryDataResult {
      readonly dataPoints: ReadonlyArray<TrajectoryDataPoint>
      readonly isLoading: boolean
      readonly error: Error | null
    }

    function useTrajectoryData(): UseTrajectoryDataResult
    ```
    **Implementation:**
    - Use `useQuery` (NOT `useInfiniteQuery` — no pagination needed for trajectory).
    - Query key: `['benchmark', 'trajectory']`
    - `queryFn`: calls `GET /api/execution/benchmark-results/trajectory`
    - `staleTime`: `5 * 60_000` (5 min — same as other benchmark hooks)
    - `enabled`: always true (trajectory is user-scoped, auth handled by `apiFetch`)
    - Milestone names are returned by the API (from `milestones.title` JOIN) — no frontend name resolution needed.
  - [x] 2.2 Unit test: returns empty dataPoints when no data
  - [x] 2.3 Unit test: returns data points sorted by milestone number
  - [x] 2.4 Unit test: query key is `['benchmark', 'trajectory']`

- [x] Task 3: Create `TrajectoryChart` component — custom inline SVG (AC: #1, #2, #3, #4, #5, #6)
  - [x] 3.1 Create `apps/webapp/src/components/overview/TrajectoryChart.tsx`:
    ```typescript
    interface TrajectoryChartProps {
      readonly dataPoints: ReadonlyArray<{
        readonly milestoneName: string
        readonly milestoneNumber: number
        readonly bestOpsPerSec: number
      }>
      readonly currentMilestoneNumber?: number  // Highlights the newest data point with glow
      readonly className?: string
    }
    ```

    **CRITICAL: Custom inline SVG — NOT a charting library.** The UX spec explicitly states: "Not a charting library — custom SVG, but honest about the edge case work." Do NOT install recharts, chart.js, victory, visx, d3, or any chart library. Budget: ~half day of development.

    **SVG Implementation per UX spec:**
    - Use `<svg>` with `viewBox="0 0 500 180"` for responsive scaling.
    - **X-axis:** Milestone names as labels along the bottom. Evenly spaced.
    - **Y-axis:** No visible Y-axis labels (clean, minimal design). Internal scaling only.
    - **Data points:** Circles at each milestone position.
      - Previous milestones: 8px diameter, `fill` = `--primary` (green, `#34d399`).
      - Current milestone (if `isCurrent`): 12px diameter with `box-shadow` / SVG `filter` glow effect: `0 0 12px rgba(52, 211, 153, 0.4)`.
    - **Connecting line:** `<polyline>` connecting all data points, `stroke` = `--primary`, `stroke-width="2"`, `opacity="0.6"`.
    - **No grid lines.** Minimal design for portfolio-grade screenshots.
    - **Value labels:** Show ops/sec value above each data point (e.g., "12,400 ops/sec"). Use `Intl.NumberFormat` for comma formatting. `font-size="10"` or `text-xs`.

    **Y-axis Scaling Logic (edge cases):**
    - If only 1 data point: center vertically, no connecting line.
    - If values are wildly different: use min/max with padding (10% headroom above max, 10% below min). Never let a point sit on the SVG edge.
    - If all values are identical: center all points vertically.
    - Calculate Y position: `yPos = chartHeight - ((value - minValue) / (maxValue - minValue)) * chartHeight` (with padding applied to min/max).

    **Engineering language (UX-8):**
    - Labels show specific metrics: "12,400 ops/sec" — not abstract scores.
    - Milestone labels below: "KV Store", "B-Tree Indexing" — the CS concept names.

    **Shareable artifact design (UX-8):**
    - Self-contained context: axis labels, milestone names, performance units all visible in a screenshot.
    - Clean, minimal aesthetic with dark background (`bg-card` / `bg-panel`).
    - Rounded border: `rounded-lg border border-border`.
    - Project branding: subtle "mycscompanion" text in corner or omit for MVP (Story 7.5 or later can add).

    **`prefers-reduced-motion` (UX-25):**
    - Glow effect on current data point: wrap in `motion-reduce:` — remove `box-shadow`/SVG filter when reduced motion is active.
    - If any entry animation is added (e.g., points appearing sequentially on completion view): instant render when reduced motion active.
    - Use Tailwind's `motion-reduce:` prefix on wrapper classes, or check `window.matchMedia('(prefers-reduced-motion: reduce)')` for SVG filter toggling.

    **Responsive (UX-14) — Three breakpoints:**
    - `≥1280px` (desktop): `max-w-[500px]` — chart at full size.
    - `1024-1279px` (small-desktop): `max-w-[400px]` — slightly smaller.
    - `<768px` (mobile): Full container width. Rotate milestone labels 45° if overlapping (check text width vs available space).
    - SVG `viewBox` handles scaling automatically. Adjust `viewBox` or use CSS `width: 100%` with `height: auto`.

  - [x] 3.2 Create `apps/webapp/src/components/overview/TrajectoryChart.test.tsx`:
  - [x] 3.3 Unit test: renders SVG element with correct viewBox
  - [x] 3.4 Unit test: renders data points as circles for each milestone
  - [x] 3.5 Unit test: current milestone data point has glow effect (larger circle)
  - [x] 3.6 Unit test: renders connecting polyline between data points
  - [x] 3.7 Unit test: displays ops/sec values with comma formatting (e.g., "12,400 ops/sec")
  - [x] 3.8 Unit test: displays milestone name labels below chart
  - [x] 3.9 Unit test: handles single data point (no connecting line)
  - [x] 3.10 Unit test: handles identical values (doesn't crash on zero range)
  - [x] 3.11 Unit test: respects `motion-reduce` — no glow effect classes when reduced motion
  - [x] 3.12 Unit test: SVG has appropriate `role="img"` and `aria-label`

- [x] Task 4: Create accessible data table alternative (AC: #5, #2)
  - [x] 4.1 Add `TrajectoryDataTable` as a companion component in the same file `TrajectoryChart.tsx` (or as a separate `TrajectoryDataTable.tsx` if it becomes large):
    ```typescript
    interface TrajectoryDataTableProps {
      readonly dataPoints: ReadonlyArray<{
        readonly milestoneName: string
        readonly milestoneNumber: number
        readonly bestOpsPerSec: number
        readonly bestNormalizedRatio: number
        readonly totalSubmissions: number
      }>
    }
    ```
    **Implementation:**
    - Semantic `<table>` with `<thead>` and `<tbody>` — same pattern as `BenchmarkHistoryList`.
    - Columns: `#` (milestone number), `Milestone`, `Best Ops/sec` (formatted with `Intl.NumberFormat`), `Ratio` (2 decimal places), `Runs` (total submissions).
    - Visually hidden by default (`sr-only` class) — only visible to screen readers.
    - Alternatively, show as a toggle: "Show as table" link below chart for users who prefer tabular data.
    - Engineering-grade language: "12,400 ops/sec", "1.15x ref" — consistent with chart labels.
  - [x] 4.2 Unit test: renders table with correct column headers
  - [x] 4.3 Unit test: displays formatted ops/sec values
  - [x] 4.4 Unit test: table is accessible (has `<thead>`, `<th>` elements)

- [x] Task 5: Integrate TrajectoryChart into Completion view (AC: #1, #3, #6)
  - [x] 5.1 Update `apps/webapp/src/routes/Completion.tsx`:
    - Replace the trajectory placeholder (lines 66-74) with `<TrajectoryChart>`.
    - Import `useTrajectoryData` hook — call it inside Completion component.
    - Pass `dataPoints` and `currentMilestoneNumber` (from `data.milestoneNumber` returned by `useCompletionData` hook — NOT from route params which only has `milestoneId`) to `TrajectoryChart`.
    - **Loading state:** Show a purpose-built skeleton (same rounded-lg border container with `animate-pulse` bars) while trajectory data loads.
    - **Empty state:** If no trajectory data (e.g., user skipped benchmarks), show: "Run benchmarks to see your performance trajectory across milestones." — engineering tone.
    - **Show data table below chart** for accessibility — render `TrajectoryDataTable` with `sr-only` or as a visible toggle.
  - [x] 5.2 Update `apps/webapp/src/hooks/use-completion-data.ts` if needed — trajectory data may need to be fetched separately via `useTrajectoryData` since completion endpoint doesn't include cross-milestone benchmark aggregation.
  - [x] 5.3 Unit test: Completion view renders TrajectoryChart when data available
  - [x] 5.4 Unit test: Completion view shows loading skeleton while trajectory data loads
  - [x] 5.5 Unit test: Completion view shows empty state when no trajectory data
  - [x] 5.6 Unit test: Completion view passes currentMilestoneNumber to TrajectoryChart

- [x] Task 6: Invalidate trajectory cache on new benchmark result (AC: #1)
  - [x] 6.1 Update `apps/webapp/src/hooks/use-submit-code.ts`:
    - In the `benchmark_result` SSE event handler, add invalidation for trajectory data:
      ```typescript
      case 'benchmark_result':
        // Existing cache writes and invalidations (from Stories 7.2, 7.3)
        queryClient.setQueryData<BenchmarkResultData>(...)
        queryClient.invalidateQueries({ queryKey: ['benchmark', 'history'] })
        queryClient.invalidateQueries({ queryKey: ['benchmark', 'previous'] })

        // NEW: Invalidate trajectory so completion view gets fresh data
        queryClient.invalidateQueries({ queryKey: ['benchmark', 'trajectory'] })

        announceToScreenReader(...)
        break
      ```
    - Use broad key `['benchmark', 'trajectory']` without params — invalidates all trajectory queries.
  - [x] 6.2 Unit test: `benchmark_result` event invalidates trajectory queries

- [x] Task 7: Verify `⌘+Shift+Enter` keyboard shortcut (AC: #7)
  - [x] 7.1 **VERIFY ONLY — DO NOT RE-IMPLEMENT.** The keyboard shortcut is already implemented in `WorkspaceLayout.tsx` (lines 106-110):
    ```typescript
    if (isModifier && e.shiftKey && e.key === 'Enter') {
      e.preventDefault()
      onBenchmark()
      return
    }
    ```
    Confirm this is working correctly during manual testing. No code changes needed.

## Dev Notes

### Architecture Compliance

- **No new Zustand stores** — trajectory data flows through TanStack Query (`useQuery`), not Zustand (per project rules: exactly 2 stores only: `useWorkspaceUIStore`, `useEditorStore`)
- **Plugin isolation preserved** — new backend route extends existing `execution` plugin's `benchmark-results.ts` file. Reuses `mapBenchmarkRow` and `parseRawMetrics` helpers already defined there
- **Named exports for new components** (`TrajectoryChart.tsx`) — no default exports. Exception: route files (`Completion.tsx`) use default exports as required by `React.lazy()`
- **`apiFetch` in `apps/webapp/src/lib/api-fetch.ts`** — NOT in shared package
- **Component organization by feature** — `TrajectoryChart.tsx` goes in `components/overview/` per architecture.md project structure (existing files there: `FirstTimeOverview.tsx`, `MilestoneStartOverview.tsx`, `OverviewError.tsx`, `OverviewSkeleton.tsx`)
- **No `@/` import aliases** — use relative paths within the webapp
- **No `as` casting** — use `satisfies` or proper typing. Note: `parseRawMetrics` uses a pre-existing `as Record<string, unknown>` cast — do not add new `as` casts in trajectory endpoint code
- **No charting library** — custom inline SVG per UX spec. Do NOT install recharts, chart.js, victory, visx, d3, or any chart dependency
- **`toCamelCase()` NOT needed** — manually map fields like `mapBenchmarkRow()` does (deliberate exception in benchmark routes)

### Existing Implementation to Build On

**Already implemented (DO NOT duplicate):**

| What | Where | Status |
|---|---|---|
| `benchmark_results` table with `(user_id, milestone_id)` index | Migration `009_add_benchmark_results.ts` | Complete — index supports cross-milestone trajectory queries |
| `mapBenchmarkRow()` helper | `apps/backend/src/plugins/execution/routes/benchmark-results.ts` lines 17-40 | Complete — converts DB row to camelCase. **Reuse for trajectory** |
| `parseRawMetrics()` helper | `apps/backend/src/plugins/execution/routes/benchmark-results.ts` lines 9-15 | Complete — parses JSONB `raw_metrics` to extract `opsPerSec`. **Reuse** |
| `GET /benchmark-results/history/:milestoneId` route | Same file, lines 83-151 | Complete — cursor-paginated history. Trajectory endpoint is different (cross-milestone aggregation) |
| `GET /benchmark-results/latest/:milestoneId` route | Same file, lines 153-184 | Complete — single latest result per milestone |
| `BenchmarkHeroDisplay` component | `apps/webapp/src/components/workspace/BenchmarkHeroDisplay.tsx` | Complete — reference for `Intl.NumberFormat` pattern, trend styling, `motion-reduce:animate-none` |
| `BenchmarkHistoryList` component | `apps/webapp/src/components/workspace/BenchmarkHistoryList.tsx` | Complete — reference for accessible `<table>` pattern with `<thead>`, `aria-label`, responsive columns |
| `usePreviousBenchmark` hook | `apps/webapp/src/hooks/use-previous-benchmark.ts` | Complete — `useQuery` pattern to follow for `useTrajectoryData` |
| Completion view with placeholder | `apps/webapp/src/routes/Completion.tsx` lines 66-74 | Complete — **replace this placeholder** with `TrajectoryChart` |
| `⌘+Shift+Enter` keyboard shortcut | `apps/webapp/src/components/workspace/WorkspaceLayout.tsx` lines 106-110 | Complete — **ALREADY DONE, verify only** |
| Overview data placeholders | `packages/shared/src/types/api.ts` lines 96-97 | Placeholders `lastBenchmark: null`, `benchmarkTrend: null` — **Story 7.5 will populate these, NOT this story** |
| `Intl.NumberFormat` formatter | `BenchmarkHeroDisplay.tsx` line 11 | Pattern established — reuse for ops/sec formatting in trajectory chart |
| `announceToScreenReader()` utility | `apps/webapp/src/components/workspace/workspace-a11y.ts` | Complete — available if needed for trajectory loading announcements |

### Data Flow for Trajectory Visualization

```
User completes a milestone → navigates to /completion/:milestoneId
    |
    v
Completion.tsx renders TrajectoryChart
    |
    v
useTrajectoryData() → GET /api/execution/benchmark-results/trajectory
    |
    v
Backend queries benchmark_results table:
  - Group by milestone_id
  - Find best ops/sec per milestone
  - Join milestone metadata for names/ordering
  - Return ordered data points
    |
    v
TrajectoryChart renders custom SVG:
  - Data points as circles (current = glow)
  - Connecting polyline
  - Milestone labels + ops/sec values
  - prefers-reduced-motion respected
    |
    v
TrajectoryDataTable (sr-only) provides accessible alternative
```

```
New benchmark completes (SSE benchmark_result event)
    |
    v
useSubmitCode invalidates ['benchmark', 'trajectory']
    |
    v
If user navigates to completion view, trajectory data auto-refreshes
```

### Component Hierarchy

```
Completion.tsx (route: /completion/:milestoneId)
  ├── Completion header (milestone name, status)
  ├── Benchmark hero summary (existing)
  ├── TrajectoryChart(dataPoints, currentMilestoneNumber)     ← NEW (replaces placeholder)
  │     └── useTrajectoryData()                                ← NEW (hook called internally or in Completion)
  ├── TrajectoryDataTable(dataPoints)                          ← NEW (sr-only accessible table)
  ├── Concepts encountered (existing)
  └── Next milestone preview (existing)
```

### SVG Implementation Detail

**UX Spec Reference (TrajectoryChart component spec):**
- Inline SVG with `viewBox`, responsive
- X-axis = milestones (labeled). Y-axis = ops/sec (no visible labels — internal scaling only)
- Data points as circles: previous = 8px standard green, current = 12px with glow
- Connecting `<polyline>` at reduced opacity
- No grid lines, no Y-axis labels — clean, minimal, portfolio-grade
- Budget: ~half day of development

**SVG Structure:**
```html
<svg viewBox="0 0 500 180" role="img" aria-label="Benchmark trajectory across milestones">
  <!-- Connecting line -->
  <polyline points="80,130 200,110 360,45" fill="none" stroke="#34d399" stroke-width="2" opacity="0.6" />

  <!-- Data point circles -->
  <circle cx="80" cy="130" r="4" fill="#34d399" />
  <circle cx="200" cy="110" r="4" fill="#34d399" />
  <circle cx="360" cy="45" r="6" fill="#34d399" filter="url(#glow)" /> <!-- current milestone -->

  <!-- Glow filter (removed when prefers-reduced-motion). Use React useId() for unique filter ID to prevent collisions -->
  <defs>
    <filter id="glow">
      <feGaussianBlur stdDeviation="3" result="blur" />
      <feMerge>
        <feMergeNode in="blur" />
        <feMergeNode in="SourceGraphic" />
      </feMerge>
    </filter>
  </defs>

  <!-- Value labels above points -->
  <text x="80" y="120" font-size="10" fill="#8b8fa3" text-anchor="middle">4,200 ops/sec</text>
  <text x="200" y="100" font-size="10" fill="#8b8fa3" text-anchor="middle">8,100 ops/sec</text>
  <text x="360" y="35" font-size="10" fill="#e4e4e7" text-anchor="middle" font-weight="600">12,400 ops/sec</text>

  <!-- Milestone labels below -->
  <text x="80" y="170" font-size="10" fill="#555973" text-anchor="middle">KV Store</text>
  <text x="200" y="170" font-size="10" fill="#555973" text-anchor="middle">Storage</text>
  <text x="360" y="170" font-size="10" fill="#34d399" text-anchor="middle" font-weight="600">B-Tree</text>
</svg>
```

**Y-Axis Scaling Edge Cases:**
- 1 data point: Center vertically at `chartHeight / 2`. No connecting line.
- All values identical: Center all at `chartHeight / 2`. Connecting line is flat/horizontal.
- Wildly different values: `minY = min(values) * 0.9`, `maxY = max(values) * 1.1` (10% padding).
- Zero values: If `bestOpsPerSec === 0`, place at bottom of chart area.

**CSS Styling (Tailwind mobile-first classes on wrapper):**
```tsx
<div className={cn(
  'w-full rounded-lg border border-border bg-card p-4',
  'lg:max-w-[400px] xl:max-w-[500px]',  // mobile: full width (base), small-desktop: 400px, desktop: 500px
  className
)}>
  <svg className="h-auto w-full" viewBox="0 0 500 180" role="img" aria-label="...">
    ...
  </svg>
</div>
```

### UX Design Compliance

**Epic 7 UX scope for this story:** FR11, UX-8 (engineering language + shareable artifact), UX-14 (responsive), UX-22 (keyboard shortcut — already done), UX-25 (`prefers-reduced-motion`), NFR-A5 (data table alternative).

**Out-of-scope for this story (Story 7.5):**
- UX-21: Trajectory chart animation on milestone completion view (the "growing" animation)
- UX-20: Benchmark data in returning-user overview
- Overview/progress view integration with trajectory data
- Populating `lastBenchmark` and `benchmarkTrend` in `OverviewData` type

**Key UX rules:**
- Engineering-grade language: "12,400 range scan ops/sec" — never "Great improvement!" or gamified language
- Shareable artifact: screenshot should be understandable without explanation — axis labels, milestone names, performance units all visible
- Color is never the sole signal: data point sizes + text labels accompany color differences
- Portfolio-grade aesthetic: clean, minimal, dark background, rounded border
- Custom SVG — NOT a charting library

### Previous Story Intelligence (from 7.3)

**Learnings to apply:**
1. **Cursor pagination tiebreaker:** When ordering by `created_at`, add `id` as tiebreaker (`ORDER BY created_at ASC, id ASC`) to prevent row skipping on identical timestamps. Apply same pattern if trajectory query uses ordering.
2. **`mapBenchmarkRow()` reuse:** Established helper converts DB row → camelCase API response. Reuse for trajectory endpoint.
3. **`parseRawMetrics()` for JSONB:** Extracts `opsPerSec`, `userMedian`, `referenceMedian` from `raw_metrics` JSONB column. Reuse for extracting best ops/sec in trajectory.
4. **Test determinism:** Use fixed timestamps (`2026-01-01T00:00:00Z` base) in seed data, not `Date.now()`.
5. **Explicit column selection:** Use explicit `.select([...columns])` instead of `.selectAll()` in Kysely queries.
6. **`normalized_ratio` is `numeric(8,4)` in DB → `string` in Kysely → `parseFloat()` on read.** Same applies to trajectory data.

### Git Intelligence (Recent Commits)

```
1f8dfcf Implement Story 7.3: Historical Benchmark Results with code review fixes
71ae75a Implement Story 7.2: Benchmark Results Display with code review fixes
0f8aac2 Implement Story 7.1: Benchmark Runner & Reference Normalization with code review fixes
```

**Patterns established:**
- All benchmark routes live in `apps/backend/src/plugins/execution/routes/benchmark-results.ts`
- All benchmark hooks live in `apps/webapp/src/hooks/use-*.ts`
- All benchmark components live in `apps/webapp/src/components/workspace/` (but `TrajectoryChart` goes in `components/overview/` per architecture.md)
- Backend tests extend the existing `benchmark-results.test.ts` file
- `Intl.NumberFormat` for comma-separated number display
- `motion-reduce:animate-none` for respecting reduced motion preference

### Testing Strategy

- **Backend route tests:** Extend `apps/backend/src/plugins/execution/routes/benchmark-results.test.ts` — add tests for `GET /benchmark-results/trajectory`. Use `fastify.inject()`. Insert benchmark results across multiple milestones with different `milestone_id` values to test aggregation and ordering
- **Frontend hook tests:** Create `apps/webapp/src/hooks/use-trajectory-data.test.ts` — mock `apiFetch`, test with `createTestQueryClient()` from `@mycscompanion/config/test-utils/`
- **Component tests:** Create `apps/webapp/src/components/overview/TrajectoryChart.test.tsx` — Vitest + `@testing-library/react`. Test SVG rendering, data point circles, glow effect, milestone labels, ops/sec formatting, edge cases (single point, identical values), reduced motion
- **Data table tests:** Test accessible `<table>` rendering (can be in same test file as TrajectoryChart)
- **Completion integration tests:** Extend or update `apps/webapp/src/routes/Completion.test.tsx` — test that trajectory chart replaces placeholder, loading state, empty state
- **Cache invalidation tests:** Extend `apps/webapp/src/hooks/use-submit-code.test.ts` — test that `benchmark_result` SSE event invalidates trajectory queries
- **No snapshot tests** — use explicit behavioral assertions
- **Import test utils from `@mycscompanion/config/test-utils/`** — never create ad-hoc mocks
- **Test names describe behavior:** `it('should render glow effect on current milestone data point')` — good
- **Reduced motion testing:** Use `window.matchMedia` mock to test `prefers-reduced-motion: reduce` behavior

### Project Structure Notes

**New files:**
- `apps/webapp/src/components/overview/TrajectoryChart.tsx`
- `apps/webapp/src/components/overview/TrajectoryChart.test.tsx`
- `apps/webapp/src/hooks/use-trajectory-data.ts`
- `apps/webapp/src/hooks/use-trajectory-data.test.ts`

**Modified files:**
- `apps/backend/src/plugins/execution/routes/benchmark-results.ts` — add trajectory endpoint
- `apps/backend/src/plugins/execution/routes/benchmark-results.test.ts` — add trajectory tests
- `apps/webapp/src/routes/Completion.tsx` — replace placeholder with TrajectoryChart
- `apps/webapp/src/routes/Completion.test.tsx` — update/add trajectory integration tests
- `apps/webapp/src/hooks/use-submit-code.ts` — add trajectory cache invalidation
- `apps/webapp/src/hooks/use-submit-code.test.ts` — add trajectory invalidation test

**All new component files use `PascalCase.tsx`, all hooks use `kebab-case.ts`**
**Co-located tests: `*.test.ts(x)` next to source**

### References

- [Source: _bmad-output/planning-artifacts/epics.md — Epic 7, Story 7.4, Story 7.5]
- [Source: _bmad-output/planning-artifacts/architecture.md — ARCH-9 (execution package), frontend component structure (TrajectoryChart.tsx in overview/)]
- [Source: _bmad-output/planning-artifacts/prd.md — FR11]
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md — UX-8 (engineering language + shareable artifact), UX-14 (responsive breakpoints), UX-22 (keyboard shortcut), UX-25 (prefers-reduced-motion), NFR-A5 (data table alternative)]
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md — TrajectoryChart component spec: inline SVG, viewBox, data points as circles, glow effect, no charting library]
- [Source: _bmad-output/planning-artifacts/ux-design-directions.html — Complete HTML/CSS mockup of trajectory chart in completion view]
- [Source: _bmad-output/project-context.md — TanStack Query patterns, testing rules, naming conventions, anti-patterns]
- [Source: apps/backend/src/plugins/execution/routes/benchmark-results.ts — mapBenchmarkRow, parseRawMetrics, existing routes to extend]
- [Source: apps/webapp/src/hooks/use-previous-benchmark.ts — TanStack Query `useQuery` pattern for benchmark data (follow for useTrajectoryData)]
- [Source: apps/webapp/src/components/workspace/BenchmarkHeroDisplay.tsx — Number formatting with Intl.NumberFormat, motion-reduce pattern]
- [Source: apps/webapp/src/components/workspace/BenchmarkHistoryList.tsx — Accessible table pattern with thead, aria-label, responsive columns]
- [Source: apps/webapp/src/routes/Completion.tsx — Existing placeholder to replace (lines 66-74)]
- [Source: apps/webapp/src/components/workspace/WorkspaceLayout.tsx — Keyboard shortcut already implemented (lines 106-110)]
- [Source: apps/webapp/src/hooks/use-submit-code.ts — benchmark_result SSE handler to extend with trajectory invalidation]
- [Source: _bmad-output/implementation-artifacts/7-3-historical-benchmark-results.md — Previous story learnings: cursor tiebreaker, mapBenchmarkRow reuse, test determinism]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6

### Debug Log References

- Fixed jsdom `window.matchMedia` not available — added defensive `typeof window.matchMedia === 'function'` check
- Fixed test cleanup issue (duplicate SVG elements between tests) — added explicit `cleanup()` in `afterEach`

### Completion Notes List

- Task 1: Implemented `GET /benchmark-results/trajectory` endpoint extending `benchmark-results.ts`. Uses simpler approach (query all, pick best in app code) per story guidance. JOINs `milestones` table for name/position. Reuses `parseRawMetrics()`. 6 backend tests added.
- Task 2: Created `useTrajectoryData` hook following `usePreviousBenchmark` pattern. Query key `['benchmark', 'trajectory']`, 5-min staleTime, retry false. 3 frontend tests added.
- Task 3: Created `TrajectoryChart` component with custom inline SVG (no charting library). Handles edge cases: single point (centered, no polyline), identical values (centered), wildly different (10% padding). Glow effect via SVG filter with `useId()` for unique IDs. `prefers-reduced-motion` removes glow. Responsive via `viewBox` + Tailwind breakpoints. 10 component tests added.
- Task 4: Created `TrajectoryDataTable` with `sr-only` semantic table. Columns: #, Milestone, Best Ops/sec, Ratio, Runs. Engineering-grade labels. 3 tests added.
- Task 5: Replaced trajectory placeholder in `Completion.tsx` with `TrajectoryChart` + `TrajectoryDataTable`. Added loading skeleton (animate-pulse) and empty state. Removed old CSS style block. 4 integration tests added, 1 old placeholder test replaced.
- Task 6: Added `queryClient.invalidateQueries({ queryKey: ['benchmark', 'trajectory'] })` to `benchmark_result` SSE handler in `use-submit-code.ts`. 1 test added.
- Task 7: Verified `⌘+Shift+Enter` keyboard shortcut in `WorkspaceLayout.tsx` line 106-110. Already implemented, no changes needed.
- 5.2: `use-completion-data.ts` not modified — trajectory is fetched separately via `useTrajectoryData` hook (independent query, not embedded in completion endpoint).

### Change Log

- 2026-03-12: Implemented Story 7.4 — Benchmark Trajectory Visualization (all 7 tasks, 28 tests added)
- 2026-03-12: Code review fixes — H1: trajectory error state in Completion.tsx, H2: fixed wrong test scenario in use-trajectory-data.test.ts (split into empty data + error tests), M1: added cross-user isolation test for trajectory endpoint, M2: wrapped prefers-reduced-motion in useMemo, M3: strengthened currentMilestoneNumber test assertion (verify glow filter + radius)

### File List

**New files:**
- `apps/webapp/src/components/overview/TrajectoryChart.tsx`
- `apps/webapp/src/components/overview/TrajectoryChart.test.tsx`
- `apps/webapp/src/hooks/use-trajectory-data.ts`
- `apps/webapp/src/hooks/use-trajectory-data.test.ts`

**Modified files:**
- `apps/backend/src/plugins/execution/routes/benchmark-results.ts` — added trajectory endpoint
- `apps/backend/src/plugins/execution/routes/benchmark-results.test.ts` — added 6 trajectory tests + updated cleanup
- `apps/webapp/src/routes/Completion.tsx` — replaced placeholder with TrajectoryChart + data table
- `apps/webapp/src/routes/Completion.test.tsx` — added 4 trajectory integration tests, updated mock setup
- `apps/webapp/src/hooks/use-submit-code.ts` — added trajectory cache invalidation
- `apps/webapp/src/hooks/use-submit-code.test.ts` — added trajectory invalidation test
