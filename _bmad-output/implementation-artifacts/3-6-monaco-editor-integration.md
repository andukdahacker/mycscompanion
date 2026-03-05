# Story 3.6: Monaco Editor Integration

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **learner**,
I want a code editor with Go syntax highlighting and keyboard shortcuts,
so that I can write code efficiently in my browser.

## Acceptance Criteria

1. **Given** the workspace layout is rendered (Story 3.5), **When** the Monaco editor loads, **Then** milestone brief text renders immediately while Monaco lazy-loads in the background (UX-1)
   - _The `EditorPlaceholder` in `WorkspaceLayout.tsx` is replaced by a `<CodeEditor>` boundary component. The CodeEditor lazy-loads Monaco inside itself while showing a purpose-built skeleton. Milestone brief (Epic 4) is a sibling, not a child of the Monaco boundary — it renders instantly._
2. **And** Monaco editor loads with Go syntax highlighting and project file structure within 1.5 seconds after app shell (NFR-P7)
   - _Use `@monaco-editor/react` which loads Monaco from CDN via web workers. Configure `language="go"` on the Editor component. Do NOT bundle all Monaco languages — Go is built-in to the default Monaco CDN bundle. Verify load time in dev tools._
3. **And** Monaco gets initial focus on workspace load (UX-15)
   - _Call `editor.focus()` in the `onMount` callback of the `@monaco-editor/react` Editor component. This fires after Monaco is fully initialized._
4. **And** `Escape` releases focus from Monaco (UX-15)
   - _Use `editor.addCommand(monaco.KeyCode.Escape, handler)` with a precondition that no Monaco widgets are open (no autocomplete, no find dialog). When fired, move focus to the workspace container (`document.getElementById('workspace-container')?.focus()` or similar). Monaco's default Escape closes widgets first — custom handler only fires when no widgets are active._
5. **And** a defined tab order moves through all workspace regions (UX-15)
   - _Tab order: Monaco editor → Run button → Benchmark button → Terminal Output tab → Terminal Criteria tab → Tutor indicator. `tabIndex` attributes on workspace regions. Monaco captures Tab for indentation by default — after Escape releases focus, Tab navigates workspace regions._
6. **And** `Cmd+Enter` is bound to Run Code with Monaco's default `Cmd+Enter` binding unbound (UX-22)
   - _In `onMount`, unbind Monaco's default `editor.action.insertLineAfter` for `Cmd+Enter` via `editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, runHandler)`. The handler calls the `onRun` prop passed from WorkspaceLayout. This prevents Monaco from inserting a new line and instead triggers code submission._
7. **And** Monaco editor screen reader mode is enabled by default (NFR-A3)
   - _Set `accessibilitySupport: 'on'` in Monaco editor options. This enables screen reader mode without requiring users to opt-in._
8. **And** ARIA live regions are configured for dynamic content updates in the workspace (NFR-A3)
   - _Add a hidden `aria-live="polite"` div (`sr-only` class) in the workspace. Do NOT put `aria-live` on visible containers — streaming output would announce every character. Announcements: "Editor ready" on Monaco mount. Future stories wire compilation results and criteria changes._
9. **And** code syntax highlighting color scheme meets WCAG AA contrast ratios against the dark background (NFR-A4)
   - _Define a custom Monaco theme via `monaco.editor.defineTheme()` before editor creation. All syntax colors must have >= 4.5:1 contrast ratio against `--background`. Primary foreground must meet 7:1 (WCAG AAA) per UX spec. Test blues and purples explicitly — dark syntax themes commonly fail on these._
10. **And** the dark theme is explicitly tested for contrast compliance (NFR-A4)
    - _Write a unit test that validates: (a) `foreground` on `background` at >= 7:1 (WCAG AAA — UX spec requirement for evening dark-mode), (b) `lineNumber` (muted-foreground) on `background` at >= 4.5:1 (WCAG AA), (c) each syntax token color on `background` at >= 4.5:1 (WCAG AA). Use a WCAG relative luminance contrast ratio calculation utility._

## Tasks / Subtasks

- [x] Task 1: Install `@monaco-editor/react` and configure Vite (AC: #2)
  - [x] 1.1 Install package: `pnpm --filter webapp add @monaco-editor/react`
    - This automatically installs `monaco-editor` as a peer dependency
    - `@monaco-editor/react` v4.7.0 (latest stable) — loads Monaco from CDN by default, no Vite plugin needed
  - [x] 1.2 Verify Vite dev server works with Monaco — no additional Vite config should be needed since `@monaco-editor/react` uses CDN loading via `@monaco-editor/loader`
  - [x] 1.3 **Do NOT install** `vite-plugin-monaco-editor` — the `@monaco-editor/react` CDN approach avoids bundle bloat and complex worker configuration. Monaco is loaded lazily from CDN, not bundled into the app.

- [x] Task 2: Create custom dark theme matching UX design tokens (AC: #9, #10)
  - [x] 2.1 Create `apps/webapp/src/components/workspace/monaco-theme.ts`:
    ```typescript
    import type * as monacoTypes from 'monaco-editor'

    // Theme token colors — contrast ratio requirements per UX spec NFR-A4:
    //   foreground on background: >= 7:1 (WCAG AAA — evening dark-mode reading)
    //   lineNumber (muted-foreground) on background: >= 4.5:1 (WCAG AA)
    //   syntax token colors on background: >= 4.5:1 (WCAG AA)
    // Background: very dark gray (~hsl(240 6% 10%)), mapped from --background CSS variable
    // IMPORTANT: Verify hex values match actual CSS variables in packages/config/tailwind-tokens.css
    const THEME_COLORS = {
      background: '#17171a',      // --background equivalent
      foreground: '#e4e4e7',      // --foreground equivalent
      lineNumber: '#71717a',      // --muted-foreground equivalent
      selection: '#27272a',       // --accent equivalent
      keyword: '#93c5fd',         // blue-300 — keywords (func, return, if)
      string: '#86efac',          // green-300 — string literals
      number: '#fde68a',          // amber-200 — numeric literals
      comment: '#a1a1aa',         // zinc-400 — comments (4.5:1+ on dark bg)
      type: '#c4b5fd',            // violet-300 — type names
      function: '#67e8f9',        // cyan-300 — function names
      variable: '#e4e4e7',        // same as foreground — variables
      operator: '#e4e4e7',        // same as foreground — operators
    } as const

    type MonacoInstance = typeof monacoTypes

    function defineMycscompanionTheme(monaco: MonacoInstance): void {
      monaco.editor.defineTheme('mycscompanion-dark', {
        base: 'vs-dark',
        inherit: true,
        rules: [
          { token: 'keyword', foreground: THEME_COLORS.keyword.slice(1) },
          { token: 'string', foreground: THEME_COLORS.string.slice(1) },
          { token: 'number', foreground: THEME_COLORS.number.slice(1) },
          { token: 'comment', foreground: THEME_COLORS.comment.slice(1) },
          { token: 'type', foreground: THEME_COLORS.type.slice(1) },
          { token: 'type.identifier', foreground: THEME_COLORS.type.slice(1) },
          { token: 'identifier', foreground: THEME_COLORS.function.slice(1) },
          { token: 'delimiter', foreground: THEME_COLORS.operator.slice(1) },
        ],
        colors: {
          'editor.background': THEME_COLORS.background,
          'editor.foreground': THEME_COLORS.foreground,
          'editorLineNumber.foreground': THEME_COLORS.lineNumber,
          'editor.selectionBackground': THEME_COLORS.selection,
          'editor.lineHighlightBackground': '#1e1e21',
          'editorCursor.foreground': '#10b981', // --primary green
        },
      })
    }

    export { defineMycscompanionTheme, THEME_COLORS }
    ```
  - [x] 2.2 Create `apps/webapp/src/components/workspace/monaco-theme.test.ts`:
    - Test `THEME_COLORS.foreground` on `THEME_COLORS.background` at >= **7:1** (WCAG AAA per UX spec NFR-A4)
    - Test `THEME_COLORS.lineNumber` on `THEME_COLORS.background` at >= **4.5:1** (WCAG AA — muted-foreground)
    - Test each syntax token color (`keyword`, `string`, `number`, `comment`, `type`, `function`) at >= **4.5:1** (WCAG AA)
    - Use WCAG relative luminance formula: `L = 0.2126*R + 0.7152*G + 0.0722*B` (with gamma-correct sRGB linearization) then ratio = `(L1+0.05)/(L2+0.05)`
    - Test should fail if any color drops below its required threshold — catches regressions on color changes
    - Export contrast calculation for reuse
    - Verify hex values match actual CSS custom properties in `packages/config/tailwind-tokens.css`

- [x] Task 3: Create `CodeEditor` boundary component (AC: #1, #2, #3, #4, #5, #6, #7, #8)
  - [x] 3.1 Create `apps/webapp/src/components/workspace/CodeEditor.tsx`:
    ```typescript
    import { useCallback, useRef } from 'react'
    import Editor, { type OnMount, type BeforeMount } from '@monaco-editor/react'
    import type * as monacoTypes from 'monaco-editor'
    import { Skeleton } from '@mycscompanion/ui/src/components/ui/skeleton'
    import { defineMycscompanionTheme } from './monaco-theme'
    import { useEditorStore } from '../../stores/editor-store'

    interface CodeEditorProps {
      readonly initialContent: string
      readonly onRun: () => void
    }

    function CodeEditor({ initialContent, onRun }: CodeEditorProps): React.ReactElement {
      const editorRef = useRef<monacoTypes.editor.IStandaloneCodeEditor | null>(null)
      const setContent = useEditorStore((s) => s.setContent)

      // Ref to avoid stale closure in Monaco addCommand handlers.
      // onMount is called ONCE by @monaco-editor/react — if onRun changes
      // on re-render, the addCommand handler would reference the old closure.
      const onRunRef = useRef(onRun)
      onRunRef.current = onRun

      const handleBeforeMount: BeforeMount = useCallback((monaco) => {
        defineMycscompanionTheme(monaco)
      }, [])

      const handleMount: OnMount = useCallback((editor, monaco) => {
        editorRef.current = editor

        // AC #3: Initial focus on workspace load
        editor.focus()

        // AC #6: Unbind Monaco default Cmd+Enter and bind to Run
        // Uses ref to avoid stale closure — onMount only fires once
        editor.addCommand(
          monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter,
          () => { onRunRef.current() }
        )

        // AC #4: Escape releases focus from Monaco when no widgets open
        editor.addCommand(
          monaco.KeyCode.Escape,
          () => {
            // Move focus to workspace container
            const container = document.getElementById('workspace-container')
            if (container) container.focus()
          },
          // Precondition: only when no suggest, find, or markers widget visible
          '!suggestWidgetVisible && !findWidgetVisible && !markersNavigationVisible'
        )

        // AC #8: Announce editor ready
        announceToScreenReader('Code editor ready')
      }, []) // No dependencies — refs handle staleness

      const handleChange = useCallback((value: string | undefined) => {
        if (value !== undefined) {
          setContent(value)
        }
      }, [setContent])

      return (
        <div id="code-editor-boundary" className="h-full w-full">
          <Editor
            language="go"
            theme="mycscompanion-dark"
            defaultValue={initialContent}
            onChange={handleChange}
            beforeMount={handleBeforeMount}
            onMount={handleMount}
            loading={<CodeEditorSkeleton />}
            options={{
              // AC #7: Screen reader mode enabled
              accessibilitySupport: 'on',
              fontSize: 14,
              fontFamily: "'JetBrains Mono', 'Fira Code', 'SF Mono', 'Cascadia Code', monospace",
              minimap: { enabled: false },
              scrollBeyondLastLine: false,
              automaticLayout: true,
              tabSize: 4,
              insertSpaces: false, // Go uses tabs
              renderWhitespace: 'none',
              lineNumbers: 'on',
              folding: true,
              wordWrap: 'off',
              // Disable features not needed for single-file Go editing
              quickSuggestions: false,
              parameterHints: { enabled: false },
              suggestOnTriggerCharacters: false,
              acceptSuggestionOnCommitCharacter: false,
            }}
          />
          {/* NOTE: ARIA live region (workspace-announcer) lives in WorkspaceLayout.tsx,
              NOT here. It must be accessible to all workspace siblings (TerminalPanel,
              CriteriaPanel, TutorPanel) for future story announcements (3.7, 4.3, 6.3). */}
        </div>
      )
    }

    function CodeEditorSkeleton(): React.ReactElement {
      return (
        <div className="flex h-full w-full flex-col gap-2 p-4" data-testid="code-editor-skeleton">
          {/* Simulate code lines */}
          <Skeleton className="h-4 w-1/4" />
          <Skeleton className="h-4 w-3/5" />
          <Skeleton className="h-4 w-2/5" />
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-4 w-1/3" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-2/5" />
          <Skeleton className="h-4 w-1/2" />
        </div>
      )
    }

    /** Inject text into the workspace ARIA live region */
    function announceToScreenReader(message: string): void {
      const el = document.getElementById('workspace-announcer')
      if (el) {
        el.textContent = ''
        // requestAnimationFrame ensures screen readers detect the change
        requestAnimationFrame(() => { el.textContent = message })
      }
    }

    export { CodeEditor, CodeEditorSkeleton, announceToScreenReader }
    export type { CodeEditorProps }
    ```
  - [x] 3.2 **Key architecture decisions:**
    - `CodeEditor` is a **boundary component** — unit tests mock this entire component. Only Playwright E2E tests exercise real Monaco.
    - `@monaco-editor/react` `Editor` component uses CDN loading by default — Monaco JS files are fetched lazily from `cdn.jsdelivr.net`, NOT bundled into the app. This keeps the app bundle small.
    - `loading` prop on Editor renders `CodeEditorSkeleton` while Monaco downloads from CDN.
    - `beforeMount` defines the custom theme before the editor instance is created.
    - `onMount` sets up keybindings and focus after editor is ready. Uses refs for callbacks to avoid stale closures (onMount only fires once).
    - `onChange` syncs to `useEditorStore` for dirty tracking.
    - `defaultValue` (uncontrolled mode) — user changes survive remounts. Controlled `value` deferred to Story 3.8/5.1.
    - Go uses tabs for indentation — `insertSpaces: false`, `tabSize: 4`.
    - `quickSuggestions: false` — no IntelliSense for Go without LSP. Don't show misleading suggestions.
    - `automaticLayout: true` — editor resizes when panel is resized (react-resizable-panels).

- [x] Task 4: Create `CodeEditor.test.tsx` — mock-based unit tests (AC: #1, #3, #6, #7, #8)
  - [x] 4.1 Create `apps/webapp/src/components/workspace/CodeEditor.test.tsx`:
    - Mock `@monaco-editor/react` — do NOT render real Monaco in Vitest/jsdom:
      ```typescript
      vi.mock('@monaco-editor/react', () => ({
        default: function MockEditor(props: Record<string, unknown>) {
          // Call beforeMount with mock monaco
          // Call onMount with mock editor + mock monaco
          // Render a div for testing
        },
      }))
      ```
    - Test: `beforeMount` calls `defineMycscompanionTheme`
    - Test: `onMount` calls `editor.focus()` (AC #3)
    - Test: `onMount` registers `Cmd+Enter` command via ref (no stale closure) (AC #6)
    - Test: `onMount` registers `Escape` command with `!suggestWidgetVisible && !findWidgetVisible && !markersNavigationVisible` precondition (AC #4)
    - Test: `accessibilitySupport` is `'on'` in options (AC #7)
    - Test: `language` is `'go'` in Editor props (AC #2)
    - Test: `onChange` calls `setContent` on editor store (AC: state sync)
    - Test: CodeEditorSkeleton renders when loading
    - Test: `announceToScreenReader` updates the ARIA live region (AC #8)
  - [x] 4.2 Use `vi.restoreAllMocks()` in `afterEach` — always

- [x] Task 5: Integrate `CodeEditor` into `WorkspaceLayout.tsx` (AC: #1, #5)
  - [x] 5.1 Replace `EditorPlaceholder` with `CodeEditor` in `WorkspaceLayout.tsx`:
    - Import `CodeEditor` from `./CodeEditor`
    - Pass `initialContent` (from route props or placeholder for now) and `onRun` prop
    - Add `id="workspace-container"` and `tabIndex={-1}` to the main workspace div — this is the target for Escape focus release
    - Add the ARIA live region in `WorkspaceLayout.tsx` (NOT inside CodeEditor):
      ```typescript
      {/* Shared ARIA live region — accessible to all workspace children */}
      <div id="workspace-announcer" aria-live="polite" role="status" className="sr-only" />
      ```
      Place it as the last child of the workspace container div, alongside the ResizablePanelGroup
  - [x] 5.2 Update `WorkspaceLayoutProps` to include `initialContent: string`
  - [x] 5.3 For `small-desktop` breakpoint: use the same `CodeEditor` component (no layout difference for the editor itself)
  - [x] 5.4 Update `Workspace.tsx` route to pass `initialContent` to `WorkspaceLayout`:
    - For now, use a Go placeholder (NOTE: use tab characters for indentation, not spaces — Go convention):
      ```go
      package main

      import "fmt"

      func main() {
      	fmt.Println("Hello, World!")
      }
      ```
    - Real content loading comes in Story 4.2
  - [x] 5.5 Add `tabIndex` attributes for workspace tab order (AC #5):
    - `id="workspace-container"` on main div with `tabIndex={-1}` (programmatic focus only)
    - Run button: natural tab order (already a `<button>`)
    - Benchmark button: natural tab order
    - Terminal tabs: `tabIndex={0}` with `role="tablist"` / `role="tab"` (Story 3.7 will fully implement)
    - Tutor collapsed indicator: already a `<button>` element
  - [x] 5.6 Add "Skip to editor" skip link at the top of WorkspaceLayout (AC #5, UX-15):
    - Visually hidden (`sr-only`) anchor link at the very top of the workspace, before WorkspaceTopBar
    - On focus (Tab from browser chrome), becomes visible with focus styles
    - On activation, calls `editorRef.current?.focus()` or `document.getElementById('code-editor-boundary')?.querySelector('textarea')?.focus()`
    - Pattern: `<a href="#code-editor-boundary" className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:p-2 focus:bg-background focus:text-foreground" onClick={skipToEditor}>Skip to editor</a>`
    - This is required by UX-15: "Single skip link: 'Skip to editor' at the top of the workspace page"

- [x] Task 6: Update existing tests for WorkspaceLayout changes (AC: #1)
  - [x] 6.1 Update `WorkspaceLayout.test.tsx`:
    - Mock `CodeEditor` component: `vi.mock('./CodeEditor', () => ({ CodeEditor: ... }))`
    - Update test expectations: no more `editor-placeholder` testId in desktop/small-desktop modes
    - Verify CodeEditor receives `initialContent` and `onRun` props
    - Verify `workspace-container` has `tabIndex={-1}` for focus management
  - [x] 6.2 Update `Workspace.test.tsx`:
    - Verify `initialContent` is passed to WorkspaceLayout

- [x] Task 7: Verify all tests pass and run quality checks
  - [x] 7.1 Run webapp tests: `pnpm --filter webapp test`
  - [x] 7.2 Run typecheck: `pnpm typecheck`
  - [x] 7.3 Run lint: `pnpm lint`
  - [x] 7.4 Run full pipeline: `turbo lint && turbo typecheck && turbo test`

## Dev Notes

### Architecture Compliance

**CodeEditor as boundary component:** Unit tests mock this wrapper entirely. Only Playwright E2E tests (Epic 9+) exercise real Monaco. This is per architecture spec: "Wrapped in a `<CodeEditor>` boundary component — unit tests mock this wrapper, Playwright tests exercise real Monaco."

**State management — hard rule:**
- Editor content → `useEditorStore.setContent()` (Zustand) — this is UI state (what the user has typed)
- Milestone content (initial code) → TanStack Query (server state) — fetched from API in Epic 4
- Never server data in Zustand. The `initialContent` prop bridges: route fetches via TanStack Query, passes to CodeEditor as prop, CodeEditor syncs user changes to Zustand.

**Named exports only** — `CodeEditor` uses named export. Not a route component, so no `export default` exception needed.

**Import pattern:** Import from `@mycscompanion/ui/src/components/ui/skeleton` individually — no barrel imports.

### @monaco-editor/react v4.7.0 API (CRITICAL)

**CDN Loading Strategy:**
- `@monaco-editor/react` uses `@monaco-editor/loader` internally
- Monaco files loaded from `cdn.jsdelivr.net/npm/monaco-editor@latest` by default
- This means Monaco is NOT in the app bundle — it loads lazily over the network
- The `loading` prop renders while Monaco downloads (~1-2s on fast connections)
- No Vite plugin needed — no worker configuration, no complex bundling

**Editor Component Key Props:**
```typescript
<Editor
  language="go"           // Built-in Go language support
  theme="mycscompanion-dark"  // Custom theme defined via beforeMount
  value={content}         // Controlled value
  onChange={handler}       // Fires on every edit
  beforeMount={fn}        // Access monaco instance before editor creation
  onMount={fn}            // Access editor + monaco after creation
  loading={<Skeleton />}  // Custom loading component
  options={{...}}          // Monaco editor options
/>
```

**beforeMount vs onMount:**
- `beforeMount(monaco)` — called once with the Monaco namespace. Use for `defineTheme`, language registration. No editor instance yet.
- `onMount(editor, monaco)` — called once after editor is created. Use for `focus()`, `addCommand()`, event listeners.

**Controlled vs Uncontrolled (IMPORTANT):**
- This story uses `defaultValue` (uncontrolled mode) — Monaco manages content internally, user changes survive remounts
- `onChange` fires with the new string value, synced to `useEditorStore` for dirty tracking
- Story 3.8/5.1 will switch to `value` prop (controlled mode) once auto-save persistence exists and content comes from TanStack Query cache
- Do NOT use `value={initialContent}` in this story — it would reset the editor on component remount (React Strict Mode, Suspense) losing user changes

### Monaco Go Language Support

**Built-in:** Go syntax highlighting is included in the default Monaco distribution. No additional language registration needed. Set `language="go"` on the Editor component.

**No LSP for MVP:** Go IntelliSense requires gopls via WebSocket, which is out of scope. Disable `quickSuggestions`, `parameterHints`, `suggestOnTriggerCharacters` to avoid misleading empty suggestions.

**Go conventions in editor:**
- `insertSpaces: false` — Go uses tabs
- `tabSize: 4` — Go convention
- No auto-formatting on save (would need gopls)

### Monaco Keybinding Architecture

**Cmd+Enter conflict — MUST unbind:**
Monaco's default `Cmd+Enter` triggers `editor.action.insertLineAfter`. This MUST be overridden before the workspace-level keyboard handler can capture it. Use `editor.addCommand()` in `onMount`:
```typescript
editor.addCommand(
  monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter,
  () => { onRun() }
)
```
This replaces Monaco's default behavior. The workspace-level `document.addEventListener('keydown')` in WorkspaceLayout handles Cmd+Enter when Monaco does NOT have focus. Inside Monaco, the `addCommand` handler fires. Both paths call `onRun`.

**Escape focus release — widget-aware:**
```typescript
editor.addCommand(
  monaco.KeyCode.Escape,
  () => { document.getElementById('workspace-container')?.focus() },
  '!suggestWidgetVisible && !findWidgetVisible && !markersNavigationVisible'
)
```
The precondition string ensures Escape only releases focus when no Monaco widgets are open (autocomplete, find dialog, markers navigation via F8). When widgets are open, Monaco's default Escape closes them first. The `markersNavigationVisible` check is important because `accessibilitySupport: 'on'` enables F8 navigation, which opens a markers overlay that Escape should close before releasing focus.

**Important:** The workspace-level Escape handler in WorkspaceLayout (for collapsing tutor) checks `tutorExpanded` before acting. When Monaco has focus and Escape fires, the Monaco command handler runs first (moves focus to container), then the workspace handler does NOT fire because the event doesn't propagate from `addCommand`. These are independent — no conflict.

**Do NOT override `Cmd+Shift+P`** — leave Monaco's native command palette intact. UX spec explicitly requires: "Use Monaco's native command palette (`Cmd+Shift+P`) for editor actions. Do not create a conflicting product-level command palette."

### Accessibility Implementation

**Screen reader mode (`accessibilitySupport: 'on'`):**
- Enables text paging strategy for screen readers
- Alternative keyboard shortcuts available: `Ctrl+Up`/`Ctrl+Down` for suggestion navigation
- `F8`/`Shift+F8` announce errors and warnings
- `Alt+F1` opens accessibility help dialog

**ARIA live region pattern:**
- Single hidden `<div id="workspace-announcer" aria-live="polite" role="status" className="sr-only">` placed in **`WorkspaceLayout.tsx`** (NOT inside CodeEditor)
- Must be in the shared layout so ALL workspace children can announce: TerminalPanel (3.7), CriteriaPanel (4.3), TutorPanel (6.3)
- `announceToScreenReader()` utility function exported from `CodeEditor.tsx`: clears text, then sets new text in `requestAnimationFrame` — ensures screen readers detect the change
- This story announces: "Code editor ready" on mount
- Future stories wire: compilation results (3.7), criteria changes (4.3), tutor messages (6.3)
- **Never place `aria-live` on visible containers** — SSE streaming would announce every character

**Contrast compliance:**
- Custom Monaco theme token colors chosen for >= 4.5:1 ratio on dark background
- Blues, purples tested explicitly (common failure points in dark themes)
- Unit test validates contrast ratios — prevents regressions on color changes

### Tab Order Implementation (AC #5)

**Workspace focus flow:**
1. Monaco editor (receives focus on mount via `editor.focus()`)
2. Escape releases focus to `#workspace-container`
3. Tab → Run button (natural button tab order in WorkspaceTopBar)
4. Tab → Benchmark button
5. Tab → Terminal Output tab (Story 3.7 adds `role="tablist"`)
6. Tab → Terminal Criteria tab
7. Tab → Tutor collapsed indicator (`<button>` element)
8. Shift+Tab reverses

**Key implementation details:**
- `#workspace-container` gets `tabIndex={-1}` — focusable programmatically but NOT in tab order
- Monaco captures Tab for indentation when focused — this is correct behavior. Escape first, then Tab navigates.
- "Skip to editor" skip link placed at top of WorkspaceLayout — visually hidden (`sr-only`), visible on focus, jumps to Monaco. Required by UX-15.

### Previous Story Intelligence (Story 3.5)

**Relevant patterns established:**
1. **react-resizable-panels v4 API:** `usePanelRef()` + `panelRef` prop pattern already working. `automaticLayout: true` on Monaco ensures editor resizes with panel.
2. **Component file pattern:** `PascalCase.tsx` with co-located `.test.tsx` in `components/workspace/`
3. **Testing pattern:** Mock dependencies with `vi.mock()`, wrap in providers if needed, `vi.restoreAllMocks()` in `afterEach`
4. **DOM polyfills in tests:** `ResizeObserver`, `scrollIntoView`, `hasPointerCapture`, `setPointerCapture`, `releasePointerCapture` already set up in WorkspaceLayout test — reuse same pattern
5. **Import paths:** Relative within webapp (no `@/` aliases). Individual imports from `@mycscompanion/ui/src/...`
6. **Zustand selector pattern:** `useEditorStore((s) => s.setContent)` — selector-based to prevent re-renders
7. **EditorStore already has:** `content: string`, `isDirty: boolean`, `setContent()`, `markClean()`
   - **Note:** Architecture spec says `useEditorStore` should also track cursor position and auto-save timer. These fields are deferred to Story 3.8 (Workspace State Management) and Story 5.1 (Auto-Save). Do NOT add them in this story.

**Debug learnings from 3.5:**
- `.js` extensions NOT needed in webapp imports (moduleResolution: "bundler") — only backend (ESM)
- `lucide-react` already installed in webapp
- `export default` only for route components with `React.lazy()` — add eslint-disable comment

### Git Intelligence

**Recent commit pattern:** `Implement Story X.Y: <title> with code review fixes`

**Files modified in Story 3.5 that this story touches:**
- `apps/webapp/src/components/workspace/WorkspaceLayout.tsx` — replace EditorPlaceholder with CodeEditor
- `apps/webapp/src/components/workspace/WorkspaceLayout.test.tsx` — update to mock CodeEditor
- `apps/webapp/src/routes/Workspace.tsx` — add initialContent prop
- `apps/webapp/src/routes/Workspace.test.tsx` — update for initialContent
- `apps/webapp/src/stores/editor-store.ts` — no changes needed (cursor position + auto-save timer deferred to 3.8/5.1)

**New files this story creates:**
- `apps/webapp/src/components/workspace/CodeEditor.tsx`
- `apps/webapp/src/components/workspace/CodeEditor.test.tsx`
- `apps/webapp/src/components/workspace/monaco-theme.ts`
- `apps/webapp/src/components/workspace/monaco-theme.test.ts`

### Latest Technical Information

**@monaco-editor/react v4.7.0** (latest stable as of 2026-03-04):
- React 19 compatible (uses ref forwarding, no deprecated lifecycle methods)
- Uses `@monaco-editor/loader` for CDN-based Monaco loading
- TypeScript types included (`OnMount`, `BeforeMount`, `EditorProps`)
- `value` prop is controlled — internal diffing prevents cursor jumps
- `options` prop accepts all `monaco.editor.IStandaloneEditorConstructionOptions`

**Monaco Editor accessibility:**
- `accessibilitySupport: 'on'` enables screen reader paging strategy
- Alternative keyboard navigation: `Ctrl+Up/Down` for suggestions, `F8` for errors
- `Alt+F1` opens accessibility help dialog listing all keyboard shortcuts
- Built-in ARIA attributes on editor elements

**Go language in Monaco:**
- Built-in syntax highlighting, no registration needed
- Tokenizer supports: keywords, types, strings, numbers, comments, operators
- No semantic highlighting without LSP (expected — not needed for MVP)

### Project Structure Notes

- All new files in `apps/webapp/src/components/workspace/` — existing feature directory
- No new packages created
- No new Zustand stores
- No new dependencies beyond `@monaco-editor/react`
- Test co-located: `*.test.tsx` / `*.test.ts` next to source
- Named exports only (no `export default`)

### References

- [Source: _bmad-output/planning-artifacts/epics.md — Epic 3, Story 3.6 Acceptance Criteria]
- [Source: _bmad-output/planning-artifacts/architecture.md — Monaco Editor, CodeEditor boundary, Workspace reveal staging]
- [Source: _bmad-output/planning-artifacts/architecture.md — Frontend Architecture, State Management, Component Structure]
- [Source: _bmad-output/planning-artifacts/architecture.md — Bundle Optimization, Route-level Code Splitting]
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md — UX-1: Content-before-tools loading pattern]
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md — UX-15: Focus management, Tab order, Escape from Monaco]
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md — UX-22: Cmd+Enter keybinding, Monaco conflict]
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md — NFR-A3: Screen reader mode, ARIA live regions]
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md — NFR-A4: Contrast ratios, dark theme compliance]
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md — NFR-P7: Monaco load time < 1.5s]
- [Source: _bmad-output/project-context.md — State Split Rule, Testing Rules, Anti-Patterns]
- [Source: _bmad-output/implementation-artifacts/3-5-workspace-layout-and-resizable-panels.md — Previous Story Patterns]
- [Source: npm — @monaco-editor/react v4.7.0]
- [Source: github.com/microsoft/monaco-editor — Accessibility Guide]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6

### Debug Log References

- lineNumber color `#71717a` failed WCAG AA contrast (3.7:1 vs 4.5:1 required). Fixed to `#9ca3af` (gray-400, ~5.4:1).
- `monaco-editor` needed explicit install as peer dependency (not auto-installed by `@monaco-editor/react`).

### Completion Notes List

- Installed `@monaco-editor/react` + `monaco-editor` in webapp. No Vite plugin needed (CDN loading).
- Created custom dark theme (`mycscompanion-dark`) with WCAG-compliant contrast ratios. All syntax token colors >= 4.5:1 on background. Foreground meets AAA (>= 7:1).
- Created `CodeEditor` boundary component with: Go syntax highlighting, CDN-based lazy loading, `CodeEditorSkeleton` loading state, `accessibilitySupport: 'on'`, `Cmd+Enter` bound to `onRun`, `Escape` releases focus with widget-aware precondition, screen reader announcements via ARIA live region.
- Used `defaultValue` (uncontrolled mode) per story spec. `onChange` syncs to `useEditorStore`.
- Replaced `EditorPlaceholder` with `CodeEditor` in both desktop and small-desktop layouts.
- Added `id="workspace-container"` with `tabIndex={-1}` for focus management.
- Added `workspace-announcer` ARIA live region in WorkspaceLayout (shared by all workspace children).
- Added "Skip to editor" skip link at top of workspace for keyboard/screen reader users.
- Added `initialContent` prop to `WorkspaceLayoutProps` and `Workspace` route (placeholder Go code with tabs).
- 27 new tests across 2 new test files. 21 updated tests in existing files. All 176 webapp tests pass.
- Full pipeline passes: lint (0 errors, 1 warning), typecheck, test (348 total across all packages).

### File List

**New files:**
- apps/webapp/src/components/workspace/monaco-theme.ts
- apps/webapp/src/components/workspace/monaco-theme.test.ts
- apps/webapp/src/components/workspace/CodeEditor.tsx
- apps/webapp/src/components/workspace/CodeEditor.test.tsx
- apps/webapp/src/components/workspace/workspace-a11y.ts

**Modified files:**
- apps/webapp/src/components/workspace/WorkspaceLayout.tsx
- apps/webapp/src/components/workspace/WorkspaceLayout.test.tsx
- apps/webapp/src/routes/Workspace.tsx
- apps/webapp/src/routes/Workspace.test.tsx
- apps/webapp/package.json
- pnpm-lock.yaml

### Change Log

- 2026-03-05: Implemented Story 3.6 Monaco Editor Integration — CodeEditor boundary component with Go syntax highlighting, custom WCAG-compliant dark theme, keyboard shortcuts (Cmd+Enter, Escape), screen reader support, and tab order management.
- 2026-03-05: Code review fixes — extracted `announceToScreenReader` to `workspace-a11y.ts` (resolves lint warning + better module boundaries), removed unused `editorRef`, documented oklch-to-hex color mapping in `monaco-theme.ts`, fixed misleading test name in `Workspace.test.tsx`, split incomplete `onRun` prop test in `WorkspaceLayout.test.tsx`.
