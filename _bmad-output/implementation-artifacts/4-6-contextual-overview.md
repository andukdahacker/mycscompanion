# Story 4.6: Contextual Overview (First-Time & Milestone-Start)

Status: done

## Story

As a learner,
I want to see a relevant overview when I start a milestone or use the platform for the first time,
so that I have the right context to begin working.

## Acceptance Criteria

1. Given a learner arrives at the workspace, when it is their first time using the platform, then they see a first-time contextual overview with: introductory context, brief excerpt for Milestone 1, and a "Start Building" CTA (UX-20)
2. When starting a new milestone (not the first visit), they see a milestone-start overview with zeroed stats and the milestone brief (UX-20)
3. The returning-user variant is scaffolded with placeholder slots for session summary (populated by Epic 5) and benchmark data (populated by Epic 7) (UX-20)
4. The overview uses workshop-appropriate language — no "welcome back" temporal framing (UX-3)
5. The overview is keyboard-accessible and screen reader compatible (NFR-A1, NFR-A2)
6. The CTA uses green accent as the sole primary action on screen (UX-9)

## Tasks / Subtasks

- [x] Task 1: Create overview API endpoint and shared types (AC: #1, #2, #3)
  - [x] 1.1 Define `OverviewData` type in `packages/shared/src/types/api.ts`:
    ```typescript
    type OverviewVariant = 'first-time' | 'milestone-start'

    interface OverviewMilestoneInfo {
      readonly id: string
      readonly slug: string
      readonly title: string
      readonly position: number
      readonly briefExcerpt: string
      readonly csConceptLabel: string | null
    }

    interface OverviewCriteriaProgress {
      readonly met: number
      readonly total: number
      readonly nextCriterionName: string | null
    }

    interface OverviewData {
      readonly variant: OverviewVariant
      readonly milestone: OverviewMilestoneInfo
      readonly criteriaProgress: OverviewCriteriaProgress | null  // null for first-time
      readonly sessionSummary: string | null    // Placeholder — populated by Epic 5
      readonly lastBenchmark: null              // Placeholder — populated by Epic 7
      readonly benchmarkTrend: null             // Placeholder — populated by Epic 7
    }
    ```
  - [x] 1.2 Add compile-time verification test in `packages/shared/src/types/api.test.ts` for new types
  - [x] 1.3 Create overview route in progress plugin `apps/backend/src/plugins/progress/routes/overview.ts`:
    - `GET /api/progress/overview` — requires Firebase Auth
    - Query `user_milestones` to find completed milestones for this user
    - If no completions AND no submissions exist → `variant: 'first-time'`, return first milestone in first track
    - Otherwise → `variant: 'milestone-start'`, return first incomplete milestone
    - Query `milestones` table for milestone metadata + join with content loader for brief excerpt (first 200 chars)
    - Query latest completed submission for the active milestone:
      ```typescript
      const latestSubmission = await db
        .selectFrom('submissions')
        .select(['criteria_results'])
        .where('user_id', '=', uid)
        .where('milestone_id', '=', activeMilestoneId)
        .where('status', '=', 'completed')
        .orderBy('created_at', 'desc')
        .limit(1)
        .executeTakeFirst()
      ```
    - Parse `criteria_results` JSONB: `latestSubmission.criteria_results as unknown[] as readonly CriterionResult[]` (same casting pattern as completion plugin — this is the ONE place `as` is acceptable for JSONB parsing)
    - Count met/total from parsed results, find first criterion where `status !== 'met'` for `nextCriterionName`
    - `sessionSummary: null` (placeholder for Epic 5)
    - `lastBenchmark: null`, `benchmarkTrend: null` (placeholder for Epic 7)
    - Use `toCamelCase()` for all DB→API conversion
    - Cursor-based pagination NOT needed (single-resource endpoint)
  - [x] 1.4 Wire progress plugin with contentLoader dependency injection:
    - Update `apps/backend/src/plugins/progress/index.ts`:
      - Define `ProgressPluginOptions` interface: `{ contentLoader: ContentLoader }` (follow completion plugin pattern)
      - Accept `contentLoader` via plugin options
      - Register overview route, passing `contentLoader` to the route handler
    - Update `apps/backend/src/app.ts`:
      - The progress plugin registration (line 92) currently passes no options besides prefix
      - Add `contentLoader` to the options: `await fastify.register(progressPlugin, { prefix: '/api/progress', contentLoader })`
      - Follow the exact same pattern as completion plugin registration
  - [x] 1.5 Add `csConceptLabel` field to milestone content:
    - **IMPORTANT**: There is NO `milestone.yaml` file. Content is split across `brief.md`, `acceptance-criteria.yaml`, `benchmark-config.yaml` in each milestone directory.
    - Create `content/milestones/01-kv-store/metadata.yaml` with:
      ```yaml
      csConceptLabel: "Systems Programming & I/O"
      ```
    - Update content loader in `apps/backend/src/plugins/curriculum/content-loader.ts`:
      - Add `readMetadata()` function that reads `metadata.yaml` from milestone directory
      - Extract `csConceptLabel` (default to `null` if file or field missing)
      - Include in milestone content response
    - Update `MilestoneContent` type in `packages/shared/src/types/curriculum.ts` to include `csConceptLabel: string | null`
    - Update content loader tests for metadata reading + missing metadata fallback
  - [x] 1.6 Create `content/schema/milestone-metadata.schema.json` for metadata.yaml validation
  - [x] 1.7 Create `apps/backend/src/plugins/progress/routes/overview.test.ts`:
    - Test first-time variant (no completions, no submissions) returns first milestone
    - Test milestone-start variant (has completions) returns next incomplete milestone
    - Test milestone-start with partial criteria returns progress stats + next criterion name
    - Test all milestones complete returns last milestone with full progress
    - Test `sessionSummary` and `lastBenchmark` are always null (placeholder verification)
    - Test 401 without valid auth token
    - Use `fastify.inject()` — never supertest
    - Mock Firebase auth via `createMockFirebaseAuth(TEST_UID)` pattern (see completion plugin tests)
    - Use real PostgreSQL — insert test data in `beforeEach`, cleanup via `db.deleteFrom()` in `afterEach` in reverse insertion order (follow completion plugin `index.test.ts` pattern — NOT Kysely test transactions)
    - Build app via helper function: `buildApp()` that registers auth plugin + progress plugin with mock contentLoader

- [x] Task 2: Create `useOverviewData` frontend hook (AC: #1, #2)
  - [x] 2.1 Create `apps/webapp/src/hooks/use-overview-data.ts`:
    ```typescript
    import { useQuery } from '@tanstack/react-query'
    import { apiFetch } from '../lib/api-fetch'
    import type { OverviewData } from '@mycscompanion/shared'

    function useOverviewData() {
      return useQuery<OverviewData>({
        queryKey: ['progress', 'overview'],
        queryFn: () => apiFetch('/api/progress/overview'),
        staleTime: 5 * 60 * 1000,  // 5 minutes
      })
    }

    export { useOverviewData }
    ```
    - **IMPORTANT**: Do NOT use `as` casting (`response as OverviewData`). Use `useQuery<OverviewData>` generic parameter instead. Check how `useCompletionData` and `useWorkspaceData` handle typing — follow the same pattern.
  - [x] 2.2 Create `apps/webapp/src/hooks/use-overview-data.test.tsx`:
    - Test successful fetch returns OverviewData
    - Test loading state
    - Test error state
    - Use `createTestQueryClient()` + `TestProviders` from `@mycscompanion/config/test-utils/`

- [x] Task 3: Create first-time overview component (AC: #1, #4, #5, #6)
  - [x] 3.1 Create `apps/webapp/src/components/overview/FirstTimeOverview.tsx`:
    - Accepts `milestone: OverviewMilestoneInfo`
    - Full-screen centered layout (follow Completion.tsx pattern: `min-h-screen`, centered container, `max-w-2xl`)
    - Content (no temporal framing, workshop-appropriate):
      - Heading: project introduction text — "You're building a database from scratch."
      - Subtext: "By the end, you'll understand how PostgreSQL, Redis, and SQLite work — because you'll have built your own."
      - Milestone 1 hook card: milestone title + brief excerpt
      - Hook text: "Start with a key-value store. Write the Get and Put methods. Run the benchmark."
    - "Start Building" button:
      - Uses `primary` variant (green accent via shadcn Button)
      - Sole primary action on screen (one-primary rule)
      - Navigates to `/workspace/{milestone.id}`
    - Semantic HTML: `<main>`, `<h1>`, `<section>`, `<p>`
    - ARIA: `role="main"`, heading hierarchy
    - Keyboard: Button is focusable, Enter/Space activates
    - No stats, no progress, no session summary — clean slate
  - [x] 3.2 Create `apps/webapp/src/components/overview/FirstTimeOverview.test.tsx`:
    - Renders introduction text
    - Renders milestone title and brief excerpt
    - "Start Building" button navigates to correct workspace URL
    - No progress stats shown
    - No temporal framing language present
    - Button has green primary styling (check className or variant prop)
    - Semantic heading structure (h1 present)
    - Use `@testing-library/react` + `vi.fn()` for navigation mock

- [x] Task 4: Create milestone-start overview component (AC: #2, #3, #4, #5, #6)
  - [x] 4.1 Create `apps/webapp/src/components/overview/MilestoneStartOverview.tsx`:
    - Accepts `data: OverviewData` (where `variant === 'milestone-start'`)
    - Full-screen centered layout (same pattern as FirstTimeOverview)
    - Content — 4 data points + 1 action (UX-20):
      1. **Milestone header**: `Milestone {position}: {title}` + CS concept label + progress percentage
         - Progress: `{criteriaProgress.met} of {criteriaProgress.total} criteria met` → percentage
         - CS concept label shown if non-null (e.g., "Systems Programming & I/O")
      2. **Benchmark card**: Placeholder card — heading "Benchmark" with muted em-dash `—` as value
         - Styled as `card` background with dashed border to indicate not-yet-available
         - No developer-facing text like "available after Epic 7" — users don't know what epics are
         - Will be replaced when Epic 7 populates `lastBenchmark` with real ops/sec + trend
      3. **Next criterion card**: Heading "Next Step", shows `criteriaProgress.nextCriterionName` if available
         - Or "All criteria met" if fully complete
         - Or "Submit code to see progress" if no submissions yet
      4. **Session summary card**: Placeholder card — heading "Context" with muted em-dash `—` as value
         - Styled as `card` background with dashed border (same as benchmark placeholder)
         - Will be replaced when Epic 5 populates `sessionSummary` with real session context text
      5. **"Continue Building" button**: Primary (green), navigates to `/workspace/{milestone.id}`
    - Workshop language: No "welcome back", no "last time", no dates
    - Semantic HTML: `<main>`, heading hierarchy, `<section>` for each data card
    - ARIA: live region not needed (static content), heading hierarchy, button labeling
    - Keyboard: All cards are informational (not interactive), button focusable
  - [x] 4.2 Create `apps/webapp/src/components/overview/MilestoneStartOverview.test.tsx`:
    - Renders milestone title, position, and CS concept label
    - Renders progress percentage from criteria counts
    - Shows next criterion name when available
    - Shows "Submit code to see progress" when no criteria results
    - Shows placeholder for benchmark data
    - Shows placeholder for session summary
    - "Continue Building" button navigates to workspace
    - No temporal framing language present
    - Button is sole primary action (green variant)
    - When sessionSummary is non-null (future), renders it instead of placeholder
    - Heading hierarchy is correct (h1, h2)

- [x] Task 5: Create Overview route component and wire routing (AC: #1, #2, #5)
  - [x] 5.1 Create `apps/webapp/src/routes/Overview.tsx`:
    ```typescript
    import { useOverviewData } from '../hooks/use-overview-data'
    import { FirstTimeOverview } from '../components/overview/FirstTimeOverview'
    import { MilestoneStartOverview } from '../components/overview/MilestoneStartOverview'

    function Overview() {
      const { data, isLoading, error, refetch } = useOverviewData()

      if (isLoading) return <OverviewSkeleton />
      if (error || !data) return <OverviewError onRetry={refetch} />

      if (data.variant === 'first-time') {
        return <FirstTimeOverview milestone={data.milestone} />
      }

      return <MilestoneStartOverview data={data} />
    }

    export default Overview
    ```
    - **NOTE**: Route components use `export default` for React.lazy compatibility (matches Workspace.tsx, Completion.tsx). This is the ONE exception to the named-exports-only rule.
  - [x] 5.2 Create `apps/webapp/src/components/overview/OverviewSkeleton.tsx`:
    - Purpose-built skeleton (no generic spinner per project rules)
    - Full-screen centered layout matching overview structure
    - Animated pulse placeholder blocks for: heading, subtext, milestone card, CTA button
    - Matches the general shape of both variants
  - [x] 5.3 Create `apps/webapp/src/components/overview/OverviewError.tsx`:
    - Error card with "Failed to load overview" message
    - Retry button (secondary variant, not primary)
    - Follow same error pattern as Workspace.tsx
  - [x] 5.4 Update `apps/webapp/src/App.tsx`:
    - Replace placeholder `/overview` route with lazy-loaded `Overview` component
    - Add `const Overview = React.lazy(() => import('./routes/Overview'))` — follows existing pattern (Workspace.tsx and Completion.tsx both use `export default` for React.lazy compatibility)
    - Wrap in `<Suspense fallback={<OverviewSkeleton />}>`
    - Remove the `OverviewPlaceholder` function (dead code after replacement)
    - Keep the route inside `<ProtectedRoute>` (auth required)
  - [x] 5.5 Create `apps/webapp/src/routes/Overview.test.tsx`:
    - Test first-time variant renders FirstTimeOverview
    - Test milestone-start variant renders MilestoneStartOverview
    - Test loading state shows skeleton
    - Test error state shows error card with retry
    - Mock `useOverviewData` hook
    - Use `createTestQueryClient()` + `TestProviders`

- [x] Task 6: Update default redirect and navigation flows (AC: #1, #2)
  - [x] 6.1 Verify `/` redirects to `/overview` in App.tsx (already exists, confirm it works)
  - [x] 6.2 Verify post-onboarding redirect goes to `/overview` (already in OnboardingGate logic)
  - [x] 6.3 Update `apps/webapp/src/routes/Completion.tsx`:
    - **Current behavior**: Already navigates to `/overview` for last milestone, navigates to `/workspace/{nextMilestoneId}` for mid-track milestones (with `replace: true`)
    - **Change**: For mid-track milestones, navigate to `/overview` instead of `/workspace/{nextMilestoneId}`
    - Update `handleContinue()`: always navigate to `/overview` (remove the conditional — both last-milestone and mid-track now go to `/overview`)
    - This ensures the user sees the milestone-start overview with zeroed stats and new milestone brief before entering workspace (UX-20)
    - The overview API will return the new milestone as the "first incomplete" milestone
  - [x] 6.4 Update `Completion.test.tsx` — verify `handleContinue` always navigates to `/overview`

## Dev Notes

### Existing Infrastructure (DO NOT recreate)

- **Progress plugin**: `apps/backend/src/plugins/progress/index.ts` exists as a stub (placeholder comments for Story 5.x routes). Already registered in `app.ts` at line 92 with `prefix: '/api/progress'` but WITHOUT `contentLoader`. You MUST update `app.ts` to pass `contentLoader` in the plugin options (same as completion plugin registration pattern).
- **`/overview` route placeholder**: Defined in `App.tsx` as `OverviewPlaceholder` component (simple centered div with "Overview (Story 4+)" text). Replace with lazy-loaded `Overview` component. Remove the `OverviewPlaceholder` function.
- **Card component**: Already exists at `packages/ui/src/components/ui/card.tsx` with `Card`, `CardHeader`, `CardTitle`, `CardDescription`, `CardContent`, `CardFooter` — import individually
- **`/` redirect to `/overview`**: Already configured in App.tsx routing
- **Post-onboarding redirect**: OnboardingGate already redirects completed users to `/overview`
- **Completion route**: `apps/webapp/src/routes/Completion.tsx` already has "Continue to Next Milestone" button navigating to workspace
- **`apiFetch`**: Located at `apps/webapp/src/lib/api-fetch.ts` — handles Firebase auth token attachment
- **`toCamelCase()`**: In `@mycscompanion/shared` — use for all DB→API response conversion
- **User profile**: `GET /api/account/profile` returns `onboardingCompletedAt`, `skillFloorPassed` etc.
- **Milestone content**: Curriculum plugin already serves `GET /api/curriculum/milestones/:id` with brief, criteria, etc.
- **Milestone content structure**: Each milestone directory (e.g., `content/milestones/01-kv-store/`) contains separate files: `brief.md`, `acceptance-criteria.yaml`, `benchmark-config.yaml`, `assets/` directory. There is NO single `milestone.yaml` file. The content loader reads each file individually.
- **`user_milestones` table**: Created in migration 005, tracks milestone completions per user
- **`submissions` table**: Tracks all code submissions with criteria results
- **Tracks & milestones tables**: Track ordering via `position` field, unique `(track_id, position)` index. Note: `milestones` table has a nullable `description` column (migration 001) — this is NOT the same as `csConceptLabel`. Do not confuse them.
- **Shadcn Button component**: Already in `@mycscompanion/ui` — import individually (no barrel)
- **Design tokens**: Primary green accent already configured in Tailwind theme via `packages/config`

### Architecture Compliance

- **No new Zustand stores**: Overview data is server state → TanStack Query via `useOverviewData()` hook. UI has no local state beyond what React provides.
- **No new packages**: All code in existing apps and packages
- **Plugin isolation**: Progress plugin imports only from `packages/shared` and `packages/*` — never from curriculum or other plugins. Gets `contentLoader` injected via plugin options (same DI pattern as completion plugin). The `ContentLoader` interface/type is defined in the curriculum plugin but passed through `app.ts` — the progress plugin only depends on the interface shape, not the implementation.
- **Component organization**: New components in `apps/webapp/src/components/overview/` (feature-grouped, matching existing `workspace/` and `common/` patterns)
- **Named exports only** — except route components used with `React.lazy()` which MUST use `export default` (matches Workspace.tsx, Completion.tsx pattern)
- **Import shadcn components individually** from `@mycscompanion/ui` (no barrel import)
- **Route responses**: Direct object for success (no `{ data: result }` wrapper)
- **Cursor pagination**: NOT needed — this is a single-resource endpoint, not a list

### UX-20: Contextual Overview Specification

The overview is a **full-screen motivational primer** — NOT a header or sidebar in the workspace.

**First-Time Variant (post-onboarding, no progress):**
- Project introduction: "You're building a database from scratch. By the end, you'll understand how PostgreSQL, Redis, and SQLite work — because you'll have built your own."
- Milestone 1 hook: "Start with a key-value store. Write the Get and Put methods. Run the benchmark."
- "Start Building" CTA (green primary button)
- Nothing else — no stats, no progress, no benchmarks

**Milestone-Start / Returning Variant:**
- 4 data points + 1 action — nothing more:
  1. Current milestone + CS concept label + progress %
  2. Last benchmark + trend (placeholder until Epic 7)
  3. Next acceptance criterion to tackle
  4. Session summary (placeholder until Epic 5)
  5. "Continue Building" button (green primary)

**Placeholder Strategy:**
- Benchmark and session summary cards render with dashed border + muted placeholder text
- When Epic 5/7 populate `sessionSummary`/`lastBenchmark` fields, the component renders real data instead
- Check: `if (data.sessionSummary) { renderSummary() } else { renderPlaceholder() }`
- This means Epic 5/7 only need to: (a) populate the backend response fields, (b) possibly tweak card styling. No structural component changes needed.

### UX-3: Zero Temporal Framing

**NEVER use any of these patterns:**
- "Welcome back"
- "Last time you..."
- "47 days ago"
- "In your last session"
- Any dates or relative timestamps
- "It's been a while"

**DO use:**
- Present-tense, content-focused language
- "Working on Milestone 3: B-Tree Indexing"
- "3 of 5 criteria met"
- Direct imperatives: "Start with a key-value store"

### UX-9: One-Primary Rule

Every screen has exactly ONE primary (green) button:
- First-time overview: "Start Building"
- Milestone-start overview: "Continue Building"

If any other button appears on the overview, it MUST be secondary (outline) or tertiary (ghost). No second green button.

### Variant Detection Logic

The backend determines the variant, NOT the frontend:
- `variant: 'first-time'` → User has zero completed milestones AND zero submissions (truly new)
- `variant: 'milestone-start'` → User has at least one submission or completion (has interacted with the platform)

This avoids the frontend needing to make multiple queries to determine state. The backend has direct DB access to check efficiently.

### Full-Screen Layout Pattern

Follow the `Completion.tsx` pattern exactly:
```tsx
<main className="flex min-h-screen items-center justify-center bg-background p-4">
  <div className="w-full max-w-2xl space-y-8">
    {/* Content sections */}
  </div>
</main>
```

Cards use shadcn Card component (import individually from `@mycscompanion/ui`):
```tsx
import { Card, CardContent, CardHeader, CardTitle } from '@mycscompanion/ui/card'
```

### Navigation Flow After Implementation

```
Login → ProtectedRoute → OnboardingGate check
  ├─ Not onboarded → /onboarding
  ├─ Assessment failed → /not-ready
  └─ Onboarded → /overview
       ├─ First-time user → FirstTimeOverview → "Start Building" → /workspace/:milestoneId
       └─ Returning user → MilestoneStartOverview → "Continue Building" → /workspace/:milestoneId

Milestone completion flow:
  /workspace/:id → complete → /completion/:id → "Continue" → /overview → MilestoneStartOverview → /workspace/:nextId
```

### Project Structure Notes

```
# Shared packages (modified)
packages/shared/src/types/api.ts                              # Add OverviewData types
packages/shared/src/types/api.test.ts                          # Compile-time verification
packages/shared/src/types/curriculum.ts                        # Add csConceptLabel to MilestoneContent

# Backend (new)
apps/backend/src/plugins/progress/routes/overview.ts           # GET /api/progress/overview
apps/backend/src/plugins/progress/routes/overview.test.ts      # Route tests

# Backend (modified)
apps/backend/src/app.ts                                        # Pass contentLoader to progressPlugin options
apps/backend/src/plugins/progress/index.ts                     # Add plugin options type, register overview route
apps/backend/src/plugins/curriculum/content-loader.ts          # Add readMetadata() for csConceptLabel
apps/backend/src/plugins/curriculum/content-loader.test.ts     # Add readMetadata tests

# Content (new)
content/milestones/01-kv-store/metadata.yaml                   # CS concept label metadata
content/schema/milestone-metadata.schema.json                  # Schema for metadata.yaml

# Frontend (new)
apps/webapp/src/routes/Overview.tsx                             # Overview route component
apps/webapp/src/routes/Overview.test.tsx                        # Route tests
apps/webapp/src/hooks/use-overview-data.ts                      # Data fetching hook
apps/webapp/src/hooks/use-overview-data.test.tsx                # Hook tests
apps/webapp/src/components/overview/FirstTimeOverview.tsx        # First-time variant
apps/webapp/src/components/overview/FirstTimeOverview.test.tsx   # Component tests
apps/webapp/src/components/overview/MilestoneStartOverview.tsx   # Milestone-start variant
apps/webapp/src/components/overview/MilestoneStartOverview.test.tsx
apps/webapp/src/components/overview/OverviewSkeleton.tsx         # Loading skeleton
apps/webapp/src/components/overview/OverviewError.tsx            # Error state

# Frontend (modified)
apps/webapp/src/App.tsx                                         # Wire lazy-loaded Overview route
apps/webapp/src/routes/Completion.tsx                            # Navigate to /overview after completion
apps/webapp/src/routes/Completion.test.tsx                       # Update navigation test
```

### Testing Requirements

- **Backend route tests** (`overview.test.ts`): Real PostgreSQL, manual row cleanup in `afterEach` (follow completion plugin `index.test.ts` pattern), `fastify.inject()`, mock Firebase auth via `createMockFirebaseAuth()`. Test both variants, progress stats, placeholder fields, 401. Build app via `buildApp()` helper that registers auth + progress plugin with mock contentLoader.
- **Frontend hook tests** (`use-overview-data.test.tsx`): Mock `apiFetch`, test loading/success/error states. Use `createTestQueryClient()` + `TestProviders`.
- **Component tests** (FirstTimeOverview, MilestoneStartOverview): `@testing-library/react`, test rendered content, navigation on CTA click, no temporal framing language, heading hierarchy, placeholder rendering.
- **Route tests** (`Overview.test.tsx`): Mock `useOverviewData`, test variant routing, loading skeleton, error state.
- **Test syntax**: `describe()` + `it()`, never `test()`. `vi.restoreAllMocks()` in `afterEach`.
- **No snapshot tests** — explicit behavioral assertions only
- **No `any`** — use proper types throughout
- **Import from `@mycscompanion/config/test-utils/`** for shared test utilities

### Anti-Patterns to Avoid

- Do NOT create a new Zustand store for overview state — it's server state, use TanStack Query
- Do NOT use temporal framing language anywhere ("welcome back", "last time", dates)
- Do NOT add a second primary (green) button on any overview screen
- Do NOT use `as` casting — use `satisfies` or type narrowing
- Do NOT use default exports — named exports only (exception: `Overview.tsx` route component needs `export default` for React.lazy)
- Do NOT use `@/` import aliases — relative paths within apps
- Do NOT use barrel imports from `@mycscompanion/ui` — import components individually
- Do NOT fetch user profile separately in frontend to determine variant — backend determines variant
- Do NOT show empty placeholder cards as errors — use muted styling with dashed borders to indicate "coming soon"
- Do NOT use generic spinners for loading — create purpose-built OverviewSkeleton
- Do NOT inline the overview inside the workspace — it's a separate full-screen route
- Do NOT use `console.log` — backend uses pino via Fastify logger
- Do NOT create a dashboard with multiple navigation options — the overview has ONE action only

### Previous Story (4.5) Learnings

- Code review found that `ConceptExplainerAsset` type needed `title` field added cleanly — when adding `csConceptLabel` to `MilestoneContent`, follow the same pattern: add field, update content loader, update compile-time tests
- Manifest/YAML parsing in content loader works well — extend same approach for `csConceptLabel` from milestone YAML
- Tab refactoring in TerminalPanel from hardcoded to dynamic was a success — overview components should also use data-driven rendering (e.g., map over data point cards)
- `vi.restoreAllMocks()` in `afterEach` was missing in some Story 4.4 test files — always include it
- Story 4.5 pattern of updating shared types → backend content loader → frontend hooks → frontend components works well. This story follows the same layered approach.
- Error logging was added to content loader read operations after code review — new content loader changes should include error logging too
- Content loader tests (`content-loader.test.ts`) mock `readFile` and `readdir` from `fs/promises` — follow the same mock pattern for `readMetadata()` tests (mock `readFile` for `metadata.yaml`)

### Git Intelligence (Recent Commits)

Recent commits follow pattern: "Implement Story X.Y: Title with code review fixes"

Story 4.5 (latest) touched:
- Shared types (curriculum.ts) — adding fields
- Backend content loader — reading new YAML fields
- Frontend hooks — exposing new data
- Frontend components — new UI components
- Frontend route — wiring data through component tree

This story follows the exact same pattern but adds a new route instead of modifying the workspace route.

Key patterns established:
- Full-screen views follow Completion.tsx structure (min-h-screen, centered, max-w-2xl)
- Data hooks use TanStack Query with 5min staleTime
- Components use shadcn/ui primitives imported individually
- Tests co-located next to source files
- Named exports throughout

### Dependencies on Previous Work

- User authentication and profile (Epic 2) - done
- `user_milestones` table for tracking completions (Story 4.4) - done
- Curriculum API serving milestone content (Story 4.1) - done
- Milestone completion flow (Story 4.4) - done
- Submissions and criteria evaluation (Stories 3.3, 3.4, 4.3) - done
- Progress plugin stub (Story 1.4) - done
- Design tokens with primary green accent (Story 1.1) - done
- ProtectedRoute and OnboardingGate (Epic 2) - done

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story-4.6]
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#UX-20-Contextual-Overview]
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#UX-3-Zero-Temporal-Framing]
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#UX-9-Dark-First-Design]
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#Button-Hierarchy]
- [Source: _bmad-output/planning-artifacts/prd.md#FR35-Single-Action-Resume]
- [Source: _bmad-output/planning-artifacts/prd.md#NFR-A1-Keyboard-Navigation]
- [Source: _bmad-output/planning-artifacts/architecture.md#Routing]
- [Source: _bmad-output/implementation-artifacts/4-5-visual-concept-explainers.md]
- [Source: _bmad-output/implementation-artifacts/4-4-milestone-completion-and-advancement.md]
- [Source: _bmad-output/project-context.md]
- [Source: apps/webapp/src/App.tsx]
- [Source: apps/webapp/src/routes/Completion.tsx]
- [Source: apps/webapp/src/hooks/use-completion-data.ts]
- [Source: apps/backend/src/plugins/progress/index.ts]
- [Source: apps/backend/migrations/005_add_user_milestones.ts]
- [Source: packages/shared/src/types/api.ts]
- [Source: packages/shared/src/types/curriculum.ts]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6

### Debug Log References

None

### Completion Notes List

- Task 1: Added OverviewData, OverviewMilestoneInfo, OverviewCriteriaProgress, OverviewVariant types to shared/types/api.ts. Created GET /api/progress/overview endpoint with variant detection (first-time vs milestone-start). Added csConceptLabel to MilestoneContent and content loader with readMetadata(). Created metadata.yaml for 01-kv-store milestone. Added milestone-metadata.schema.json. Wired progress plugin with contentLoader DI. 8 backend route tests, 4 content-loader metadata tests, 6 compile-time type tests.
- Task 2: Created useOverviewData hook using TanStack Query with 5min staleTime. 5 hook tests.
- Task 3: Created FirstTimeOverview component with full-screen centered layout, project introduction, milestone hook card, "Start Building" green CTA. 9 component tests.
- Task 4: Created MilestoneStartOverview component with milestone header, CS concept label, criteria progress %, benchmark placeholder, next criterion card, session summary placeholder, "Continue Building" green CTA. 12 component tests.
- Task 5: Created Overview route component with variant routing, OverviewSkeleton, OverviewError. Replaced OverviewPlaceholder in App.tsx with lazy-loaded Overview. 4 route tests.
- Task 6: Verified existing redirects work. Updated Completion.tsx handleContinue to always navigate to /overview. Updated Completion test.

### Change Log

- 2026-03-06: Implemented Story 4.6 - Contextual Overview (all 6 tasks, 53 new tests)
- 2026-03-06: Code review fixes applied (H1: division-by-zero guard, M1: apiFetch generic, M2: shared contentLoader, M3: remove __none__ sentinel, M4: restore replace:true, M5: remove brittle data-variant tests, L1: skeleton grid layout, L2: acknowledged no toCamelCase needed)

### File List

New:
- apps/backend/src/plugins/progress/routes/overview.ts
- apps/backend/src/plugins/progress/routes/overview.test.ts
- apps/webapp/src/hooks/use-overview-data.ts
- apps/webapp/src/hooks/use-overview-data.test.tsx
- apps/webapp/src/components/overview/FirstTimeOverview.tsx
- apps/webapp/src/components/overview/FirstTimeOverview.test.tsx
- apps/webapp/src/components/overview/MilestoneStartOverview.tsx
- apps/webapp/src/components/overview/MilestoneStartOverview.test.tsx
- apps/webapp/src/components/overview/OverviewSkeleton.tsx
- apps/webapp/src/components/overview/OverviewError.tsx
- apps/webapp/src/routes/Overview.tsx
- apps/webapp/src/routes/Overview.test.tsx
- content/milestones/01-kv-store/metadata.yaml
- content/schema/milestone-metadata.schema.json

Modified:
- packages/shared/src/types/api.ts (added OverviewData types)
- packages/shared/src/types/api.test.ts (added compile-time verification tests)
- packages/shared/src/types/curriculum.ts (added csConceptLabel to MilestoneContent)
- packages/shared/src/types/curriculum.test.ts (added csConceptLabel to test objects)
- apps/backend/src/app.ts (pass contentLoader to progressPlugin)
- apps/backend/src/plugins/progress/index.ts (added ProgressPluginOptions, register overview route)
- apps/backend/src/plugins/curriculum/content-loader.ts (added readMetadata, loadMetadata, MilestoneMetadata)
- apps/backend/src/plugins/curriculum/content-loader.test.ts (added loadMetadata tests, updated cached data fixture)
- apps/backend/src/plugins/curriculum/routes/milestones.ts (added csConceptLabel to response)
- apps/webapp/src/App.tsx (replaced OverviewPlaceholder with lazy-loaded Overview)
- apps/webapp/src/routes/Completion.tsx (handleContinue always navigates to /overview)
- apps/webapp/src/routes/Completion.test.tsx (updated navigation assertion)
- apps/webapp/src/hooks/use-workspace-data.test.tsx (added csConceptLabel to mock)
- _bmad-output/implementation-artifacts/sprint-status.yaml (status updated)
