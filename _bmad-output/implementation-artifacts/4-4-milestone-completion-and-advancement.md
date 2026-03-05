# Story 4.4: Milestone Completion & Advancement

Status: done

## Story

As a learner,
I want to complete a milestone when all criteria are met and advance to the next one,
so that I progress through building my database step by step.

## Acceptance Criteria

1. When the system detects that all acceptance criteria are MET in a submission's `criteria_results`, the learner can trigger milestone completion (FR8)
2. Milestone completion displays as a full-screen route (`/completion/:milestoneId`), not a dialog or modal (UX-21)
3. The completion view shows: a criteria summary (all MET), engineering-grade language, and a next milestone preview with title and brief excerpt (UX-21)
4. No celebration animations, badges, streaks, or XP anywhere in the completion flow — workshop atmosphere only (UX-5)
5. A trajectory chart placeholder area is present but shows "Benchmark data available after Epic 7" — not populated until Epic 7 (UX-21)
6. The emotional pattern follows the Strava model — satisfaction through accomplishment, not artificial reward (UX-21)
7. Route transition to the next milestone workspace completes in <200ms (NFR-P8)
8. `prefers-reduced-motion` is respected — trajectory chart placeholder glow/animations removed when active (UX-25)
9. Milestone completion status is persisted in a new `user_milestones` database table
10. A `GET /api/completion/:milestoneId` endpoint returns completion data, criteria summary, and next milestone info
11. A `POST /api/completion/:milestoneId/complete` endpoint persists the completion and returns the next milestone ID
12. The workspace detects "all criteria MET" and shows a "Complete Milestone" button in the criteria panel — green accent, sole primary action (UX-9)

## Tasks / Subtasks

- [x] Task 1: Create `user_milestones` migration and regenerate types (AC: #9)
  - [x]1.1 Create `apps/backend/migrations/005_add_user_milestones.ts`
    ```sql
    user_milestones:
      id: text PK (cuid2)
      user_id: text NOT NULL FK -> users.id ON DELETE CASCADE
      milestone_id: text NOT NULL FK -> milestones.id ON DELETE CASCADE
      completed_at: timestamptz NOT NULL DEFAULT now()
      completing_submission_id: text FK -> submissions.id (the submission that achieved all-MET)
      created_at: timestamptz NOT NULL DEFAULT now()
    ```
  - [x]1.2 Add unique constraint: `idx_user_milestones_user_id_milestone_id` on `(user_id, milestone_id)` — a user completes a milestone exactly once
  - [x]1.3 Add index: `idx_user_milestones_user_id` for efficient lookups
  - [x]1.4 Run `pnpm --filter shared db:types` to regenerate Kysely types

- [x] Task 2: Add completion types to shared package (AC: #10, #11)
  - [x]2.1 Add types to `packages/shared/src/types/api.ts` (or create if needed):
    ```typescript
    interface MilestoneCompletionData {
      readonly milestoneId: string
      readonly milestoneName: string
      readonly milestoneNumber: number
      readonly completedAt: string // ISO 8601
      readonly criteriaResults: ReadonlyArray<CriterionResult>
      readonly nextMilestone: NextMilestonePreview | null
    }

    interface NextMilestonePreview {
      readonly id: string
      readonly title: string
      readonly position: number
      readonly briefExcerpt: string // First ~200 chars of next milestone brief
    }

    interface CompleteMilestoneResponse {
      readonly nextMilestoneId: string | null // null if last milestone in track
    }
    ```
  - [x]2.2 Export from `packages/shared/src/types/index.ts`
  - [x]2.3 Add compile-time verification tests

- [x] Task 3: Implement completion plugin with routes (AC: #10, #11, #9)
  - [x]3.1 Create `apps/backend/src/plugins/completion/index.ts` — new Fastify plugin
  - [x]3.2 Create `apps/backend/src/plugins/completion/routes/completion.ts`
  - [x]3.3 `GET /api/completion/:milestoneId` route:
    - Requires auth (uid from request decorator)
    - Query `user_milestones` for this user+milestone — 404 if not completed
    - Query milestone details (title, position) from `milestones` table
    - Query the completing submission's `criteria_results` from `submissions` table
    - Query next milestone: `SELECT id, title, position FROM milestones WHERE track_id = :trackId AND position = :currentPosition + 1`
    - Load next milestone brief excerpt via ContentLoader: `contentLoader.loadMilestoneBrief(nextMilestone.slug)` — truncate to ~200 chars
    - Return `MilestoneCompletionData` (apply `toCamelCase()` on DB results)
  - [x]3.4 `POST /api/completion/:milestoneId/complete` route:
    - Requires auth (uid from request decorator)
    - JSON Schema validation: `{ submissionId: string }`
    - Verify submission exists, belongs to user, and has status `'completed'`
    - Parse `criteria_results` JSONB from submission — verify ALL criteria have `status === 'met'`
    - If any criterion is `not-met`, return 409 with `{ error: { code: 'CRITERIA_NOT_MET', message: 'Not all criteria are met' } }`
    - If already completed (unique constraint violation), return existing completion data (idempotent)
    - Insert into `user_milestones`: `{ id: createId(), user_id: uid, milestone_id: milestoneId, completing_submission_id: submissionId }`
    - Query next milestone (same as GET)
    - Return `{ nextMilestoneId: nextMilestone?.id ?? null }`
    - Log at info level: `milestone completed` with `{ userId: uid, milestoneId, submissionId }`
  - [x]3.5 Register plugin in `apps/backend/src/app.ts`:
    ```typescript
    import { completionPlugin } from './plugins/completion/index.js'
    // After curriculumPlugin, before progressPlugin
    await fastify.register(completionPlugin, { prefix: '/api/completion', redis })
    ```
  - [x]3.6 Create `apps/backend/src/plugins/completion/index.test.ts` with route tests using `fastify.inject()`:
    - GET returns completion data with criteria summary and next milestone
    - GET returns 404 when milestone not completed
    - POST completes milestone and returns next milestone ID
    - POST returns 409 when criteria not all met
    - POST is idempotent (second call returns success)
    - POST returns `nextMilestoneId: null` for last milestone in track
    - All responses use camelCase

- [x] Task 4: Add completion route and lazy-loaded component (AC: #2, #7)
  - [x]4.1 Create `apps/webapp/src/routes/Completion.tsx` — full-screen completion view
  - [x]4.2 Add lazy route to `App.tsx`:
    ```typescript
    const Completion = React.lazy(() => import('./routes/Completion'))
    // Inside protected routes:
    <Route
      path="/completion/:milestoneId"
      element={
        <Suspense fallback={<CompletionSkeleton />}>
          <Completion />
        </Suspense>
      }
    />
    ```
  - [x]4.3 Create `apps/webapp/src/components/completion/CompletionSkeleton.tsx` — purpose-built skeleton (no generic spinners)

- [x] Task 5: Implement completion data hook (AC: #10)
  - [x]5.1 Create `apps/webapp/src/hooks/use-completion-data.ts`:
    ```typescript
    function useCompletionData(milestoneId: string | undefined) {
      return useQuery({
        queryKey: ['completion', 'get', milestoneId],
        queryFn: () => apiFetch<MilestoneCompletionData>(`/api/completion/${milestoneId}`),
        staleTime: 5 * 60 * 1000,
        enabled: !!milestoneId,
      })
    }
    ```
  - [x]5.2 Create `apps/webapp/src/hooks/use-complete-milestone.ts`:
    ```typescript
    function useCompleteMilestone() {
      const navigate = useNavigate()
      return useMutation({
        mutationKey: ['completion', 'complete'],
        mutationFn: ({ milestoneId, submissionId }: CompleteMilestoneParams) =>
          apiFetch<CompleteMilestoneResponse>(`/api/completion/${milestoneId}/complete`, {
            method: 'POST',
            body: JSON.stringify({ submissionId }),
          }),
        onSuccess: (data) => {
          if (data.nextMilestoneId) {
            navigate(`/workspace/${data.nextMilestoneId}`, { replace: true })
          }
          // If null (last milestone), stay on completion page — congratulatory final state
        },
      })
    }
    ```
  - [x]5.3 Add tests for both hooks

- [x] Task 6: Build Completion page UI (AC: #2, #3, #4, #5, #6, #8)
  - [x]6.1 Implement `Completion.tsx` full-screen view:
    - Dark background (`bg-background`), centered content, max-width constraint
    - **Header**: "Milestone {number}: {name} — Complete" in engineering-grade language
    - **Criteria Summary**: Compact list showing all criteria as MET (green checks) — reuse `CriterionResult` display pattern from TerminalPanel but simplified (no expected/actual)
    - **Trajectory Chart Placeholder**: A bordered area with `text-muted-foreground` text: "Performance trajectory — available after benchmark integration" (Epic 7)
    - **Next Milestone Preview**: Card showing next milestone title, position, and brief excerpt (first ~200 chars). If last milestone, show "Track Complete" message instead.
    - **"Continue to Next Milestone" button**: Green accent (`bg-primary`), sole primary action on screen. Calls `useCompleteMilestone` mutation which navigates to `/workspace/{nextMilestoneId}` on success.
    - If last milestone in track: button text is "Return to Overview", navigates to `/overview`
  - [x]6.2 NO celebration animations, badges, streaks, XP, confetti, or gamification. Tone: professional satisfaction, like completing a section of a workshop.
  - [x]6.3 Wrap trajectory placeholder in `prefers-reduced-motion` media query — remove any subtle glow or animation when active:
    ```css
    @media (prefers-reduced-motion: reduce) {
      .trajectory-placeholder { animation: none; }
    }
    ```
  - [x]6.4 Keyboard accessible: all interactive elements focusable, Enter activates buttons
  - [x]6.5 Screen reader: announce "Milestone {number} complete. All criteria met." via `aria-live`
  - [x]6.6 Create `apps/webapp/src/routes/Completion.test.tsx`:
    - Test completion data renders correctly (criteria summary, next milestone preview)
    - Test "Continue" button calls complete mutation
    - Test last milestone shows "Track Complete" and "Return to Overview"
    - Test no red colors, no celebration elements
    - Test trajectory placeholder present with placeholder text
    - Test loading state shows skeleton
    - Test error state shows retry

- [x] Task 7: Add "Complete Milestone" trigger in workspace (AC: #12)
  - [x]7.1 Update `use-submit-code.ts`: expose `allCriteriaMet` derived boolean:
    ```typescript
    const allCriteriaMet = criteriaResults !== null
      && criteriaResults.length > 0
      && criteriaResults.every((r) => r.status === 'met')
    ```
  - [x]7.2 Update `TerminalPanel.tsx` — add "Complete Milestone" button at bottom of CriteriaContent when `allCriteriaMet` is true:
    - Green accent button (`variant="default"` which uses `bg-primary`)
    - Text: "Complete Milestone"
    - Sole primary-colored action in the criteria panel
    - `aria-label="Complete milestone and advance to next"` for screen reader
  - [x]7.3 Wire button through `WorkspaceLayout` -> `Workspace`: on click, call `POST /api/completion/:milestoneId/complete` then navigate to `/completion/:milestoneId`
  - [x]7.4 Update `UseSubmitCodeResult` to include `allCriteriaMet: boolean`
  - [x]7.5 Wire completion flow in `Workspace.tsx`:
    ```typescript
    const completeMutation = useMutation({
      mutationKey: ['completion', 'complete'],
      mutationFn: ({ milestoneId, submissionId }: { milestoneId: string; submissionId: string }) =>
        apiFetch<CompleteMilestoneResponse>(`/api/completion/${milestoneId}/complete`, {
          method: 'POST',
          body: JSON.stringify({ submissionId }),
        }),
      onSuccess: () => {
        navigate(`/completion/${milestoneId}`)
      },
    })

    const handleCompleteMilestone = useCallback(() => {
      if (!milestoneId || !submissionId) return
      completeMutation.mutate({ milestoneId, submissionId })
    }, [milestoneId, submissionId, completeMutation])
    ```
  - [x]7.6 Update tests: `use-submit-code.test.tsx` for `allCriteriaMet`, `TerminalPanel.test.tsx` for button visibility, `Workspace.test.tsx` for completion flow

- [x] Task 8: Update progress display in workspace (AC: #9)
  - [x]8.1 Update `use-workspace-data.ts` — compute progress from submission history:
    - Query latest submission for this user+milestone: `GET /api/curriculum/milestones/:id` already returns criteria count
    - Progress = `(metCriteriaCount / totalCriteriaCount) * 100` computed from latest `criteriaResults`
    - For MVP, derive progress client-side from `criteriaResults` in `Workspace.tsx` (avoid new API endpoint)
  - [x]8.2 Update `Workspace.tsx`: compute progress from `criteriaResults` and pass to `WorkspaceLayout`:
    ```typescript
    const criteria = data?.criteria ?? []
    const progress = criteriaResults && criteria.length > 0
      ? Math.round((criteriaResults.filter((r) => r.status === 'met').length / criteria.length) * 100)
      : 0
    ```
  - [x]8.3 Update `WorkspaceTopBar` to show computed progress (already displays `{progress}%`)
  - [x]8.4 Update `Workspace.test.tsx` — test progress computation from criteria results

## Dev Notes

### Existing Infrastructure (DO NOT recreate)

- **Submissions with criteria_results** (Story 4.3): `submissions.criteria_results` JSONB column stores `CriterionResult[]` after every execution. The evaluator runs automatically in the execution processor.
- **CriterionResult type** exists in `packages/shared/src/types/curriculum.ts`: `{ name, order, status: 'met' | 'not-met', expected, actual, errorHint }`
- **Criteria display exists** in `TerminalPanel.tsx` (Story 4.3): Shows MET (green check) / NOT MET (gray dash) with expected/actual values
- **ContentLoader** (Story 4.1): `apps/backend/src/plugins/curriculum/content-loader.ts` — `loadMilestoneBrief(slug)` returns `string | null`, cached in Redis
- **SSE criteria_results event** (Story 4.3): Already auto-switches to criteria tab and stores results in TanStack Query cache `['execution', 'criteria', submissionId]`
- **milestones table** (Migration 001): Has `id`, `track_id`, `title`, `slug`, `position` with unique index on `(track_id, position)` — position ordering is the advancement path
- **tracks table** (Migration 001): Has `id`, `name`, `slug`, `description`
- **React Router** setup in `App.tsx`: Uses `React.lazy()` for code splitting, `ProtectedRoute` wrapper, `Suspense` with purpose-built skeletons
- **`useNavigate`** from `react-router` already used in other routes (SignIn, SignUp, Onboarding)
- **Progress plugin** exists as empty placeholder at `/api/progress` — do NOT use this for completion; completion is its own plugin at `/api/completion` per architecture
- **`toCamelCase()`** from `@mycscompanion/shared` — MUST use on all DB query results before API response

### Architecture Compliance

- **Route**: `/completion/:milestoneId` — defined in architecture as a dedicated route (NOT a dialog or overlay on workspace)
- **API**: `GET /api/completion/:milestoneId` — architecture defines this as a "single-fetch screen endpoint" returning all data for the completion screen
- **Plugin isolation**: Completion plugin can import from `shared/` and `packages/*` only — NOT from other plugins. It queries DB directly for milestone and submission data.
- **No new Zustand store**: Progress/completion state is server data → TanStack Query only. The existing 2 stores (`useWorkspaceUIStore`, `useEditorStore`) remain unchanged.
- **No new packages**: All code goes in existing apps and packages.

### Completion Detection Logic

Completion detection is FRONTEND-DRIVEN, not server-side:
1. `use-submit-code.ts` already receives `criteria_results` via SSE and stores in TanStack Query cache
2. Derive `allCriteriaMet` boolean from cached criteria results
3. When `allCriteriaMet === true`, show "Complete Milestone" button in criteria panel
4. User explicitly clicks to complete — the POST endpoint validates server-side before persisting

The POST endpoint does server-side validation (re-checks `criteria_results` JSONB from the submission record) to prevent cheating or stale state. The frontend detection is for UX only.

### Database Design Decision

`user_milestones` is a separate table (not a column on `submissions`) because:
- A milestone is completed once per user, but may have many submissions
- Tracks which specific submission achieved completion (`completing_submission_id`)
- Clean query path for progress tracking (Epic 5) and analytics (Epic 10)
- Unique constraint on `(user_id, milestone_id)` enforces one-time completion

### "Next Milestone" Query

```typescript
const nextMilestone = await db
  .selectFrom('milestones')
  .select(['id', 'title', 'slug', 'position'])
  .where('track_id', '=', currentMilestone.trackId)
  .where('position', '=', currentMilestone.position + 1)
  .executeTakeFirst()
```

If `null`, this is the last milestone in the track — show "Track Complete" state.

### UX Tone Guide (UX-5, UX-21)

DO use:
- "Milestone 1: Key-Value Store — Complete"
- "All acceptance criteria met."
- "Next: Storage Engine"
- "Continue to Next Milestone" / "Return to Overview"

DO NOT use:
- "Congratulations!" / "Great job!" / "Well done!"
- "You earned X points" / "Achievement unlocked"
- Confetti, fireworks, party emojis, celebration animations
- "Welcome back" or temporal framing
- Badges, streaks, XP counters, level-up indicators

The tone is a workshop facilitator acknowledging you finished a section — professional, matter-of-fact, forward-looking.

### Project Structure Notes

```
# Backend (new)
apps/backend/migrations/005_add_user_milestones.ts          # Migration
apps/backend/src/plugins/completion/index.ts                 # Plugin registration
apps/backend/src/plugins/completion/routes/completion.ts     # GET + POST routes
apps/backend/src/plugins/completion/index.test.ts            # Route tests

# Backend (modified)
apps/backend/src/app.ts                                       # Register completion plugin

# Shared packages (modified)
packages/shared/src/types/api.ts                              # Completion types (create if needed)
packages/shared/src/types/index.ts                            # Re-export completion types

# Frontend (new)
apps/webapp/src/routes/Completion.tsx                          # Full-screen completion view
apps/webapp/src/routes/Completion.test.tsx                     # Completion page tests
apps/webapp/src/components/completion/CompletionSkeleton.tsx   # Loading skeleton
apps/webapp/src/hooks/use-completion-data.ts                   # GET hook
apps/webapp/src/hooks/use-complete-milestone.ts                # POST mutation hook

# Frontend (modified)
apps/webapp/src/App.tsx                                        # Add /completion/:milestoneId route
apps/webapp/src/hooks/use-submit-code.ts                       # Add allCriteriaMet derived state
apps/webapp/src/hooks/use-submit-code.test.tsx                 # Test allCriteriaMet
apps/webapp/src/components/workspace/TerminalPanel.tsx         # "Complete Milestone" button
apps/webapp/src/components/workspace/TerminalPanel.test.tsx    # Test button visibility
apps/webapp/src/components/workspace/WorkspaceLayout.tsx       # Pass onCompleteMilestone prop
apps/webapp/src/components/workspace/WorkspaceLayout.test.tsx  # Update tests
apps/webapp/src/routes/Workspace.tsx                           # Wire completion flow + progress
apps/webapp/src/routes/Workspace.test.tsx                      # Test completion + progress
```

### Testing Requirements

- **Migration test**: Verify table creation, unique constraint, FK constraints via real PostgreSQL
- **Route tests** (`completion/index.test.ts`): Use `fastify.inject()` — mock ContentLoader for brief excerpts. Test all response shapes, error cases (404, 409), idempotency, camelCase responses.
- **Hook tests**: Mock `apiFetch` via msw v2 `http.get()` / `http.post()`. Test query caching, mutation success/error, navigation on success.
- **Component tests**: `@testing-library/react` — test rendering states, button interactions, no gamification elements, accessibility (`aria-live`, keyboard navigation), `prefers-reduced-motion` media query.
- **Test syntax**: `describe()` + `it()`, never `test()`. `vi.restoreAllMocks()` in `afterEach`.
- **Import test utilities from `@mycscompanion/config/test-utils/`**: `createTestQueryClient()`, `TestProviders`.
- **No snapshot tests** — explicit behavioral assertions only.

### Anti-Patterns to Avoid

- Do NOT use a dialog/modal for completion — it's a full-screen ROUTE (`/completion/:milestoneId`)
- Do NOT add celebration animations, confetti, or gamification — workshop atmosphere (UX-5)
- Do NOT use red (`text-destructive`) in completion view — green checks and neutral tones only
- Do NOT store completion state in Zustand — server data belongs in TanStack Query
- Do NOT create a new Zustand store
- Do NOT import from other Fastify plugins in the completion plugin (plugin isolation)
- Do NOT auto-complete milestone without user action — user must explicitly click "Complete Milestone"
- Do NOT use "Congratulations" or patronizing language (UX-5)
- Do NOT use `any` type — typed responses with shared types
- Do NOT use default exports (except Completion.tsx for React.lazy)
- Do NOT use `jest.fn()` — use `vi.fn()`
- Do NOT forget `toCamelCase()` on DB results in API responses
- Do NOT use offset pagination if listing completions — cursor-based (though not needed for this story)
- Do NOT add a new `packages/*` directory

### Previous Story (4.3) Learnings

- `??` vs `||` matters for empty string fallbacks — apply same care to brief excerpt truncation
- Integration test isolation requires `vi.restoreAllMocks()` + fresh instances in `beforeEach`
- CriterionResult display patterns established in TerminalPanel — reuse for completion criteria summary
- Code review found duplicated evaluation helper — extract shared code early if patterns repeat
- SSE event handling and TanStack Query cache patterns well-established — follow same patterns for completion mutation
- `ContentLoader.loadMilestoneBrief()` returns `string | null` — handle null case in next milestone preview

### Git Intelligence (Recent Commits)

Recent commits follow pattern: "Implement Story X.Y: Title with code review fixes"

Story 4.3 modified 18 files across shared types, execution events, backend processor, frontend hooks, and components. This story touches a similar spread — new plugin + new route + workspace modifications.

Key patterns from 4.3:
- New types added to `packages/shared/src/types/curriculum.ts` with compile-time tests
- SSE events defined in `packages/execution/src/events.ts` as discriminated union
- Frontend state stored in TanStack Query cache, NOT Zustand
- Screen reader announcements batched via `announceToScreenReader()`
- Test files co-located next to source

### Dependencies on Previous Work

- Criteria evaluation and display (Story 4.3) - done
- Milestone content model and curriculum API (Story 4.1) - done
- Milestone brief loading (Story 4.2) - done
- Execution pipeline with SSE (Stories 3.2-3.4) - done
- Workspace layout with terminal panel (Stories 3.5, 3.7) - done
- Database with milestones and submissions tables (Migrations 001, 004) - done

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story-4.4]
- [Source: _bmad-output/planning-artifacts/prd.md#FR8]
- [Source: _bmad-output/planning-artifacts/architecture.md#Route-Organization]
- [Source: _bmad-output/planning-artifacts/architecture.md#API-Endpoints]
- [Source: _bmad-output/planning-artifacts/epics.md#UX-21-Milestone-Completion]
- [Source: _bmad-output/planning-artifacts/epics.md#UX-5-Workshop-Atmosphere]
- [Source: _bmad-output/planning-artifacts/epics.md#UX-25-Reduced-Motion]
- [Source: _bmad-output/planning-artifacts/epics.md#NFR-P8-Route-Transitions]
- [Source: _bmad-output/implementation-artifacts/4-3-acceptance-criteria-evaluation-and-display.md]
- [Source: _bmad-output/project-context.md]
- [Source: apps/backend/migrations/001_initial_schema.ts]
- [Source: apps/backend/migrations/004_add_submissions.ts]
- [Source: apps/backend/src/app.ts]
- [Source: apps/webapp/src/App.tsx]
- [Source: apps/webapp/src/routes/Workspace.tsx]
- [Source: apps/webapp/src/hooks/use-submit-code.ts]
- [Source: apps/webapp/src/hooks/use-workspace-data.ts]
- [Source: apps/webapp/src/stores/workspace-ui-store.ts]
- [Source: apps/webapp/src/components/workspace/TerminalPanel.tsx]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6

### Debug Log References

None required.

### Completion Notes List

- Task 1: Created migration 005_add_user_milestones with user_milestones table, unique constraint on (user_id, milestone_id), index on user_id. Regenerated Kysely types.
- Task 2: Added MilestoneCompletionData, NextMilestonePreview, CompleteMilestoneRequest, CompleteMilestoneResponse types to shared/types/api.ts with compile-time verification tests.
- Task 3: Implemented completion plugin with GET /api/completion/:milestoneId and POST /api/completion/:milestoneId/complete routes. GET returns completion data with criteria summary and next milestone preview. POST validates all criteria met, persists to user_milestones (idempotent), returns next milestone ID. 11 route tests via fastify.inject().
- Task 4: Added /completion/:milestoneId route with React.lazy, CompletionSkeleton, and Suspense boundary in App.tsx.
- Task 5: Created useCompletionData (TanStack Query GET) and useCompleteMilestone (mutation with navigate on success) hooks with tests.
- Task 6: Built full Completion.tsx page with criteria summary (green checks), trajectory placeholder, next milestone preview, workshop tone (no celebration/gamification), prefers-reduced-motion support, aria-live announcements. 11 component tests.
- Task 7: Added allCriteriaMet derived boolean to useSubmitCode, "Complete Milestone" button in TerminalPanel criteria tab (green accent, sole primary action), wired through WorkspaceLayout to Workspace with completion mutation.
- Task 8: Computed progress from criteriaResults in Workspace.tsx (metCount/totalCount * 100), passed to WorkspaceTopBar.

### Change Log

- 2026-03-05: Implemented Story 4.4 - Milestone Completion & Advancement
- 2026-03-06: Code review fixes — removed cross-plugin imports (DI via BriefLoader interface), removed dead useCompleteMilestone from Completion.tsx, added vi.restoreAllMocks() to Completion.test.tsx, replaced as casts with runtime type checks in route handler

### File List

New files:
- apps/backend/migrations/005_add_user_milestones.ts
- apps/backend/src/plugins/completion/index.ts
- apps/backend/src/plugins/completion/routes/completion.ts
- apps/backend/src/plugins/completion/index.test.ts
- apps/webapp/src/routes/Completion.tsx
- apps/webapp/src/routes/Completion.test.tsx
- apps/webapp/src/components/completion/CompletionSkeleton.tsx
- apps/webapp/src/hooks/use-completion-data.ts
- apps/webapp/src/hooks/use-completion-data.test.tsx
- apps/webapp/src/hooks/use-complete-milestone.ts
- apps/webapp/src/hooks/use-complete-milestone.test.tsx
- packages/shared/src/types/api.test.ts

Modified files:
- apps/backend/src/app.ts
- apps/webapp/src/App.tsx
- apps/webapp/src/routes/Workspace.tsx
- apps/webapp/src/hooks/use-submit-code.ts
- apps/webapp/src/components/workspace/TerminalPanel.tsx
- apps/webapp/src/components/workspace/WorkspaceLayout.tsx
- packages/shared/src/types/api.ts
- packages/shared/src/types/db.ts (auto-generated)
