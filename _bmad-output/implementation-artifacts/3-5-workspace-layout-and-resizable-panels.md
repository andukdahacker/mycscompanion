# Story 3.5: Workspace Layout & Resizable Panels

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **learner**,
I want a well-organized workspace with adjustable panel sizes,
so that I can arrange my coding environment to my preference.

## Acceptance Criteria

1. **Given** a learner navigates to their workspace, **When** the workspace loads, **Then** the workspace uses resizable split panels: editor + terminal on the left, tutor placeholder on the right (UX-11)
   - _Horizontal split: left panel (editor area ~70%) | right panel (tutor ~30%). Nested vertical split in left panel: top (editor placeholder ~70%) | bottom (terminal placeholder ~30%). All percentages are defaults — user can resize._
2. **And** the tutor panel collapses to 32px and is non-modal (UX-11)
   - _`collapsible={true}` on the tutor `ResizablePanel`. Collapsed state shows a tutor icon centered in the 32px strip. DOM always present — no conditional rendering. Expand/collapse via panel API._
3. **And** panels are resizable via `react-resizable-panels` or shadcn Resizable component
   - _Use shadcn Resizable component (wraps `react-resizable-panels` v4). Component added to `@mycscompanion/ui`. Minimum sizes: editor 40%, terminal 120px, tutor 32px collapsed._
4. **And** the workspace is responsive: full experience at >=1280px, tutor overlay at 1024-1279px, read-only mobile at <768px (UX-14)
   - _Breakpoint read ONCE on mount via `window.matchMedia` — NOT a reactive hook. No mid-session layout jump. >=1280px: resizable panels. 1024-1279px: tutor as fixed-position overlay (300px, click-outside-to-close). <768px: "Continue on desktop to build" message with read-only progress display._
5. **And** all animations respect `prefers-reduced-motion` (UX-25)
   - _Panel resize handles and any transition animations check `prefers-reduced-motion: reduce` media query. If reduced motion preferred, disable transitions on panel resize._
6. **And** loading indicators use a shared `useDelayedLoading` hook with a 500ms delay to prevent flash-of-spinner (UX-18)
   - _Hook: `useDelayedLoading(isLoading: boolean, delayMs?: number)` returns `showLoading: boolean`. Default delay 500ms. Only shows loading state if loading takes longer than the delay. Used by `WorkspaceSkeleton`._

## Tasks / Subtasks

- [x] Task 1: Install dependencies and add shadcn Resizable + Skeleton components to `@mycscompanion/ui` (AC: #3)
  - [x] 1.1 Install `react-resizable-panels` v4 in `packages/ui`: `pnpm --filter @mycscompanion/ui add react-resizable-panels`
  - [x] 1.2 Create `packages/ui/src/components/ui/resizable.tsx` — shadcn Resizable wrapper:
    ```typescript
    // Wraps react-resizable-panels v4 API
    // Exports: ResizablePanelGroup, ResizablePanel, ResizableHandle
    // v4 imports: Group, Panel, Separator (NOT PanelGroup/PanelResizeHandle)
    // v4 API: orientation="horizontal" (NOT direction), defaultSize="70%" (string, NOT number)
    import { Group, Panel, Separator } from 'react-resizable-panels'
    ```
  - [x] 1.3 Create `packages/ui/src/components/ui/skeleton.tsx` — shadcn Skeleton component:
    ```typescript
    // Simple div with animate-pulse and bg-muted
    function Skeleton({ className, ...props }: React.ComponentProps<'div'>) {
      return <div data-slot="skeleton" className={cn('bg-muted animate-pulse rounded-md', className)} {...props} />
    }
    ```
  - [x] 1.4 Do NOT add barrel exports to `@mycscompanion/ui` — import components individually per project-context anti-pattern rule

- [x] Task 2: Install `zustand` v5 in webapp and create Zustand stores (AC: #1, #2)
  - [x] 2.1 Install zustand: `pnpm --filter webapp add zustand`
  - [x] 2.2 Create `apps/webapp/src/stores/workspace-ui-store.ts`:
    ```typescript
    import { create } from 'zustand'

    type BreakpointMode = 'desktop' | 'small-desktop' | 'mobile'

    interface WorkspaceUIState {
      // Panel state
      tutorExpanded: boolean
      tutorAvailable: boolean // 3 visual states: collapsed, expanded, unavailable (retry button)
      activeTerminalTab: 'output' | 'criteria'
      // Breakpoint — set once on mount, no reactive updates
      breakpointMode: BreakpointMode
      // Actions
      setTutorExpanded: (expanded: boolean) => void
      toggleTutor: () => void
      setTutorAvailable: (available: boolean) => void
      setActiveTerminalTab: (tab: 'output' | 'criteria') => void
      setBreakpointMode: (mode: BreakpointMode) => void
    }

    const useWorkspaceUIStore = create<WorkspaceUIState>()((set) => ({
      tutorExpanded: true,
      tutorAvailable: true,
      activeTerminalTab: 'output',
      breakpointMode: 'desktop',
      setTutorExpanded: (expanded) => set({ tutorExpanded: expanded }),
      toggleTutor: () => set((state) => ({ tutorExpanded: !state.tutorExpanded })),
      setTutorAvailable: (available) => set({ tutorAvailable: available }),
      setActiveTerminalTab: (tab) => set({ activeTerminalTab: tab }),
      setBreakpointMode: (mode) => set({ breakpointMode: mode }),
    }))

    export { useWorkspaceUIStore }
    export type { WorkspaceUIState, BreakpointMode }
    ```
  - [x] 2.3 Create `apps/webapp/src/stores/editor-store.ts`:
    ```typescript
    import { create } from 'zustand'

    interface EditorState {
      content: string
      isDirty: boolean
      // Actions
      setContent: (content: string) => void
      markClean: () => void
    }

    const useEditorStore = create<EditorState>()((set) => ({
      content: '',
      isDirty: false,
      setContent: (content) => set({ content, isDirty: true }),
      markClean: () => set({ isDirty: false }),
    }))

    export { useEditorStore }
    export type { EditorState }
    ```
  - [x] 2.4 Exactly 2 stores — no more. `useWorkspaceUIStore` + `useEditorStore` per architecture mandate.

- [x] Task 3: Create the `useDelayedLoading` hook (AC: #6)
  - [x] 3.1 Create `apps/webapp/src/hooks/use-delayed-loading.ts`:
    ```typescript
    import { useEffect, useState } from 'react'

    function useDelayedLoading(isLoading: boolean, delayMs = 500): boolean {
      const [showLoading, setShowLoading] = useState(false)
      useEffect(() => {
        if (!isLoading) { setShowLoading(false); return }
        const timer = setTimeout(() => setShowLoading(true), delayMs)
        return () => clearTimeout(timer)
      }, [isLoading, delayMs])
      return showLoading
    }

    export { useDelayedLoading }
    ```
  - [x] 3.2 Create `apps/webapp/src/hooks/use-delayed-loading.test.ts` — test with `vi.useFakeTimers()`:
    - Loading becomes true, showLoading stays false until 500ms elapsed
    - Loading becomes false before 500ms — showLoading never becomes true
    - Loading becomes true and stays — showLoading true after delay
    - Custom delay value works

- [x] Task 4: Create `WorkspaceSkeleton` component (AC: #6)
  - [x] 4.1 Create `apps/webapp/src/components/workspace/WorkspaceSkeleton.tsx`:
    - Purpose-built skeleton matching the workspace 3-panel layout
    - Uses `Skeleton` from `@mycscompanion/ui/src/components/ui/skeleton` (import individually, NOT barrel)
    - Shows skeleton rectangles matching editor area, terminal area, and tutor panel
    - Full height layout (`h-screen` minus top bar height)
  - [x] 4.2 Create `apps/webapp/src/components/workspace/WorkspaceSkeleton.test.tsx`:
    - Renders without crashing
    - Contains skeleton elements with `animate-pulse`

- [x] Task 5: Create `WorkspaceTopBar` component (AC: #1)
  - [x] 5.1 Create `apps/webapp/src/components/workspace/WorkspaceTopBar.tsx`:
    ```typescript
    interface WorkspaceTopBarProps {
      readonly milestoneName: string
      readonly milestoneNumber: number
      readonly progress: number
      readonly onRun: () => void
      readonly onBenchmark: () => void
    }
    ```
    - Left: project name (`text-muted-foreground`) + milestone indicator (e.g., "Milestone 3: B-Tree Indexing — 60%")
    - Right: Run button (outline variant, `Cmd+Enter` tooltip) + Benchmark button (default/primary, `Cmd+Shift+Enter` tooltip)
    - Fixed height bar above resizable panels
    - Use `Button` from `@mycscompanion/ui/src/components/ui/button` (plain `title` attribute for tooltips — Tooltip component scaffolded in Epic 4+)
  - [x] 5.2 Create `apps/webapp/src/components/workspace/WorkspaceTopBar.test.tsx`:
    - Renders milestone name and progress
    - Run and Benchmark buttons call handlers on click
    - Responsive: at <768px, top bar is not rendered (mobile has no workspace)

- [x] Task 6: Create workspace layout with resizable panels (AC: #1, #2, #3, #5)
  - [x] 6.1 Create `apps/webapp/src/components/workspace/WorkspaceLayout.tsx`:
    - Import `ResizablePanelGroup`, `ResizablePanel`, `ResizableHandle` from `@mycscompanion/ui/src/components/ui/resizable`
    - **Desktop layout (>=1280px):**
      ```
      ┌─────────────────────────────────────┐
      │          WorkspaceTopBar            │
      ├────────────────────┬────────────────┤
      │                    │                │
      │   Editor Area      │  Tutor Panel   │
      │   (placeholder)    │  (placeholder) │
      │                    │                │
      ├────────────────────┤                │
      │   Terminal Panel   │  (collapsible  │
      │   (placeholder)    │   to 32px)     │
      │                    │                │
      └────────────────────┴────────────────┘
      ```
    - Outer: `ResizablePanelGroup orientation="horizontal"` — left panel (editor+terminal) + right panel (tutor)
    - Left panel: nested `ResizablePanelGroup orientation="vertical"` — top (editor) + bottom (terminal)
    - Right panel: `collapsible={true}`, `collapsedSize` equivalent to 32px, `minSize` for expanded ~20%
    - Tutor collapsed state: centered icon (e.g., Lucide `MessageCircle` or `Bot` icon) in the 32px strip
    - All resize handles get `ResizableHandle withHandle` for visible drag indicators
    - Panel resize transitions respect `prefers-reduced-motion` via CSS: `@media (prefers-reduced-motion: reduce) { transition: none !important; }`
    - Editor and terminal areas render placeholder divs with labels — actual components come in Stories 3.6 and 3.7
    - Tutor `unavailable` state: when `!tutorAvailable`, show "AI tutor temporarily unavailable" message + retry button (visual scaffold — wired to SSE in Epic 6)
    - Use `usePanelRef()` from `react-resizable-panels` for tutor panel imperative handle (NOT `useRef` + `ref`)
    - Detect collapse/expand via `onResize` callback (NOT `onCollapse`/`onExpand` — removed in v4)
  - [x] 6.1b Wire workspace keyboard shortcuts via `useEffect` + `document.addEventListener('keydown', ...)`:
    - `Cmd+/` / `Ctrl+/` → `toggleTutor()` (prevent default)
    - `Escape` → `setTutorExpanded(false)` only when tutor is expanded
    - `Cmd+Enter` / `Ctrl+Enter` → call `onRun` prop (no-op placeholder for Story 3.7)
    - `Cmd+Shift+Enter` / `Ctrl+Shift+Enter` → call `onBenchmark` prop (no-op placeholder for Epic 7)
    - Cleanup: remove listener on unmount
  - [x] 6.2 **Small desktop layout (1024-1279px):**
    - Editor + terminal use same resizable vertical split (no horizontal resizable — tutor is overlay)
    - Tutor rendered as fixed-position overlay: `position: fixed`, `width: 300px`, `right: 0`, `top: {topBarHeight}`, `height: calc(100vh - {topBarHeight})`, solid background, left border shadow
    - `z-index` above editor, below top bar
    - Click-outside-to-close via `onPointerDownOutside` handler (pointer event on the overlay backdrop area)
    - Close button more prominent at this breakpoint
    - Expand/collapse controlled by `useWorkspaceUIStore.tutorExpanded`
  - [x] 6.3 **Mobile layout (<768px):**
    - No editor, no terminal, no resizable panels
    - Show: milestone progress summary + "Continue on desktop to build" message
    - Read-only: milestone brief text, criteria status (placeholder), progress percentage
    - Use a simple single-column layout
  - [x] 6.4 **Breakpoint detection (read once on mount):**
    ```typescript
    // In WorkspaceLayout or Workspace route:
    useEffect(() => {
      const width = window.innerWidth
      if (width >= 1280) setBreakpointMode('desktop')
      else if (width >= 1024) setBreakpointMode('small-desktop')
      else setBreakpointMode('mobile')
    }, []) // Empty deps — read ONCE, no resize listener
    ```
    - Store result in `useWorkspaceUIStore.breakpointMode`
    - Conditionally render layout based on mode — not CSS media queries for structural changes
  - [x] 6.5 Create `apps/webapp/src/components/workspace/WorkspaceLayout.test.tsx`:
    - Desktop: renders ResizablePanelGroup with horizontal orientation
    - Desktop: tutor panel is collapsible
    - Small desktop: renders overlay tutor panel
    - Mobile: renders read-only message, no resizable panels
    - Mock `window.matchMedia` or `window.innerWidth` for breakpoint tests

- [x] Task 7: Create `Workspace` route component (AC: #1, #6)
  - [x] 7.1 Create `apps/webapp/src/routes/Workspace.tsx`:
    - Route component for `/workspace/:milestoneId`
    - Uses `React.lazy()` — this entire route is lazy-loaded
    - Fetches workspace data via TanStack Query: `GET /api/workspace/:milestoneId`
    - Loading state: uses `useDelayedLoading` hook → shows `WorkspaceSkeleton` only after 500ms delay
    - Error state: dedicated error UI (not generic spinner)
    - Passes data down to `WorkspaceLayout` — no component self-fetching (data flows from route)
    - Query key pattern: `['workspace', 'get', milestoneId]`
    - **API does NOT exist yet** — use a placeholder TanStack Query that returns mock data for now. The actual API (`GET /api/workspace/:milestoneId`) comes in Epic 4. For this story, the workspace route should render the layout with placeholder content.
  - [x] 7.2 Register route in `apps/webapp/src/App.tsx`:
    - Add: `const Workspace = React.lazy(() => import('./routes/Workspace.js'))`
    - Add route: `<Route path="/workspace/:milestoneId" element={<ProtectedRoute><Suspense fallback={<WorkspaceSkeleton />}><Workspace /></Suspense></ProtectedRoute>} />`
    - Import `Suspense` from React
    - The `React.lazy` boundary catches the lazy import. `Suspense` provides fallback while chunk loads.
  - [x] 7.3 Create `apps/webapp/src/routes/Workspace.test.tsx`:
    - Renders WorkspaceLayout when data is available
    - Shows WorkspaceSkeleton during loading (after delay)
    - Shows error state on fetch failure

- [x] Task 8: Verify all tests pass and run quality checks
  - [x] 8.1 Run webapp tests: `pnpm --filter webapp test`
  - [x] 8.2 Run typecheck: `pnpm typecheck`
  - [x] 8.3 Run lint: `pnpm lint`
  - [x] 8.4 Run full pipeline: `turbo lint && turbo typecheck && turbo test`

## Dev Notes

### Architecture Compliance

**Route:** `/workspace/:milestoneId` — lazy-loaded via `React.lazy()` per architecture spec.

**State management — hard rule followed:**
- Server state → TanStack Query (workspace data, milestone content)
- UI state → Zustand (exactly 2 stores: `useWorkspaceUIStore`, `useEditorStore`)
- Never server data in Zustand. Never UI state in TanStack Query.

**Component organization:** By feature — all workspace components in `components/workspace/`. Common components in `components/common/`.

**Plugin isolation (backend):** N/A — this is a frontend-only story.

**No barrel imports from `@mycscompanion/ui`:** Import each component individually. Path includes `/src/` because `packages/ui/package.json` has no `exports` field — the tsconfig path `@mycscompanion/ui/*` resolves to `./packages/ui/*`:
```typescript
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '@mycscompanion/ui/src/components/ui/resizable'
import { Skeleton } from '@mycscompanion/ui/src/components/ui/skeleton'
import { Button } from '@mycscompanion/ui/src/components/ui/button'
```

**Named exports only** — no default exports. Exception: route components use `export default` for `React.lazy()` dynamic imports (React.lazy requires default export).

### react-resizable-panels v4 API (CRITICAL)

**v4 breaking changes from v2/v3:**
- Import `Group`, `Panel`, `Separator` (NOT `PanelGroup`, `PanelResizeHandle`)
- Prop `orientation` (NOT `direction`)
- Size props accept `number | string` — **numbers mean pixels, strings mean percentages**:
  - `defaultSize="70%"` = 70% of container (correct for layout)
  - `defaultSize={70}` = 70 pixels (almost certainly wrong for layout)
  - `minSize="20%"` / `maxSize="80%"` — use strings for percentage-based sizing
  - `collapsedSize={32}` — use number for pixel-based collapsed size (32px)
- **Imperative API changed:** Use `usePanelRef()` hook + `panelRef` prop (NOT `useRef` + `ref`):
  ```typescript
  import { usePanelRef } from 'react-resizable-panels'
  const tutorPanelRef = usePanelRef()
  <Panel panelRef={tutorPanelRef} collapsible={true}>...</Panel>
  // Later: tutorPanelRef.current?.expand() / .collapse()
  ```
- **`onCollapse` and `onExpand` callbacks REMOVED** — use `onResize` instead:
  ```typescript
  <Panel onResize={(prevSize, nextSize) => {
    // Compare sizes to detect collapse/expand transitions
    if (nextSize.asPercentage === 0) { /* collapsed */ }
  }}>
  ```
- `autoSaveId` removed — layout persistence uses `onLayoutChange` callbacks instead (not needed for this story)

**shadcn wrapper re-exports these as:**
- `ResizablePanelGroup` → wraps `Group`
- `ResizablePanel` → wraps `Panel`
- `ResizableHandle` → wraps `Separator`

The wrapper abstracts the v4 API so consumers use the familiar shadcn names.

### Zustand v5 Setup

**Key changes in Zustand v5:**
- `create` function imported directly: `import { create } from 'zustand'`
- TypeScript: `create<StateType>()((set) => ({ ... }))` — note the double parentheses for type inference
- Selector-based subscriptions: `useWorkspaceUIStore((state) => state.tutorExpanded)` — prevents unnecessary re-renders

### Workspace Loading Strategy

**Two distinct loading phases — do NOT conflate:**

**Phase 1 — Chunk download (Suspense):**
`React.lazy()` triggers chunk download. `Suspense fallback={<WorkspaceSkeleton />}` shows skeleton while JS loads. This is the ONLY use of `WorkspaceSkeleton`.

**Phase 2 — Data loading (content-before-tools pattern):**
Once the chunk loads and the component mounts, the architecture requires **immediate rendering of lightweight content** (milestone brief, criteria) while heavier tools (Monaco) load separately. Do NOT show a second skeleton during data fetch. Instead:
1. Milestone brief text + CriteriaPanel render immediately from API response
2. Monaco editor area shows `WorkspaceSkeleton` (editor-sized) while lazy-loading
3. `useDelayedLoading` applies to the API data fetch — if data arrives within 500ms, no loading indicator at all

**For this story:** The API doesn't exist yet. Use a mock/placeholder that immediately returns static data. The loading flow is scaffolded but the real API integration comes in Epic 4. Render placeholder text in the editor/terminal areas to simulate the content-before-tools pattern.

### Breakpoint Strategy — Read Once on Mount

Per UX spec: breakpoint is read ONCE on mount via `window.innerWidth`. No reactive `useMediaQuery` hook. No resize listener. Rationale: nobody resizes their browser while coding. A mid-session layout jump (resizable → overlay) would be jarring. If user wants the other layout, they refresh.

```typescript
// DO THIS:
useEffect(() => {
  const width = window.innerWidth
  // ... set breakpoint mode
}, [])

// DO NOT DO THIS:
const isDesktop = useMediaQuery('(min-width: 1280px)') // ❌ reactive
```

### Panel Size Configuration

| Panel | Default | Min | Max | Notes |
|-------|---------|-----|-----|-------|
| Editor+Terminal (left) | 70% | 40% | 80% | Contains nested vertical split |
| Editor (top of left) | 70% of left | 40% | 90% | Placeholder for Monaco (Story 3.6) |
| Terminal (bottom of left) | 30% of left | 120px equiv | 60% | Placeholder for terminal output (Story 3.7) |
| Tutor (right) | 30% | 20% | 50% | Collapsible to 32px |

### Tutor Panel States (3 visual states)

**State 1 — Expanded:** Full tutor panel content visible. Default state on workspace load.

**State 2 — Collapsed:** `ResizablePanel` at `collapsedSize={32}` (32 pixels). Shows centered Lucide `MessageCircle` icon in the narrow strip. Clicking the strip expands via `tutorPanelRef.current?.expand()` (v4 imperative API using `usePanelRef()` + `panelRef` prop).

**State 3 — Unavailable:** Distinct visual state with "AI tutor temporarily unavailable" message + retry button. Scaffolded now, wired to SSE connection failure in Epic 6. Controlled by `useWorkspaceUIStore.tutorAvailable`.

**Collapse/expand detection (v4 pattern):** Use `onResize` callback (NOT `onCollapse`/`onExpand` — removed in v4):
```typescript
const tutorPanelRef = usePanelRef()
<ResizablePanel
  panelRef={tutorPanelRef}
  collapsible={true}
  collapsedSize={32}
  defaultSize="30%"
  minSize="20%"
  onResize={(prevSize, nextSize) => {
    const isNowCollapsed = nextSize.asPercentage === 0
    setTutorExpanded(!isNowCollapsed)
  }}
>
```

**Future story hooks:**
- Stage 1 stuck signal (Epic 6): green tint on collapsed strip — `bg-primary/10` with `text-primary` icon color
- Stage 2 auto-expand (Epic 6): `tutorPanelRef.current?.expand()` called from stuck detection timer
- Focus management (Epic 6): auto-expand does NOT steal focus from editor

### Small Desktop Overlay Implementation

```typescript
// 1024-1279px: Tutor as fixed-position overlay
{breakpointMode === 'small-desktop' && tutorExpanded && (
  <div
    className="fixed right-0 top-[var(--topbar-height)] w-[300px] h-[calc(100vh-var(--topbar-height))] bg-background border-l shadow-lg z-40"
    // No backdrop — editor stays visible for code reference
  >
    {/* Tutor placeholder content */}
    <button onClick={() => setTutorExpanded(false)}>Close</button>
  </div>
)}
```

- Click-outside-to-close: `onPointerDown` handler on the main content area when overlay is open
- No semi-transparent backdrop — editor remains visible
- `z-index: 40` (above editor, below any modals)

### prefers-reduced-motion Compliance

Add to `packages/ui/src/globals.css` or workspace-specific styles:
```css
@media (prefers-reduced-motion: reduce) {
  [data-panel-group] *,
  [data-resize-handle] * {
    transition-duration: 0ms !important;
    animation-duration: 0ms !important;
  }
}
```

This blanket rule ensures all panel resize animations and transitions respect the user's motion preference.

### Component Tree — Sibling Constraint (CRITICAL for Stories 3.6/3.7)

CriteriaPanel + milestone brief are **SIBLINGS** of the lazy Monaco boundary, NOT children:

```
WorkspaceLayout
├── WorkspaceTopBar
├── ResizablePanelGroup (horizontal)
│   ├── ResizablePanel (left — editor+terminal)
│   │   ├── ResizablePanelGroup (vertical)
│   │   │   ├── ResizablePanel (top — editor area)
│   │   │   │   ├── MilestoneBrief ← renders IMMEDIATELY (sibling, not child of Monaco)
│   │   │   │   └── CodeEditor (Monaco) ← lazy-loaded, shows skeleton while loading
│   │   │   ├── ResizableHandle
│   │   │   └── ResizablePanel (bottom — terminal)
│   │   │       ├── Tab: "Output" ← streaming compilation output (Story 3.7)
│   │   │       └── Tab: "Criteria" ← CriteriaList (sibling to Output, not to Monaco)
│   ├── ResizableHandle
│   └── ResizablePanel (right — tutor, collapsible)
│       └── TutorPanel (3 states: expanded, collapsed, unavailable)
```

Story 3.5 creates this structure with placeholders. Stories 3.6/3.7 fill in the actual components. The key constraint: brief and criteria render OUTSIDE the Monaco lazy boundary so they appear instantly.

### Keyboard Shortcuts (Scaffold)

Wire these workspace-level shortcuts in `WorkspaceLayout` via `useEffect` + `document.addEventListener('keydown', ...)`:

| Shortcut | Action | Scope | Story |
|----------|--------|-------|-------|
| `Cmd+Enter` / `Ctrl+Enter` | Run (compile + execute) | Workspace only | 3.7 (wire to submit) |
| `Cmd+Shift+Enter` / `Ctrl+Shift+Enter` | Benchmark | Workspace only | Epic 7 |
| `Cmd+/` / `Ctrl+/` | Toggle tutor panel | Workspace only | **3.5 (this story)** |
| `Escape` | Collapse tutor panel (if expanded) | Workspace only | **3.5 (this story)** |

For this story: implement `Cmd+/` (toggle tutor via `toggleTutor()`) and `Escape` (collapse tutor via `setTutorExpanded(false)` — only when tutor is expanded and no other modal/widget is open). Run and Benchmark are no-ops wired to the `onRun`/`onBenchmark` props passed down from the route.

### Previous Story Intelligence (Story 3.4)

**Relevant patterns for this story:**
1. **SSE Event types** — the workspace will eventually consume these via `useSSE` hook (Epic 3.7/3.8). This story scaffolds the terminal panel placeholder where streaming output will appear.
2. **Error two-tier presentation** — the terminal panel will need to show user-code errors with human-readable interpretation above collapsible raw output (Story 3.7). This story just creates the terminal placeholder.
3. **`import type` for barrel imports** — continue using `import type` when importing types from `@mycscompanion/execution` or `@mycscompanion/shared`.

**Debug learnings from 3.4:**
- `.js` extensions required in all internal imports (ESM)
- `vi.restoreAllMocks()` in `afterEach` — always
- Mock factories for each dependency — follow established pattern

### Git Intelligence

**Recent commit pattern:** `Implement Story X.Y: <title> with code review fixes`

**Files from recent stories:**
- `apps/webapp/src/App.tsx` — router with protected routes, lazy loading pattern NOT yet used
- `apps/webapp/src/components/common/ProtectedRoute.tsx` — auth + onboarding gating
- `apps/webapp/src/hooks/use-auth.ts`, `use-onboarding-status.ts` — existing hooks pattern
- `apps/webapp/src/lib/api-fetch.ts` — `apiFetch` with Firebase token attachment

**Established frontend patterns:**
- Component files: `PascalCase.tsx` with co-located `.test.tsx`
- Hooks: `use-kebab-case.ts` with co-located `.test.ts`
- Stores: `kebab-case-store.ts` in `stores/` directory
- Routes: `PascalCase.tsx` in `routes/` directory
- Inline skeleton pattern: `bg-muted rounded animate-pulse` (used in ProtectedRoute, Onboarding)
- Testing with `@testing-library/react` + `vitest` + `jsdom` environment
- Mocking via `vi.mock()` at top level — existing tests do NOT use `TestProviders` wrapper
- Route tests wrapped in `MemoryRouter` with `initialEntries`

### Latest Technical Information

**react-resizable-panels v4.7.0** (latest as of 2026-03-04):
- v4 is a major version with breaking API changes from v2/v3
- Import names changed: `Group`, `Panel`, `Separator`
- Props renamed: `orientation` instead of `direction`
- Size values: `number` = pixels, `string` = percentages — use `"70%"` for layout, `{32}` for pixel sizes
- Imperative API: `usePanelRef()` + `panelRef` prop (NOT `useRef` + `ref`)
- `onCollapse`/`onExpand` removed — use `onResize` callback with size comparison
- `autoSaveId` removed — use `onLayoutChange` callbacks
- TypeScript-native

**Zustand v5.0.11** (latest as of 2026-03-04):
- No middleware needed for this use case (no persistence, no devtools required for MVP)
- `create` function with TypeScript generics
- Selector-based subscriptions prevent re-renders: `useStore((s) => s.field)`

**shadcn/ui Resizable + react-resizable-panels v4 compatibility:**
- There were known compatibility issues (GitHub issues #9118, #9136, #9197) when shadcn CLI generated v2 code but v4 was installed
- Solution: write the Resizable component manually using v4 API (`Group`, `Panel`, `Separator`) with shadcn-style wrapper names

### Project Structure Notes

- New files follow existing `components/workspace/` directory pattern from architecture spec
- No new packages created (exactly 4: ui, shared, execution, config)
- No new Zustand stores beyond the 2 mandated (useWorkspaceUIStore, useEditorStore)
- Test co-located: `*.test.tsx` next to source
- Route component uses `export default` for `React.lazy()` — only exception to "named exports only" rule

### Testing Strategy

**Test environment:** `jsdom` with `@testing-library/jest-dom/vitest` setup file (configured in `apps/webapp/vitest.config.ts`).

**Existing patterns to follow (verified from codebase):**
- Mock dependencies with `vi.mock()` at top level — mock hooks return `vi.fn()` + `.mockReturnValue()`
- Wrap route tests in `MemoryRouter` with `initialEntries` (NOT `BrowserRouter`)
- Create helper `renderXxx()` functions for DRY test setup
- Use `userEvent.setup()` for interaction tests, `waitFor()` for async
- Query by `screen.getByRole()` / `screen.getByText()` — accessibility-first
- `afterEach`: call both `cleanup()` from `@testing-library/react` and `vi.restoreAllMocks()`
- DOM polyfills needed for Radix UI / react-resizable-panels in `beforeAll`:
  ```typescript
  globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} }
  Element.prototype.scrollIntoView = vi.fn()
  Element.prototype.hasPointerCapture = vi.fn().mockReturnValue(false)
  Element.prototype.setPointerCapture = vi.fn()
  Element.prototype.releasePointerCapture = vi.fn()
  ```
- Existing tests do NOT use `TestProviders` wrapper — they mock API calls directly with `vi.fn()`. Use `TestProviders` only if TanStack Query is needed in the component under test.

**What to test:**
- `useDelayedLoading`: timer behavior with `vi.useFakeTimers()`, cleanup on unmount via `renderHook` + `unmount()`
- `WorkspaceSkeleton`: renders skeleton layout matching panel structure
- `WorkspaceTopBar`: renders milestone info, button click handlers via `userEvent.click()`
- `WorkspaceLayout`: renders correct layout per breakpoint mode (mock `window.innerWidth`), tutor collapse/expand
- `Workspace` route: renders WorkspaceLayout (wrap in `MemoryRouter` with `/workspace/test-milestone`)

**What NOT to test:**
- `react-resizable-panels` resize behavior (library's responsibility)
- CSS media queries (use breakpoint mode from store)
- Actual pixel measurements

**Mock boundary rule:** Only mock what you don't own:
- Mock `window.innerWidth` for breakpoint detection
- Mock `apiFetch` for API calls
- Do NOT mock React state hooks or Zustand internals

### References

- [Source: _bmad-output/planning-artifacts/architecture.md — Frontend Architecture, State Management]
- [Source: _bmad-output/planning-artifacts/architecture.md — React Frontend Directory Structure]
- [Source: _bmad-output/planning-artifacts/architecture.md — Monaco Editor, Workspace Reveal Staging]
- [Source: _bmad-output/planning-artifacts/architecture.md — SSE Client Pattern (useSSE)]
- [Source: _bmad-output/planning-artifacts/architecture.md — API Data Endpoints, Single-Fetch Screen Pattern]
- [Source: _bmad-output/planning-artifacts/architecture.md — Complete Project Structure, Workspace Components]
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md — Layout Principles, No Grid System]
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md — Responsive Behavior, 3 Breakpoints]
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md — Workspace Implementation Approach]
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md — Collapsed Tutor Implementation]
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md — Workspace Components Table, Breakpoint Behavior]
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md — Tutor Layout Switch at 1024px]
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md — WorkspaceTopBar Component Spec]
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md — TutorPanel Component Spec]
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md — CriteriaList Component Spec]
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md — Terminal Panel Tab Labels]
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md — Focus Management, Workspace Tab Order]
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md — Data Flow Architecture]
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md — Component Strategy, Design System Table (Resizable)]
- [Source: _bmad-output/planning-artifacts/epics.md — Epic 3, Story 3.5 Acceptance Criteria]
- [Source: _bmad-output/project-context.md — State Split Rule, Zustand Stores, Component Patterns]
- [Source: _bmad-output/project-context.md — Testing Rules, Anti-Patterns]
- [Source: _bmad-output/project-context.md — Import Path Conventions, No @/ Aliases]
- [Source: _bmad-output/implementation-artifacts/3-4-submission-api-and-sse-streaming.md — Previous Story Patterns]
- [Source: npm — react-resizable-panels v4.7.0]
- [Source: npm — zustand v5.0.11]
- [Source: shadcn/ui — Resizable component documentation, v4 migration]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6

### Debug Log References

- `lucide-react` not in webapp dependencies — installed as webapp dependency (icons needed in workspace components)
- `react-resizable-panels` types (PanelSize) not resolvable from webapp — re-exported from `@mycscompanion/ui/src/components/ui/resizable`
- `.js` extension in imports NOT needed for webapp (moduleResolution: "bundler") — only needed in backend (ESM)
- v4 `onResize` signature is `(panelSize: PanelSize, id, prevPanelSize)` — different from Dev Notes which showed `(prevSize, nextSize)`
- `export default` lint rule violation — added eslint-disable comment per documented exception for React.lazy()

### Completion Notes List

- Installed `react-resizable-panels` v4.7.1 in packages/ui
- Created shadcn-style `ResizablePanelGroup`, `ResizablePanel`, `ResizableHandle` wrappers using v4 API (Group, Panel, Separator)
- Created `Skeleton` component with data-slot attribute for testing
- Re-exported `PanelSize` type and `usePanelRef` hook from resizable wrapper
- Added `prefers-reduced-motion` CSS rule in globals.css for panel animations (AC #5) — fixed selectors to match v4 data attributes (`[data-group]`, `[data-separator]`)
- Installed `zustand` v5 in webapp — created exactly 2 stores per architecture mandate
- `useWorkspaceUIStore`: panel state, breakpoint mode, tutor states
- `useEditorStore`: content and dirty tracking
- Created `useDelayedLoading` hook with 6 comprehensive tests (timer-based with vi.useFakeTimers)
- Created `WorkspaceSkeleton` matching 3-panel layout with 3 tests
- Created `WorkspaceTopBar` with milestone info, Run/Benchmark buttons with keyboard shortcut tooltips, 4 tests
- Created `WorkspaceLayout` with 3 responsive breakpoints:
  - Desktop (>=1280px): full resizable panels with collapsible tutor
  - Small desktop (1024-1279px): vertical split + overlay tutor with click-outside-to-close
  - Mobile (<768px): read-only progress display + "Continue on desktop" message
- Tutor panel implements all 3 visual states: expanded, collapsed (32px with icon), unavailable (retry button)
- Keyboard shortcuts: Ctrl+/ (toggle tutor), Escape (collapse tutor), Ctrl+Enter (run), Ctrl+Shift+Enter (benchmark)
- Breakpoint detection: read once on mount via window.innerWidth (no resize listener per spec)
- Created `Workspace` route with placeholder TanStack Query + `useDelayedLoading` + error state UI, registered as React.lazy in App.tsx
- Added `QueryClientProvider` to App.tsx wrapping the router
- All 144 webapp tests pass (28 new tests added), 0 regressions
- All typechecks pass across all 7 packages
- No new lint errors introduced (pre-existing errors in firebase.test.ts and NotReady.tsx unchanged)
- Installed `lucide-react` in webapp for workspace icons

### File List

New files:
- packages/ui/src/components/ui/resizable.tsx
- packages/ui/src/components/ui/skeleton.tsx
- apps/webapp/src/stores/workspace-ui-store.ts
- apps/webapp/src/stores/editor-store.ts
- apps/webapp/src/hooks/use-delayed-loading.ts
- apps/webapp/src/hooks/use-delayed-loading.test.ts
- apps/webapp/src/components/workspace/WorkspaceSkeleton.tsx
- apps/webapp/src/components/workspace/WorkspaceSkeleton.test.tsx
- apps/webapp/src/components/workspace/WorkspaceTopBar.tsx
- apps/webapp/src/components/workspace/WorkspaceTopBar.test.tsx
- apps/webapp/src/components/workspace/WorkspaceLayout.tsx
- apps/webapp/src/components/workspace/WorkspaceLayout.test.tsx
- apps/webapp/src/routes/Workspace.tsx
- apps/webapp/src/routes/Workspace.test.tsx

Modified files:
- apps/webapp/src/App.tsx (added Workspace route with React.lazy + Suspense)
- packages/ui/src/globals.css (added prefers-reduced-motion CSS rule)
- packages/ui/package.json (added react-resizable-panels dependency)
- apps/webapp/package.json (added zustand, lucide-react dependencies)
- pnpm-lock.yaml (updated with new dependencies)

### Change Log

- 2026-03-04: Implemented Story 3.5 — Workspace Layout & Resizable Panels. Created full workspace infrastructure with resizable panels, 3 responsive breakpoints, Zustand state management, keyboard shortcuts, and 25 new tests.
- 2026-03-04: Code review fixes (9 issues). Fixed: prefers-reduced-motion CSS selectors for v4 attributes, Workspace route now uses TanStack Query + useParams + useDelayedLoading + error state, added QueryClientProvider to App.tsx, added keyboard shortcut tests for Ctrl+Enter and Ctrl+Shift+Enter, added missing vi.restoreAllMocks() in WorkspaceSkeleton.test.tsx. Total: 144 tests passing (28 new).
