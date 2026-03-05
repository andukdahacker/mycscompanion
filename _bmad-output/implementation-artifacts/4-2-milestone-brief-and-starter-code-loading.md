# Story 4.2: Milestone Brief & Starter Code Loading

Status: done

## Story

As a learner,
I want to see the milestone brief and have starter code loaded into my editor,
so that I understand what to build and have a starting point at the right scaffolding level.

## Acceptance Criteria

1. The milestone brief renders immediately when the workspace loads, with learning objectives and acceptance criteria listed (FR1)
2. The brief uses "Why This Matters" framing to connect the milestone to real database engineering concepts
3. The brief renders as part of the content-before-tools loading pattern — visible before Monaco finishes loading (UX-1)
4. When starting a new milestone, pre-scaffolded starter code loads into the Monaco editor at the appropriate level for that milestone (FR3)
5. The scaffolding level is appropriate to the milestone (e.g., Milestone 1 has more scaffolding, later milestones have less)
6. The starter code is valid Go code that compiles (FR44 — validated by Content CI)
7. The workspace tone is consistent with workshop atmosphere — no gamification, no patronizing encouragement (UX-5)

## Tasks / Subtasks

- [x] Task 1: Extend backend to serve starter code content (AC: #4)
  - [x] 1.1 Add `loadStarterCode(slug): Promise<string | null>` method to `ContentLoader` in `apps/backend/src/plugins/curriculum/content-loader.ts` — reads `content/milestones/{slug}/starter-code/main.go` as UTF-8, returns `null` if missing or only `.gitkeep`
  - [x] 1.2 Add `starterCode` field (type `string | null`) to `MilestoneContent` in `packages/shared/src/types/curriculum.ts` — replaces `starterCodePath` field
  - [x] 1.3 Update milestone route handler in `routes/milestones.ts` to call `loadStarterCode(slug)` and include result in response
  - [x] 1.4 Include starter code in Redis cache (already cached as part of full content object)
  - [x] 1.5 Write unit tests for `loadStarterCode` in `content-loader.test.ts` — cover: file exists with content, file missing, only `.gitkeep`, read error
  - [x] 1.6 Update integration test in `content-loader.integration.test.ts` to verify starter code loading for milestone 01-kv-store (real file exists) and 02+ (`.gitkeep` only → `null`)

- [x] Task 2: Install markdown rendering dependency (AC: #1, #2)
  - [x] 2.1 Run `pnpm --filter webapp add react-markdown` — lightweight markdown renderer (v9+ bundles its own TypeScript types — do NOT install `@types/react-markdown`, it does not exist)

- [x] Task 3: Replace mock `useWorkspaceData` with real API call (AC: #1, #3, #4)
  - [x] 3.1 Update `apps/webapp/src/hooks/use-workspace-data.ts`:
    - Import `apiFetch` from `../lib/api-fetch`
    - Import `MilestoneContent` from `@mycscompanion/shared`
    - Change `queryFn` from `Promise.resolve(MOCK_WORKSPACE_DATA)` to `apiFetch<MilestoneContent>(`/api/curriculum/milestones/${milestoneId}`)`
    - Update `WorkspaceData` interface to align with `MilestoneContent` response shape (see Dev Notes for exact mapping)
    - Keep `staleTime: 5 * 60 * 1000` (5 min)
    - Remove `MOCK_WORKSPACE_DATA` constant
    - Update the existing comment `"real API (GET /api/workspace/:milestoneId) comes in Epic 4"` to document the interim approach: using curriculum endpoint directly until Epic 5 introduces the combined workspace endpoint
  - [x] 3.2 Update `WorkspaceData` interface fields:
    - `milestoneName` → mapped from `title`
    - `milestoneNumber` → mapped from `position`
    - `initialContent` → mapped from `starterCode` (fall back to empty Go template if `null`)
    - `brief` → mapped from `brief` (raw markdown string)
    - `criteria` → mapped from `acceptanceCriteria` (full `AcceptanceCriterion[]`, not `string[]`)
    - Keep `progress: 0` hardcoded (no progress tracking until Epic 5)
    - Keep `stuckDetection` hardcoded (no dynamic thresholds until Epic 6)
  - [x] 3.3 Update existing `use-workspace-data.test.ts` to mock `apiFetch` and verify real API integration

- [x] Task 4: Create MilestoneBrief component (AC: #1, #2, #3, #7)
  - [x] 4.1 Create `apps/webapp/src/components/workspace/MilestoneBrief.tsx`
    - Accept prop: `brief: string` (raw markdown)
    - Render via `react-markdown` inside a `ScrollArea`
    - Constrain prose width to `max-w-prose` (720px max for comfortable reading)
    - Style headings, paragraphs, lists, code blocks with Tailwind typography classes matching dark theme
    - No gamification language, no emojis in rendering — workshop atmosphere
  - [x] 4.2 Create `apps/webapp/src/components/workspace/MilestoneBrief.test.tsx`
    - Verify markdown renders heading content
    - Verify prose width constraint applied
    - Verify long brief content is scrollable

- [x] Task 5: Integrate brief into TerminalPanel as swappable content (AC: #1, #3)
  - [x] 5.1 Add `'brief'` to terminal tab options in `workspace-ui-store.ts`: change `activeTerminalTab` type from `'output' | 'criteria'` to `'brief' | 'output' | 'criteria'` (keep store default as `'output'` — brief tab activation is handled at the component level)
  - [x] 5.2 Update `TerminalPanel.tsx`:
    - Add `brief` prop: `readonly brief: string | null`
    - Add "Brief" tab button alongside Output and Criteria
    - Render `MilestoneBrief` component when brief tab is active
  - [x] 5.3 Update `TABS` constant to `['brief', 'output', 'criteria']` and update keyboard navigation for 3 tabs
  - [x] 5.4 Add a `useEffect` in `Workspace.tsx` (NOT in the store default) that sets `activeTerminalTab` to `'brief'` when `data.brief` is non-null on initial load — this implements the content-before-tools pattern so the user reads the brief while Monaco lazy-loads
  - [x] 5.5 Update `TerminalPanel.test.tsx` — test brief tab renders markdown, tab switching works across 3 tabs

- [x] Task 6: Wire brief, criteria, and starter code through Workspace route and layout (AC: #1, #3, #4)
  - [x] 6.1 Update `WorkspaceLayout` props interface to accept `brief: string | null` and `criteria: ReadonlyArray<AcceptanceCriterion>`
  - [x] 6.2 Pass `brief` and `criteria` from `WorkspaceLayout` to `TerminalPanel`
  - [x] 6.3 Update `Workspace.tsx` route to pass `data.brief` and `data.criteria` to `WorkspaceLayout`
  - [x] 6.4 Pass `data.initialContent` (now from API) as `initialContent` to `WorkspaceLayout`

- [x] Task 7: Update criteria tab placeholder with real data shape (AC: #1)
  - [x] 7.1 Update `TerminalPanel` criteria tab to accept `criteria: ReadonlyArray<AcceptanceCriterion>` prop
  - [x] 7.2 Display criteria as a list with name, description, and a gray dash icon (not evaluated yet — evaluation is Story 4.3)
  - [x] 7.3 Wire `data.criteria` from workspace route through layout to terminal panel
  - [x] 7.4 Test criteria list rendering in `TerminalPanel.test.tsx`

- [x] Task 8: Update Workspace route tests (AC: all)
  - [x] 8.1 Update `Workspace.test.tsx` to mock `apiFetch` returning `MilestoneContent` shape
  - [x] 8.2 Test: workspace renders brief in terminal panel brief tab on load
  - [x] 8.3 Test: starter code from API loads into editor
  - [x] 8.4 Test: error state shows when API fails
  - [x] 8.5 Test: loading skeleton shows during API fetch

## Dev Notes

### Existing Infrastructure (DO NOT recreate)

- **Curriculum API exists** (Story 4.1): `GET /api/curriculum/milestones/:id` returns `MilestoneContent` with `brief`, `acceptanceCriteria`, `starterCodePath`. This story adds `starterCode` content to the response.
- **Content loader exists**: `apps/backend/src/plugins/curriculum/content-loader.ts` — has methods for brief, criteria, benchmarks, assets. Add `loadStarterCode()` following same pattern.
- **`useWorkspaceData` hook exists**: `apps/webapp/src/hooks/use-workspace-data.ts` — currently returns mock data. Replace `queryFn` with real `apiFetch` call.
- **`apiFetch` utility exists**: `apps/webapp/src/lib/api-fetch.ts` — handles Firebase auth token, error parsing, auto-refresh.
- **WorkspaceLayout exists** (Story 3.5): `apps/webapp/src/components/workspace/WorkspaceLayout.tsx` — three-panel layout with editor, terminal, tutor.
- **TerminalPanel exists** (Story 3.7): `apps/webapp/src/components/workspace/TerminalPanel.tsx` — has Output and Criteria tabs. Criteria tab shows placeholder text.
- **CodeEditor exists** (Story 3.6): Receives `initialContent` prop, passes to Monaco `defaultValue` (uncontrolled mode — set once on mount). When `milestoneId` changes in the URL, React Router remounts the entire `Workspace` route component, which creates a fresh `CodeEditor` instance with the new starter code. Do NOT try to make CodeEditor a controlled component or add logic to update Monaco content after mount.
- **All MilestoneContent types exist**: `packages/shared/src/types/curriculum.ts` — `AcceptanceCriterion`, `MilestoneContent`, etc.
- **No `workspace-ui-store.test.ts` exists** — store behavior is tested via `TerminalPanel.test.tsx` integration tests. No separate store test file needed for this story.

### WorkspaceData → MilestoneContent Mapping

The `useWorkspaceData` hook should transform the API response internally:

```typescript
// In useWorkspaceData queryFn:
const content = await apiFetch<MilestoneContent>(`/api/curriculum/milestones/${milestoneId}`)
return {
  milestoneName: content.title,
  milestoneNumber: content.position,
  progress: 0, // Hardcoded until Epic 5
  initialContent: content.starterCode ?? DEFAULT_GO_TEMPLATE,
  brief: content.brief,
  criteria: content.acceptanceCriteria,
  stuckDetection: { thresholdMinutes: 10, stage2OffsetSeconds: 60 }, // Hardcoded until Epic 6
}
```

Default Go template (when `starterCode` is null):
```go
package main

import "fmt"

func main() {
    fmt.Println("Hello, World!")
}
```

Update the `WorkspaceData` interface `criteria` type from `ReadonlyArray<string>` to `ReadonlyArray<AcceptanceCriterion>` (import from `@mycscompanion/shared`).

### API Endpoint Decision (Interim)

Architecture specifies `GET /api/workspace/:milestoneId` as the combined single-fetch endpoint (progress plugin). That endpoint does not exist yet — the progress plugin is a placeholder for Epic 5. This story uses `GET /api/curriculum/milestones/:id` directly as an interim approach. When Epic 5 implements the workspace endpoint, `useWorkspaceData` will be updated to call that endpoint instead, adding user code state, session context, and progress data. The query key `['workspace', 'get', milestoneId]` is kept stable so downstream cache consumers don't need changes.

### Content-Before-Tools Loading Pattern

The brief MUST be visible before Monaco finishes loading. Implementation:
1. In `Workspace.tsx`, add a `useEffect` that calls `setActiveTerminalTab('brief')` when `data.brief` is non-null on first render — this is the trigger for content-before-tools
2. Do NOT change the store's default value (keep `'output'`) — the brief tab activation must be data-driven, not a static default
3. User reads brief in the bottom panel while Monaco lazy-loads in the top panel
4. The `WorkspaceSkeleton` already shows the layout structure during the initial data fetch
5. Once data arrives: brief renders instantly (text), Monaco starts loading with starter code

This is NOT a split-fetch strategy — it's progressive rendering from a single API response. The brief (text) renders faster than Monaco (heavy JS bundle).

### Brief Rendering

Use `react-markdown` for rendering the brief markdown. Do NOT use `dangerouslySetInnerHTML`. The brief content comes from trusted content files but markdown rendering is safer and more maintainable.

Style the rendered markdown to match the dark theme:
- Headings: `text-foreground font-medium`
- Paragraphs: `text-secondary-foreground leading-relaxed`
- Code blocks: `bg-card rounded p-2 font-mono text-sm`
- Lists: proper spacing, `text-secondary-foreground`
- Max prose width: 720px (`max-w-prose`)

### Starter Code Loading

The starter code for Milestone 1 (`content/milestones/01-kv-store/starter-code/main.go`) is a 330-line Go file with:
- Complete CLI harness (main, tests, benchmark runner — marked "do not modify")
- TODO stubs for `Get`, `Put`, `Delete`, `saveToDisk`, `loadFromDisk`
- ~80% scaffolding level

For milestones 02-05, `starter-code/` contains only `.gitkeep` — `loadStarterCode` returns `null`, frontend uses the default Go template.

### Backend Change: Replace `starterCodePath` with `starterCode`

In `packages/shared/src/types/curriculum.ts`, change:
```typescript
// Before (Story 4.1):
readonly starterCodePath: string | null

// After (Story 4.2):
readonly starterCode: string | null
```

This is a breaking change to `MilestoneContent`. Since no consumer currently uses `starterCodePath` (frontend was using mock data), this is safe. Update:
- `content-loader.ts`: Add `loadStarterCode(slug)` that reads `main.go` content
- `routes/milestones.ts`: Call `loadStarterCode` instead of `getStarterCodePath`, map to `starterCode`
- Type definition in `curriculum.ts`

Keep `getStarterCodePath()` for now (used by content-loader integration tests) but the API response should use `starterCode` (file content string).

### Terminal Panel Brief Tab

The UX spec says: "A keyboard shortcut swaps the terminal panel content to show the brief. One panel, two content modes." This maps to adding a third tab `'brief'` to the existing terminal panel tabs (`output`, `criteria`).

Tab order: **Brief | Output | Criteria**

On initial workspace load with brief available, default to the Brief tab so the user sees the brief immediately.

### File Structure

```
# Backend (modified)
apps/backend/src/plugins/curriculum/content-loader.ts          # Add loadStarterCode()
apps/backend/src/plugins/curriculum/content-loader.test.ts      # Add starter code tests
apps/backend/src/plugins/curriculum/content-loader.integration.test.ts  # Update
apps/backend/src/plugins/curriculum/routes/milestones.ts        # Use starterCode
packages/shared/src/types/curriculum.ts                         # starterCodePath → starterCode

# Frontend (new)
apps/webapp/src/components/workspace/MilestoneBrief.tsx         # New component
apps/webapp/src/components/workspace/MilestoneBrief.test.tsx     # New tests

# Frontend (modified)
apps/webapp/src/hooks/use-workspace-data.ts                     # Replace mock with API
apps/webapp/src/hooks/use-workspace-data.test.tsx               # Update tests (file exists)
apps/webapp/src/stores/workspace-ui-store.ts                    # Add 'brief' tab type
apps/webapp/src/components/workspace/TerminalPanel.tsx          # Add brief tab + criteria list
apps/webapp/src/components/workspace/TerminalPanel.test.tsx     # Update tests
apps/webapp/src/components/workspace/WorkspaceLayout.tsx        # Pass brief prop
apps/webapp/src/routes/Workspace.tsx                            # Pass brief + criteria data
apps/webapp/src/routes/Workspace.test.tsx                       # Update tests
```

### Testing Requirements

- **Content loader tests** (`content-loader.test.ts`): Mock `fs` reads for `loadStarterCode()`. Test: file exists → returns content, missing → returns null, `.gitkeep` only → returns null.
- **Route tests** (`milestones.test.ts`): Verify `starterCode` field in response (string content, not path).
- **MilestoneBrief tests**: Use `@testing-library/react` to verify markdown renders.
- **TerminalPanel tests**: Verify three tabs render, brief tab shows content, criteria tab shows criteria list.
- **Workspace route tests**: Mock `apiFetch`, verify brief and starter code integration end-to-end.
- **Test syntax**: `describe()` + `it()`, never `test()`. `vi.restoreAllMocks()` in `afterEach`.
- **Import test utilities from `@mycscompanion/config/test-utils/`**: `createTestQueryClient()`, `TestProviders`.

### Anti-Patterns to Avoid

- Do NOT use `dangerouslySetInnerHTML` for brief rendering — use `react-markdown`
- Do NOT create a new Zustand store — add `'brief'` to existing `activeTerminalTab` type in `useWorkspaceUIStore`
- Do NOT fetch brief and starter code separately — single API call to curriculum endpoint
- Do NOT create `@/` import aliases — use relative paths within apps
- Do NOT put the brief in a separate floating panel or modal — it's a tab in the terminal panel
- Do NOT add server data to Zustand — keep it in TanStack Query via `useWorkspaceData`
- Do NOT import from other Fastify plugins — only from `packages/*`
- Do NOT use `any` type anywhere — use `AcceptanceCriterion` from `@mycscompanion/shared`
- Do NOT use default exports (except `Workspace.tsx` which needs it for `React.lazy()`)
- Do NOT use `jest.fn()` — use `vi.fn()`
- Do NOT try to make CodeEditor a controlled component — it uses `defaultValue` (uncontrolled mode) by design; route remounting handles milestone changes
- Do NOT change the store default for `activeTerminalTab` — brief tab activation is data-driven via `useEffect` in `Workspace.tsx`

### Dependencies on Previous Work

- Curriculum API with content loader (Story 4.1) ✓
- Workspace layout with resizable panels (Story 3.5) ✓
- Monaco editor integration (Story 3.6) ✓
- Terminal panel with tabs (Story 3.7) ✓
- Workspace state management (Story 3.8) ✓
- Firebase auth + apiFetch (Story 2.1) ✓
- Test infrastructure (Story 1.5) ✓

### Previous Story (4.1) Learnings

- Route tests initially returned 404 — fixed by adding `prefix` to sub-route registration. Ensure milestones route is correctly prefixed.
- Inline `import('ioredis').Redis` caused lint errors — use proper `import type { Redis }` at top of file.
- Content loader must handle missing files gracefully — return null, never throw.
- YAML snake_case → camelCase conversion via `toCamelCase()` is critical.
- Integration tests need proper isolation: `vi.restoreAllMocks()` + fresh loader in `beforeEach`.
- Code review found N+1 query issues and missing path traversal validation — both fixed. Be mindful of similar patterns.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Epic-4-Story-4.2]
- [Source: _bmad-output/planning-artifacts/architecture.md#Content-Before-Tools-Loading]
- [Source: _bmad-output/planning-artifacts/architecture.md#Workspace-Data-Flow]
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#Content-Before-Tools]
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#Milestone-Brief-Structure]
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#Workshop-Atmosphere]
- [Source: _bmad-output/planning-artifacts/prd.md#FR1-FR3-FR44-FR45]
- [Source: _bmad-output/implementation-artifacts/4-1-milestone-content-model-and-curriculum-api.md]
- [Source: _bmad-output/project-context.md]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6

### Debug Log References

None — implementation was straightforward.

### Completion Notes List

- Task 1: Added `loadStarterCode(slug)` to ContentLoader — reads `main.go` as UTF-8, returns null if missing. Updated `MilestoneContent` type: `starterCodePath` → `starterCode` (string content instead of path). Route handler now returns file content directly. 4 new unit tests + 2 new integration tests.
- Task 2: Installed `react-markdown` v9+ in webapp workspace.
- Task 3: Replaced mock `useWorkspaceData` with real `apiFetch` call to `GET /api/curriculum/milestones/:id`. Maps `MilestoneContent` to `WorkspaceData` shape internally. Falls back to default Go template when `starterCode` is null. Updated `criteria` type from `ReadonlyArray<string>` to `ReadonlyArray<AcceptanceCriterion>`. 8 tests covering API integration and data mapping.
- Task 4: Created `MilestoneBrief` component with `react-markdown`, `ScrollArea`, prose width constraint, dark theme styling. 4 tests.
- Task 5: Added `'brief'` tab to workspace-ui-store and TerminalPanel. Tab order: Brief | Output | Criteria. Added content-before-tools `useEffect` in Workspace.tsx. 19 tests covering all 3 tabs + keyboard navigation.
- Task 6: Wired `brief` and `criteria` props through WorkspaceLayout to TerminalPanel. Updated Workspace route to pass data from API.
- Task 7: Replaced criteria placeholder with real `AcceptanceCriterion` list rendering (name + description with dash icon).
- Task 8: Updated Workspace route tests with full `MilestoneContent` mock shape. 17 tests covering brief rendering, starter code, error state, loading, and content-before-tools pattern.

### Change Log

- Story 4.2 implementation complete (Date: 2026-03-05)
- Code review fixes applied (Date: 2026-03-05):
  - [H1] Fixed `MilestoneContent.brief` type: `string` -> `string | null` in `curriculum.ts`
  - [M1] Changed `??` to `||` for starterCode fallback in `use-workspace-data.ts` (handles empty string)
  - [M2] Added 1-hour TTL to Redis cache in `content-loader.ts`
  - [M3] Fixed misleading criteria tab empty state message in `TerminalPanel.tsx`
  - [L2] Extracted MilestoneBrief markdown components to file-level constant
  - Updated tests: cache TTL assertion, criteria empty state text

### File List

**Backend (modified):**
- `apps/backend/src/plugins/curriculum/content-loader.ts` — Added `loadStarterCode()`, updated cache type
- `apps/backend/src/plugins/curriculum/content-loader.test.ts` — Added 4 loadStarterCode tests, updated cache mock
- `apps/backend/src/plugins/curriculum/content-loader.integration.test.ts` — Added 2 starter code integration tests
- `apps/backend/src/plugins/curriculum/routes/milestones.ts` — Changed from `getStarterCodePath` to `loadStarterCode`
- `packages/shared/src/types/curriculum.ts` — `starterCodePath` → `starterCode`
- `packages/shared/src/types/curriculum.test.ts` — Updated type references

**Frontend (new):**
- `apps/webapp/src/components/workspace/MilestoneBrief.tsx` — New markdown rendering component
- `apps/webapp/src/components/workspace/MilestoneBrief.test.tsx` — New tests

**Frontend (modified):**
- `apps/webapp/src/hooks/use-workspace-data.ts` — Replaced mock with real API call
- `apps/webapp/src/hooks/use-workspace-data.test.tsx` — Updated tests for real API integration
- `apps/webapp/src/stores/workspace-ui-store.ts` — Added `'brief'` tab type
- `apps/webapp/src/components/workspace/TerminalPanel.tsx` — Added Brief tab, criteria list, 3-tab navigation
- `apps/webapp/src/components/workspace/TerminalPanel.test.tsx` — Updated for 3 tabs + brief + criteria
- `apps/webapp/src/components/workspace/WorkspaceLayout.tsx` — Added brief/criteria props passthrough
- `apps/webapp/src/components/workspace/WorkspaceLayout.test.tsx` — Updated defaultProps
- `apps/webapp/src/routes/Workspace.tsx` — Added brief/criteria wiring + content-before-tools useEffect
- `apps/webapp/src/routes/Workspace.test.tsx` — Added brief/criteria/starter code tests

**Dependencies:**
- `apps/webapp/package.json` — Added `react-markdown`
- `pnpm-lock.yaml` — Updated
