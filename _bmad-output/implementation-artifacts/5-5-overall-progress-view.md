# Story 5.5: Overall Progress View

Status: done

## Story

As a learner,
I want to see my progress across all milestones in the track,
so that I understand how far I've come and what's ahead.

## Acceptance Criteria

1. Given a learner accesses their progress view, when the progress data loads, then the view shows all milestones in the track with status: completed, in-progress, or upcoming (FR39)
2. Given a completed milestone is shown, then it displays criteria met count and a completion indicator
3. Given the in-progress milestone is shown, then it displays current criteria status (met/unmet count)
4. Given an upcoming milestone is shown, then it displays title and brief description but no detailed content
5. Given any milestone in the list, then benchmark data slots are scaffolded but show placeholder (em-dash) until Epic 7
6. Given any text rendered in the progress view, then workshop-appropriate language is used — no gamification metrics like XP, streaks, or badges (UX-5)
7. Given any text rendered, then zero temporal framing is enforced — no dates, no "days ago", no "welcome back" (UX-3)
8. Given the progress view, then it is keyboard-accessible and screen reader compatible (NFR-A1, NFR-A2)
9. Given the progress view, then it is responsive across all three breakpoints: full at >=1280px, functional at 1024-1279px, read-only at <768px (UX-14)

## Tasks / Subtasks

- [x] Task 1: Add shared types for track progress (AC: #1, #2, #3, #4, #5)
  - [x] 1.1 Add `MilestoneProgressInfo` and `TrackProgressData` interfaces to `packages/shared/src/types/api.ts`
  - [x] 1.2 Export new types from `packages/shared/src/types/index.ts` barrel (already re-exported via `export type * from './api.js'`)

- [x] Task 2: Create backend track progress endpoint (AC: #1, #2, #3, #4, #5)
  - [x] 2.1 Create `apps/backend/src/plugins/progress/routes/track-progress.ts` with `GET /api/progress/track-progress`
  - [x] 2.2 Create `apps/backend/src/plugins/progress/routes/track-progress.test.ts` with integration tests (10 tests)
  - [x] 2.3 Register the route in `apps/backend/src/plugins/progress/index.ts`

- [x] Task 3: Create frontend progress route and components (AC: #1, #2, #3, #4, #5, #6, #7, #8, #9)
  - [x] 3.1 Create `apps/webapp/src/hooks/use-track-progress.ts` — TanStack Query hook for the new endpoint
  - [x] 3.2 Create `apps/webapp/src/components/progress/MilestoneProgressItem.tsx` — individual milestone row component
  - [x] 3.3 Create `apps/webapp/src/components/progress/MilestoneProgressItem.test.tsx` — tests (14 tests)
  - [x] 3.4 Create `apps/webapp/src/components/progress/ProgressView.tsx` — main page component showing track with all milestones
  - [x] 3.5 Create `apps/webapp/src/components/progress/ProgressView.test.tsx` — tests (11 tests)
  - [x] 3.6 Create `apps/webapp/src/components/progress/ProgressSkeleton.tsx` — loading skeleton matching layout
  - [x] 3.7 Create `apps/webapp/src/routes/Progress.tsx` — route wrapper with Suspense/error handling
  - [x] 3.8 Register `/progress` route in `apps/webapp/src/App.tsx`

- [x] Task 4: Add navigation to progress view (AC: #1)
  - [x] 4.1 Add "View all milestones" or equivalent link to `MilestoneStartOverview.tsx` below the CTA
  - [x] 4.2 Add "View all milestones" link to `FirstTimeOverview.tsx` as secondary action
  - [x] 4.3 Update overview component tests for the new navigation link
  - [x] 4.4 Add "Back to overview" navigation in `ProgressView.tsx`

## Dev Notes

### Current State (DO NOT recreate — build on existing work)

**What exists:**
- `GET /api/progress/overview` returns contextual overview for **single milestone** (current/active). This is the Overview page.
- `milestones` table has `id`, `track_id`, `title`, `slug`, `position`, `description`
- `user_milestones` table tracks completions: `user_id`, `milestone_id`, `completed_at`, `completing_submission_id`
- `submissions` table has `criteria_results` (JSONB) with `CriterionResult[]` per submission
- `tracks` table has `id`, `name`, `slug`, `description`
- Frontend route `/overview` shows single-milestone contextual overview
- No existing route or component for overall progress across milestones

**What this story adds:**
- Backend: New endpoint returning ALL milestones in the track with per-milestone status
- Frontend: New `/progress` route with track-level progress view
- Navigation: Links between overview and progress views

### Shared Types

Add to `packages/shared/src/types/api.ts`:

```typescript
export type MilestoneStatus = 'completed' | 'in-progress' | 'upcoming'

export interface MilestoneProgressInfo {
  readonly id: string
  readonly slug: string
  readonly title: string
  readonly position: number
  readonly description: string
  readonly status: MilestoneStatus
  readonly criteriaMet: number | null      // null for upcoming
  readonly criteriaTotal: number | null    // null for upcoming
  readonly completedAt: string | null      // ISO 8601, null if not completed
  readonly lastBenchmark: null             // Placeholder — Epic 7
}

export interface TrackProgressData {
  readonly trackName: string
  readonly trackSlug: string
  readonly milestones: readonly MilestoneProgressInfo[]
  readonly completedCount: number
  readonly totalCount: number
}
```

### Backend Endpoint Design

**Route:** `GET /api/progress/track-progress`
**Location:** `apps/backend/src/plugins/progress/routes/track-progress.ts`
**Auth:** Required (uses `request.uid`)

**Architecture note:** The architecture doc lists `GET /api/overview` for "track progress, milestone grid, trajectory data." In practice, `GET /api/progress/overview` already serves the single-milestone contextual overview (different screen, different data shape). This endpoint is a separate screen endpoint for the track-level progress view — both coexist under the progress plugin.

**Description data source:** Use the `milestones.description` column from the database (NOT the content loader's `loadMilestoneBrief()` which reads full markdown files). The progress plugin only receives `OverviewContentLoader` (with `loadMilestoneBrief` + `loadMetadata`), which is scoped to the overview route. The DB `description` column is a short text suitable for the progress list. Do NOT extend the content loader interface — keep it simple.

**Query logic:**
1. Find the user's track (for MVP there is one track — query the first track)
2. Load all milestones in the track ordered by `position` — SELECT `id`, `slug`, `title`, `position`, `description`
3. Load user completions from `user_milestones` for this user
4. For the in-progress milestone (first incomplete): find latest `completed` submission and extract `criteria_results` for met/total count
5. Determine status per milestone:
   - `completed`: has entry in `user_milestones`
   - `in-progress`: first milestone without completion AND user has at least one session or submission for it
   - `upcoming`: all others (no activity)
6. Return `TrackProgressData`

**Performance:** Single query with LEFT JOINs on `user_milestones` and a subquery for latest submission criteria. All indexed paths. No N+1. Consider extracting shared query helpers with the overview route rather than duplicating milestone/completion queries.

**Response shape:** Direct object (no wrapper). `{ error: { code, message } }` for errors.

**DB→API:** Apply `toCamelCase()` on all database results before returning.

### Backend Test Plan

Test file: `apps/backend/src/plugins/progress/routes/track-progress.test.ts`

Tests using `fastify.inject()` (never supertest):
1. Returns all milestones in correct order with status
2. Completed milestone shows `criteriaMet` count and `completedAt`
3. In-progress milestone shows current criteria progress
4. Upcoming milestone shows `null` for criteria fields
5. First-time user (no activity) — first milestone is `in-progress`, rest are `upcoming`
6. All milestones completed — all show `completed` status
7. Returns 401 without auth token
8. `lastBenchmark` is `null` for all milestones (Epic 7 placeholder)
9. `completedCount` and `totalCount` aggregate correctly

### Frontend Component Design

**ProgressView (`components/progress/ProgressView.tsx`):**
- Track title heading: `{trackName}` with progress summary subtitle: `{completedCount} of {totalCount} milestones completed`
- Ordered list of `MilestoneProgressItem` components
- "Back to overview" link at top (uses `useNavigate()` to `/overview`)
- No gamification: no percentage bar, no badges, no streaks — just a clean list
- Wrap in semantic `<main>` with `aria-label="Track progress"`

**MilestoneProgressItem (`components/progress/MilestoneProgressItem.tsx`):**
- Props: `MilestoneProgressInfo`
- Layout: horizontal row with milestone position number, title, description (truncated for upcoming), and status indicator
- **Completed:** Green checkmark or `data-status="completed"`, shows `{criteriaMet}/{criteriaTotal} criteria met`, benchmark placeholder (em-dash)
- **In-progress:** Highlighted/active state with `data-status="in-progress"`, shows `{criteriaMet}/{criteriaTotal} criteria met`, benchmark placeholder
- **Upcoming:** Muted appearance with `data-status="upcoming"`, title + brief description only, no criteria or benchmark
- Each item is a `<section>` with `aria-label="Milestone {position}: {title}"`
- In-progress milestone has a "Continue Building" link navigating to `/workspace/{id}`

**ProgressSkeleton (`components/progress/ProgressSkeleton.tsx`):**
- Matches ProgressView layout: heading skeleton + 5 milestone row skeletons
- Uses existing shadcn `Skeleton` component
- `data-testid="progress-skeleton"`

**Route wrapper (`routes/Progress.tsx`):**
- `React.lazy` import of `ProgressView`
- `Suspense` with `ProgressSkeleton` fallback
- Error boundary with retry
- Default export (only exception for `React.lazy`)

**Empty state (first-time user with zero activity):**
- Same layout as populated view — heading + milestone list
- All milestones show as `upcoming` except the first which shows as `in-progress`
- First milestone row has "Start Building" link (not "Continue Building") to `/workspace/{id}`
- No special empty-state illustration or messaging — follow UX spec: "Same layout as populated, placeholder content in `--muted-foreground`. No illustrations, no mascots."

**Responsive behavior (UX-14):**
- >=1280px: Full layout — milestone rows with description, criteria stats, benchmark placeholder
- 1024-1279px: Description may truncate or wrap. Same data.
- <768px: Read-only — milestone list with status indicators, descriptions, criteria counts. Replace "Continue Building" button with passive text: "Continue on desktop to build" in `text-muted-foreground`. No interactive workspace links on mobile.

### Frontend Data Fetching

**Hook:** `apps/webapp/src/hooks/use-track-progress.ts`
```typescript
export function useTrackProgress() {
  return useQuery<TrackProgressData>({
    queryKey: ['progress', 'track-progress'],
    queryFn: () => apiFetch<TrackProgressData>('/api/progress/track-progress'),
    staleTime: 5 * 60 * 1000,  // 5 minute cache, same as overview
  })
}
```

### Navigation Integration

**From Overview to Progress:**
- In `MilestoneStartOverview.tsx`: Add a secondary text link below the "Continue Building" button: "View all milestones" → navigates to `/progress`
- In `FirstTimeOverview.tsx`: Add same secondary link below "Start Building" button
- Style: `text-sm text-muted-foreground hover:underline` — tertiary action per UX spec's 3-tier button hierarchy (Primary = CTA, Secondary = bordered, Tertiary = no border/fill). This is a tertiary link, not competing with the single primary CTA.
- Use `<Link to="/progress">` from react-router for text links (the codebase uses `useNavigate()` for Button onClick handlers, but `<Link>` is appropriate for inline text navigation)

**From Progress to Workspace:**
- In-progress milestone row has "Continue Building" link → `/workspace/{milestoneId}`
- "Back to overview" link at top of progress view → `/overview`

**Route registration in App.tsx:**

The app uses `ProtectedRoute` as an **outlet layout route** — all protected routes are children of a single `<Route element={<ProtectedRoute />}>`, NOT individually wrapped. Add the new route as a sibling to the existing `/overview` route inside that parent:

```typescript
<Route element={<ProtectedRoute />}>
  {/* ...existing routes (overview, workspace, completion, etc.)... */}
  <Route path="/progress" element={
    <Suspense fallback={<ProgressSkeleton />}>
      <Progress />
    </Suspense>
  } />
</Route>
```

Do NOT wrap individually with `<ProtectedRoute>` — that is the wrong pattern for this codebase.

### UX Design Note

The UX design specification does not explicitly define a dedicated "overall progress view" layout — the spec's contextual overview focuses on the single-milestone experience. This view implements FR39 by applying existing UX principles (workshop atmosphere, zero temporal framing, responsive breakpoints, feedback vocabulary) to a new screen. Use the spec's visual language: green/`--primary` for completed states, `--secondary-foreground` for neutral/in-progress, `--muted-foreground` for upcoming. One primary button per screen. Weight differentiation over size differentiation for typography hierarchy.

### Architecture Compliance

- **No new Zustand stores** — only 2 exist (`useWorkspaceUIStore`, `useEditorStore`), none needed here
- **No new packages** — all changes in existing apps and `packages/shared`
- **Plugin isolation** — new route in `progress` plugin, no cross-plugin imports
- **Named exports only** — except `routes/Progress.tsx` default export for `React.lazy`
- **Components by feature** — new `components/progress/` directory alongside existing `components/overview/`
- **No `@/` aliases** — relative paths within webapp
- **Import shadcn/ui individually** — `import { Skeleton } from '@mycscompanion/ui/src/components/ui/skeleton'`
- **DB→API conversion** — `toCamelCase()` on every query result
- **IDs:** `cuid2` — no auto-increment, no UUID
- **Timestamps:** `timestamptz` in DB, ISO 8601 in API
- **Tailwind v4** — use existing design tokens from `packages/config/tailwind-tokens.css`, do NOT create new colors
- **Response shape:** Direct object, no `{ data: result, success: true }` wrapper
- **Backend tests:** `fastify.inject()` only, never supertest

### Testing Requirements

- **Test syntax:** `describe()` + `it()`, never `test()`. `vi.restoreAllMocks()` in `afterEach`
- **No snapshot tests** — explicit behavioral assertions only
- **No `any` type** — use `Partial<T>` or mock factories
- **Backend:** Real PostgreSQL, Kysely test transactions rolled back in `afterEach`
- **Frontend components:** `@testing-library/react` + `vitest` in `*.test.tsx`
- **Mock patterns:** `vi.mock('react-router')` for navigation, wrap in `MemoryRouter`
- **TanStack Query:** Use `createTestQueryClient()` from `@mycscompanion/config/test-utils/`
- **No `toMatchSnapshot()`** — behavioral assertions
- **Accessibility:** Test `aria-label` attributes, keyboard interaction if applicable
- **Zero temporal framing:** Assert no temporal language in any rendered text
- **No gamification:** Assert no XP, badges, streaks, levels language
- **Empty state:** Test first-time user (no completions) — verify layout matches populated state with appropriate defaults
- **Mobile CTA:** If testing responsive behavior, verify "Continue on desktop to build" passive text replaces interactive links at <768px

### Previous Story (5.4) Learnings

- Inline stat row layout (flex, 3 items) works well — reuse similar pattern for milestone stats within each progress item
- `OverviewSkeleton` must match actual component layout to prevent layout shift — apply same discipline to `ProgressSkeleton`
- Session summary as plain `<p>` with `text-muted-foreground` — follow same styling for descriptions
- Tests: use `toBeInTheDocument()` not `toBeDefined()` (code review fix from 5.4)
- Tests: don't assert Tailwind classNames — assert behavior and DOM structure
- Tests: use `querySelectorAll` for structural assertions, not brittle `nextElementSibling`
- `endSession` is a plain function utility (not a hook) — follow same pattern for simple utilities
- Temporal framing regex: use `/\bago\b/` to catch all "X ago" variants

### Anti-Patterns to Avoid

- Do NOT use the existing `GET /api/progress/overview` endpoint — it returns single-milestone data; create a new endpoint
- Do NOT create new Zustand stores — use TanStack Query for server state
- Do NOT add gamification (XP, badges, streaks, levels, progress bars with percentage fill animations)
- Do NOT add temporal framing ("days since", "welcome back", "last visited")
- Do NOT use `@/` import aliases — relative paths within webapp
- Do NOT use default exports — named exports only (except route file for React.lazy)
- Do NOT use `test()` — use `it()`
- Do NOT use `toMatchSnapshot()`
- Do NOT use `any` type
- Do NOT import from `@mycscompanion/ui` barrel — import components individually
- Do NOT use `supertest` — use `fastify.inject()`
- Do NOT use wrapper response shape `{ data: ..., success: true }` — return direct object
- Do NOT use offset pagination — cursor-based if pagination needed (unlikely for 5-10 milestones)
- Do NOT modify existing overview endpoint or components beyond adding the navigation link
- Do NOT add a persistent navigation bar — the workshop atmosphere spec says "no persistent top navigation bar"
- Do NOT create celebration animations, confetti, or "Great job!" popups for completed milestones

### Project Structure Notes

```
# Shared types (modified)
packages/shared/src/types/api.ts                                    # Add MilestoneProgressInfo, TrackProgressData
packages/shared/src/types/index.ts                                   # Re-export new types

# Backend (new + modified)
apps/backend/src/plugins/progress/routes/track-progress.ts          # NEW: GET /api/progress/track-progress
apps/backend/src/plugins/progress/routes/track-progress.test.ts     # NEW: integration tests
apps/backend/src/plugins/progress/index.ts                           # MODIFIED: register new route

# Frontend (new + modified)
apps/webapp/src/hooks/use-track-progress.ts                          # NEW: TanStack Query hook
apps/webapp/src/components/progress/MilestoneProgressItem.tsx        # NEW: single milestone row
apps/webapp/src/components/progress/MilestoneProgressItem.test.tsx   # NEW: component tests
apps/webapp/src/components/progress/ProgressView.tsx                 # NEW: main progress page
apps/webapp/src/components/progress/ProgressView.test.tsx            # NEW: component tests
apps/webapp/src/components/progress/ProgressSkeleton.tsx             # NEW: loading skeleton
apps/webapp/src/routes/Progress.tsx                                  # NEW: route wrapper
apps/webapp/src/App.tsx                                              # MODIFIED: add /progress route

# Frontend (modified — navigation links only)
apps/webapp/src/components/overview/MilestoneStartOverview.tsx       # MODIFIED: add "View all milestones" link
apps/webapp/src/components/overview/MilestoneStartOverview.test.tsx  # MODIFIED: test for nav link
apps/webapp/src/components/overview/FirstTimeOverview.tsx            # MODIFIED: add "View all milestones" link
apps/webapp/src/components/overview/FirstTimeOverview.test.tsx       # MODIFIED: test for nav link
```

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story-5.5]
- [Source: _bmad-output/planning-artifacts/prd.md#FR39]
- [Source: _bmad-output/planning-artifacts/architecture.md#Progress-Session-Management]
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#UX-5-Workshop-Language]
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#UX-14-Responsive-Breakpoints]
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#UX-3-Zero-Temporal-Framing]
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#Contextual-Overview]
- [Source: _bmad-output/project-context.md]
- [Source: _bmad-output/implementation-artifacts/5-4-session-summary-display-for-returning-users.md]
- [Source: packages/shared/src/types/api.ts#OverviewData]
- [Source: apps/backend/src/plugins/progress/index.ts]
- [Source: apps/backend/src/plugins/progress/routes/overview.ts]
- [Source: apps/backend/migrations/001_initial_schema.ts#milestones]
- [Source: apps/backend/migrations/005_add_user_milestones.ts]
- [Source: apps/webapp/src/App.tsx]
- [Source: apps/webapp/src/routes/Overview.tsx]
- [Source: apps/webapp/src/components/overview/MilestoneStartOverview.tsx]
- [Source: apps/webapp/src/components/overview/FirstTimeOverview.tsx]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6

### Debug Log References

None — clean implementation with all tests passing on first run.

### Completion Notes List

- Task 1: Added `MilestoneStatus`, `MilestoneProgressInfo`, and `TrackProgressData` types to shared package. Barrel already re-exports via `export type * from './api.js'`.
- Task 2: Created `GET /api/progress/track-progress` endpoint. Queries all milestones in track, determines status (completed/in-progress/upcoming) based on `user_milestones` completions and submission activity. Loads criteria counts from latest completed submissions. 10 integration tests covering all scenarios (correct order, completed/in-progress/upcoming states, first-time user, all-complete, 401 auth, benchmark placeholders, aggregate counts, descriptions).
- Task 3: Created full frontend stack — `useTrackProgress` hook, `MilestoneProgressItem` component (status-aware rendering with criteria stats, benchmark placeholder, responsive CTA), `ProgressView` (track heading, progress summary, milestone list with back-to-overview link), `ProgressSkeleton`, `Progress` route wrapper. 25 component tests covering rendering, accessibility (aria-labels, semantic roles), zero temporal framing, no gamification, empty state, keyboard-accessible structure.
- Task 4: Added "View all milestones" tertiary link to both `MilestoneStartOverview` and `FirstTimeOverview` below their primary CTA buttons. Added corresponding tests. "Back to overview" link already included in `ProgressView`.

### Change Log

- 2026-03-08: Implemented Story 5.5 — Overall Progress View with backend endpoint, frontend components, and navigation integration
- 2026-03-08: Code review fixes — eliminated N+1 query in track-progress endpoint (batched completed milestone criteria into single query), removed unnecessary JSX fragment in MilestoneProgressItem, fixed toBeDefined() → toBeInTheDocument() in FirstTimeOverview tests

### File List

**New files:**
- `apps/backend/src/plugins/progress/routes/track-progress.ts`
- `apps/backend/src/plugins/progress/routes/track-progress.test.ts`
- `apps/webapp/src/hooks/use-track-progress.ts`
- `apps/webapp/src/components/progress/MilestoneProgressItem.tsx`
- `apps/webapp/src/components/progress/MilestoneProgressItem.test.tsx`
- `apps/webapp/src/components/progress/ProgressView.tsx`
- `apps/webapp/src/components/progress/ProgressView.test.tsx`
- `apps/webapp/src/components/progress/ProgressSkeleton.tsx`
- `apps/webapp/src/routes/Progress.tsx`

**Modified files:**
- `packages/shared/src/types/api.ts` — added MilestoneStatus, MilestoneProgressInfo, TrackProgressData
- `apps/backend/src/plugins/progress/index.ts` — registered trackProgressRoutes
- `apps/webapp/src/App.tsx` — added /progress route with Suspense + ProgressSkeleton
- `apps/webapp/src/components/overview/MilestoneStartOverview.tsx` — added "View all milestones" link
- `apps/webapp/src/components/overview/MilestoneStartOverview.test.tsx` — added nav link test
- `apps/webapp/src/components/overview/FirstTimeOverview.tsx` — added "View all milestones" link
- `apps/webapp/src/components/overview/FirstTimeOverview.test.tsx` — added nav link test
