# Story 3.7: Terminal Output & Error Presentation

Status: done

## Story

As a **learner**,
I want to see compilation output and errors presented clearly,
so that I can diagnose and fix issues in my code.

## Acceptance Criteria

1. **Given** a learner has submitted code for compilation, **When** execution events stream in via SSE, **Then** the terminal "Output" tab displays streaming compilation and runtime output in real-time (FR4, FR5)
   - _Create a `useSSE` hook that connects to `GET /api/execution/:submissionId/stream`. Use fetch-based SSE (not native EventSource — it cannot send Authorization headers). Handle `Last-Event-ID` reconnection. Parse each SSE event as `ExecutionEvent` discriminated union from `@mycscompanion/execution`._
2. **And** the terminal panel has two static-label tabs: "Output" and "Criteria" (UX-23)
   - _Tab labels never change. "Output" stays "Output" even when errors appear. "Criteria" stays "Criteria". Active tab tracked via `useWorkspaceUIStore.activeTerminalTab` (already exists: `'output' | 'criteria'`)._
3. **And** the "Criteria" tab is scaffolded as empty — populated by Epic 4
   - _Render a placeholder: centered muted text "Acceptance criteria appear here after your first submission" or similar._
4. **And** errors use two-tier presentation: human-readable interpretation displayed above collapsible raw compiler output (UX-7)
   - _Create `ErrorPresentation` component. Top: human-readable interpretation in `--foreground` on `--elevated` bg with left border in `--secondary-foreground`. Bottom: collapsible raw output in monospace `--muted-foreground`. Toggle label: "Show/Hide raw compiler output". Default state: collapsed (interpretation only)._
5. **And** the interpretation describes the error; it never prescribes a fix (that is the tutor's role) (UX-7)
   - _Use "The function..." framing, not "Your function...". Example: "The insert function references 'node' on line 142, but it hasn't been declared in this scope." Never say "try changing..." or "fix by...". Error interpretation = diagnosis. Tutor = prescription._
6. **And** user-code errors (compilation failures, runtime panics) are visually distinct from platform errors (FR24)
   - _User-code errors: `--secondary-foreground` text with dash icon. Platform errors: `--error-surface` background with distinct message format. Neither uses red. Color is never the sole signal._
7. **And** platform errors show a user-friendly message with an option to retry
   - _Message template: "[What happened]. [What to do]." Example: "Something went wrong. Try again." Retry button calls `onRun` again. Message in `--secondary-foreground`._
8. **And** screen reader live regions announce compilation completion (UX-16)
   - _Use existing `announceToScreenReader()` from `workspace-a11y.ts`. Announce: "Build successful", "Compilation failed: [count] issues", "Execution timed out". Text must match UX spec line 1733 exactly._
9. **And** the terminal uses JetBrains Mono font for code output (UX-10)
   - _Apply `font-family: 'JetBrains Mono', monospace` to terminal output area. JetBrains Mono is already loaded by the webapp (used by Monaco). Size: 14px per UX spec `code-block` token._

## Tasks / Subtasks

- [x] Task 1: Create `useSSE` hook (AC: #1)
  - [x] 1.1 Create `apps/webapp/src/hooks/use-sse.ts`:
    ```typescript
    import { useEffect, useRef, useState } from 'react'
    import type { ExecutionEvent } from '@mycscompanion/execution'
    import { auth } from '../lib/firebase'

    type SSEStatus = 'idle' | 'connecting' | 'connected' | 'error' | 'closed'

    interface UseSSEOptions {
      readonly url: string | null // null = don't connect
      readonly onEvent?: (event: ExecutionEvent) => void
      readonly fetchFn?: typeof fetch // injectable for tests — defaults to global fetch
    }

    interface UseSSEResult {
      readonly status: SSEStatus
      readonly error: string | null
      readonly reconnectCount: number
    }

    function useSSE(options: UseSSEOptions): UseSSEResult { ... }

    export { useSSE }
    export type { UseSSEOptions, UseSSEResult, SSEStatus }
    ```
    **Architecture note:** Architecture spec defines `useSSE` as returning `{ data, status, error, reconnectCount }`. This implementation intentionally uses an `onEvent` callback instead of a `data` field because SSE events accumulate (streaming) rather than replace. The callback pattern is better for streaming — the consumer accumulates events in its own state.
  - [x] 1.2 Implementation details (fetch-based SSE):
    - When `url` is non-null, get auth token via `auth.currentUser?.getIdToken()`, then `fetch(url, { headers: { Authorization: 'Bearer ${token}' } })`
    - Read `response.body` as `ReadableStream<Uint8Array>` via `getReader()`
    - Parse SSE text protocol: buffer text chunks, split on `\n\n` for event boundaries, extract `event:`, `data:`, `id:` fields per line
    - Skip SSE comment lines (starting with `:`) — this filters heartbeat events
    - Parse `data` field as JSON, validate `type` field exists, call `onEvent` callback
    - Store last `id` value for reconnection via `Last-Event-ID` header on retry
    - On terminal events (`complete`, `error`, `timeout`): close the reader, set status to `'closed'`. Do NOT reconnect.
    - On network error or unexpected stream end (before terminal event): auto-reconnect with exponential backoff (1s, 2s, 4s, max 30s), send `Last-Event-ID` header
    - Cleanup: abort fetch controller on unmount or when `url` changes
    - Use `useRef` for the `onEvent` callback to avoid stale closures (same pattern as CodeEditor `onRunRef`)
  - [x] 1.3 **API URL construction:** Export `API_URL` from `apps/webapp/src/lib/api-fetch.ts` (currently defined but not exported). Import in `use-sse.ts`: `import { API_URL } from '../lib/api-fetch'`. Construct: `${API_URL}/api/execution/${submissionId}/stream`
  - [x] 1.6 Create `apps/webapp/src/hooks/use-sse.test.ts`:
    - Test: connects when url is provided, status transitions idle -> connecting -> connected
    - Test: parses SSE events and calls onEvent callback with typed ExecutionEvent
    - Test: closes on terminal events (complete, error, timeout)
    - Test: does not connect when url is null
    - Test: cleans up on unmount
    - Test: handles reconnection with Last-Event-ID
    - Test: increments reconnectCount on connection errors
    - Mock `fetch` with scripted SSE responses (ReadableStream with TextEncoder)
    - Mock `auth.currentUser.getIdToken()` to return test token
    - Use `vi.restoreAllMocks()` in `afterEach`

- [x] Task 2: Create `useAutoScroll` shared hook and `TerminalPanel` component (AC: #2, #3, #9)
  - [x] 2.0 Create `apps/webapp/src/hooks/use-auto-scroll.ts`:
    UX spec (lines 1420-1430) defines this as a shared hook reused by TerminalPanel AND TutorPanel (Epic 6).
    ```typescript
    import { useEffect, useRef, useCallback } from 'react'

    /** Auto-scroll a container to bottom on new content.
     *  Pauses when user scrolls up, resumes when scrolled back to bottom. */
    function useAutoScroll<T>(deps: ReadonlyArray<T>): React.RefObject<HTMLDivElement | null> {
      const containerRef = useRef<HTMLDivElement | null>(null)
      const shouldAutoScroll = useRef(true)
      const rafId = useRef<number>(0)

      const handleScroll = useCallback(() => {
        cancelAnimationFrame(rafId.current)
        rafId.current = requestAnimationFrame(() => {
          const el = containerRef.current
          if (!el) return
          shouldAutoScroll.current = el.scrollHeight - el.scrollTop - el.clientHeight < 50
        })
      }, [])

      useEffect(() => {
        const el = containerRef.current
        if (!el) return
        el.addEventListener('scroll', handleScroll, { passive: true })
        return () => {
          el.removeEventListener('scroll', handleScroll)
          cancelAnimationFrame(rafId.current)
        }
      }, [handleScroll])

      useEffect(() => {
        if (shouldAutoScroll.current && containerRef.current) {
          containerRef.current.scrollTop = containerRef.current.scrollHeight
        }
      }, deps) // eslint-disable-line react-hooks/exhaustive-deps

      return containerRef
    }

    export { useAutoScroll }
    ```
  - [x] 2.0b Create `apps/webapp/src/hooks/use-auto-scroll.test.ts`:
    - Test: scrolls to bottom when deps change and user hasn't scrolled up
    - Test: pauses auto-scroll when user scrolls up (scrollHeight - scrollTop - clientHeight > 50)
    - Test: resumes auto-scroll when user scrolls back to bottom
    - Use `vi.restoreAllMocks()` in `afterEach`
  - [x] 2.1 Create `apps/webapp/src/components/workspace/TerminalPanel.tsx`:
    ```typescript
    import { useWorkspaceUIStore } from '../../stores/workspace-ui-store'
    import { ScrollArea } from '@mycscompanion/ui/src/components/ui/scroll-area'
    import { useAutoScroll } from '../../hooks/use-auto-scroll'

    interface TerminalPanelProps {
      readonly outputLines: ReadonlyArray<OutputLine>
      readonly isRunning: boolean
      readonly onRetry?: () => void // passed to ErrorPresentation for platform error retry
    }

    // Structured output line for rendering
    type OutputLine =
      | { readonly kind: 'stdout'; readonly text: string }
      | { readonly kind: 'stderr'; readonly text: string }
      | { readonly kind: 'error'; readonly interpretation: string; readonly rawOutput: string; readonly isUserError: boolean }
      | { readonly kind: 'status'; readonly text: string; readonly phase: string }
      | { readonly kind: 'success'; readonly text: string }

    function TerminalPanel({ outputLines, isRunning, onRetry }: TerminalPanelProps): React.ReactElement {
      const activeTab = useWorkspaceUIStore((s) => s.activeTerminalTab)
      const setActiveTab = useWorkspaceUIStore((s) => s.setActiveTerminalTab)
      const scrollRef = useAutoScroll([outputLines])
      // ...
    }
    ```
  - [x] 2.2 Tab implementation:
    - Two buttons: "Output" and "Criteria" — styled as text tabs, not shadcn Tabs component (simpler)
    - Active tab: `--foreground` text with bottom border in `--primary`
    - Inactive tab: `--muted-foreground` text, no border
    - **Touch targets:** `min-h-11` (44px) on each tab button per UX spec (line 1764)
    - `role="tablist"` on container, `role="tab"` + `aria-selected` on each tab button
    - `role="tabpanel"` on content area with `aria-labelledby` pointing to active tab
    - `tabIndex={0}` on active tab button, `tabIndex={-1}` on inactive tab button
    - **Arrow key navigation (required by WAI-ARIA tablist pattern, UX spec line 1753):**
      - `onKeyDown` handler on tablist: Left/Right arrow keys switch active tab
      - ArrowLeft/ArrowRight move focus and activate the adjacent tab
      - Home/End move to first/last tab
      - This is mandatory — `role="tablist"` promises this keyboard behavior
  - [x] 2.3 Output content area:
    - Wrap output in shadcn `ScrollArea` component (UX spec line 1304) — provides consistent cross-browser scrollbar styling
    - Pass `scrollRef` from `useAutoScroll` to the ScrollArea viewport
    - `font-family: 'JetBrains Mono', monospace` at 14px (AC #9)
    - Dark background matching `--card` token
    - Show blinking cursor `$` when empty (UX terminal empty state: `--muted-foreground`)
    - Render each `OutputLine` with appropriate styling:
      - `stdout`: `--foreground` text
      - `stderr`: `--secondary-foreground` text
      - `error`: render `<ErrorPresentation>` component, pass `onRetry` for platform errors
      - `status`: `--muted-foreground` text with phase indicator
      - `success`: `--primary` text with checkmark icon
  - [x] 2.4 Running state indicator:
    - When `isRunning` is true and no output yet: "Compiling..." with inline spinner
    - Spinner: simple CSS animation, respects `prefers-reduced-motion`
  - [x] 2.5 Criteria tab placeholder (AC #3):
    - Centered text: "Acceptance criteria will appear here after your first submission"
    - Styled in `--muted-foreground`, no icon needed
  - [x] 2.6 Create `apps/webapp/src/components/workspace/TerminalPanel.test.tsx`:
    - Test: renders "Output" and "Criteria" tabs
    - Test: Output tab is active by default
    - Test: clicking Criteria tab switches view (calls setActiveTerminalTab)
    - Test: Criteria tab shows placeholder text
    - Test: renders output lines correctly (stdout, stderr, status)
    - Test: tab buttons have correct ARIA attributes (role, aria-selected, tabIndex)
    - Test: arrow key navigation switches active tab (Left/Right)
    - Test: tab buttons have min-h-11 (44px touch target)
    - Test: terminal output area uses JetBrains Mono font
    - Test: empty state shows blinking cursor
    - Test: running state shows "Compiling..." indicator
    - Test: error output lines render ErrorPresentation with onRetry
    - Mock `useWorkspaceUIStore` with vi.mock
    - Use `vi.restoreAllMocks()` in `afterEach`

- [x] Task 3: Create `ErrorPresentation` component (AC: #4, #5, #6, #7)
  - [x] 3.1 Create `apps/webapp/src/components/workspace/ErrorPresentation.tsx`:
    ```typescript
    import { Minus } from 'lucide-react'
    import { Button } from '@mycscompanion/ui/src/components/ui/button'
    import {
      Collapsible,
      CollapsibleTrigger,
      CollapsibleContent,
    } from '@mycscompanion/ui/src/components/ui/collapsible'

    interface ErrorPresentationProps {
      readonly interpretation: string
      readonly rawOutput: string
      readonly isUserError: boolean
      readonly issueCount?: number // for screen reader announcement formatting
      readonly onRetry?: () => void // only for platform errors
    }

    function ErrorPresentation({ interpretation, rawOutput, isUserError, onRetry }: ErrorPresentationProps): React.ReactElement {
      if (!isUserError) {
        // Platform error — distinct visual treatment
        return (
          <div className="rounded border border-border bg-[hsl(var(--error-surface))] p-3">
            <div className="flex items-start gap-2">
              <Minus className="mt-0.5 size-4 shrink-0 text-secondary-foreground" />
              <div>
                <p className="text-[13px] text-secondary-foreground">{interpretation}</p>
                {onRetry && (
                  <Button variant="outline" size="sm" className="mt-2" onClick={onRetry}>
                    Try again
                  </Button>
                )}
              </div>
            </div>
          </div>
        )
      }

      // User-code error — two-tier presentation
      return (
        <div className="space-y-1">
          {/* Top tier: human-readable interpretation — 13px per UX spec, --elevated bg */}
          <div className="border-l-2 border-secondary-foreground bg-[hsl(var(--elevated))] px-3 py-2">
            <div className="flex items-start gap-2">
              <Minus className="mt-0.5 size-4 shrink-0 text-secondary-foreground" />
              <p className="text-[13px] text-foreground">{interpretation}</p>
            </div>
          </div>
          {/* Bottom tier: collapsible raw compiler output — use shadcn Collapsible (UX spec line 1305) */}
          <Collapsible>
            <CollapsibleTrigger className="flex min-h-11 items-center gap-1 px-3 text-xs text-muted-foreground hover:text-foreground">
              Show/Hide raw compiler output
            </CollapsibleTrigger>
            <CollapsibleContent>
              <pre className="mx-3 overflow-x-auto rounded bg-background p-2 font-mono text-xs text-muted-foreground">
                {rawOutput}
              </pre>
            </CollapsibleContent>
          </Collapsible>
        </div>
      )
    }

    export { ErrorPresentation }
    export type { ErrorPresentationProps }
    ```
    **Key UX compliance:**
    - Font size: `text-[13px]` (not `text-sm`/14px) per UX spec ErrorPresentation anatomy (line 1366)
    - Background: `bg-[hsl(var(--elevated))]` (not `bg-accent/50`) per UX spec (line 1366)
    - Collapsible: shadcn `Collapsible` component (Radix-based, built-in accessibility) per UX spec (line 1305)
    - Touch target: `min-h-11` (44px) on collapsible trigger per UX spec (line 1766)
    - Verify `--elevated` CSS custom property exists in theme. If not, add it to `packages/config/tailwind-tokens.css`
  - [x] 3.2 **Error interpretation rules (AC #5):**
    - For this story, the interpretation comes from a simple Go error parser function
    - Create `apps/webapp/src/components/workspace/parse-go-error.ts`:
      - Parse common Go compiler error patterns: `file.go:line:col: message`
      - Generate human-readable interpretation: "The function on line X..." / "The variable on line X..."
      - Use "The..." framing — never "Your..."
      - Never prescribe fixes — only describe what happened
      - For unparseable errors: "A compilation error occurred." + raw output
      - For runtime panics: "The program panicked at runtime." + stack trace in raw
    - This is a basic parser for MVP — AI-generated interpretations come in Epic 6
  - [x] 3.3 **No red rule (UX spec):**
    - User-code errors: `--secondary-foreground` text, dash icon — NOT red
    - Platform errors: `--error-surface` bg (muted warm amber/orange) — NOT red
    - Distinction via icon (dash vs checkmark) and content, not color
  - [x] 3.4 Create `apps/webapp/src/components/workspace/ErrorPresentation.test.tsx`:
    - Test: user-code error renders interpretation with left border and `--elevated` background
    - Test: user-code error raw output is collapsed by default (Collapsible)
    - Test: clicking toggle expands raw output
    - Test: collapsible trigger has min-h-11 (44px touch target)
    - Test: interpretation text is 13px (not 14px)
    - Test: platform error renders with error-surface background
    - Test: platform error shows "Try again" button when onRetry provided
    - Test: no red colors used (check className doesn't contain 'destructive' or 'red')
    - Test: interpretation text uses "The..." framing, not "Your..."
    - Use `vi.restoreAllMocks()` in `afterEach`
  - [x] 3.5 Create `apps/webapp/src/components/workspace/parse-go-error.test.ts`:
    - Test: parses standard Go compiler error format
    - Test: generates "The..." framing in interpretation
    - Test: handles runtime panic format
    - Test: handles unparseable errors gracefully
    - Test: never includes prescriptive language ("try", "fix", "change", "should")

- [x] Task 4: Wire submission flow in `Workspace.tsx` (AC: #1, #8)
  - [x] 4.1 Update `apps/webapp/src/routes/Workspace.tsx`:
    - Implement `handleRun`:
      1. Get code from `useEditorStore.content`
      2. Call `POST /api/execution/submit` via `apiFetch<{ submissionId: string }>('/api/execution/submit', { method: 'POST', body: JSON.stringify({ milestoneId, code }) })`
      3. On success: store `submissionId` in local state, construct SSE URL
      4. On error (429 rate limit): show inline error in terminal with retry-after message
      5. On error (other): show platform error in terminal
    - Add state: `submissionId: string | null`, `outputLines: OutputLine[]`, `isRunning: boolean`
    - Create `handleSSEEvent` callback that processes `ExecutionEvent`:
      ```typescript
      function handleSSEEvent(event: ExecutionEvent): void {
        switch (event.type) {
          case 'queued':
            setOutputLines([{ kind: 'status', text: 'Queued...', phase: 'preparing' }])
            break
          case 'compile_output':
          case 'output':
            setOutputLines(prev => [...prev, { kind: 'stdout', text: event.data }])
            break
          case 'compile_error':
            // NOTE: compile_error is NOT a terminal event — the SSE stream continues.
            // A terminal 'error' or 'complete' event will follow. Do NOT set isRunning(false) here.
            const { interpretation, rawOutput } = parseGoError(event.data)
            setOutputLines(prev => [...prev, { kind: 'error', interpretation, rawOutput, isUserError: true }])
            break
          case 'error':
            // Terminal event — stream closes after this
            if (event.isUserError) {
              const parsed = parseGoError(event.data)
              setOutputLines(prev => [...prev, { kind: 'error', ...parsed, isUserError: true }])
              announceToScreenReader(`Compilation failed: ${parsed.interpretation}`)
            } else {
              setOutputLines(prev => [...prev, { kind: 'error', interpretation: event.message, rawOutput: event.data, isUserError: false }])
            }
            setIsRunning(false)
            break
          case 'complete':
            // Terminal event — stream closes after this
            setOutputLines(prev => [...prev, { kind: 'success', text: 'Build successful.' }])
            setIsRunning(false)
            announceToScreenReader('Build successful')
            break
          case 'timeout':
            // Terminal event — stream closes after this
            setOutputLines(prev => [...prev, { kind: 'error', interpretation: `Execution timed out after ${event.timeoutSeconds} seconds.`, rawOutput: event.data, isUserError: true }])
            setIsRunning(false)
            announceToScreenReader('Execution timed out')
            break
          case 'test_output':
            setOutputLines(prev => [...prev, { kind: 'stdout', text: event.data }])
            break
          case 'test_result':
            // Deferred to Epic 4 — just show as stdout for now
            setOutputLines(prev => [...prev, { kind: event.passed ? 'success' : 'stderr', text: event.data }])
            break
          case 'benchmark_progress':
            // Deferred to Epic 7 — show minimal progress indicator for now
            setOutputLines(prev => [...prev, { kind: 'status', text: `Benchmark: ${event.iteration}/${event.total}`, phase: 'benchmarking' }])
            break
          case 'benchmark_result':
            // Deferred to Epic 7 — show raw data for now
            setOutputLines(prev => [...prev, { kind: 'stdout', text: event.data }])
            break
          case 'heartbeat':
            // No-op — heartbeats are filtered at the SSE parser level,
            // but handle defensively in case one reaches here
            break
        }
      }
      ```
      **Key correctness notes:**
      - Only terminal events (`error`, `complete`, `timeout`) set `isRunning(false)` — these are the only events after which the backend closes the SSE stream
      - `compile_error` does NOT set `isRunning(false)` — the stream continues and a terminal event follows
      - Screen reader text matches UX spec line 1733: "Build successful" (not "Compilation successful")
    - Pass `useSSE({ url: sseUrl, onEvent: handleSSEEvent })` where `sseUrl` is constructed from `submissionId`
    - Clear output lines before each new submission
  - [x] 4.2 Pass new props to `WorkspaceLayout`:
    - Add to `WorkspaceLayoutProps`: `outputLines: ReadonlyArray<OutputLine>`, `isRunning: boolean`, `onRetry: () => void`
    - `onRetry` calls `handleRun` again (for platform error retry)
    - `WorkspaceLayout` passes `onRetry` to `TerminalPanel`, which passes it to `ErrorPresentation` for platform error retry buttons
  - [x] 4.3 Guard `milestoneId` from `useParams`:
    - `milestoneId` from `useParams<{ milestoneId: string }>()` can be `undefined` (react-router typing)
    - Guard in `handleRun`: `if (!milestoneId) return` — don't submit without a milestoneId
    - This is at the system boundary (route param) so validation is appropriate
  - [x] 4.4 Screen reader announcements (AC #8):
    - Import `announceToScreenReader` from `../components/workspace/workspace-a11y`
    - Announce on `complete`: "Build successful" (matches UX spec line 1733)
    - Announce on `error` (terminal event): "Compilation failed: [count] issues" (matches UX spec)
    - Announce on `timeout`: "Execution timed out"
  - [x] 4.5 Update `apps/webapp/src/routes/Workspace.test.tsx`:
    - Test: handleRun calls apiFetch with correct endpoint and body
    - Test: handleRun guards against undefined milestoneId
    - Test: successful submit sets submissionId and constructs SSE URL
    - Test: 429 error shows rate limit message in terminal
    - Test: SSE events update outputLines state
    - Test: only terminal events (complete, error, timeout) stop running state
    - Test: compile_error does NOT stop running state
    - Test: benchmark_progress and benchmark_result are handled (not silently dropped)
    - Mock `apiFetch`, `useSSE`, `useEditorStore`
    - Use `vi.restoreAllMocks()` in `afterEach`

- [x] Task 5: Replace `TerminalPlaceholder` with `TerminalPanel` in `WorkspaceLayout` (AC: #1, #2)
  - [x] 5.1 Update `apps/webapp/src/components/workspace/WorkspaceLayout.tsx`:
    - Remove `TerminalPlaceholder` component
    - Import `TerminalPanel` from `./TerminalPanel`
    - Replace `<TerminalPlaceholder />` with `<TerminalPanel outputLines={outputLines} isRunning={isRunning} onRetry={onRetry} />` in both desktop and small-desktop layouts
    - Add `outputLines: ReadonlyArray<OutputLine>`, `isRunning: boolean`, `onRetry: () => void` to `WorkspaceLayoutProps`
  - [x] 5.2 Update `apps/webapp/src/components/workspace/WorkspaceLayout.test.tsx`:
    - Mock `TerminalPanel`: `vi.mock('./TerminalPanel', () => ({ TerminalPanel: ... }))`
    - Remove tests for terminal-placeholder testId
    - Add test: TerminalPanel receives outputLines, isRunning, and onRetry props
    - Use `vi.restoreAllMocks()` in `afterEach`

- [x] Task 6: Verify all tests pass and run quality checks
  - [x] 6.1 Run webapp tests: `pnpm --filter webapp test`
  - [x] 6.2 Run typecheck: `pnpm typecheck`
  - [x] 6.3 Run lint: `pnpm lint`
  - [x] 6.4 Run full pipeline: `turbo lint && turbo typecheck && turbo test`

## Dev Notes

### Architecture Compliance

**Error classification two-path rule:** User-code errors (compilation failures, runtime panics) are SSE event payloads displayed in the terminal. Platform errors (API failures, queue errors) are HTTP status codes. User-code errors must NEVER trigger Sentry. Platform errors must NEVER appear as terminal diagnostic output. The `isUserError` field on the `error` event type enables this distinction.

**State management — hard rule:**
- SSE connection status and output lines are local component state in `Workspace.tsx` (not Zustand, not TanStack Query). This is a deliberate deferral — Story 3.8 will refactor the submission call into a TanStack Query mutation and SSE events into query cache updates. For now, local state is correct because output lines are ephemeral per-submission UI state.
- Active terminal tab → `useWorkspaceUIStore.activeTerminalTab` (already exists)
- Editor content → `useEditorStore.content` (read for submission)
- Never server data in Zustand.

**Named exports only** — all new components use named exports.

**Import patterns:**
- Relative paths within webapp (no `@/` aliases)
- Individual imports from `@mycscompanion/ui/src/components/ui/...`
- Type imports from `@mycscompanion/execution` for `ExecutionEvent`

### SSE Connection Architecture (CRITICAL)

**Native EventSource does NOT support custom headers.** The backend auth plugin requires `Authorization: Bearer <token>` header. Two options:
1. **Fetch-based SSE** — Use `fetch()` with auth header, read `response.body` as `ReadableStream`, parse SSE protocol manually
2. **Query parameter token** — Send token as `?token=...` query param (requires backend change)

**Use fetch-based approach.** Cleaner, no token in URLs/logs, no backend changes needed.

**SSE protocol parsing:**
```
data: {"type":"compile_output","phase":"compiling","data":"main.go:5:2: ...","sequenceId":1}
id: 1
event: compile_output

```
Fields are separated by `\n`, events separated by `\n\n`. Parse `event:`, `data:`, `id:` fields. The `id:` field maps to `sequenceId` for reconnection via `Last-Event-ID`.

**Reconnection:** On network error or unexpected stream end (before terminal event), reconnect with `Last-Event-ID` header set to the last received `id`. Exponential backoff: 1s, 2s, 4s, max 30s. The backend's replay-then-subscribe pattern (double LRANGE in `stream.ts`) handles deduplication.

**Terminal events:** `complete`, `error`, `timeout` — close the connection after receiving. Do NOT reconnect.

**Heartbeat events:** Sent as SSE comments (`: heartbeat\n\n`). Native `EventSource` ignores them. For fetch-based parsing, skip lines starting with `:`.

### ExecutionEvent Type Reference

From `packages/execution/src/events.ts` — the discriminated union:

| Event Type | Phase | Key Fields | Terminal? |
|---|---|---|---|
| `queued` | — | `submissionId` | No |
| `compile_output` | `compiling` | `data`, `sequenceId` | No |
| `compile_error` | `compiling` | `data`, `sequenceId` | No |
| `test_output` | `testing` | `data`, `sequenceId` | No |
| `test_result` | `testing` | `passed`, `details`, `data`, `sequenceId` | No |
| `benchmark_progress` | `benchmarking` | `iteration`, `total`, `data`, `sequenceId` | No |
| `benchmark_result` | `benchmarking` | `userMedian`, `referenceMedian`, `normalizedRatio`, `data`, `sequenceId` | No |
| `output` | any | `data`, `sequenceId` | No |
| `complete` | any | `data`, `sequenceId` | **Yes** |
| `error` | any | `message`, `isUserError`, `data`, `sequenceId` | **Yes** |
| `timeout` | any | `timeoutSeconds`, `data`, `sequenceId` | **Yes** |
| `heartbeat` | — | — | No |

**Import:** `import type { ExecutionEvent } from '@mycscompanion/execution'`

### Backend API Reference

**Submit endpoint:** `POST /api/execution/submit`
- Body: `{ milestoneId: string, code: string }`
- Success: `202 { submissionId: string }`
- Rate limited: `429 { error: { code: 'RATE_LIMITED', message: '...' } }` with `Retry-After` header
- Server error: `500 { error: { code: 'INTERNAL_ERROR', message: '...' } }`
- Queue down: `503 { error: { code: 'SERVICE_UNAVAILABLE', message: '...' } }`

**Stream endpoint:** `GET /api/execution/:submissionId/stream`
- SSE stream with `Content-Type: text/event-stream`
- Supports `Last-Event-ID` for reconnection replay
- Heartbeat every 30s
- Max duration: 5 minutes (Railway hard limit)
- Ownership verified: returns 403 if submission doesn't belong to user

### Auto-Scroll Pattern

Implemented as shared `useAutoScroll` hook in `hooks/use-auto-scroll.ts` per UX spec (lines 1420-1430). Reused by both TerminalPanel (this story) and TutorPanel (Epic 6).

- Auto-scroll to bottom when deps change
- **Pause** if user scrolls up (scrollHeight - scrollTop - clientHeight > 50px)
- **Resume** when user scrolls back to bottom
- `requestAnimationFrame`-throttled scroll handler — critical for SSE streaming (hundreds of events/sec)
- Same pattern as Railway's streaming logs

Usage in TerminalPanel: `const scrollRef = useAutoScroll([outputLines])`

### UX Design Compliance

**No red anywhere.** Errors use `--secondary-foreground`. Distinction is via icon (dash) and content, not color. This is enforced.

**Error interpretation boundary:** Error layer = diagnosis. Tutor = prescription. Never cross. The `ErrorPresentation` component describes what happened. It never tells the user what to do.

**Platform error message template:** "[What happened]. [What to do]." Always with contractions ("Couldn't"). All in `--secondary-foreground`.

**Feedback vocabulary:**
| State | Color | Icon | Tone |
|---|---|---|---|
| Success | `--primary` (green) | Checkmark | Factual: "Build successful." |
| In-progress | `--secondary-foreground` | Spinner | Present tense: "Compiling..." |
| Error/issue | `--secondary-foreground` | Dash | Diagnostic. Describes, not blames. |

**Terminal empty state:** Blinking cursor `$` in `--muted-foreground`. Terminal feels alive.

**Static tab labels:** "Output" never becomes "Errors". "Criteria" never changes. Content changes, labels stay.

### Previous Story Intelligence (Story 3.6)

**Patterns established that apply to this story:**
1. **Component file pattern:** `PascalCase.tsx` with co-located `.test.tsx` in `components/workspace/`
2. **Testing pattern:** Mock dependencies with `vi.mock()`, wrap in providers if needed, `vi.restoreAllMocks()` in `afterEach`
3. **Zustand selector pattern:** `useWorkspaceUIStore((s) => s.activeTerminalTab)` — selector-based
4. **Import paths:** Relative within webapp. Individual imports from `@mycscompanion/ui/src/...`
5. **`workspace-a11y.ts`:** Already exports `announceToScreenReader()` — reuse, don't recreate
6. **ARIA live region:** `#workspace-announcer` already in `WorkspaceLayout.tsx` — shared by all workspace children. Don't add another one.

**Debug learnings from 3.6:**
- `.js` extensions NOT needed in webapp imports (moduleResolution: "bundler")
- `export default` only for route components with `React.lazy()`
- `lucide-react` already installed in webapp

**Files from 3.6 that this story modifies:**
- `apps/webapp/src/components/workspace/WorkspaceLayout.tsx` — replace TerminalPlaceholder with TerminalPanel
- `apps/webapp/src/components/workspace/WorkspaceLayout.test.tsx` — update to mock TerminalPanel
- `apps/webapp/src/routes/Workspace.tsx` — wire handleRun and SSE
- `apps/webapp/src/routes/Workspace.test.tsx` — test submission flow

### Git Intelligence

**Recent commit pattern:** `Implement Story X.Y: <title> with code review fixes`

**New files this story creates:**
- `apps/webapp/src/hooks/use-sse.ts`
- `apps/webapp/src/hooks/use-sse.test.ts`
- `apps/webapp/src/hooks/use-auto-scroll.ts`
- `apps/webapp/src/hooks/use-auto-scroll.test.ts`
- `apps/webapp/src/components/workspace/TerminalPanel.tsx`
- `apps/webapp/src/components/workspace/TerminalPanel.test.tsx`
- `apps/webapp/src/components/workspace/ErrorPresentation.tsx`
- `apps/webapp/src/components/workspace/ErrorPresentation.test.tsx`
- `apps/webapp/src/components/workspace/parse-go-error.ts`
- `apps/webapp/src/components/workspace/parse-go-error.test.ts`

**Modified files:**
- `apps/webapp/src/components/workspace/WorkspaceLayout.tsx`
- `apps/webapp/src/components/workspace/WorkspaceLayout.test.tsx`
- `apps/webapp/src/routes/Workspace.tsx`
- `apps/webapp/src/routes/Workspace.test.tsx`
- `apps/webapp/src/lib/api-fetch.ts` (export `API_URL` constant)

### Project Structure Notes

- All new files in existing directories: `hooks/`, `components/workspace/`
- No new packages created
- No new Zustand stores (uses existing `useWorkspaceUIStore.activeTerminalTab`)
- No new npm dependencies needed (fetch is built-in, lucide-react already installed, shadcn ScrollArea and Collapsible are already in `@mycscompanion/ui`)
- Verify shadcn `Collapsible` and `ScrollArea` components exist in `@mycscompanion/ui`. If not, add them: `npx shadcn@latest add collapsible scroll-area` in the ui package
- Verify `--elevated` CSS custom property exists in `packages/config/tailwind-tokens.css`. If not, add it as a slightly lighter surface than `--card`
- Test co-located: `*.test.tsx` / `*.test.ts` next to source
- Named exports only

### References

- [Source: _bmad-output/planning-artifacts/epics.md — Epic 3, Story 3.7 Acceptance Criteria]
- [Source: _bmad-output/planning-artifacts/architecture.md — SSE Streaming, Error Classification Two-Path, ExecutionEvent Union]
- [Source: _bmad-output/planning-artifacts/architecture.md — Workspace Component Structure, useSSE Hook Pattern]
- [Source: _bmad-output/planning-artifacts/architecture.md — Worker-API Communication (Redis Pub/Sub), SSE Reconnect Replay]
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md — UX-7: Two-tier error presentation]
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md — UX-10: JetBrains Mono terminal font]
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md — UX-16: Screen reader announcements]
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md — UX-23: Static tab labels]
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md — No Red Rule, Feedback Vocabulary]
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md — ScrollArea Streaming Support, Auto-scroll Pattern]
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md — Error Presentation Boundary Rule]
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md — Terminal Empty State, Platform Error Message Template]
- [Source: _bmad-output/project-context.md — State Split Rule, Testing Rules, Error Handling Two-Path]
- [Source: _bmad-output/implementation-artifacts/3-6-monaco-editor-integration.md — Previous Story Patterns]
- [Source: packages/execution/src/events.ts — ExecutionEvent Discriminated Union]
- [Source: apps/backend/src/plugins/execution/routes/submit.ts — Submit API Contract]
- [Source: apps/backend/src/plugins/execution/routes/stream.ts — SSE Stream Implementation]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6

### Debug Log References

None

### Completion Notes List

- Implemented fetch-based SSE hook (`useSSE`) with auth header support, reconnection with exponential backoff, and terminal event handling
- Created shared `useAutoScroll` hook for auto-scrolling containers with pause/resume on user scroll
- Built `TerminalPanel` with Output/Criteria tabs, WAI-ARIA tablist pattern with arrow key navigation, 44px touch targets
- Created `ErrorPresentation` component with two-tier display: human-readable interpretation + collapsible raw output
- Built `parseGoError` utility for Go compiler error parsing with "The..." framing (no prescriptive language)
- Wired full submission flow in `Workspace.tsx`: POST submit → SSE stream → terminal output
- Added screen reader announcements via existing `announceToScreenReader` for build success, failure, and timeout
- Replaced `TerminalPlaceholder` with real `TerminalPanel` in both desktop and small-desktop layouts
- Added `--color-elevated` token to tailwind-tokens.css
- Added shadcn Collapsible and ScrollArea components to `@mycscompanion/ui`
- Exported `API_URL` from `api-fetch.ts`
- All 223 tests pass, lint clean, typecheck clean
- **Code review fixes applied (2026-03-05):**
  - H1: Added ScrollArea component to TerminalPanel (was using overflow-auto, now uses shadcn ScrollArea with viewportRef for auto-scroll)
  - H2: Fixed 429 rate limit error classification from `isUserError: true` to `isUserError: false` (platform error, not user-code error)
  - H3: Added 10 missing tests in Workspace.test.tsx covering handleRun, milestoneId guard, SSE URL construction, 429 handling, SSE event processing, terminal vs non-terminal events, benchmark events, and screen reader announcements
  - M1: Fixed screen reader announcement to use issue count format ("Compilation failed: N issues") per UX spec line 1733
  - M2: Added `void` prefix to floating promise in useSSE reconnect
  - M3: Fixed SSE parser to concatenate multi-line `data:` fields per SSE spec
  - L1: Updated rate limit message to follow platform error template ("Too many submissions. Try again shortly.")
  - Added viewportRef prop to ScrollArea component for auto-scroll integration
- All 233 tests pass after review fixes, lint clean, typecheck clean

### Change Log

- 2026-03-05: Implemented Story 3.7 — Terminal Output & Error Presentation
- 2026-03-05: Code review fixes — 7 issues fixed (3 HIGH, 3 MEDIUM, 1 LOW), 10 tests added

### File List

**New files:**
- `apps/webapp/src/hooks/use-sse.ts`
- `apps/webapp/src/hooks/use-sse.test.ts`
- `apps/webapp/src/hooks/use-auto-scroll.ts`
- `apps/webapp/src/hooks/use-auto-scroll.test.ts`
- `apps/webapp/src/components/workspace/TerminalPanel.tsx`
- `apps/webapp/src/components/workspace/TerminalPanel.test.tsx`
- `apps/webapp/src/components/workspace/ErrorPresentation.tsx`
- `apps/webapp/src/components/workspace/ErrorPresentation.test.tsx`
- `apps/webapp/src/components/workspace/parse-go-error.ts`
- `apps/webapp/src/components/workspace/parse-go-error.test.ts`
- `packages/ui/src/components/ui/collapsible.tsx`
- `packages/ui/src/components/ui/scroll-area.tsx`

**Modified files:**
- `apps/webapp/src/routes/Workspace.tsx` — wired submission flow, SSE, terminal state
- `apps/webapp/src/routes/Workspace.test.tsx` — updated mocks for TerminalPanel, useSSE
- `apps/webapp/src/components/workspace/WorkspaceLayout.tsx` — replaced TerminalPlaceholder with TerminalPanel, added new props
- `apps/webapp/src/components/workspace/WorkspaceLayout.test.tsx` — mock TerminalPanel, updated props
- `apps/webapp/src/lib/api-fetch.ts` — exported `API_URL`
- `packages/config/tailwind-tokens.css` — added `--color-elevated` token
- `packages/ui/src/components/ui/scroll-area.tsx` — added `viewportRef` prop for auto-scroll integration
