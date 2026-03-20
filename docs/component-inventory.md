# Component Inventory — mycscompanion

**Generated:** 2026-03-20 | **Scan Level:** Exhaustive

## UI Library (`packages/ui`) — 13 Components

shadcn/ui-based components with Radix UI primitives and Tailwind CSS v4.

| Component | Source | Dependencies | Description |
|---|---|---|---|
| `AlertDialog` | Radix AlertDialog | radix-ui | Confirmation modal with overlay |
| `Button` | CVA + Radix Slot | class-variance-authority | 6 variants (default, destructive, outline, secondary, ghost, link), 5 sizes (default, xs, sm, lg, icon) |
| `Card` | Custom | — | Composable: Card, CardHeader, CardTitle, CardDescription, CardAction, CardContent, CardFooter. Container queries. |
| `Collapsible` | Radix Collapsible | radix-ui | Expandable/collapsible content |
| `Dialog` | Radix Dialog | radix-ui | Modal dialog with overlay |
| `Input` | Native | — | Text input with file/ring styling |
| `Label` | Radix Label | radix-ui | Form label with disabled states |
| `RadioGroup` | Radix RadioGroup | radix-ui | Radio button group |
| `Resizable` | react-resizable-panels | react-resizable-panels | Resizable panel layout (horizontal/vertical) |
| `ScrollArea` | Radix ScrollArea | radix-ui | Scrollable container with iOS-style scrollbars |
| `Select` | Radix Select | radix-ui | Dropdown select with trigger, content, items |
| `Separator` | Radix Separator | radix-ui | Horizontal/vertical divider |
| `Skeleton` | Custom | — | Animated loading placeholder |

**Utility:** `cn(...classes)` — `clsx` + `tailwind-merge` for conflict-free class merging.

---

## Webapp Components (`apps/webapp/src/components/`)

### Workspace Components (20+)

Core interactive IDE experience — the primary user interface.

| Component | File | Description |
|---|---|---|
| `WorkspaceLayout` | workspace/WorkspaceLayout.tsx | Main container with resizable panels, keyboard shortcuts (Cmd+/, Cmd+Enter, Cmd+Shift+Enter, Escape) |
| `WorkspaceTopBar` | workspace/WorkspaceTopBar.tsx | Header with milestone title, progress bar, run/benchmark buttons |
| `CodeEditor` | workspace/CodeEditor.tsx | Monaco editor wrapper for Go. Syncs to Zustand store. Cmd+Enter → Run. Escape → release focus. Read-only for non-editable files. |
| `FileTabs` | workspace/FileTabs.tsx | Multi-file tab bar (M2+ milestones). Active file switching. |
| `TerminalPanel` | workspace/TerminalPanel.tsx | 5-tab output panel: Brief, Diagrams, Output, History, Criteria. Auto-scroll, keyboard navigation. |
| `TutorPanel` | workspace/TutorPanel.tsx | AI tutor chat interface. Infinite scroll pagination. SSE streaming. Auto-recovery probe. Expandable/collapsible (Cmd+/). |
| `TutorMessage` | workspace/TutorMessage.tsx | Message bubble with explainer diagram refs (`[explainer:file.svg]`) |
| `TutorInput` | workspace/TutorInput.tsx | Message input (2000 char limit), send button, disabled during streaming |
| `TutorExplainerCard` | workspace/TutorExplainerCard.tsx | Expandable card with embedded SVG concept diagram |
| `ConceptExplainers` | workspace/ConceptExplainers.tsx | Gallery of all concept diagrams for current milestone |
| `ConceptExplainerDialog` | workspace/ConceptExplainerDialog.tsx | Full-screen modal for viewing diagrams |
| `BenchmarkHeroDisplay` | workspace/BenchmarkHeroDisplay.tsx | Large benchmark result card (ops/sec, normalized ratio, latency) |
| `BenchmarkHistoryList` | workspace/BenchmarkHistoryList.tsx | Paginated list of historical benchmark runs |
| `ErrorPresentation` | workspace/ErrorPresentation.tsx | Formatted Go compilation/runtime errors with human interpretations |
| `MilestoneBrief` | workspace/MilestoneBrief.tsx | Markdown rendering of milestone description (react-markdown + remark-gfm) |
| `WorkspaceSkeleton` | workspace/WorkspaceSkeleton.tsx | Animated loading skeleton |

**Workspace Utilities:**
- `monaco-theme.ts` — Custom dark theme (WCAG AA/AAA contrast, oklch colors)
- `parse-go-error.ts` — Go error parser with human-readable explanations
- `workspace-a11y.ts` — ARIA live region announcements for screen readers

### Overview Components

| Component | Description |
|---|---|
| `FirstTimeOverview` | Welcome page for first-time users (no milestones completed) |
| `MilestoneStartOverview` | Current/next milestone preview with brief excerpt |
| `TrajectoryChart` | Benchmark progression line chart + sortable data table |
| `OverviewError` | Error boundary fallback with retry button |
| `OverviewSkeleton` | Animated loading skeleton |

### Progress Components

| Component | Description |
|---|---|
| `ProgressView` | Main milestone list page with status badges |
| `MilestoneProgressItem` | Individual milestone card (title, status, brief excerpt) |
| `ProgressSkeleton` | Loading skeleton |

### Onboarding Components

| Component | Description |
|---|---|
| `SkillFloorCheck` | 3-question Go assessment (loops, slices, maps). 2/3 required to pass. |

### Settings Components

| Component | Description |
|---|---|
| `DeleteAccountDialog` | Confirmation modal for account deletion |
| `AccountSettingsSkeleton` | Loading skeleton |

### Common Components

| Component | Description |
|---|---|
| `ProtectedRoute` | Two-level auth gate: (1) Firebase auth check → /sign-in, (2) Onboarding status → /onboarding or /not-ready |

---

## Webapp Hooks (27)

### Authentication & Account

| Hook | Purpose |
|---|---|
| `useAuth` | Firebase auth state listener, token refresh on tab focus |
| `useOnboardingStatus` | Check onboarding completion + skill floor status |
| `useAccountProfile` | TanStack Query: fetch user profile |
| `useAccountDeletion` | Mutation: delete account |
| `useDataExport` | Export user data with status polling |

### Workspace & Editor

| Hook | Purpose |
|---|---|
| `useAutoSave` | Debounced code snapshot save (30s) with retries |
| `useSubmitCode` | Full execution orchestrator (submit → SSE → results) |
| `useSSE` | Generic SSE connection with exponential backoff reconnect |
| `useBenchmarkProgress` | Benchmark iteration timer & state machine |
| `useStuckDetection` | Two-stage stuck detection (10min threshold + 60s offset) |
| `useStuckIntervention` | Auto-hint SSE stream on Stage 2 trigger |
| `useSession` | Create or retrieve active session |
| `useAutoScroll` | Auto-scroll container to bottom on new content |
| `useDelayedLoading` | Debounce loading state to prevent flash |
| `usePreviousBenchmark` | Fetch latest benchmark result for comparison |

### Tutor

| Hook | Purpose |
|---|---|
| `useTutorStream` | SSE streaming for tutor chat (text_delta, message_complete) |
| `useTutorMessages` | Infinite paginated message history |
| `useTutorRecovery` | Health probe loop (30s) when tutor unavailable |

### Data Fetching

| Hook | Purpose |
|---|---|
| `useOverviewData` | Fetch overview (current/next milestone) |
| `useCompletionData` | Fetch completion summary |
| `useCompleteMilestone` | Mutation: mark milestone complete + navigate |
| `useTrackProgress` | Fetch all milestone progress |
| `useTrajectoryData` | Fetch benchmark trajectory data |
| `useHistoricalBenchmarks` | Infinite paginated benchmark history |

---

## Webapp Zustand Stores (2)

### `useEditorStore`

```typescript
{
  content: string               // Current file content
  isDirty: boolean              // Has unsaved changes
  cursorPosition: { line, column }
  pendingReset: string | null   // Code to reset to
  files: Record<string, string> // M2: all files
  activeFile: string            // M2: currently visible file
  editableFiles: string[]       // M2: which files can be edited
}
```

### `useWorkspaceUIStore`

```typescript
{
  tutorExpanded: boolean        // Tutor panel open/closed
  tutorAvailable: boolean       // Tutor service available
  activeTerminalTab: 'brief' | 'diagrams' | 'output' | 'history' | 'criteria'
  breakpointMode: 'desktop' | 'small-desktop' | 'mobile'
}
```
