# Story 6.3: Tutor Chat UI & Panel Integration

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a learner,
I want a clean, non-intrusive chat interface for the tutor,
so that I can ask questions without leaving my coding context.

## Acceptance Criteria

1. Given the workspace is loaded with the tutor panel, when the learner interacts with the tutor, then the tutor panel displays a chat interface with conversation history and an input field
2. Given the tutor chat input is visible, when the learner sees it, then the input is a single-line `<input>` element with placeholder "Ask a question..." (UX-24)
3. Given a learner types a message, when they press `Enter`, then the message is sent; the input is disabled while the tutor is streaming a response (UX-24)
4. Given the learner is in the workspace, when they press `Cmd+/` (Mac) or `Ctrl+/` (Windows/Linux), then the tutor panel toggles open/closed (UX-22)
5. Given the tutor panel is collapsed and the learner expands it, when the panel opens, then focus remains in the Monaco editor — focus is NOT stolen from the editor unless the learner explicitly clicks the tutor input (UX-15)
6. Given the tutor streams a response with screen reader active, when the stream completes, then a live region announces the tutor's complete message on stream end, not per-token (UX-16)
7. Given the workspace layout, when the tutor panel is visible, then it is non-modal and resizable within the workspace layout (UX-11)
8. Given the tutor chat has messages, when new messages arrive, then chat auto-scrolls to bottom; when the user scrolls up manually, auto-scroll pauses until they scroll back to bottom (UX-18)
9. Given the frontend needs to stream tutor responses, when a message is sent, then SSE stream lifecycle is managed by a `useTutorStream` hook handling connection, event parsing, and cleanup (UX-18)
10. Given the viewport is mobile (<768px), when the tutor panel is shown, then conversation history displays in read-only mode — no input field, no send capability (UX-14)
11. Given the tutor response contains code snippets, when rendered in the chat, then code uses JetBrains Mono font (UX-10)

## Tasks / Subtasks

- [x] Task 1: Create `TutorPanel` component replacing placeholder (AC: #1, #7)
  - [x]1.1 Create `apps/webapp/src/components/workspace/TutorPanel.tsx` — extract and replace the inline `TutorContent` sub-component currently in `WorkspaceLayout.tsx` (lines ~229-255). The new component receives `sessionId: string | null` and reads `tutorAvailable` from `useWorkspaceUIStore`
  - [x]1.2 Component structure: header bar (title "AI Tutor" + collapse button), scrollable message area (attach `useAutoScroll` ref), input area at bottom. Use flexbox column layout with message area as flex-grow
  - [x]1.3 Three visual states driven by store: `tutorAvailable=false` shows unavailable state with retry button (existing pattern), `tutorExpanded=false` shows nothing (panel is collapsed), `tutorExpanded=true && tutorAvailable=true` shows full chat UI
  - [x]1.4 Update `WorkspaceLayout.tsx` to render `<TutorPanel sessionId={sessionId} />` instead of inline `<TutorContent>` in all three layout modes (desktop, small-desktop, mobile)
  - [x]1.5 On mobile layout, render `<TutorPanel>` in read-only mode — pass `readOnly={true}` prop. When `readOnly`, hide the input area entirely and show only conversation history (AC: #10)

- [x] Task 2: Create `useTutorStream` hook for SSE streaming (AC: #3, #9)
  - [x]2.1 Create `apps/webapp/src/hooks/use-tutor-stream.ts`. This is a NEW hook (not reusing `useSSE` — the tutor stream is POST-based, not GET/EventSource-based). Interface: `useTutorStream(sessionId: string | null)` returns `{ sendMessage: (message: string) => void, isStreaming: boolean, streamingContent: string, error: TutorStreamError | null, clearError: () => void }`
  - [x]2.2 `sendMessage` implementation: call `fetch()` with `POST /api/tutor/${sessionId}/stream`, body `{ message }`, headers include Firebase auth token (use `getIdToken()` from Firebase — same pattern as `apiFetch` but manual since we need streaming response). Set `Accept: text/event-stream`
  - [x]2.3 Parse SSE response using `ReadableStream` reader: `response.body.getReader()` → decode chunks → split on `\n\n` → extract `data:` lines → `JSON.parse()` each into `TutorStreamEvent` discriminated union
  - [x]2.4 On `text_delta` event: append `delta` to internal `streamingContent` state (accumulate text progressively)
  - [x]2.5 On `message_complete` event: clear `streamingContent`, add the completed message to TanStack Query cache (see Task 3), set `isStreaming=false`
  - [x]2.6 On `error` event: set `error` state with the `TutorStreamError`, set `isStreaming=false`. If error code is `TUTOR_UNAVAILABLE`, also call `setTutorAvailable(false)` on workspace store
  - [x]2.7 Handle HTTP-level errors (non-200 responses before SSE starts): 401 → redirect to login, 429 → set error with rate limit message and `retryAfter` from response, 404 → session error, 400 → validation error. Parse JSON error body
  - [x]2.8 Cleanup: abort fetch on component unmount using `AbortController`. Clear any pending state
  - [x]2.9 Guard: prevent sending while `isStreaming=true`. Guard against `sessionId=null`

- [x] Task 3: Integrate TanStack Query for conversation history (AC: #1, #8)
  - [x]3.1 Create `apps/webapp/src/hooks/use-tutor-messages.ts` with `useTutorMessages(sessionId: string | null)` — wraps `useInfiniteQuery` for paginated message history from `GET /api/tutor/${sessionId}/messages`. NOTE: `useInfiniteQuery` has not been used elsewhere in this codebase — follow the v5 pattern below:
    ```typescript
    const { data, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
      queryKey: ['tutor', 'messages', sessionId],
      queryFn: ({ pageParam }) =>
        apiFetch<{ messages: TutorConversationMessage[]; nextCursor: string | null }>(
          `/api/tutor/${sessionId}/messages${pageParam ? `?afterCursor=${pageParam}` : ''}`
        ),
      initialPageParam: undefined as string | undefined,
      getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
      staleTime: 5 * 60 * 1000,
      enabled: !!sessionId,
    })
    ```
  - [x]3.2 Query key: `['tutor', 'messages', sessionId]`. Set `staleTime: 5 * 60 * 1000` (5 min — conversation doesn't change from other sources). `enabled: !!sessionId`
  - [x]3.3 Implement `getNextPageParam` using `nextCursor` from response. `initialPageParam: undefined`. Initial page loads most recent 20 messages
  - [x]3.4 Provide `addOptimisticMessage` helper: when user sends a message, immediately insert a user message into the query cache using `queryClient.setQueryData()` so it appears instantly in the UI (optimistic update). Generate a temporary client-side ID (prefix `temp-`)
  - [x]3.5 On `message_complete` event from `useTutorStream`: insert the assistant message into query cache AND replace any temp user message ID with the real persisted ID if returned
  - [x]3.6 Expose `fetchNextPage` and `hasNextPage` for infinite scroll — when user scrolls to top, load older messages
  - [x]3.7 Flatten pages into a single `messages` array (chronological order — oldest first) for rendering

- [x] Task 4: Build chat message rendering (AC: #1, #11)
  - [x]4.1 Create `apps/webapp/src/components/workspace/TutorMessage.tsx` — renders a single chat message bubble. Props: `message: TutorConversationMessage`, `isStreaming?: boolean`, `streamingContent?: string`
  - [x]4.2 Visual differentiation: user messages right-aligned with muted background, assistant messages left-aligned with subtle border. Use Tailwind classes, match existing workspace dark theme
  - [x]4.3 For assistant messages, render markdown content. `react-markdown` v10.1.0 is ALREADY installed in `apps/webapp/package.json` — do NOT reinstall. Reuse the existing `MARKDOWN_COMPONENTS` custom renderer pattern from `apps/webapp/src/components/workspace/MilestoneBrief.tsx` (it defines styled renderers for h1-h3, p, ul, ol, li, code, pre with Tailwind classes matching the workspace dark theme). Extract or copy the components object and extend code block renderers to use `className="font-mono"` (Tailwind token `--font-mono` already maps to `'JetBrains Mono', 'Fira Code', ...`) for both inline code and block code (AC: #11). If `remark-gfm` is not installed, add it: `pnpm --filter webapp add remark-gfm`
  - [x]4.4 For the currently streaming message (`isStreaming=true`): render `streamingContent` with a blinking cursor indicator (CSS animation). Do NOT use a separate component — same `TutorMessage` with conditional streaming state
  - [x]4.5 Timestamp display: relative time ("2m ago") for recent, absolute for older. Use `Intl.RelativeTimeFormat` or simple helper — no external date library

- [x] Task 5: Wire up input field and send behavior (AC: #2, #3, #10)
  - [x]5.1 Create `apps/webapp/src/components/workspace/TutorInput.tsx` — single-line `<input type="text">` with placeholder "Ask a question..." (exact text per UX-24). Controlled component with local state
  - [x]5.2 `Enter` key handler: trim message, validate non-empty and length <= 2000, call `sendMessage()` from `useTutorStream`, clear input. Prevent default form submission
  - [x]5.3 Disable input (`disabled` attribute + visual styling) while `isStreaming=true`. Show subtle loading indicator (pulsing dot or similar) next to input
  - [x]5.4 Do NOT render `TutorInput` when `readOnly=true` (mobile mode) — the parent `TutorPanel` conditionally excludes it
  - [x]5.5 On rate limit error (429): show inline error message below input with retry countdown using `retryAfter` value. Auto-clear when countdown expires
  - [x]5.6 On generic error: show inline error message below input with dismiss button

- [x] Task 6: Focus management and keyboard shortcuts (AC: #4, #5)
  - [x]6.1 Keyboard shortcut `Cmd+/` / `Ctrl+/` is ALREADY implemented in `WorkspaceLayout.tsx` (line ~85) calling `toggleTutor()`. Verify it still works after the refactor — no new code needed
  - [x]6.2 Focus management on panel expand: do NOT call `.focus()` on the tutor input when panel expands. The existing `WorkspaceLayout.tsx` toggle code does not move focus — verify this remains true after refactor. The learner must explicitly click the input to focus it (UX-15)
  - [x]6.3 Focus management on panel collapse: if focus is inside the tutor panel when it collapses, move focus back to the Monaco editor using the `CodeEditor` ref or `document.querySelector('.monaco-editor textarea')`
  - [x]6.4 `Escape` key behavior is already implemented in `WorkspaceLayout.tsx` (line ~91) — verify it still works

- [x] Task 7: Screen reader accessibility (AC: #6)
  - [x]7.1 Add ARIA live region for tutor responses: create a visually hidden `<div aria-live="polite" aria-atomic="true">` that receives the complete assistant message text ONLY when the stream finishes (on `message_complete` event). Use the existing `announceToScreenReader()` from `workspace-a11y.ts`
  - [x]7.2 Do NOT announce per-token — only announce the complete final message. This prevents screen reader spam during streaming
  - [x]7.3 Add `role="log"` to the message container and `role="listitem"` to each message for semantic structure
  - [x]7.4 Input field: add `aria-label="Send a message to AI tutor"` and `aria-disabled` when streaming

- [x] Task 8: Write component tests (AC: #1-#11)
  - [x]8.1 Create `apps/webapp/src/components/workspace/TutorPanel.test.tsx` — component tests using Vitest + `@testing-library/react`
  - [x]8.2 Test: renders chat input with correct placeholder when session is active
  - [x]8.3 Test: renders unavailable state with retry button when `tutorAvailable=false`
  - [x]8.4 Test: hides input in read-only mode (mobile)
  - [x]8.5 Test: disables input while streaming
  - [x]8.6 Test: sends message on Enter key press
  - [x]8.7 Test: does not send empty or whitespace-only messages
  - [x]8.8 Test: renders user and assistant messages with correct alignment
  - [x]8.9 Test: shows streaming content with cursor indicator during active stream
  - [x]8.10 Test: announces complete message to screen reader on stream end
  - [x]8.11 Create `apps/webapp/src/hooks/use-tutor-stream.test.ts` — hook tests
  - [x]8.12 Test: parses SSE text_delta events and accumulates content
  - [x]8.13 Test: handles message_complete event and updates query cache
  - [x]8.14 Test: handles error events and sets error state
  - [x]8.15 Test: handles HTTP 429 with retryAfter
  - [x]8.16 Test: aborts fetch on cleanup
  - [x]8.17 Test: prevents concurrent sends while streaming
  - [x]8.18 Create `apps/webapp/src/hooks/use-tutor-messages.test.ts` — query hook tests
  - [x]8.19 Test: fetches initial message page on mount
  - [x]8.20 Test: adds optimistic user message to cache
  - [x]8.21 Test: paginates with cursor when scrolling to top

## Dev Notes

### Critical Architecture Constraints

**State Management — Hard Rules:**
- Server state (messages, history) → TanStack Query ONLY. Key: `['tutor', 'messages', sessionId]`
- UI state (panel expanded, tutor available) → `useWorkspaceUIStore` ONLY
- NEVER put message data in Zustand. NEVER put UI state in TanStack Query
- Only 2 Zustand stores exist: `useWorkspaceUIStore` and `useEditorStore`. Do NOT create a third

**SSE Streaming — POST-Based (Not EventSource):**

The tutor stream uses `POST /api/tutor/:sessionId/stream` which requires a request body. The browser `EventSource` API only supports GET, so the `useTutorStream` hook must use `fetch()` with `ReadableStream` for SSE parsing. This is different from the execution `useSSE` hook which uses GET-based `EventSource`.

```typescript
// Pattern for POST-based SSE consumption
const response = await fetch(`${API_URL}/api/tutor/${sessionId}/stream`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
    'Accept': 'text/event-stream',
  },
  body: JSON.stringify({ message }),
  signal: abortController.signal,
})

const reader = response.body!.getReader()
const decoder = new TextDecoder()
let buffer = ''

while (true) {
  const { done, value } = await reader.read()
  if (done) break
  buffer += decoder.decode(value, { stream: true })

  // Split on double newline (SSE event boundary)
  const parts = buffer.split('\n\n')
  buffer = parts.pop()! // Keep incomplete last part in buffer

  for (const part of parts) {
    if (part.startsWith('data: ')) {
      const event: TutorStreamEvent = JSON.parse(part.slice(6))
      // Handle event by type discriminator
    }
    // Skip heartbeat comments (lines starting with ':')
  }
}
```

**Firebase Auth Token — Manual Attachment:**

Since `useTutorStream` uses raw `fetch()` (not `apiFetch`), it must manually get the Firebase token:

```typescript
import { getAuth } from 'firebase/auth'

const auth = getAuth()
const token = await auth.currentUser?.getIdToken()
```

Follow the same pattern as `apiFetch` but without the retry logic (streaming requests shouldn't be auto-retried).

**Shared Types from `@mycscompanion/shared`:**

Import these types — they are already exported:
```typescript
import type {
  TutorStreamEvent,
  TutorStreamTextDelta,
  TutorStreamMessageComplete,
  TutorStreamError,
  TutorConversationMessage,
  TutorMessageResponse,
} from '@mycscompanion/shared'
```

**Component Organization:**
- New components go in `apps/webapp/src/components/workspace/` (feature-grouped)
- New hooks go in `apps/webapp/src/hooks/`
- Files: `PascalCase.tsx` for components, `kebab-case.ts` for hooks/utilities
- Named exports only — no default exports
- Co-located tests: `TutorPanel.test.tsx` next to `TutorPanel.tsx`

**Focus Management — Critical UX Detail:**

The `WorkspaceLayout.tsx` already handles `Cmd+/` toggle and `Escape` close. The key constraint is: expanding the tutor panel must NOT steal focus from Monaco. The existing code toggles panel visibility without calling `.focus()` — verify this remains true after refactoring out `TutorContent` into `TutorPanel`.

**Auto-Scroll Hook — Already Exists:**

`useAutoScroll` is already implemented at `apps/webapp/src/hooks/use-auto-scroll.ts`. It returns a ref to attach to the scroll container. It auto-scrolls on dependency changes and pauses when user scrolls up (50px threshold). Usage:

```typescript
const scrollRef = useAutoScroll([messages, streamingContent])
// Attach to: <div ref={scrollRef} className="overflow-y-auto">
```

**Markdown Rendering — Reuse Existing Pattern:**

`react-markdown` v10.1.0 is ALREADY installed in `apps/webapp/package.json`. `MilestoneBrief.tsx` already defines a `MARKDOWN_COMPONENTS` object with custom Tailwind-styled renderers for h1-h3, p, ul, ol, li, code (inline + block), and pre. Reuse or extract this pattern for tutor message rendering. Extend code block renderers with `className="font-mono"` — the Tailwind `font-mono` token already resolves to `'JetBrains Mono', 'Fira Code', 'SF Mono', 'Cascadia Code', monospace` via `--font-mono` in `packages/ui/src/globals.css`. No custom `font-family` CSS needed — just use the Tailwind class.

**Mobile Behavior (<768px):**

The `breakpointMode` in `useWorkspaceUIStore` tracks viewport size. When `breakpointMode === 'mobile'`, the tutor panel shows read-only conversation history only — no input, no send capability. The `MobileLayout` in `WorkspaceLayout.tsx` already has a tutor panel slot.

### Existing Code to Modify

**`Workspace.tsx` route (MODIFY — do this FIRST, it's a blocking prerequisite):**
- `sessionId` is currently stored in `sessionIdRef` (a ref) and is NOT passed to `WorkspaceLayout`. This must be fixed before TutorPanel can work.
- Convert `sessionIdRef` to React state: `const [sessionId, setSessionId] = useState<string | null>(null)`. Update the `useSession` `onSuccess` callback to call `setSessionId(data.session.id)` instead of `sessionIdRef.current = data.session.id`
- Update all existing `sessionIdRef.current` usages in `Workspace.tsx` to use the `sessionId` state variable
- Pass `sessionId` as a new prop to `<WorkspaceLayout sessionId={sessionId} />`
- Do NOT put `sessionId` in `useWorkspaceUIStore` — it is server state, not UI state

**`WorkspaceLayout.tsx` (MODIFY):**
- Add `sessionId: string | null` to the component props interface
- Replace inline `TutorContent` sub-component with imported `<TutorPanel sessionId={sessionId} />`
- Remove the `TutorContent` function definition (lines ~229-255) entirely

### Existing Hooks to Reuse (NOT recreate)

| Hook | Location | Usage |
|------|----------|-------|
| `useAutoScroll` | `hooks/use-auto-scroll.ts` | Attach ref to message scroll container |
| `useSession` | `hooks/use-session.ts` | Already called in `Workspace.tsx` — provides `sessionId` |
| `useStuckDetection` | `hooks/use-stuck-detection.ts` | Already exists — do NOT break its integration points in WorkspaceLayout during refactor |
| `apiFetch` | `lib/api-fetch.ts` | Use for history GET requests (TanStack Query `queryFn`). Follow established pattern: `apiFetch<ResponseType>('/api/path')` |

### Existing Utilities to Reuse

| Utility | Location | Usage |
|---------|----------|-------|
| `announceToScreenReader` | `components/workspace/workspace-a11y.ts` | Announce completed tutor message. **Prerequisite:** requires a `<div id="workspace-announcer" aria-live="polite">` in the DOM — this already exists in `WorkspaceLayout.tsx`. Do NOT create a duplicate |
| `useWorkspaceUIStore` | `stores/workspace-ui-store.ts` | Read `tutorExpanded`, `tutorAvailable`, `breakpointMode` |
| `MARKDOWN_COMPONENTS` | `components/workspace/MilestoneBrief.tsx` | Reuse/extract the custom renderer object for `react-markdown` styling |

### TanStack Query Cache Update Pattern (from use-submit-code.ts)

The established pattern for updating query cache from SSE events — use this in `useTutorStream`:
```typescript
// In useTutorStream, after message_complete event:
const queryClient = useQueryClient()

// Insert assistant message into infinite query cache
queryClient.setQueryData<InfiniteData<MessagesPage>>(
  ['tutor', 'messages', sessionId],
  (old) => {
    if (!old) return old
    const lastPage = old.pages[old.pages.length - 1]
    return {
      ...old,
      pages: [
        ...old.pages.slice(0, -1),
        { ...lastPage, messages: [...lastPage.messages, newAssistantMessage] },
      ],
    }
  }
)
```

### Test Infrastructure

**Import paths for test utilities:**
- `createTestQueryClient` — import from `'@mycscompanion/config/test-utils'` (barrel export)
- `TestProviders` — import from `'@mycscompanion/config/test-utils/providers'` directly (**NOT from barrel** — deliberately excluded from `index.ts` to avoid TS6142 error in backend packages)

### Anti-Patterns to Avoid

- Do NOT use `EventSource` API — tutor stream is POST-based, EventSource only supports GET
- Do NOT create a third Zustand store — use `useWorkspaceUIStore` for tutor UI state
- Do NOT put message content in Zustand — messages go in TanStack Query cache
- Do NOT announce per-token to screen reader — only complete messages (UX-16)
- Do NOT auto-focus the tutor input on panel expand — must not steal Monaco focus (UX-15)
- Do NOT use `test()` — use `it()`. Do NOT use `.spec.ts` — use `.test.ts`
- Do NOT use `toMatchSnapshot()` — use behavioral assertions
- Do NOT use `any` — use proper types from `@mycscompanion/shared`
- Do NOT use default exports — named exports only
- Do NOT use `as` casts — use `satisfies` or type narrowing
- Do NOT use `@/` import aliases — relative paths within apps
- Do NOT use `console.log` — no logging in frontend (no pino in webapp)
- Do NOT import from `@mycscompanion/ui` barrel — import components individually
- Do NOT create a separate reconnection/replay mechanism for tutor (unlike execution SSE) — if stream breaks, user sends a new message
- Do NOT create new markdown renderer components from scratch — reuse/extend the `MARKDOWN_COMPONENTS` pattern from `MilestoneBrief.tsx`
- Do NOT use custom `font-family: 'JetBrains Mono'` CSS — use Tailwind `font-mono` class (already configured in `--font-mono` token)
- Do NOT import `TestProviders` from `'@mycscompanion/config/test-utils'` barrel — import from `'@mycscompanion/config/test-utils/providers'` directly

### Previous Story (6.2) Learnings Applied

- **SSE event types already defined:** `TutorStreamEvent` discriminated union in `@mycscompanion/shared` — import, don't recreate
- **POST route for streaming:** `POST /:sessionId/stream` with body `{ message }` — not GET
- **User message persisted server-side before streaming:** Frontend should show optimistic user message immediately, but server handles persistence
- **Assistant message persisted after stream completes:** `message_complete` event contains the persisted message ID
- **Rate limiting:** 30 msgs/min shared between POST message and POST stream routes — same key
- **Heartbeat comments:** Server sends `: heartbeat\n\n` every 30s — skip these in SSE parser (lines starting with `:`)
- **Max stream duration:** 3 minutes server-side timeout — client should handle stream ending unexpectedly
- **Error before SSE:** Validation errors (400, 401, 404, 429) return JSON, not SSE. Only after 200 does SSE format begin
- **Whitespace rejection:** Server rejects whitespace-only messages — client should also trim and validate

### Git Intelligence (from Stories 6.1 & 6.2)

Recent commits show the tutor backend is fully implemented:
- `8e58db6` — Story 6.2: SSE streaming route, conversation history helper, shared stream event types
- `b448fd8` — Story 6.1: Anthropic integration, context assembler, message route, history route, rate limiter

Key patterns from these commits:
- DI via minimal interfaces (AnthropicClient, RedisCache) — frontend doesn't need to worry about this
- Composite cursor pagination `(created_at, id)` — frontend uses cursor string opaquely
- Code review fixes: eliminated `as` casts, fixed test ordering, added whitespace rejection

### Project Structure Notes

- All new files in existing directories — no new directories needed
- Components follow `workspace/` feature grouping convention
- Hooks follow `hooks/` flat organization
- Tests co-located next to source files
- No barrel file changes needed — components imported directly in WorkspaceLayout

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Epic-6-Story-6.3]
- [Source: _bmad-output/planning-artifacts/architecture.md#AI-Tutor-Architecture]
- [Source: _bmad-output/planning-artifacts/architecture.md#Frontend-Architecture]
- [Source: _bmad-output/planning-artifacts/architecture.md#SSE-Streaming]
- [Source: _bmad-output/planning-artifacts/architecture.md#State-Management]
- [Source: _bmad-output/project-context.md — project rules and conventions]
- [Source: apps/webapp/src/components/workspace/WorkspaceLayout.tsx — existing tutor panel scaffold]
- [Source: apps/webapp/src/hooks/use-sse.ts — execution SSE pattern reference (GET-based)]
- [Source: apps/webapp/src/hooks/use-auto-scroll.ts — reuse directly]
- [Source: apps/webapp/src/hooks/use-session.ts — session ID provider]
- [Source: apps/webapp/src/stores/workspace-ui-store.ts — tutor UI state]
- [Source: apps/webapp/src/lib/api-fetch.ts — auth token pattern reference]
- [Source: apps/webapp/src/components/workspace/workspace-a11y.ts — screen reader announcements]
- [Source: packages/shared/src/types/api.ts — TutorStreamEvent types]
- [Source: apps/backend/src/plugins/tutor/routes/stream.ts — SSE endpoint contract]
- [Source: apps/backend/src/plugins/tutor/routes/history.ts — pagination contract]
- [Source: apps/webapp/src/components/workspace/MilestoneBrief.tsx — MARKDOWN_COMPONENTS reuse pattern]
- [Source: apps/webapp/src/hooks/use-stuck-detection.ts — existing hook, preserve integration]
- [Source: apps/webapp/src/hooks/use-submit-code.ts — TanStack Query cache update from SSE pattern]
- [Source: packages/config/test-utils/providers.tsx — TestProviders (import directly, not from barrel)]
- [Source: packages/ui/src/globals.css — font-mono token with JetBrains Mono]
- [Source: _bmad-output/implementation-artifacts/6-2-tutor-sse-streaming-and-conversation-persistence.md — previous story]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6

### Debug Log References

None — clean implementation, no blockers encountered.

### Completion Notes List

- Converted `sessionIdRef` in `Workspace.tsx` to React state (`useState`) alongside the existing ref (ref kept for cleanup callbacks). `sessionId` now passed as prop to `WorkspaceLayout`.
- Created `TutorPanel` component replacing inline `TutorContent` in `WorkspaceLayout.tsx`. Three visual states: unavailable (retry button), collapsed (empty), expanded (full chat UI with header, message area, input).
- Created `useTutorStream` hook — POST-based SSE streaming via `fetch()` + `ReadableStream`. Handles `text_delta` (accumulate), `message_complete` (cache update + screen reader announce), `error` (including `TUTOR_UNAVAILABLE`). HTTP error handling for 401/429/400/404. AbortController cleanup on unmount. Guards against concurrent sends and null sessionId.
- Created `useTutorMessages` hook — `useInfiniteQuery` for cursor-based pagination of conversation history. Optimistic user message insertion via `setQueryData`. Pages flattened into chronological `messages` array.
- Created `TutorMessage` component — user messages right-aligned (muted bg), assistant messages left-aligned (border). Markdown rendering via `react-markdown` + `remark-gfm` with custom `TUTOR_MARKDOWN_COMPONENTS` using `font-mono` class for code. Streaming cursor indicator. Relative timestamps.
- Created `TutorInput` component — single-line `<input>` with placeholder "Ask a question...". Enter to send, disabled during streaming, 2000 char limit. Rate limit countdown, generic error with dismiss.
- Focus management: Escape key moves focus to Monaco editor. Panel expand does NOT auto-focus input (UX-15 preserved).
- Screen reader: `announceToScreenReader()` called on `message_complete` only (not per-token). Message area has `role="log"`, each message has `role="listitem"`. Input has `aria-label` and `aria-disabled`.
- Mobile: `readOnly` prop hides input entirely, showing only conversation history.
- Added `remark-gfm` dependency to webapp.
- Updated existing test files (`WorkspaceLayout.test.tsx`, `Workspace.test.tsx`) to mock `TutorPanel` and add `sessionId` prop.
- 23 new tests across 3 test files, all passing. Full suite: 456 tests, 0 failures, 0 regressions.

### Change Log

- 2026-03-09: Story 6.3 implementation complete — Tutor Chat UI & Panel Integration
- 2026-03-09: Code review fixes — removed `as` casts (H1), replaced retryAfter string encoding with structured field (H2), added response.body null guard (M1), added pnpm-lock.yaml to File List (M2), replaced module-level tempIdCounter with crypto.randomUUID() (L1), fixed test import paths to use barrel export (L2)

### File List

**New files:**
- `apps/webapp/src/components/workspace/TutorPanel.tsx`
- `apps/webapp/src/components/workspace/TutorPanel.test.tsx`
- `apps/webapp/src/components/workspace/TutorMessage.tsx`
- `apps/webapp/src/components/workspace/TutorInput.tsx`
- `apps/webapp/src/hooks/use-tutor-stream.ts`
- `apps/webapp/src/hooks/use-tutor-stream.test.ts`
- `apps/webapp/src/hooks/use-tutor-messages.ts`
- `apps/webapp/src/hooks/use-tutor-messages.test.ts`

**Modified files:**
- `apps/webapp/src/routes/Workspace.tsx` — added `sessionId` state, passed to `WorkspaceLayout`
- `apps/webapp/src/routes/Workspace.test.tsx` — added `TutorPanel` mock
- `apps/webapp/src/components/workspace/WorkspaceLayout.tsx` — added `sessionId` prop, replaced `TutorContent` with `TutorPanel`, updated mobile layout, added Escape focus management
- `apps/webapp/src/components/workspace/WorkspaceLayout.test.tsx` — added `sessionId` to defaultProps, added `TutorPanel` mock
- `apps/webapp/package.json` — added `remark-gfm` dependency
- `pnpm-lock.yaml` — updated from `remark-gfm` addition
