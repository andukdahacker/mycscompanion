# Story 5.2: Session Resume & "Continue Building"

Status: done

## Story

As a returning learner,
I want to pick up exactly where I left off with a single click,
so that I spend zero time navigating and get straight back to building.

## Acceptance Criteria

1. Given a learner has previously worked on a milestone, when they log in and land on the app, then their default action is "Continue Building" — a single action with zero navigation decisions required (FR35)
2. Given a learner clicks "Continue Building", when the workspace loads, then their last saved code state is restored in the Monaco editor, current milestone progress is shown, and last submission results are displayed (FR33)
3. Given a learner has code snapshots for the active milestone, when the workspace loads, then the Monaco editor loads with the most recent code snapshot — NOT the milestone's starter code
4. Given a learner has a completed submission for the active milestone, when the workspace loads, then the acceptance criteria status from that last submission is displayed in the Criteria tab immediately
5. Given a logged-in learner navigates to the app root, when the overview loads, then they see the contextual overview with "Continue Building" as the singular primary action directing them to their active milestone workspace (FR35)
6. Given a brand new user with no active session, when they log in, then they are directed to the first milestone via the first-time contextual overview variant (Story 4.6 — already implemented)

## Tasks / Subtasks

- [x] Task 1: Create resume data endpoint (AC: #2, #3, #4)
  - [x] 1.1 Create `apps/backend/src/plugins/progress/routes/resume.ts`:
    ```typescript
    import type { FastifyInstance } from 'fastify'
    import type { Kysely } from 'kysely'
    import type { DB, CriterionResult } from '@mycscompanion/shared'
    import { toCamelCase } from '@mycscompanion/shared'

    interface ResumeData {
      readonly latestSnapshot: { readonly id: string; readonly code: string; readonly createdAt: string } | null
      readonly lastSubmissionId: string | null
      readonly lastSubmissionCriteria: ReadonlyArray<CriterionResult> | null
    }

    interface ResumeRoutesOptions {
      readonly db: Kysely<DB>
    }

    async function resumeRoutes(
      fastify: FastifyInstance,
      opts: ResumeRoutesOptions
    ): Promise<void> {
      const { db } = opts

      // GET /api/progress/resume/:milestoneId
      fastify.get<{ Params: { milestoneId: string } }>(
        '/resume/:milestoneId',
        async (request) => {
          const { milestoneId } = request.params
          const userId = request.uid

          // Fetch latest code snapshot
          const snapshot = await db
            .selectFrom('code_snapshots')
            .select(['id', 'code', 'created_at'])
            .where('user_id', '=', userId)
            .where('milestone_id', '=', milestoneId)
            .orderBy('created_at', 'desc')
            .limit(1)
            .executeTakeFirst()

          // Fetch latest completed submission with criteria results and ID
          const submission = await db
            .selectFrom('submissions')
            .select(['id', 'criteria_results'])
            .where('user_id', '=', userId)
            .where('milestone_id', '=', milestoneId)
            .where('status', '=', 'completed')
            .orderBy('created_at', 'desc')
            .limit(1)
            .executeTakeFirst()

          return {
            latestSnapshot: snapshot ? toCamelCase(snapshot) : null,
            lastSubmissionId: submission?.id ?? null,
            lastSubmissionCriteria: submission?.criteria_results ?? null,
          }
        }
      )
    }

    export { resumeRoutes }
    export type { ResumeData }
    ```
  - [x] 1.2 Register in `apps/backend/src/plugins/progress/index.ts`:
    - Import `resumeRoutes`
    - Register: `await fastify.register(resumeRoutes, { db })`
    - Route available at `GET /api/progress/resume/:milestoneId`
  - [x] 1.3 Create `apps/backend/src/plugins/progress/routes/resume.test.ts`:
    - Test returns latest snapshot when snapshots exist (verify code content and createdAt)
    - Test returns null latestSnapshot when no snapshots exist
    - Test returns latest completed submission's criteria_results and submission ID
    - Test returns null lastSubmissionCriteria and null lastSubmissionId when no completed submissions exist
    - Test returns null lastSubmissionCriteria when completed submission has null criteria_results (edge case: evaluation errored)
    - Test returns null for all fields when user has no data for milestone
    - Test returns correct data for the specific user (not other users' data)
    - Test returns correct data for the specific milestone (not other milestones' data)
    - Test 401 without auth
    - Real PostgreSQL, `fastify.inject()`, mock Firebase auth via `createMockFirebaseAuth()`
    - Cleanup in `afterEach`: delete from `code_snapshots`, `submissions`, `sessions`, `milestones`, `tracks`, `users` in reverse dependency order
    - `vi.restoreAllMocks()` in `afterEach`

- [x] Task 2: Add ResumeData type to shared package (AC: #2)
  - [x] 2.1 Add to `packages/shared/src/types/api.ts`:
    ```typescript
    import type { CriterionResult } from './curriculum.js'

    interface ResumeData {
      readonly latestSnapshot: {
        readonly id: string
        readonly code: string
        readonly createdAt: string
      } | null
      readonly lastSubmissionId: string | null
      readonly lastSubmissionCriteria: ReadonlyArray<CriterionResult> | null
    }
    ```
    - `CriterionResult` is already defined in `packages/shared/src/types/curriculum.ts` with fields: `name`, `order`, `status` (`'met' | 'not-met'`), `expected`, `actual`, `errorHint?`
    - `CriterionResult` is already exported via the barrel chain: `curriculum.ts` -> `types/index.ts` -> `index.ts`
    - Export `ResumeData` from the barrel file
  - [x] 2.2 Verify `CriterionResult` is importable from `@mycscompanion/shared` — it is (confirmed in `packages/shared/src/types/curriculum.ts`, re-exported through barrel).

- [x] Task 3: Modify `useWorkspaceData` to fetch and merge resume data (AC: #2, #3)
  - [x] 3.1 Update `apps/webapp/src/hooks/use-workspace-data.ts`:
    ```typescript
    import type { ResumeData, CriterionResult } from '@mycscompanion/shared'

    interface WorkspaceData {
      readonly milestoneName: string
      readonly milestoneNumber: number
      readonly progress: number
      readonly initialContent: string
      readonly brief: string | null
      readonly criteria: ReadonlyArray<AcceptanceCriterion>
      readonly stuckDetection: StuckDetectionConfig
      readonly conceptExplainerAssets: readonly ConceptExplainerAsset[]
      readonly restoredCriteria: ReadonlyArray<CriterionResult> | null  // NEW
      readonly restoredSubmissionId: string | null  // NEW — enables "Complete Milestone" for returning users
    }

    function useWorkspaceData(milestoneId: string | undefined) {
      return useQuery({
        queryKey: ['workspace', 'get', milestoneId],
        queryFn: async (): Promise<WorkspaceData> => {
          // Parallel fetch: curriculum content + resume data
          const [content, resumeData] = await Promise.all([
            apiFetch<MilestoneContent>(`/api/curriculum/milestones/${milestoneId}`),
            apiFetch<ResumeData>(`/api/progress/resume/${milestoneId}`),
          ])

          // Use snapshot code if available, otherwise fall back to starter code
          const initialContent = resumeData.latestSnapshot?.code
            ?? content.starterCode
            ?? DEFAULT_GO_TEMPLATE

          return {
            milestoneName: content.title,
            milestoneNumber: content.position,
            progress: 0, // Computed from criteria in Workspace.tsx
            initialContent,
            brief: content.brief,
            criteria: content.acceptanceCriteria,
            stuckDetection: { thresholdMinutes: 10, stage2OffsetSeconds: 60 },
            conceptExplainerAssets: content.conceptExplainerAssets,
            restoredCriteria: resumeData.lastSubmissionCriteria,
            restoredSubmissionId: resumeData.lastSubmissionId,
          }
        },
        staleTime: 5 * 60 * 1000,
        enabled: !!milestoneId,
      })
    }
    ```
    - **CRITICAL**: `Promise.all` for parallel fetch — do NOT await sequentially
    - If resume endpoint fails (e.g., 500), the entire query fails. This is acceptable — workspace shows error state with retry button (already handled in Workspace.tsx)
    - The `DEFAULT_GO_TEMPLATE` fallback chain: snapshot code > starterCode > default template
  - [x] 3.2 Update `apps/webapp/src/hooks/use-workspace-data.test.ts`:
    - Mock both `apiFetch` calls (curriculum + resume)
    - Test: when snapshot exists, initialContent uses snapshot code (not starterCode)
    - Test: when no snapshot, initialContent uses starterCode
    - Test: when no snapshot and no starterCode, initialContent uses DEFAULT_GO_TEMPLATE
    - Test: restoredCriteria and restoredSubmissionId populated from resume response
    - Test: restoredCriteria and restoredSubmissionId are null when no completed submissions
    - Test: parallel fetch (both endpoints called, not sequential)
    - Use `createTestQueryClient()` from `@mycscompanion/config/test-utils/`

- [x] Task 4: Wire restored criteria into Workspace (AC: #4)
  - [x] 4.1 Update `apps/webapp/src/routes/Workspace.tsx`:
    - Pass restored criteria through to layout, merging with live results:
    ```typescript
    // Use live criteria results if available (from current session submission),
    // otherwise fall back to restored criteria from last session's submission
    const effectiveCriteriaResults = criteriaResults ?? data.restoredCriteria ?? undefined

    // Use live submissionId if available, otherwise fall back to restored submission ID
    // This enables "Complete Milestone" for returning users who met all criteria but didn't complete
    const effectiveSubmissionId = submissionId ?? data.restoredSubmissionId ?? null

    // Derive allCriteriaMet from effective criteria (not just live criteria)
    const effectiveAllCriteriaMet = allCriteriaMet || (
      effectiveCriteriaResults !== undefined
      && effectiveCriteriaResults !== null
      && effectiveCriteriaResults.length > 0
      && effectiveCriteriaResults.every((r) => r.status === 'met')
    )

    // Progress calculation uses effective criteria
    const progress = effectiveCriteriaResults && criteria.length > 0
      ? Math.round(
          (effectiveCriteriaResults.filter((r) => r.status === 'met').length / criteria.length) * 100
        )
      : 0
    ```
    - Pass `effectiveCriteriaResults` to `<WorkspaceLayout criteriaResults={effectiveCriteriaResults} ... />`
    - Pass `effectiveAllCriteriaMet` to `<WorkspaceLayout allCriteriaMet={effectiveAllCriteriaMet} ... />`
    - Update `handleCompleteMilestone` to use `effectiveSubmissionId`:
    ```typescript
    const handleCompleteMilestone = useCallback(() => {
      if (!milestoneId || !effectiveSubmissionId) return
      completeMutation.mutate({ mId: milestoneId, sId: effectiveSubmissionId })
    }, [milestoneId, effectiveSubmissionId, completeMutation])
    ```
    - **IMPORTANT**: Once the user submits code in the current session, `criteriaResults` and `submissionId` from `useSubmitCode()` take over and restored values are no longer used. This is the correct behavior — live results replace restored results.
    - When restored criteria exist, switch to criteria tab on load (alongside brief tab logic):
    ```typescript
    // Content-before-tools: show brief tab on initial load
    // BUT if restored criteria exist, show criteria tab so user sees their progress
    useEffect(() => {
      if (data?.brief && !briefShownRef.current) {
        briefShownRef.current = true
        // If returning with criteria, show criteria tab; otherwise show brief
        if (data.restoredCriteria && data.restoredCriteria.length > 0) {
          useWorkspaceUIStore.getState().setActiveTerminalTab('criteria')
        } else {
          useWorkspaceUIStore.getState().setActiveTerminalTab('brief')
        }
      }
    }, [data?.brief, data?.restoredCriteria])
    ```
  - [x] 4.2 Update `apps/webapp/src/routes/Workspace.test.tsx`:
    - Test: when restoredCriteria provided, progress bar shows correct percentage
    - Test: when restoredCriteria provided AND criteriaResults from submission exist, submission results take precedence
    - Test: when no restoredCriteria and no submission results, progress is 0
    - Test: criteria tab activated when restoredCriteria exist
    - Test: brief tab activated when no restoredCriteria (existing behavior preserved)
    - Test: when all restored criteria are met, effectiveAllCriteriaMet is true and "Complete Milestone" button appears
    - Test: when restored criteria exist but not all met, "Complete Milestone" button does NOT appear
    - Test: handleCompleteMilestone uses restoredSubmissionId when no live submissionId
    - Test: handleCompleteMilestone uses live submissionId when available (takes precedence over restored)
    - Mock `useWorkspaceData` to return restoredCriteria and restoredSubmissionId
    - Mock `useSubmitCode` for live results override test

- [x] Task 5: Verify existing "Continue Building" flow (AC: #1, #5, #6)
  - [x] 5.1 Verify `MilestoneStartOverview.tsx` "Continue Building" navigates to `/workspace/${milestone.id}` — already implemented in Story 4.6, no changes needed
  - [x] 5.2 Verify `FirstTimeOverview.tsx` handles brand new users — already implemented in Story 4.6, no changes needed
  - [x] 5.3 Verify `ProtectedRoute` redirects unauthenticated users to sign-in — already implemented in Epic 2, no changes needed
  - [x] 5.4 Verify root `/` redirects to `/overview` — already configured in App.tsx, no changes needed
  - [x] 5.5 Add an integration test in `apps/webapp/src/routes/Overview.test.tsx` (if not already covered):
    - Test: returning user variant shows "Continue Building" button
    - Test: first-time user variant shows "Start Building" button
    - These should already exist from Story 4.6 — verify and skip if present

## Dev Notes

### Existing Infrastructure (DO NOT recreate)

- **Progress plugin**: `apps/backend/src/plugins/progress/index.ts` — already has `overviewRoutes`, `autoSaveRoutes`, `latestSnapshotRoutes`, `sessionRoutes`. Add `resumeRoutes` here.
- **Latest snapshot endpoint**: `GET /api/progress/snapshots/:milestoneId/latest` exists from Story 5.1. The new `resume` endpoint queries the same table but returns data in a combined response alongside criteria. Do NOT remove or modify the existing latest-snapshot endpoint — it's still used by auto-save deduplication logic.
- **Session creation**: `POST /api/progress/sessions` already fires on workspace mount (Story 5.1). No changes needed.
- **Auto-save**: `useAutoSave` hook already wired in Workspace.tsx (Story 5.1). No changes needed.
- **Overview route**: `GET /api/progress/overview` returns `OverviewData` with `variant`, `milestone`, `criteriaProgress`, `sessionSummary` (null placeholder for Story 5.3). No changes needed for this story.
- **"Continue Building" button**: Already in `MilestoneStartOverview.tsx` — navigates to `/workspace/${milestone.id}`. No changes needed.
- **First-time overview**: `FirstTimeOverview.tsx` handles brand new users with "Start Building". No changes needed.
- **`useWorkspaceData`**: Currently at `apps/webapp/src/hooks/use-workspace-data.ts`. Fetches from `/api/curriculum/milestones/{id}` and returns `starterCode` as `initialContent`. This is the PRIMARY file to modify — add parallel resume fetch and merge snapshot code.
- **`useSubmitCode`**: Returns `{ criteriaResults, allCriteriaMet, submissionId, isRunning, outputLines }`. The `criteriaResults` type is `ReadonlyArray<CriterionResult> | null`, initialized to `null` via TanStack Query cache with key `['execution', 'criteria', submissionId]`. It's populated ONLY when the SSE `'criteria_results'` event fires after a code submission. `allCriteriaMet` is derived from `criteriaResults` — `false` until criteria are populated and all have `status === 'met'`. `submissionId` is `string | null`, populated on submit. This is where restored values fill the gap before the first submission.
- **Editor store**: `useEditorStore` — `content`, `isDirty`, `setContent`, `markClean`. The `setContent` call happens inside `CodeEditor.tsx` when Monaco's model value changes. When `initialContent` prop changes, Monaco updates via `defaultValue`. The editor store gets populated from Monaco's `onMount` handler reading `model.getValue()`.
- **`toCamelCase()`**: In `@mycscompanion/shared` — use for all DB-to-API response conversion in the resume endpoint.
- **`generateId()`**: In `apps/backend/src/shared/id.ts` — NOT needed for this story (no new records created).
- **`apiFetch`**: At `apps/webapp/src/lib/api-fetch.ts` — handles Firebase auth token attachment. Used for both curriculum and resume fetch.
- **CriterionResult type**: Defined in `packages/shared/src/types/curriculum.ts` (Story 4.3). Used by submissions `criteria_results` JSONB column. Structure: `{ name: string, order: number, status: 'met' | 'not-met', expected: string | number, actual: string | number | null, errorHint?: string }`. Note: NO `id` field exists on this type.
- **WorkspaceLayout**: Receives `criteriaResults` prop and passes to `CriteriaPanel`. The panel renders criteria with status indicators. No changes needed to WorkspaceLayout or CriteriaPanel — they already handle `criteriaResults` being `undefined` (shows no results) or populated (shows statuses).

### Architecture Compliance

- **No new Zustand stores**: No new state stores. Resume data flows through TanStack Query via `useWorkspaceData`.
- **No new packages**: All code in existing apps and packages.
- **Plugin isolation**: Resume route goes in progress plugin. No cross-plugin imports.
- **Named exports only** — no default exports in any new file.
- **Route responses**: Direct object for success (no `{ data: result }` wrapper).
- **`toCamelCase` on DB results**: The resume endpoint returns snapshot data from DB — apply `toCamelCase()` to convert `created_at` to `createdAt`.
- **`criteria_results` is JSONB**: Already stored as camelCase JSON in the DB (the criteria evaluation in Story 4.3 writes camelCase keys into the JSONB column). Do NOT apply `toCamelCase()` to `criteria_results` — it's already camelCase.
- **TanStack Query key**: Keep existing `['workspace', 'get', milestoneId]` key — the resume data is part of the workspace query, not a separate cache entry.
- **`staleTime: 5 * 60 * 1000`**: Keep the 5-minute stale time. Workspace data doesn't change while the user is viewing the overview.
- **No Redis caching for resume endpoint**: Direct DB query is sufficient. Two simple queries (latest snapshot + latest submission) with existing indexes. Redis caching can be added later when the combined `/api/workspace/:milestoneId` endpoint is introduced.
- **Content-before-tools pattern preserved**: The parallel fetch (`Promise.all`) means resume data arrives at the same time as curriculum data. Monaco still lazy-loads. User reads brief (or criteria) while editor initializes.

### UX Specification Compliance

**From UX Design Specification — Critical Rules:**

- "Opening the app — Contextual overview (4 data points + 1 action) -> 'Continue Building' -> workspace. Zero navigation decisions."
- "Resuming after absence — Pre-computed session summary surfaces where the user left off. The AI tutor receives this context automatically."
- "Core building (sessions) — Editor loads, code is where they left it, brief is accessible. Quiet flow — the workshop feeling."
- "Return after absence — Potential guilt, inertia, 'where was I?' -> Session summary with pure context (no temporal framing), one button -> Comfort -> momentum — 'My project was waiting for me'"
- "Content-before-tools loading — show the milestone brief text immediately while Monaco editor initializes."
- "Zero temporal framing — No dates, no 'last session', no relative time in session context."

**Key UX behaviors for this story:**
- Code loads silently — no "restoring your session" toast or modal
- If snapshot exists, editor shows saved code. If not, shows starter code. No indication of which source was used.
- Criteria tab shows last submission results immediately — user sees their progress without submitting again
- No "welcome back" messaging anywhere in the workspace
- The workspace feels like the user never left

### Code Restoration Strategy

The code restoration follows a simple priority chain:

1. **Latest code snapshot** (from `code_snapshots` table, ordered by `created_at DESC`) — this is the user's most recent auto-saved code
2. **Milestone starter code** (from curriculum content via `/api/curriculum/milestones/{id}`) — fallback for first-time users or if no snapshots exist
3. **Default Go template** — final fallback if curriculum has no starter code

The restoration is invisible. The `initialContent` prop passed to `WorkspaceLayout` → `CodeEditor` → Monaco's `defaultValue` is set to whichever source is available. The user sees their code. No loading states, no "restored from snapshot" indicators.

**Edge case — starter code changed after user started**: If the curriculum team updates the starter code for a milestone, returning users still get their snapshot (their own saved code). This is correct — they've already diverged from the template. New users get the updated starter code.

### Criteria Restoration Strategy

Criteria results are restored from the most recent **completed** submission's `criteria_results` JSONB column. This gives the user immediate feedback on their progress without requiring a new submission.

**Merge logic in Workspace.tsx:**
```
effectiveCriteriaResults = criteriaResults ?? data.restoredCriteria ?? undefined
effectiveSubmissionId = submissionId ?? data.restoredSubmissionId ?? null
effectiveAllCriteriaMet = allCriteriaMet || (effectiveCriteriaResults?.every(r => r.status === 'met'))
```

- Before first submission in current session: show restored criteria + restored submissionId (from last session)
- After first submission in current session: show live criteria + live submissionId (from useSubmitCode)
- No submission ever (new user): show nothing (undefined)

This is a simple nullish coalescing chain. The `useSubmitCode` hook's `criteriaResults` starts as `null` and gets populated when a submission completes. Once populated, it takes precedence.

**"Complete Milestone" edge case**: If a returning user previously met all criteria but didn't click "Complete Milestone", the restored data enables this: `effectiveAllCriteriaMet` is true, `effectiveSubmissionId` has their last submission ID, and the completion button works without requiring a re-submission. The `handleCompleteMilestone` callback uses `effectiveSubmissionId` to record which submission completed the milestone.

**Null criteria_results edge case**: A completed submission could theoretically have `criteria_results = null` if criteria evaluation errored. The resume endpoint handles this with `submission?.criteria_results ?? null`. The frontend treats this the same as "no submission" — criteria panel shows unevaluated state.

### Project Structure Notes

```
# Backend (new)
apps/backend/src/plugins/progress/routes/resume.ts              # GET /api/progress/resume/:milestoneId
apps/backend/src/plugins/progress/routes/resume.test.ts          # Resume endpoint tests

# Backend (modified)
apps/backend/src/plugins/progress/index.ts                       # Register resumeRoutes

# Shared (modified)
packages/shared/src/types/api.ts                                 # Add ResumeData type + export

# Frontend (modified)
apps/webapp/src/hooks/use-workspace-data.ts                      # Parallel fetch + merge resume data
apps/webapp/src/hooks/use-workspace-data.test.ts                  # Tests for resume data merging
apps/webapp/src/routes/Workspace.tsx                              # Wire restored criteria + tab logic
apps/webapp/src/routes/Workspace.test.tsx                         # Tests for criteria restoration
```

### Testing Requirements

- **Backend route tests** (`resume.test.ts`): Real PostgreSQL, `fastify.inject()`, mock Firebase auth via `createMockFirebaseAuth()`. Build app via `buildApp()` helper. Manual row cleanup in `afterEach` in reverse dependency order. Follow exact same patterns as `latest-snapshot.test.ts` and `overview.test.ts`.
- **Frontend hook tests** (`use-workspace-data.test.ts`): Mock `apiFetch` to return both curriculum and resume responses. Use `createTestQueryClient()` + `TestProviders` from `@mycscompanion/config/test-utils/`. Test the priority chain (snapshot > starterCode > default template).
- **Frontend integration tests** (`Workspace.test.tsx`): Mock `useWorkspaceData` to return `restoredCriteria`. Mock `useSubmitCode` to test criteria override. Verify tab switching logic.
- **Test syntax**: `describe()` + `it()`, never `test()`. `vi.restoreAllMocks()` in `afterEach`.
- **No snapshot tests** — explicit behavioral assertions only.
- **No `any`** — use proper types throughout.
- **Import from `@mycscompanion/config/test-utils/`** for shared test utilities.

### Anti-Patterns to Avoid

- Do NOT create a new Zustand store for resume state — resume data flows through TanStack Query
- Do NOT add a separate TanStack Query key for resume data — it's part of the workspace query (`['workspace', 'get', milestoneId]`)
- Do NOT remove the existing `GET /api/progress/snapshots/:milestoneId/latest` endpoint — it's still used
- Do NOT add "restoring session" or "welcome back" UI indicators — restoration is invisible
- Do NOT fetch resume data sequentially after curriculum data — use `Promise.all` for parallel fetch
- Do NOT modify `useSubmitCode` to accept initial criteria — use nullish coalescing in Workspace.tsx
- Do NOT modify `CodeEditor`, `CriteriaPanel`, or `WorkspaceLayout` — they already handle the data shapes correctly
- Do NOT apply `toCamelCase()` to `criteria_results` JSONB — it's already stored as camelCase
- Do NOT use `localStorage` or `IndexedDB` — PostgreSQL via API is the source of truth
- Do NOT use `@/` import aliases — relative paths within apps
- Do NOT use default exports — named exports only
- Do NOT use `as` casting — use proper types
- Do NOT use `any` — use proper types, `Partial<T>`, or mock factories
- Do NOT use `console.log` — backend uses pino via Fastify logger

### Previous Story (5.1) Learnings

- Progress plugin has `ProgressPluginOptions` with `contentLoader` and `db`. New routes receive `{ db }` via options.
- `autoSaveRoutes` and `sessionRoutes` use `{ db }` from `ProgressPluginOptions` — follow the same pattern for `resumeRoutes`.
- Code snapshots query uses compound index `idx_code_snapshots_user_milestone_created` for efficient `ORDER BY created_at DESC LIMIT 1` queries.
- Submissions query uses index `idx_submissions_user_id_milestone_id` for user+milestone filtering.
- `toCamelCase()` IS needed when returning raw DB query results (e.g., `created_at` → `createdAt`). NOT needed for JSONB fields already stored as camelCase.
- Unique partial index `idx_sessions_user_milestone_active` prevents concurrent duplicate active sessions — session creation is safe.
- Test patterns: `buildApp()` helper, `fastify.inject()` with auth headers, reverse-order cleanup in `afterEach`.
- Code review caught `.then()` chains — always use `async/await`.
- Code review caught inconsistent ISO 8601 string handling — ensure `createdAt` is returned as ISO string.

### Git Intelligence (Recent Commits)

Recent commits follow pattern: "Implement Story X.Y: Title with code review fixes"

Key patterns from Story 5.1:
- New routes follow `{ db }` options pattern (no `contentLoader` needed for data-only routes)
- Route tests use `buildApp()` helper with mock auth + plugin registration
- `afterEach` cleanup in reverse dependency order
- `toCamelCase()` applied to raw DB results, not to constructed objects

### Dependencies on Previous Work

- Auto-save infrastructure: sessions + code_snapshots tables (Story 5.1) - done
- Latest snapshot endpoint (Story 5.1) - done (provides query pattern reference)
- Session creation on workspace mount (Story 5.1) - done
- Contextual overview with "Continue Building" (Story 4.6) - done
- First-time overview variant (Story 4.6) - done
- Acceptance criteria evaluation + CriterionResult type (Story 4.3) - done
- Milestone content model + curriculum API (Story 4.1) - done
- Workspace layout with CriteriaPanel (Stories 3.5, 4.3) - done
- Monaco editor integration (Story 3.6) - done
- Submission API with criteria_results JSONB (Stories 3.3, 3.4, 4.3) - done
- Firebase Auth integration (Epic 2) - done

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story-5.2]
- [Source: _bmad-output/planning-artifacts/architecture.md#API-Communication-Patterns]
- [Source: _bmad-output/planning-artifacts/architecture.md#Data-Architecture-Core-Schema]
- [Source: _bmad-output/planning-artifacts/architecture.md#Caching-Strategy-Redis]
- [Source: _bmad-output/planning-artifacts/architecture.md#Progress-Plugin-Routes]
- [Source: _bmad-output/planning-artifacts/architecture.md#State-Management]
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#Effortless-Interactions]
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#Session-Summary-Temporal-Rule]
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#Content-Before-Tools-Loading]
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#Core-Building-Sessions]
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#Return-After-Absence]
- [Source: _bmad-output/planning-artifacts/prd.md#FR33-Code-State-Restoration]
- [Source: _bmad-output/planning-artifacts/prd.md#FR35-Continue-Building]
- [Source: _bmad-output/implementation-artifacts/5-1-auto-save-and-code-snapshot-persistence.md]
- [Source: _bmad-output/project-context.md]
- [Source: apps/backend/src/plugins/progress/index.ts]
- [Source: apps/backend/src/plugins/progress/routes/latest-snapshot.ts]
- [Source: apps/backend/src/plugins/progress/routes/sessions.ts]
- [Source: apps/backend/src/plugins/progress/routes/overview.ts]
- [Source: apps/webapp/src/hooks/use-workspace-data.ts]
- [Source: apps/webapp/src/routes/Workspace.tsx]
- [Source: apps/webapp/src/routes/Overview.tsx]
- [Source: apps/webapp/src/components/overview/MilestoneStartOverview.tsx]
- [Source: apps/webapp/src/stores/editor-store.ts]
- [Source: apps/webapp/src/hooks/use-submit-code.ts]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6

### Debug Log References

None

### Completion Notes List

- Task 1: Created `GET /api/progress/resume/:milestoneId` endpoint returning latest code snapshot + last completed submission criteria. 9 tests covering happy paths, edge cases (null criteria_results, user isolation, milestone isolation), and auth.
- Task 2: Added `ResumeData` interface to `packages/shared/src/types/api.ts`, exported via barrel chain.
- Task 3: Updated `useWorkspaceData` to parallel-fetch curriculum + resume data via `Promise.all`. Snapshot code takes priority over starter code. 15 tests updated to mock both endpoints.
- Task 4: Wired restored criteria into Workspace.tsx with nullish coalescing chain. Live submission results override restored values. Criteria tab activated on load when restored criteria exist. 5 new tests added.
- Task 5: Verified existing "Continue Building" flow — `MilestoneStartOverview`, `FirstTimeOverview`, `ProtectedRoute`, and root redirect all working as implemented in Stories 4.6 and Epic 2. Existing tests confirm coverage.

### Change Log

- 2026-03-08: Implemented Story 5.2 — Session Resume & "Continue Building"
- 2026-03-08: Code review fixes — 6 issues fixed:
  1. [CRITICAL] Added 6 missing tests for Complete Milestone button + criteria tab edge cases (35 tests total)
  2. [MEDIUM] Fixed criteria tab activation failing when milestone has no brief
  3. [MEDIUM] Added `satisfies ResumeData` type safety + manual field mapping (replaced toCamelCase which mangled Date objects)
  4. [MEDIUM] Added missing `allCriteriaMet: false` to mockUseSubmitCode default
  5. [LOW] Removed redundant `!== undefined` check in effectiveAllCriteriaMet
  6. [LOW] Parallelized independent DB queries with Promise.all

### File List

**New:**
- `apps/backend/src/plugins/progress/routes/resume.ts` — Resume data endpoint
- `apps/backend/src/plugins/progress/routes/resume.test.ts` — Resume endpoint tests (9 tests)

**Modified:**
- `apps/backend/src/plugins/progress/index.ts` — Register resumeRoutes
- `packages/shared/src/types/api.ts` — Add ResumeData type
- `apps/webapp/src/hooks/use-workspace-data.ts` — Parallel fetch + merge resume data
- `apps/webapp/src/hooks/use-workspace-data.test.tsx` — Updated tests for dual-fetch (15 tests)
- `apps/webapp/src/routes/Workspace.tsx` — Wire restored criteria + tab logic
- `apps/webapp/src/routes/Workspace.test.tsx` — Tests for criteria restoration (35 tests, 11 new)
