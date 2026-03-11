# Story 7.3: Historical Benchmark Results

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a learner,
I want to see how my benchmark results have changed across submissions within a milestone,
so that I can track whether my code changes are improving performance.

## Acceptance Criteria

1. Given a learner has multiple benchmark results within a milestone, when they view historical results, then a list or chart shows benchmark results across submissions in chronological order (FR10)
2. Given historical results are displayed, when each entry is shown, then each entry shows the absolute metric (ops/sec), normalized ratio, and submission number
3. Given historical results are displayed, when consecutive entries are compared, then the display indicates trend direction (improving or regressing) between consecutive results
4. Given historical data is queried, when the backend responds, then historical data is queried from the `benchmark_results` table filtered by user and milestone
5. Given historical results exceed one page, when paginated, then results use cursor-based pagination per ARCH-13 (`?afterCursor={lastId}&pageSize=20`)
6. Given historical results are displayed, when text is shown, then engineering-grade language is used throughout — no "great job" or casual commentary (UX-8)
7. Given historical results are displayed, when keyboard is used, then the historical view is keyboard-accessible (NFR-A2)
8. Given historical results include charts, when accessibility is needed, then benchmark charts have data table alternatives for accessibility (NFR-A5)

## Tasks / Subtasks

- [x] Task 1: Create historical benchmark results API endpoint (AC: #4, #5)
  - [x]1.1 Add `GET /api/execution/benchmark-results/history/:milestoneId` route in `apps/backend/src/plugins/execution/routes/benchmark-results.ts` (extend existing file — reuse `mapBenchmarkRow` and `parseRawMetrics` helpers).
    ```typescript
    // Query params
    interface HistoricalBenchmarkQuery {
      readonly afterCursor?: string  // cuid2 of last result for cursor pagination
      readonly pageSize?: string     // Default "20", max "50"
    }

    // Response shape
    interface HistoricalBenchmarkResponse {
      readonly results: ReadonlyArray<{
        readonly id: string
        readonly submissionId: string
        readonly benchmarkName: string
        readonly opsPerSec: number
        readonly normalizedRatio: number
        readonly userMedian: number
        readonly referenceMedian: number
        readonly p50LatencyUs: number | null
        readonly p99LatencyUs: number | null
        readonly referenceVersion: string
        readonly createdAt: string        // ISO 8601
      }>
      readonly nextCursor: string | null  // null when no more results
      readonly totalCount: number         // Total results for this user+milestone (returned on first page only for efficiency; subsequent pages return same value)
    }
    ```
    **Query logic:**
    - **No JOIN needed** — `benchmark_results` has direct `user_id` and `milestone_id` columns. Query the table directly (do NOT join `submissions`).
    - Base query: `SELECT * FROM benchmark_results WHERE user_id = ? AND milestone_id = ? ORDER BY created_at ASC`
    - This directly leverages the `idx_benchmark_results_user_id_milestone_id` index.
    - Cursor pagination: If `afterCursor` provided, add `AND created_at > (SELECT created_at FROM benchmark_results WHERE id = ?)`. cuid2 IDs are NOT chronologically sortable — must use `created_at` for ordering.
    - `LIMIT pageSize + 1` to detect if more results exist. If `pageSize + 1` rows returned, pop the last row and set `nextCursor` to the last *included* row's `id`.
    - Total count: `SELECT COUNT(*) FROM benchmark_results WHERE user_id = ? AND milestone_id = ?` — separate query, no JOIN needed.
    - **No `submissionNumber` in SQL** — the frontend computes sequential numbering from the flattened chronologically-ordered entries (`entries.map((e, i) => i + 1)`). This avoids `ROW_NUMBER()` window function complexity with cursor pagination.
    - Auth required — verify `request.uid` (already handled by auth plugin global hook).
    - Parse `pageSize` with `Math.min(Math.max(Number(pageSize) || 20, 1), 50)` to clamp range.
    - Reuse `mapBenchmarkRow()` for each result row — it already handles `parseRawMetrics`, `parseFloat(normalized_ratio)`, and camelCase conversion.
  - [x]1.2 Route is already registered via `benchmarkResultsRoutes` in `apps/backend/src/plugins/execution/index.ts` — no additional registration needed since we're adding to the same function.
  - [x]1.3 Unit test (backend): returns results in chronological order (oldest first)
  - [x]1.4 Unit test (backend): cursor pagination returns correct next page
  - [x]1.6 Unit test (backend): returns `nextCursor: null` when no more results
  - [x]1.7 Unit test (backend): returns `totalCount` matching actual result count
  - [x]1.8 Unit test (backend): returns empty results array when no benchmarks exist (not 404)
  - [x]1.9 Unit test (backend): respects `pageSize` limit (default 20, max 50)
  - [x]1.10 Unit test (backend): returns 401 for unauthenticated request

- [x] Task 2: Create `useHistoricalBenchmarks` frontend hook (AC: #1, #4, #5)
  - [x]2.1 Create `apps/webapp/src/hooks/use-historical-benchmarks.ts`:
    ```typescript
    import { useMemo } from 'react'
    import { useInfiniteQuery } from '@tanstack/react-query'
    import { apiFetch } from '../lib/api-fetch'

    interface HistoricalBenchmarkEntry {
      readonly id: string
      readonly submissionId: string
      readonly benchmarkName: string
      readonly opsPerSec: number
      readonly normalizedRatio: number
      readonly userMedian: number
      readonly referenceMedian: number
      readonly p50LatencyUs: number | null
      readonly p99LatencyUs: number | null
      readonly referenceVersion: string
      readonly createdAt: string
      readonly submissionNumber: number  // Computed on frontend (1-based index in flattened array)
    }

    interface HistoricalBenchmarkPage {
      readonly results: ReadonlyArray<Omit<HistoricalBenchmarkEntry, 'submissionNumber'>>
      readonly nextCursor: string | null
      readonly totalCount: number
    }

    interface UseHistoricalBenchmarksResult {
      readonly entries: ReadonlyArray<HistoricalBenchmarkEntry>
      readonly totalCount: number
      readonly isLoading: boolean
      readonly hasNextPage: boolean
      readonly fetchNextPage: () => void
      readonly isFetchingNextPage: boolean
    }

    function useHistoricalBenchmarks(milestoneId: string | undefined): UseHistoricalBenchmarksResult
    ```
    **Implementation — follow `useTutorMessages` pattern** (existing `useInfiniteQuery` hook at `apps/webapp/src/hooks/use-tutor-messages.ts`):
    - Use `useInfiniteQuery` from TanStack Query (NOT `useQuery`).
    - Query key: `['benchmark', 'history', milestoneId]`
    - `queryFn`: calls `GET /api/execution/benchmark-results/history/${milestoneId}?afterCursor=${pageParam}&pageSize=20`
    - `getNextPageParam`: returns `lastPage.nextCursor ?? undefined` (undefined stops pagination — same pattern as `useTutorMessages`)
    - `initialPageParam`: `undefined as string | undefined` (same cast pattern as `useTutorMessages`)
    - `enabled`: `!!milestoneId`
    - `staleTime`: `5 * 60_000` (5 min)
    - Flatten pages and add `submissionNumber` via `useMemo`:
      ```typescript
      const entries = useMemo(() => {
        if (!data) return []
        return data.pages.flatMap((p) => p.results).map((entry, i) => ({
          ...entry,
          submissionNumber: i + 1,
        }))
      }, [data])
      ```
    - `totalCount` from latest page: `data?.pages[data.pages.length - 1]?.totalCount ?? 0`
    - `hasNextPage: hasNextPage ?? false` (same default pattern as `useTutorMessages`)
  - [x]2.2 Unit test: returns empty entries when no data
  - [x]2.3 Unit test: flattens pages into single entries array
  - [x]2.4 Unit test: `hasNextPage` is true when `nextCursor` is non-null
  - [x]2.5 Unit test: disabled when `milestoneId` is undefined

- [x] Task 3: Create `BenchmarkHistoryList` component (AC: #1, #2, #3, #6, #7, #8)
  - [x]3.1 Create `apps/webapp/src/components/workspace/BenchmarkHistoryList.tsx`:
    ```typescript
    import { useHistoricalBenchmarks } from '../../hooks/use-historical-benchmarks'

    interface BenchmarkHistoryListProps {
      readonly milestoneId: string | undefined
    }
    ```
    **The component calls `useHistoricalBenchmarks(milestoneId)` internally** — do NOT prop-drill history data from Workspace.tsx. This follows the same pattern as other workspace components that own their data fetching.

    **Layout — data table (accessible by default, satisfies NFR-A5):**
    - Render as `<table>` with `<thead>` and `<tbody>` — semantic HTML for screen reader accessibility.
    - Columns: `#` (submission number), `Ops/sec` (hero metric, formatted with `Intl.NumberFormat`), `Ratio` (normalized, 2 decimal places), `Trend` (direction vs previous), `Date` (relative — "2 min ago", "yesterday", etc. using a simple utility function).
    - **Trend column logic:** For each entry at index `i`:
      - If `i === 0` (first entry): show "—" (no previous to compare)
      - If `entries[i].opsPerSec > entries[i-1].opsPerSec`: show `↑` with `text-primary` (green)
      - If `entries[i].opsPerSec < entries[i-1].opsPerSec`: show `↓` with `text-muted-foreground` (subdued — NOT `text-destructive`/red, matching `BenchmarkHeroDisplay` which uses `text-foreground` for regression, never red)
      - If equal: show `→` with `text-muted-foreground`
    - **Trend is NOT color-only:** Arrow character + `aria-label` (e.g., "Improving from 8,200 ops/sec") satisfies UX-9.
    - **Engineering-grade language:** "12,400 ops/sec", "0.82x ref" — no casual commentary.
    - **Empty state:** "No benchmark results yet. Run a benchmark to see your performance history." — engineering tone.
    - **Loading state:** Purpose-built skeleton (3-4 rows of `animate-pulse` placeholder bars). NOT a generic spinner.
    - **Load more:** "Load more results" button at bottom when `hasNextPage`. Button shows "Loading..." when `isFetchingNextPage`.
    - **Summary header:** "{totalCount} benchmark results" above the table.
    - **Keyboard accessibility:** Table is natively keyboard-navigable. "Load more" button is focusable.
    - **Reduced motion:** `motion-reduce:animate-none` on any loading animations.
    - **Responsive:** Full table on desktop. On narrow widths, hide `Ratio` and `Date` columns (show `#`, `Ops/sec`, `Trend` only).
    - **Benchmark name grouping:** For MVP, all results are shown in chronological order regardless of `benchmarkName`. Trend comparison is only meaningful between entries with the same `benchmarkName`. If a milestone has multiple benchmarks, trend arrows should compare against the previous entry with the *same* `benchmarkName` (not just the previous row). Simplest approach: filter entries by `benchmarkName` before computing trends, or skip trend for different-name consecutive entries.
  - [x]3.2 Create `apps/webapp/src/components/workspace/BenchmarkHistoryList.test.tsx`:
  - [x]3.3 Unit test: renders table with correct column headers
  - [x]3.4 Unit test: displays formatted ops/sec with commas (e.g., "12,400")
  - [x]3.5 Unit test: displays normalized ratio with 2 decimal places
  - [x]3.6 Unit test: shows improvement arrow (↑) when ops/sec increases
  - [x]3.7 Unit test: shows regression arrow (↓) when ops/sec decreases
  - [x]3.8 Unit test: shows "—" for first entry (no previous to compare)
  - [x]3.9 Unit test: renders "Load more results" button when `hasNextPage` is true
  - [x]3.10 Unit test: does not render "Load more" when `hasNextPage` is false
  - [x]3.11 Unit test: renders empty state message when entries is empty
  - [x]3.12 Unit test: renders loading skeleton when `isLoading` is true
  - [x]3.13 Unit test: table has accessible `<thead>` with column headers
  - [x]3.14 Unit test: trend arrows have descriptive `aria-label`

- [x] Task 4: Add "History" tab to TerminalPanel (AC: #1, #7)
  - [x]4.1 Update `apps/webapp/src/stores/workspace-ui-store.ts`:
    - Add `'history'` to the `activeTerminalTab` union type:
      ```typescript
      activeTerminalTab: 'brief' | 'diagrams' | 'output' | 'criteria' | 'history'
      ```
    - Update `setActiveTerminalTab` parameter type to match.
    - **CRITICAL:** Without this, TypeScript will reject `setActiveTab('history')`.
  - [x]4.2 Update `apps/webapp/src/components/workspace/TerminalPanel.tsx`:
    - Add `'history'` to `TAB_LABELS`: `history: 'History'`
    - Add `readonly milestoneId?: string` to `TerminalPanelProps` (single prop — no prop-drilling of history data).
    - Update `visibleTabs` logic: include `'history'` when `milestoneId` is provided. Place after `'output'` and before `'criteria'`:
      ```typescript
      const visibleTabs = [
        'brief',
        ...(conceptExplainerAssets.length > 0 ? ['diagrams'] : []),
        'output',
        ...(milestoneId ? ['history'] : []),
        'criteria',
      ] as const
      ```
    - Add `effectiveTab` fallback: if `activeTab === 'history'` and no `milestoneId`, fall back to `'output'`.
    - Add tab panel content for `'history'`: render `<BenchmarkHistoryList milestoneId={milestoneId} />`. The component owns its own data fetching — no props to drill.
  - [x]4.3 Update `apps/webapp/src/components/workspace/WorkspaceLayout.tsx`:
    - Pass `milestoneId` to `TerminalPanel` (single prop). `milestoneId` is already available in workspace context.
  - [x]4.4 Update `apps/webapp/src/routes/Workspace.tsx`:
    - Pass `milestoneId` through WorkspaceLayout to TerminalPanel. No other changes needed — `BenchmarkHistoryList` handles its own data fetching.
  - [x]4.5 Unit test: "History" tab renders in TerminalPanel when milestoneId provided
  - [x]4.6 Unit test: clicking "History" tab shows BenchmarkHistoryList
  - [x]4.7 Unit test: "History" tab not visible when no milestoneId

- [x] Task 5: Invalidate history cache on new benchmark result (AC: #1)
  - [x]5.1 Update `apps/webapp/src/hooks/use-submit-code.ts`:
    - In the `benchmark_result` SSE event handler (already exists from Story 7.2), add two `queryClient.invalidateQueries` calls **after** the existing `setQueryData` cache write and **before** the screen reader announcement:
      ```typescript
      case 'benchmark_result':
        // Existing cache write (from Story 7.2) — keep as-is
        queryClient.setQueryData<BenchmarkResultData>(...)

        // NEW: Invalidate history and previous queries so they refetch
        queryClient.invalidateQueries({ queryKey: ['benchmark', 'history'] })
        queryClient.invalidateQueries({ queryKey: ['benchmark', 'previous'] })

        // Existing screen reader announcement — keep as-is
        announceToScreenReader(...)
        break
      ```
    - Use broad query key prefix (`['benchmark', 'history']` without milestoneId) — invalidates all milestone histories. Simpler and safer than threading milestoneId into the SSE handler.
    - This is the **only** location for invalidation — do NOT add invalidation in Workspace.tsx or elsewhere.
  - [x]5.2 Unit test: `benchmark_result` event invalidates history queries
  - [x]5.3 Unit test: `benchmark_result` event invalidates previous benchmark query

## Dev Notes

### Architecture Compliance

- **No new Zustand stores** — historical benchmark data flows through TanStack Query (`useInfiniteQuery`), not Zustand (per project rules: exactly 2 stores only)
- **Plugin isolation preserved** — new backend route extends existing `execution` plugin's `benchmark-results.ts` file. Reuses `mapBenchmarkRow` and `parseRawMetrics` helpers already defined there
- **Named exports only** — no default exports
- **`apiFetch` in `apps/webapp/src/lib/api-fetch.ts`** — NOT in shared package
- **Component organization by feature** — `BenchmarkHistoryList.tsx` goes in `components/workspace/` alongside `BenchmarkHeroDisplay.tsx`
- **No `@/` import aliases** — use relative paths within the webapp
- **Cursor-based pagination** — per ARCH-13 and project-context.md anti-patterns. Never offset pagination
- **`toCamelCase()` NOT needed** — `mapBenchmarkRow` already converts to camelCase manually. This is a deliberate exception to the usual `toCamelCase()` pattern (used elsewhere in profile, onboarding, tutor routes). Reuse `mapBenchmarkRow` directly for consistency with existing benchmark routes
- **No `as` casting** — use `satisfies` or proper typing
- **Zustand store update required** — `activeTerminalTab` union type in `workspace-ui-store.ts` must include `'history'`

### Existing Implementation to Build On

**Already implemented (DO NOT duplicate):**

| What | Where | Status |
|---|---|---|
| `benchmark_results` table with `(user_id, milestone_id)` index | Migration `009_add_benchmark_results.ts` | Complete — index `idx_benchmark_results_user_id_milestone_id` supports history queries |
| `mapBenchmarkRow()` helper | `apps/backend/src/plugins/execution/routes/benchmark-results.ts` lines 17-40 | Complete — converts DB row to camelCase API response. **Reuse directly** |
| `parseRawMetrics()` helper | `apps/backend/src/plugins/execution/routes/benchmark-results.ts` lines 9-15 | Complete — parses JSONB `raw_metrics` column. **Reuse directly** |
| `GET /benchmark-results/latest/:milestoneId` route | Same file, lines 83-114 | Complete — similar query pattern to follow for history endpoint |
| `BenchmarkHeroDisplay` component | `apps/webapp/src/components/workspace/BenchmarkHeroDisplay.tsx` | Complete — for reference on number formatting and trend display patterns |
| `usePreviousBenchmark` hook | `apps/webapp/src/hooks/use-previous-benchmark.ts` | Complete — `useQuery` pattern for single benchmark result |
| `useTutorMessages` hook (`useInfiniteQuery` pattern) | `apps/webapp/src/hooks/use-tutor-messages.ts` | Complete — **follow this pattern** for `useHistoricalBenchmarks` (same `useInfiniteQuery` + cursor pagination + `useMemo` flatten approach) |
| `BenchmarkResultData` type + cache write | `apps/webapp/src/hooks/use-submit-code.ts` | Complete — `benchmark_result` SSE handler to extend with invalidation |
| Tab system in TerminalPanel | `apps/webapp/src/components/workspace/TerminalPanel.tsx` | Complete — existing Output tab to add History alongside |
| `announceToScreenReader()` utility | `apps/webapp/src/components/workspace/workspace-a11y.ts` | Complete — use for announcing history load |
| `Intl.NumberFormat` formatter | `BenchmarkHeroDisplay.tsx` line 11 | Pattern established — reuse for formatting ops/sec in history list |
| `benchmark_name` column in DB | Migration `009` | Complete — allows filtering by benchmark name if needed |

### Data Flow for Historical Benchmarks

```
User clicks "History" tab in TerminalPanel
    |
    v
TerminalPanel renders BenchmarkHistoryList(milestoneId)
    |
    v
BenchmarkHistoryList calls useHistoricalBenchmarks(milestoneId) internally
    |
    v
useInfiniteQuery → GET /api/execution/benchmark-results/history/:milestoneId
    |
    v
Backend queries benchmark_results table directly (user_id + milestone_id — NO join)
    |
    v
Frontend flattens pages, adds submissionNumber (index + 1), renders table
    |
    v
"Load more" button → fetchNextPage → next cursor request
```

```
New benchmark completes (SSE benchmark_result event)
    |
    v
useSubmitCode invalidates ['benchmark', 'history'] + ['benchmark', 'previous']
    |
    v
History tab auto-refreshes with new entry
```

### Component Hierarchy

```
Workspace.tsx (passes milestoneId down)
  └── WorkspaceLayout (passes milestoneId to TerminalPanel)
        └── TerminalPanel (milestoneId prop controls History tab visibility)
              ├── Tab: "Output"
              │     ├── OutputContent (existing)
              │     ├── BenchmarkProgressInline (existing)
              │     └── BenchmarkHeroDisplay (existing)
              └── Tab: "History" (only visible when milestoneId provided)  ← NEW
                    └── BenchmarkHistoryList(milestoneId)                  ← NEW
                          └── useHistoricalBenchmarks(milestoneId)         ← NEW (hook called internally)
```

### Cursor Pagination Implementation Detail

**Backend cursor strategy:** `cuid2` IDs are NOT chronologically sortable — cursor pagination uses `created_at` for ordering. The cursor value is the `id` of the last result on the current page.

```sql
-- Kysely query (both first page and subsequent pages)
SELECT * FROM benchmark_results
WHERE user_id = $uid AND milestone_id = $milestoneId
  -- Cursor filter (omit for first page)
  AND created_at > (SELECT created_at FROM benchmark_results WHERE id = $cursor)
ORDER BY created_at ASC
LIMIT $pageSize + 1  -- +1 to detect hasNextPage
```

**No JOIN needed** — `benchmark_results` has direct `user_id` and `milestone_id` columns. Leverages `idx_benchmark_results_user_id_milestone_id` index.

**No ROW_NUMBER** — `submissionNumber` is computed on the frontend after flattening pages: `entries.map((e, i) => ({ ...e, submissionNumber: i + 1 }))`. This avoids SQL window function complexity with cursor pagination.

**Total count** — separate `COUNT(*)` query: `SELECT COUNT(*) FROM benchmark_results WHERE user_id = $uid AND milestone_id = $milestoneId`.

### UX Design Compliance

**Epic 7 UX scope for this story:** FR10, UX-8, NFR-A2, NFR-A5. **Out-of-scope:** UX-21 (trajectory chart on milestone completion — Story 7.4/7.5), UX-22 (benchmark keyboard shortcut — already done in 7.2).

**Key UX rules:**
- Engineering-grade language throughout: "12,400 ops/sec", "0.82x ref" — never "Great improvement!" or gamified language
- Data table is the primary view (satisfies NFR-A5 accessibility requirement for chart alternatives). Chart visualization is Story 7.4's trajectory view
- Color is never the sole signal: trend arrows (↑/↓/→) + `aria-label` text always accompany color
- Keyboard navigation: semantic `<table>` is natively keyboard-accessible. "Load more" button is focusable with `<button>` element

### Relative Date Formatting

Use a simple utility function (inline in `BenchmarkHistoryList.tsx` — don't create a separate utility for one use):

```typescript
function formatRelativeDate(isoDate: string): string {
  const now = Date.now()
  const date = new Date(isoDate).getTime()
  const diffMs = now - date
  const diffMin = Math.floor(diffMs / 60_000)
  const diffHours = Math.floor(diffMs / 3_600_000)
  const diffDays = Math.floor(diffMs / 86_400_000)

  if (diffMin < 1) return 'just now'
  if (diffMin < 60) return `${diffMin}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays < 7) return `${diffDays}d ago`
  return new Date(isoDate).toLocaleDateString()
}
```

### Testing Strategy

- **Backend route tests:** Extend `apps/backend/src/plugins/execution/routes/benchmark-results.test.ts` — add tests for `GET /history/:milestoneId`. Use `fastify.inject()`. Insert multiple `benchmark_results` rows with different `created_at` values to test ordering and pagination
- **Frontend hook tests:** Create `apps/webapp/src/hooks/use-historical-benchmarks.test.ts` — mock `apiFetch`, test with `createTestQueryClient()` from `@mycscompanion/config/test-utils/`
- **Component tests:** Create `apps/webapp/src/components/workspace/BenchmarkHistoryList.test.tsx` — Vitest + `@testing-library/react`. Test rendering, trend arrows, empty state, loading skeleton, load more button
- **Integration tests in TerminalPanel:** Extend `apps/webapp/src/components/workspace/TerminalPanel.test.tsx` — test History tab visibility and rendering
- **Cache invalidation tests:** Extend `apps/webapp/src/hooks/use-submit-code.test.ts` — test that `benchmark_result` SSE event invalidates history and previous queries
- **No snapshot tests** — use explicit behavioral assertions
- **Import test utils from `@mycscompanion/config/test-utils/`** — never create ad-hoc mocks
- **Test names describe behavior:** `it('should show improvement arrow when ops/sec increases between entries')` — good

### Key Patterns from Stories 7.1 and 7.2

- Story 7.1: `benchmark_results` table has `idx_benchmark_results_user_id_milestone_id` index — designed for this story's historical queries. `normalized_ratio` is `numeric(8,4)` in DB → `string` in Kysely → `parseFloat()` on read
- Story 7.2: `BenchmarkHeroDisplay` established the number formatting pattern (`Intl.NumberFormat` for commas), trend display pattern (↑/↓ arrows with color), and `aria-live` region for screen reader announcements. The `usePreviousBenchmark` hook established the TanStack Query pattern for benchmark data (`staleTime: 5min`)
- Story 7.2 code review: `mapBenchmarkRow()` and `parseRawMetrics()` were extracted as helpers to avoid duplication — reuse them for the history endpoint
- `benchmark_name` column was added during 7.1 code review — each result has a benchmark name (e.g., "sequential-inserts"). A milestone could have multiple benchmarks. For MVP, show all results in chronological order. **Trend comparison caveat:** comparing ops/sec across different benchmark types is meaningless. When computing trend arrows, compare against the previous entry with the *same* `benchmarkName`, not just the previous row. Milestone 1 has only one benchmark ("sequential-inserts") so this is not an immediate issue, but the logic should be correct for future milestones

### Project Structure Notes

- New files: `BenchmarkHistoryList.tsx`, `BenchmarkHistoryList.test.tsx`, `use-historical-benchmarks.ts`, `use-historical-benchmarks.test.ts`
- Modified files: `benchmark-results.ts` (backend — add history route), `benchmark-results.test.ts` (backend — add history tests), `workspace-ui-store.ts` (add `'history'` to tab union), `TerminalPanel.tsx` (add History tab + milestoneId prop), `TerminalPanel.test.tsx`, `WorkspaceLayout.tsx` (pass milestoneId), `Workspace.tsx` (pass milestoneId), `use-submit-code.ts` (add invalidation), `use-submit-code.test.ts`
- All new component files use `PascalCase.tsx`, all hooks use `kebab-case.ts`
- Co-located tests: `*.test.ts(x)` next to source

### References

- [Source: _bmad-output/planning-artifacts/epics.md — Epic 7, Story 7.3]
- [Source: _bmad-output/planning-artifacts/architecture.md — ARCH-9 (execution package), ARCH-13 (cursor pagination)]
- [Source: _bmad-output/planning-artifacts/prd.md — FR10]
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md — UX-8, NFR-A2, NFR-A5]
- [Source: _bmad-output/project-context.md — Cursor pagination, TanStack Query patterns, testing rules, naming conventions]
- [Source: apps/backend/src/plugins/execution/routes/benchmark-results.ts — mapBenchmarkRow, parseRawMetrics, existing routes to extend]
- [Source: apps/webapp/src/hooks/use-previous-benchmark.ts — TanStack Query `useQuery` pattern for benchmark data]
- [Source: apps/webapp/src/hooks/use-tutor-messages.ts — TanStack Query `useInfiniteQuery` + cursor pagination pattern (follow this for history hook)]
- [Source: apps/webapp/src/stores/workspace-ui-store.ts — `activeTerminalTab` union type to extend with `'history'`]
- [Source: apps/webapp/src/components/workspace/BenchmarkHeroDisplay.tsx — Number formatting, trend display patterns]
- [Source: apps/webapp/src/hooks/use-submit-code.ts — benchmark_result SSE handler to extend]
- [Source: apps/webapp/src/components/workspace/TerminalPanel.tsx — Tab system to extend]
- [Source: _bmad-output/implementation-artifacts/7-1-benchmark-runner-and-reference-normalization.md — Previous story learnings]
- [Source: _bmad-output/implementation-artifacts/7-2-benchmark-results-display.md — Previous story learnings]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6

### Debug Log References

None.

### Completion Notes List

- Task 1: Added `GET /benchmark-results/history/:milestoneId` route to existing `benchmark-results.ts`. Reused `mapBenchmarkRow` and `parseRawMetrics` helpers. Cursor-based pagination using `created_at` ordering (cuid2 IDs are not chronologically sortable). Separate COUNT(*) query for totalCount. 7 unit tests added covering chronological ordering, cursor pagination, empty results, pageSize clamping, and auth.
- Task 2: Created `useHistoricalBenchmarks` hook following `useTutorMessages` pattern — `useInfiniteQuery` with cursor pagination, `useMemo` for flattening pages and computing `submissionNumber`. 4 unit tests.
- Task 3: Created `BenchmarkHistoryList` component — semantic `<table>` for accessibility (NFR-A5), trend arrows with `aria-label` (not color-only, NFR-A2), engineering-grade language (UX-8), responsive columns (hide Ratio/Date on small screens), loading skeleton, empty state, "Load more" button. Trend comparison uses same `benchmarkName` matching. 12 unit tests.
- Task 4: Added `'history'` to `activeTerminalTab` union in `workspace-ui-store.ts`. Added History tab to `TerminalPanel` with `milestoneId` prop controlling visibility. Passed `milestoneId` through `WorkspaceLayout` from `Workspace.tsx`. 3 unit tests.
- Task 5: Added `queryClient.invalidateQueries` for `['benchmark', 'history']` and `['benchmark', 'previous']` in the `benchmark_result` SSE event handler in `use-submit-code.ts`. 2 unit tests.

### Senior Developer Review (AI)

**Reviewed by:** Amelia (Dev Agent) — 2026-03-11
**Outcome:** Approved with fixes applied

**Issues found:** 4 Medium, 3 Low (0 Critical, 0 High)
**Issues fixed:** 6 (4 Medium + 2 Low)
**Issues accepted:** 1 Low (L2 — `as` cast on `initialPageParam` is required by TanStack Query API, matches `useTutorMessages` pattern)

**Fixes applied:**
1. **M1** — Cursor pagination tiebreaker: added `(created_at, id)` composite ordering to prevent row skipping on identical timestamps
2. **M2** — Test assertion consistency: replaced `toBeDefined()`/`toBeNull()` with `toBeInTheDocument()`/`not.toBeInTheDocument()` across History tests
3. **M3** — Deterministic test timestamps: replaced `Date.now()` with fixed base `2026-01-01T00:00:00Z` in seed data
4. **M4** — Explicit `pageSize=20` in hook URL per story spec
5. **L1** — Explicit column selection in history query (replaced `selectAll()`)
6. **L3** — `formatRelativeDate` handles negative diffs (future dates / clock skew)

**All 995 tests pass (431 backend + 564 frontend).**

### Change Log

- 2026-03-11: Implemented Story 7.3 — Historical Benchmark Results (all 5 tasks)
- 2026-03-11: Code review fixes — cursor pagination tiebreaker, test assertion consistency, deterministic timestamps, explicit pageSize, explicit column selection, future date handling

### File List

**New files:**
- `apps/webapp/src/hooks/use-historical-benchmarks.ts`
- `apps/webapp/src/hooks/use-historical-benchmarks.test.ts`
- `apps/webapp/src/components/workspace/BenchmarkHistoryList.tsx`
- `apps/webapp/src/components/workspace/BenchmarkHistoryList.test.tsx`

**Modified files:**
- `apps/backend/src/plugins/execution/routes/benchmark-results.ts` — added history endpoint
- `apps/backend/src/plugins/execution/routes/benchmark-results.test.ts` — added history tests
- `apps/webapp/src/stores/workspace-ui-store.ts` — added `'history'` to tab union
- `apps/webapp/src/components/workspace/TerminalPanel.tsx` — added History tab + milestoneId prop
- `apps/webapp/src/components/workspace/TerminalPanel.test.tsx` — added History tab tests
- `apps/webapp/src/components/workspace/WorkspaceLayout.tsx` — pass milestoneId to TerminalPanel
- `apps/webapp/src/routes/Workspace.tsx` — pass milestoneId to WorkspaceLayout
- `apps/webapp/src/hooks/use-submit-code.ts` — invalidate history + previous queries on benchmark_result
- `apps/webapp/src/hooks/use-submit-code.test.ts` — added invalidation tests
