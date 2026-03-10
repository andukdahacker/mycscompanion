# Story 6.4: Two-Stage Stuck Detection & Proactive Intervention

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a learner,
I want the tutor to notice when I'm stuck and offer help without being intrusive,
so that I get unstuck faster without feeling watched or patronized.

## Acceptance Criteria

1. Given a learner is working on a milestone and has not made progress, when the client-side inactivity timer reaches the milestone-configured threshold, then Stage 1 activates: a subtle green glow appears on the collapsed tutor panel as a non-intrusive signal (UX-4)
2. Given Stage 1 is active, when 60 additional seconds pass without activity, then Stage 2 activates: the tutor panel auto-expands with a contextual Socratic question based on the learner's current code and criteria state (FR17, UX-4)
3. Given stuck detection thresholds are loaded from milestone configuration on workspace mount (ARCH-11), then thresholds can differ per milestone (earlier milestones may have shorter thresholds)
4. Given the green glow animation is rendered, when the user has `prefers-reduced-motion` enabled, then the glow animation is removed and replaced with a static indicator (UX-25)
5. Given the learner dismisses the tutor or collapses the panel after stuck detection triggered, then stuck detection resets and the green glow is removed
6. Given Stage 2 triggers, when the tutor panel auto-expands, then focus remains in the Monaco editor — the panel expands without stealing focus (consistent with UX-15)
7. Given the tutor is unavailable (`tutorAvailable=false`), when stuck detection would trigger Stage 2, then Stage 2 is suppressed — no auto-expand, no intervention request — but Stage 1 visual still shows

## Tasks / Subtasks

- [x] Task 1: Add stuck detection thresholds to milestone content pipeline (AC: #3)
  - [x]1.1 Extend `metadata.yaml` schema: add `stuckDetection` object with `thresholdMinutes: number` and `stage2OffsetSeconds: number` fields to milestone metadata. Update `content/milestones/01-kv-store/metadata.yaml` (this file EXISTS) to add the `stuckDetection` field. **CREATE new `metadata.yaml` files** for the other 4 milestones — they do NOT have `metadata.yaml` yet: `02-storage-engine/metadata.yaml` (10min/60s), `03-btree-indexing/metadata.yaml` (7min/60s), `04-query-parser/metadata.yaml` (8min/60s), `05-transactions/metadata.yaml` (8min/60s). Each new file also needs `csConceptLabel: null` (or appropriate label if known) alongside the stuckDetection field
  - [x]1.2 Extend `MilestoneMetadata` interface in `apps/backend/src/plugins/curriculum/content-loader.ts`: add `readonly stuckDetection: { readonly thresholdMinutes: number; readonly stage2OffsetSeconds: number } | null`. Update `emptyMetadata` to include `stuckDetection: null`
  - [x]1.3 Update `readMetadata()` in content-loader.ts to parse the `stuckDetection` field from metadata.yaml. If not present, default to `null` (frontend falls back to hardcoded defaults)
  - [x]1.4 Extend `MilestoneContent` in `packages/shared/src/types/curriculum.ts`: add `readonly stuckDetection: { readonly thresholdMinutes: number; readonly stage2OffsetSeconds: number } | null`
  - [x]1.5 Update curriculum milestones route in `apps/backend/src/plugins/curriculum/routes/milestones.ts` to include `stuckDetection: metadata.stuckDetection` in the response
  - [x]1.6 Update `useWorkspaceData` in `apps/webapp/src/hooks/use-workspace-data.ts`: read `stuckDetection` from the API response instead of using the hardcoded `{ thresholdMinutes: 10, stage2OffsetSeconds: 60 }`. Use API value if not null, otherwise fall back to the hardcoded defaults
  - [x]1.7 Move `StuckDetectionConfig` type to `packages/shared/src/types/curriculum.ts` and export from `@mycscompanion/shared`. Update `use-workspace-data.ts` and `use-stuck-detection.ts` to import from shared

- [x] Task 2: Wire stuck detection state to WorkspaceLayout (AC: #1, #4, #5, #6)
  - [x]2.1 In `Workspace.tsx`: destructure `isStage1`, `isStage2` from `useStuckDetection()` (currently only `resetTimer` is destructured). Pass `isStage1` and `isStage2` as new props to `<WorkspaceLayout>`
  - [x]2.2 Add `isStage1: boolean` and `isStage2: boolean` to `WorkspaceLayoutProps` interface in `WorkspaceLayout.tsx`
  - [x]2.3 Stage 1 visual — collapsed tutor panel button (desktop layout, lines 217-224): When `isStage1=true` AND `tutorExpanded=false`, apply a subtle green glow to the collapsed tutor panel button. Import `cn` utility: `import { cn } from '@mycscompanion/ui/src/lib/utils'` (NO webapp component currently imports `cn` — this is the first usage, follow the same path pattern used for other UI imports like `@mycscompanion/ui/src/components/ui/button`):
    - Use `cn()` to conditionally apply classes: `animate-pulse bg-primary/10 text-primary` when `isStage1` (replaces default `text-muted-foreground`)
    - The `animate-pulse` Tailwind utility creates a gentle opacity pulsing effect — this IS the "subtle green glow"
    - For `prefers-reduced-motion`: add `motion-reduce:animate-none` class so the pulse stops but the static green tint (`bg-primary/10 text-primary`) remains as the indicator (AC: #4)
    - Add `aria-label="Expand tutor panel - tutor wants to help"` when `isStage1=true` for screen reader users
  - [x]2.4 Stage 1 visual — small-desktop layout: The small-desktop layout doesn't have a visible collapsed state (tutor is an overlay). Add a floating indicator button in the bottom-right corner when `isStage1=true && !tutorExpanded`: a small circular button with `MessageCircle` icon, same green glow classes. Clicking it opens the tutor overlay. Same `motion-reduce:animate-none` treatment
  - [x]2.5 Stage 2 auto-expand — In `Workspace.tsx`, add a `useEffect` that watches `isStage2`:
    ```typescript
    useEffect(() => {
      if (isStage2 && tutorAvailable) {
        setTutorExpanded(true)
      }
    }, [isStage2, tutorAvailable, setTutorExpanded])
    ```
    Note: `tutorAvailable` from `useWorkspaceUIStore` — if tutor is unavailable, suppress Stage 2 expansion (AC: #7). Focus is NOT stolen because `setTutorExpanded(true)` triggers the imperative panel `expand()` in `WorkspaceLayout`'s existing sync effect, which does not call `.focus()` (preserves UX-15, AC: #6)
  - [x]2.6 Reset on dismiss — In `Workspace.tsx`, add a `useEffect` that watches `tutorExpanded`:
    ```typescript
    useEffect(() => {
      if (!tutorExpanded && (isStage1 || isStage2)) {
        resetTimer()
      }
    }, [tutorExpanded, isStage1, isStage2, resetTimer])
    ```
    When user collapses the tutor (via Escape, Cmd+/, or clicking outside on small-desktop), stuck detection resets completely (AC: #5)

- [x] Task 3: Create stuck intervention backend endpoint (AC: #2)
  - [x]3.1 Create `apps/backend/src/plugins/tutor/services/stuck-context-assembler.ts` — a new function `assembleStuckInterventionPrompt(params)` that:
    - Reads the stuck intervention prompt template from `content/prompts/stuck-intervention.md` (cache in memory like `tutor-base.md`)
    - Loads: milestone brief (from Redis cache via existing `contextAssembler` pattern), current code snapshot, criteria status, user background, and session summary
    - Computes `stuck_criterion`: the FIRST acceptance criterion with status `'not_met'` from the latest completed submission (or `'(unknown)'` if no submission yet)
    - Computes `recent_diffs`: load the 2 most recent code snapshots, compute a simple diff description (e.g., "Added 15 lines, removed 3 lines" + the last 10 changed lines). If only 1 snapshot exists, note "(No previous snapshot for comparison)"
    - Computes `time_stuck_minutes`: accept as a parameter from the client request
    - Replaces all `{{template_variables}}` in the stuck-intervention.md template
    - Returns the assembled prompt string
  - [x]3.2 Create `apps/backend/src/plugins/tutor/routes/stuck-intervention.ts` — new route `POST /:sessionId/stuck-intervention`:
    - Request body schema: `{ timeStuckMinutes: number }` (integer, min: 1, max: 60)
    - Auth required (same as stream route)
    - Rate limiting: reuse existing `rate:tutor:${uid}` key (counts against same 30/min limit)
    - Session ownership validation (same pattern as stream route)
    - Assemble stuck intervention prompt via `assembleStuckInterventionPrompt()`
    - Load conversation history (same as stream route)
    - Call `anthropicService.createStreamingTutorResponse()` with the stuck intervention system prompt. Set `context.isStuckIntervention = true` to force Sonnet model (see Task 3.5 below)
    - Stream response via SSE (same writeSSE pattern as stream route)
    - Persist the intervention as an assistant message in `tutor_messages` with `model` field set
    - ALSO persist a synthetic user message BEFORE the intervention: content `"[System: Stuck detection triggered — proactive intervention]"`, role `'user'` — this preserves conversation context so subsequent tutor interactions know an intervention happened
  - [x]3.3 Register the stuck intervention route in `apps/backend/src/plugins/tutor/index.ts`: `await fastify.register(stuckInterventionRoutes, { db, anthropicService, contextAssembler, rateLimiter, contentRoot: opts.contentRoot, promptsRoot })`. Add `promptsRoot` to `TutorPluginOptions` interface (optional, with same default as context-assembler)
  - [x]3.5 Extend Anthropic service model routing in `apps/backend/src/plugins/tutor/services/anthropic.ts`: Add `readonly isStuckIntervention?: boolean` to the `TutorContext` type. Update `selectModel()` to check `context.isStuckIntervention` FIRST — if true, return `SONNET_MODEL`. Do NOT hack `hasCompileErrors: true` to force Sonnet — that's fragile and misleading. The `selectModel` function should read:
    ```typescript
    function selectModel(context: TutorContext): string {
      if (context.isStuckIntervention) return SONNET_MODEL
      if (context.hasCompileErrors) return SONNET_MODEL
      if (EXPLAIN_PATTERNS.test(context.userMessage)) return SONNET_MODEL
      return HAIKU_MODEL
    }
    ```
  - [x]3.4 Add shared types to `packages/shared/src/types/api.ts`: Add `StuckInterventionRequest` interface:
    ```typescript
    export interface StuckInterventionRequest {
      readonly timeStuckMinutes: number
    }
    ```
    The SSE response reuses the existing `TutorStreamEvent` discriminated union — no new event types needed (the intervention streams text_delta + message_complete just like regular tutor responses)

- [x] Task 4: Create frontend stuck intervention hook (AC: #2)
  - [x]4.1 Create `apps/webapp/src/hooks/use-stuck-intervention.ts` — hook `useStuckIntervention(sessionId: string | null)` that returns `{ triggerIntervention: (timeStuckMinutes: number) => void, isInterventionStreaming: boolean }`
  - [x]4.2 Implementation: `triggerIntervention` calls `fetch()` with `POST /api/tutor/${sessionId}/stuck-intervention`, body `{ timeStuckMinutes }`, same headers as `useTutorStream` (Firebase auth token, Accept: text/event-stream)
  - [x]4.3 Extract shared SSE parsing utility FIRST: create `apps/webapp/src/lib/parse-sse-stream.ts` — extract the `ReadableStream` reader + `TextDecoder` + double-newline split + heartbeat-skip + `JSON.parse` logic from `useTutorStream` into a reusable async generator:
    ```typescript
    export async function* parseSSEStream<T>(body: ReadableStream<Uint8Array>): AsyncGenerator<T> {
      const reader = body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })
          const parts = buffer.split('\n\n')
          buffer = parts.pop()!
          for (const part of parts) {
            if (part.startsWith(':')) continue // heartbeat
            const dataLine = part.split('\n').find((line) => line.startsWith('data: '))
            if (!dataLine) continue
            yield JSON.parse(dataLine.slice(6)) as T
          }
        }
      } finally {
        reader.releaseLock()
      }
    }
    ```
    Then refactor `useTutorStream` to use `parseSSEStream<TutorStreamEvent>()` instead of its inline parsing. `useStuckIntervention` also uses this utility. Add co-located test: `parse-sse-stream.test.ts`
  - [x]4.4 (was 4.3) Parse the SSE response using `parseSSEStream<TutorStreamEvent>()` — accumulate `text_delta` events into `interventionStreamingContent` state, handle `message_complete` by inserting into TanStack Query cache at `['tutor', 'messages', sessionId]`
  - [x]4.5 (was 4.4) ALSO insert a synthetic user message into the query cache BEFORE the streaming starts: `{ id: 'system-stuck-' + crypto.randomUUID(), role: 'user' as const, content: '[Tutor noticed you might be stuck and offered a hint]', model: null, createdAt: new Date().toISOString() }` — this shows in the chat so the learner understands why the tutor spoke unprompted
  - [x]4.6 (was 4.5) Guard: prevent triggering if `isInterventionStreaming=true` or `sessionId=null`. The "don't interrupt active conversation" guard is naturally handled — if the user is actively chatting, editor inactivity timer has already reset, so Stage 2 won't fire. Add `isTutorStreaming: boolean` parameter to hook signature as a defensive secondary guard
  - [x]4.7 (was 4.6) On error (non-200 before SSE, or SSE error event): silently fail — do NOT show error UI for proactive interventions. Log to `console.warn` for debugging. If error code is `TUTOR_UNAVAILABLE`, call `setTutorAvailable(false)` on workspace store
  - [x]4.8 (was 4.7) Cleanup: abort fetch on unmount using AbortController

- [x] Task 5: Wire stuck intervention to Stage 2 trigger (AC: #2)
  - [x]5.1 In `Workspace.tsx`: import and call `useStuckIntervention(sessionId)`. Destructure `triggerIntervention` and `isInterventionStreaming`
  - [x]5.2 Enhance the Stage 2 `useEffect` from Task 2.5 to also trigger the intervention:
    ```typescript
    const stage2TriggeredRef = useRef(false)

    useEffect(() => {
      if (isStage2 && tutorAvailable && !stage2TriggeredRef.current) {
        stage2TriggeredRef.current = true
        setTutorExpanded(true)

        // Calculate time stuck in minutes from stage1Timestamp
        const minutesStuck = stage1Timestamp
          ? Math.round((Date.now() - stage1Timestamp) / 60_000)
          : stuckDetectionConfig.thresholdMinutes

        triggerIntervention(minutesStuck)
      }
    }, [isStage2, tutorAvailable, setTutorExpanded, triggerIntervention, stage1Timestamp, stuckDetectionConfig.thresholdMinutes])
    ```
  - [x]5.3 Reset `stage2TriggeredRef.current = false` in the dismiss/reset effect (Task 2.6) so intervention can re-trigger after reset
  - [x]5.4 Thread intervention streaming content to TutorPanel. The problem: `useStuckIntervention` runs in Workspace.tsx but TutorPanel renders streaming content from its internal `useTutorStream`. Completed messages insert into TanStack Query cache automatically, but **in-progress streaming tokens** need explicit plumbing:
    - `useStuckIntervention` hook returns `interventionStreamingContent: string` (accumulated text_delta tokens, same as `streamingContent` in `useTutorStream`)
    - Add `interventionStreamingContent?: string` and `isInterventionStreaming?: boolean` props to `WorkspaceLayoutProps` and `TutorPanelProps`
    - Workspace.tsx passes these through: `<WorkspaceLayout interventionStreamingContent={interventionStreamingContent} isInterventionStreaming={isInterventionStreaming} ...>`
    - WorkspaceLayout passes to TutorPanel: `<TutorPanel interventionStreamingContent={interventionStreamingContent} isInterventionStreaming={isInterventionStreaming} ...>`
  - [x]5.5 In `TutorPanel.tsx`: render intervention streaming content. When `isInterventionStreaming && interventionStreamingContent`, render a streaming `TutorMessage` (same pattern as the existing streaming rendering at lines 99-105). Give it priority over regular `streamingContent` — if both are truthy (shouldn't happen due to guards but defensive), `interventionStreamingContent` wins. After `message_complete`, `useStuckIntervention` clears `interventionStreamingContent` and the completed message appears from the TanStack Query cache
  - [x]5.6 Edge case — user sends message while intervention is streaming: TutorInput's disabled state must account for BOTH streams. In TutorPanel, compute: `const isAnyStreaming = isStreaming || !!isInterventionStreaming`. Pass `isAnyStreaming` to `TutorInput` as the `disabled` condition. This prevents the user from sending a message that would collide with the ongoing intervention stream

- [x] Task 6: Write tests (AC: #1-#7)
  - [x]6.1a **Backend: context helpers tests** — Create `apps/backend/src/plugins/tutor/services/context-helpers.test.ts`:
    - Test: loadCurrentCode returns latest snapshot code
    - Test: loadCurrentCode returns fallback when no snapshots exist
    - Test: loadCriteriaStatus formats criterion results
    - Test: loadUserBackground builds profile string
    - Test: loadMilestoneBrief reads from Redis cache, falls back to filesystem
  - [x]6.1b **Frontend: SSE parser tests** — Create `apps/webapp/src/lib/parse-sse-stream.test.ts`:
    - Test: parses single SSE event from stream
    - Test: parses multiple events split across chunks
    - Test: skips heartbeat comments (lines starting with `:`)
    - Test: handles incomplete chunks (buffering across reads)
    - Test: releases reader lock on completion
  - [x]6.1 **Backend: stuck context assembler tests** — Create `apps/backend/src/plugins/tutor/services/stuck-context-assembler.test.ts`:
    - Test: assembles prompt with all template variables replaced
    - Test: handles missing stuck criterion gracefully (no completed submissions)
    - Test: computes recent diffs from 2 snapshots
    - Test: handles single snapshot (no diff available)
    - Test: caches stuck intervention prompt template
  - [x]6.2 **Backend: stuck intervention route tests** — Create `apps/backend/src/plugins/tutor/routes/stuck-intervention.test.ts`:
    - Test: returns SSE stream with text_delta and message_complete events
    - Test: persists synthetic user message and assistant response
    - Test: validates timeStuckMinutes (min 1, max 60)
    - Test: returns 404 for invalid session
    - Test: returns 429 when rate limited
    - Test: returns 503 when Anthropic unavailable
    - Test: uses Sonnet model for stuck interventions (via `isStuckIntervention` context flag)
  - [x]6.2b **Backend: Anthropic service model routing test** — Update `apps/backend/src/plugins/tutor/services/anthropic.test.ts`:
    - Test: selectModel returns Sonnet when isStuckIntervention=true
    - Test: selectModel still returns Haiku for default when isStuckIntervention is undefined
  - [x]6.3 **Backend: content-loader metadata tests** — Update `apps/backend/src/plugins/curriculum/content-loader.test.ts`:
    - Test: parses stuckDetection from metadata.yaml
    - Test: returns null stuckDetection when field missing
    - Test: returns null stuckDetection when metadata.yaml missing
  - [x]6.4 **Frontend: WorkspaceLayout stuck detection visual tests** — Update `apps/webapp/src/components/workspace/WorkspaceLayout.test.tsx`:
    - Test: collapsed tutor button has green glow classes when isStage1=true
    - Test: collapsed tutor button has default classes when isStage1=false
    - Test: green glow has motion-reduce:animate-none class
    - Test: stage 1 indicator has updated aria-label
  - [x]6.5 **Frontend: Workspace.tsx integration tests** — Update `apps/webapp/src/routes/Workspace.test.tsx`:
    - Test: Stage 2 auto-expands tutor panel
    - Test: Stage 2 suppressed when tutorAvailable=false
    - Test: stuck detection resets when tutor panel collapses
    - Test: Stage 2 triggers stuck intervention
  - [x]6.6 **Frontend: useStuckIntervention hook tests** — Create `apps/webapp/src/hooks/use-stuck-intervention.test.ts`:
    - Test: sends POST with timeStuckMinutes
    - Test: inserts synthetic user message into query cache
    - Test: parses SSE events and inserts assistant message on complete
    - Test: silently handles errors (no UI error state)
    - Test: prevents concurrent interventions
    - Test: aborts on cleanup
    - Test: sets tutorAvailable=false on TUTOR_UNAVAILABLE error
  - [x]6.7 **Frontend: useWorkspaceData threshold tests** — Update `apps/webapp/src/hooks/use-workspace-data.test.ts` (or create if not exists):
    - Test: uses API-provided stuckDetection config when available
    - Test: falls back to defaults when stuckDetection is null

## Dev Notes

### Design Decisions & Scope Adjustments

**Persistent background SSE — DESCOPED for this story:**

The epic AC states: *"a persistent background SSE connection is maintained per session for stuck detection, even when the tutor panel is collapsed (UX-2)"*. This is **intentionally replaced** with an on-demand POST request when Stage 2 triggers.

**Rationale:**
- Stuck detection is entirely client-side (the `useStuckDetection` hook tracks editor inactivity via `setInterval`) — the server does NOT need to push stuck events
- A persistent SSE per session means 100+ long-lived connections at scale — unnecessary infrastructure cost when the client can simply POST when it decides the user is stuck
- The on-demand approach is simpler, testable, and has zero idle resource consumption
- If future requirements need server-side stuck detection (e.g., cross-device awareness), a persistent SSE can be added in a follow-up story

**Concurrent stream guard — via prop threading (NOT Zustand):**

`useTutorStream.isStreaming` is internal to TutorPanel. The intervention hook in Workspace.tsx cannot directly read it. Rather than adding streaming state to Zustand (which would violate the "no server state in Zustand" rule), the guard works via prop threading:
- `useStuckIntervention` accepts `isTutorStreaming: boolean` parameter
- Workspace.tsx cannot read TutorPanel's internal `isStreaming` directly, but the guard is sufficient because: if the user is actively chatting (tutor is expanded, user sending messages), the editor is not receiving input, so `useStuckDetection` has already reset — Stage 2 won't trigger during an active conversation
- The primary guard is `stage2TriggeredRef` which prevents double-firing

### Critical Architecture Constraints

**State Management — Hard Rules (DO NOT VIOLATE):**
- Stuck detection timer state (`isStage1`, `isStage2`, timestamps, `resetTimer`) lives ONLY in the `useStuckDetection` hook — NOT in Zustand
- Tutor panel expand/collapse → `useWorkspaceUIStore.tutorExpanded` — existing Zustand
- Tutor availability → `useWorkspaceUIStore.tutorAvailable` — existing Zustand
- Intervention messages → TanStack Query cache at `['tutor', 'messages', sessionId]` — NOT Zustand
- Only 2 Zustand stores exist: `useWorkspaceUIStore` and `useEditorStore`. Do NOT create a third

**Stuck Detection Hook — Already Implemented:**

`apps/webapp/src/hooks/use-stuck-detection.ts` is FULLY implemented and tested (9 tests passing). It provides:
- `isStage1: boolean` — true when `thresholdMinutes` elapsed without activity
- `isStage2: boolean` — true when `thresholdMinutes + stage2OffsetSeconds` elapsed
- `resetTimer(): void` — resets all state and restarts timer
- `stage1Timestamp: number | null` — when Stage 1 first triggered
- `stage2Timestamp: number | null` — when Stage 2 first triggered

Activity reset is already wired in `Workspace.tsx`:
- Editor content changes (keystrokes, paste)
- Code submission (Run)
- Benchmark execution

**What's NOT implemented yet (this story's work):**
1. The VISUAL effects (green glow on Stage 1)
2. The BEHAVIORAL effects (auto-expand on Stage 2)
3. The PROACTIVE INTERVENTION (server-side question generation)
4. Dynamic threshold loading from milestone config
5. Reset on tutor dismiss

**SSE Pattern — Reuse Existing Stream Route Pattern:**

The stuck intervention endpoint follows the EXACT same SSE streaming pattern as `stream.ts`:
- POST with request body → validate → persist user message → assemble context → call Anthropic → stream SSE → persist assistant message → cleanup
- Same `writeSSE()` helper, same heartbeat, same cleanup pattern
- Same `TutorStreamEvent` discriminated union for responses
- The ONLY differences: different system prompt (stuck-intervention.md vs tutor-base.md), forced Sonnet model, synthetic user message content

**Stuck Intervention Prompt — Already Written:**

`content/prompts/stuck-intervention.md` is complete and ready to use. Template variables:
- `{{milestone_brief}}` — from Redis-cached milestone content
- `{{current_code}}` — latest code snapshot
- `{{criteria_status}}` — formatted criteria results
- `{{stuck_criterion}}` — first unmet criterion name
- `{{time_stuck_minutes}}` — from client request
- `{{recent_diffs}}` — computed from 2 most recent snapshots
- `{{user_background}}` — user profile data

**Milestone Content Pipeline Extension:**

Current flow: `metadata.yaml` → `content-loader.readMetadata()` → `MilestoneMetadata` → cached in Redis → served via curriculum API → `MilestoneContent` type → frontend

Extension: Add `stuckDetection` to this same pipeline. The `metadata.yaml` for each milestone gets a new field. The `readMetadata()` parser extracts it. The API serves it. The frontend reads it instead of using hardcoded defaults.

Per-milestone thresholds from architecture:
| Milestone | thresholdMinutes | stage2OffsetSeconds | Rationale |
|---|---|---|---|
| M1 (KV Store) | 10 | 60 | Entry level, generous |
| M2 (Storage Engine) | 10 | 60 | Still early |
| M3 (B-Tree Indexing) | 7 | 60 | Hardest milestone |
| M4 (Query Parser) | 8 | 60 | Moderate difficulty |
| M5 (Transactions) | 8 | 60 | Moderate difficulty |

### Existing Code to Modify

**`Workspace.tsx` (MODIFY — primary integration point):**
- Destructure `isStage1`, `isStage2`, `stage1Timestamp` from `useStuckDetection()` (line 29)
- Add `useStuckIntervention(sessionId)` hook call
- Add Stage 2 auto-expand effect
- Add dismiss/reset effect
- Pass `isStage1`, `isStage2` to `<WorkspaceLayout>`

**`WorkspaceLayout.tsx` (MODIFY — visual changes):**
- Add `isStage1` and `isStage2` to props interface
- Desktop collapsed button (lines 217-224): conditionally apply green glow classes
- Small-desktop: add floating indicator button
- Mobile: no changes (stuck detection doesn't apply on mobile — no editor)

**`use-workspace-data.ts` (MODIFY — dynamic thresholds):**
- Read `stuckDetection` from API response (content.stuckDetection)
- Fall back to `{ thresholdMinutes: 10, stage2OffsetSeconds: 60 }` if null

**`packages/shared/src/types/curriculum.ts` (MODIFY — types):**
- Add `stuckDetection` to `MilestoneContent`
- Add and export `StuckDetectionConfig` type

**`packages/shared/src/types/api.ts` (MODIFY — types):**
- Add `StuckInterventionRequest` interface

**`apps/backend/src/plugins/curriculum/content-loader.ts` (MODIFY):**
- Extend `MilestoneMetadata` with `stuckDetection`
- Update `readMetadata()` to parse new field

**`apps/backend/src/plugins/curriculum/routes/milestones.ts` (MODIFY):**
- Include `stuckDetection` in response

**`apps/backend/src/plugins/tutor/index.ts` (MODIFY):**
- Register stuck intervention route
- Add `promptsRoot` to options

**`apps/backend/src/plugins/tutor/services/anthropic.ts` (MODIFY):**
- Add `readonly isStuckIntervention?: boolean` to `TutorContext` type
- Update `selectModel()` to check `isStuckIntervention` first → return Sonnet

**`apps/backend/src/plugins/tutor/services/context-assembler.ts` (REFACTOR):**
- Extract `loadCurrentCode`, `loadCriteriaStatus`, `loadUserBackground`, `loadMilestoneBrief`, `loadSessionSummary` into `context-helpers.ts`
- Import shared helpers from `context-helpers.ts` instead of defining inline
- No behavior change — purely structural refactor

**`apps/webapp/src/hooks/use-tutor-stream.ts` (REFACTOR):**
- Replace inline SSE parsing with `parseSSEStream<TutorStreamEvent>()` from `lib/parse-sse-stream.ts`
- No behavior change — same streaming logic, just using shared utility

**`apps/webapp/src/components/workspace/TutorPanel.tsx` (MODIFY):**
- Add `interventionStreamingContent?: string` and `isInterventionStreaming?: boolean` to props
- Render intervention streaming content when present (priority over regular streaming)
- Compute `isAnyStreaming` for TutorInput disabled state

### New Files to Create

| File | Purpose |
|------|---------|
| `apps/backend/src/plugins/tutor/services/context-helpers.ts` | Extracted shared DB query helpers (loadCurrentCode, loadCriteriaStatus, etc.) used by both assemblers |
| `apps/backend/src/plugins/tutor/services/context-helpers.test.ts` | Tests for shared context helpers |
| `apps/backend/src/plugins/tutor/services/stuck-context-assembler.ts` | Assembles stuck intervention prompt from template + context |
| `apps/backend/src/plugins/tutor/services/stuck-context-assembler.test.ts` | Tests for stuck context assembler |
| `apps/backend/src/plugins/tutor/routes/stuck-intervention.ts` | POST /:sessionId/stuck-intervention SSE route |
| `apps/backend/src/plugins/tutor/routes/stuck-intervention.test.ts` | Tests for stuck intervention route |
| `apps/webapp/src/lib/parse-sse-stream.ts` | Shared SSE parsing async generator — used by useTutorStream and useStuckIntervention |
| `apps/webapp/src/lib/parse-sse-stream.test.ts` | Tests for SSE parser |
| `apps/webapp/src/hooks/use-stuck-intervention.ts` | Frontend hook for triggering & consuming stuck intervention |
| `apps/webapp/src/hooks/use-stuck-intervention.test.ts` | Tests for stuck intervention hook |
| `content/milestones/02-storage-engine/metadata.yaml` | New metadata file with stuckDetection config |
| `content/milestones/03-btree-indexing/metadata.yaml` | New metadata file with stuckDetection config |
| `content/milestones/04-query-parser/metadata.yaml` | New metadata file with stuckDetection config |
| `content/milestones/05-transactions/metadata.yaml` | New metadata file with stuckDetection config |

### Existing Hooks & Utilities to Reuse (NOT recreate)

| Hook/Utility | Location | Usage |
|------|----------|-------|
| `useStuckDetection` | `hooks/use-stuck-detection.ts` | Timer — already fully working. Just destructure more state from it |
| `useAutoScroll` | `hooks/use-auto-scroll.ts` | Already used by TutorPanel — intervention messages auto-scroll too |
| `useTutorStream` | `hooks/use-tutor-stream.ts` | Reference for SSE parsing pattern. Do NOT reuse directly — intervention is a separate stream |
| `useTutorMessages` | `hooks/use-tutor-messages.ts` | Already provides TanStack Query cache — intervention inserts into same cache |
| `announceToScreenReader` | `components/workspace/workspace-a11y.ts` | Announce intervention completion for screen reader |
| `apiFetch` | `lib/api-fetch.ts` | NOT used for intervention (needs streaming). Used for workspace data fetch |
| `writeSSE` | Backend stream.ts (line 39) | Simple one-liner — duplicate in stuck-intervention.ts (not worth extracting for a single call) |
| `context-helpers` | Backend services/context-helpers.ts | **NEW** — extracted shared helpers. Both context-assembler.ts and stuck-context-assembler.ts import from here |
| `parseSSEStream` | Webapp lib/parse-sse-stream.ts | **NEW** — shared SSE parsing generator. Both useTutorStream and useStuckIntervention use it |

### TanStack Query Cache Pattern for Intervention Messages

The intervention hook inserts **completed** messages into the SAME TanStack Query cache (`['tutor', 'messages', sessionId]`) as regular chat, using the identical `setQueryData<InfiniteData<MessagesPage>>` pattern from `useTutorStream` (see Story 6.3 dev notes for the full code). **Streaming** content (in-progress tokens) is threaded via the `interventionStreamingContent` prop to TutorPanel (see Task 5.4).

### CSS Approach for Green Glow

Tailwind utility classes only — NO custom CSS, NO custom keyframes. The `cn()` import: `import { cn } from '@mycscompanion/ui/src/lib/utils'`. Key classes:
- `animate-pulse` — gentle opacity pulsing (Tailwind built-in)
- `bg-primary/10` — green tint at 10% opacity
- `text-primary` — green icon color
- `motion-reduce:animate-none` — respects `prefers-reduced-motion`, keeps static green tint

See Task 2.3 for the full code snippet.

### Backend Context Assembly — Reuse Pattern

The stuck context assembler follows the same DI pattern as `createContextAssembler()`:

```typescript
// stuck-context-assembler.ts
export interface StuckContextAssemblerOptions {
  readonly db: Kysely<DB>
  readonly redis: RedisCache
  readonly contentRoot?: string
  readonly promptsRoot?: string
}

export interface StuckContextAssembler {
  assembleStuckInterventionPrompt(params: StuckAssembleParams): Promise<string>
}

export interface StuckAssembleParams {
  readonly userId: string
  readonly sessionId: string
  readonly milestoneId: string
  readonly milestoneSlug: string
  readonly timeStuckMinutes: number
}
```

Many sub-functions (loadCurrentCode, loadCriteriaStatus, loadUserBackground, loadMilestoneBrief) are identical to `createContextAssembler()`. These are currently private (inner functions of the factory closure) and NOT exported.

**MANDATORY: Extract shared helpers into `apps/backend/src/plugins/tutor/services/context-helpers.ts`** that both `createContextAssembler` and `createStuckContextAssembler` import. Do NOT duplicate — 4 identical DB query functions across 2 files is a maintenance hazard. The extraction is straightforward:

```typescript
// context-helpers.ts — export each helper as a standalone function
export async function loadCurrentCode(db: Kysely<DB>, userId: string, milestoneId: string): Promise<string> { ... }
export async function loadCriteriaStatus(db: Kysely<DB>, userId: string, milestoneId: string): Promise<string> { ... }
export async function loadUserBackground(db: Kysely<DB>, userId: string): Promise<string> { ... }
export async function loadMilestoneBrief(redis: RedisCache, contentRoot: string, milestoneSlug: string): Promise<string> { ... }
export async function loadSessionSummary(db: Kysely<DB>, userId: string, milestoneId: string): Promise<string | null> { ... }
```

Then update `context-assembler.ts` to import from `context-helpers.ts` instead of defining them inline. This refactor must NOT change any behavior — just moves functions.

### Recent Diffs Computation

For `{{recent_diffs}}` template variable in the stuck intervention prompt:

```typescript
// Load 2 most recent code_snapshots for this user+milestone
const snapshots = await db
  .selectFrom('code_snapshots')
  .select(['code', 'created_at'])
  .where('user_id', '=', userId)
  .where('milestone_id', '=', milestoneId)
  .orderBy('created_at', 'desc')
  .limit(2)
  .execute()

if (snapshots.length < 2) return '(No previous snapshot for comparison)'

// Simple line-level diff description
const current = snapshots[0].code.split('\n')
const previous = snapshots[1].code.split('\n')
const added = current.filter((line) => !previous.includes(line))
const removed = previous.filter((line) => !current.includes(line))

return `Added ${added.length} lines, removed ${removed.length} lines.\n\nRecent additions:\n${added.slice(0, 10).join('\n')}`
```

This is a simple heuristic — NOT a real diff algorithm. The `filter + includes` approach is O(n*m) and produces misleading results for reordered lines. Acceptable for MVP since: (1) Go files in this context are small (<200 lines), (2) the AI tutor only needs approximate context about what the learner tried, and (3) a proper diff library adds unnecessary dependency. If future stories need better diffs, consider `diff-match-patch` or a simple LCS algorithm.

### Anti-Patterns to Avoid

- Do NOT create a third Zustand store for stuck detection state
- Do NOT put intervention messages in Zustand — use TanStack Query cache
- Do NOT create a persistent background SSE connection (architecture mentions it but this is MVP — use on-demand POST when Stage 2 triggers)
- Do NOT show error UI for failed interventions — silently fail
- Do NOT steal focus from Monaco when auto-expanding tutor panel
- Do NOT use `EventSource` — stuck intervention is POST-based like regular tutor stream
- Do NOT create a new event type for stuck interventions — reuse `TutorStreamEvent`
- Do NOT use `as` casts, `any`, `test()`, `.spec.ts`, `toMatchSnapshot()`, default exports, `@/` aliases
- Do NOT duplicate the SSE parsing logic — use the shared `parseSSEStream()` utility from `lib/parse-sse-stream.ts` in both `useTutorStream` and `useStuckIntervention`
- Do NOT use `console.log` in frontend — use `console.warn` only for intervention errors (acceptable for debugging non-critical failures)
- Do NOT trigger intervention if user is actively typing (the useStuckDetection hook already handles this — content changes reset the timer)
- Do NOT add stuck detection visuals to mobile layout — mobile is read-only mode, no editor, no stuck detection

### Previous Story (6.3) Learnings Applied

- **TanStack Query cache update pattern**: Same `setQueryData<InfiniteData<MessagesPage>>` pattern used in `useTutorStream` — reuse identical approach for intervention messages
- **POST-based SSE via fetch + ReadableStream**: Same manual SSE parsing with `response.body.getReader()` + `TextDecoder` + double-newline split — established pattern in `useTutorStream`
- **Firebase auth token attachment**: Same manual `getAuth().currentUser?.getIdToken()` pattern — not via `apiFetch`
- **AbortController cleanup**: Same pattern on unmount
- **Heartbeat skipping**: Same `': heartbeat'` comment line detection in SSE parser
- **Rate limiting**: Same `rate:tutor:${uid}` key — intervention counts against 30/min limit
- **Message persistence**: Same persist-before-stream (user message) and persist-after-complete (assistant message) pattern
- **screen reader**: Call `announceToScreenReader()` on intervention message_complete — same as regular tutor messages

### Git Intelligence (from Story 6.3)

Commit `7238fb5` (Story 6.3) established:
- `TutorPanel` component with 3-state rendering (unavailable, collapsed, expanded)
- `useTutorStream` hook with POST-based SSE pattern
- `useTutorMessages` hook with `useInfiniteQuery` and optimistic cache updates
- `TutorMessage` component with markdown rendering
- Focus management: Escape returns focus to Monaco, expand doesn't steal focus
- screen reader: `announceToScreenReader()` on stream complete only

Key file modifications from 6.3 that affect this story:
- `Workspace.tsx` — `sessionId` is now React state (useState), passed to WorkspaceLayout
- `WorkspaceLayout.tsx` — `TutorPanel` replaces inline `TutorContent`, `sessionId` prop added
- `workspace-ui-store.ts` — `tutorExpanded` and `tutorAvailable` are the relevant state fields

### Project Structure Notes

- All new backend files go in existing `plugins/tutor/` subdirectories — no new directories
- New frontend hooks go in existing `hooks/` directory; new shared utility `parse-sse-stream.ts` goes in existing `lib/` directory — no new directories
- Content YAML updates to existing `content/milestones/*/metadata.yaml` files
- Shared type changes in existing type files — no new files in `packages/shared/`
- Co-located tests next to source files

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Epic-6-Story-6.4]
- [Source: _bmad-output/planning-artifacts/architecture.md#AI-Tutor-Architecture — ARCH-6, ARCH-7, ARCH-11]
- [Source: _bmad-output/planning-artifacts/architecture.md#SSE-Streaming — heartbeat, Railway timeout]
- [Source: _bmad-output/planning-artifacts/architecture.md#Graceful-Degradation — ARCH-11, tutor unavailability]
- [Source: _bmad-output/project-context.md — project rules and conventions]
- [Source: content/prompts/stuck-intervention.md — intervention prompt template (complete)]
- [Source: content/milestones/01-kv-store/metadata.yaml — current metadata format]
- [Source: apps/webapp/src/hooks/use-stuck-detection.ts — existing timer hook (complete)]
- [Source: apps/webapp/src/hooks/use-stuck-detection.test.ts — 9 passing tests]
- [Source: apps/webapp/src/hooks/use-workspace-data.ts — hardcoded stuckDetection config (line 55)]
- [Source: apps/webapp/src/routes/Workspace.tsx — stuck detection wiring point]
- [Source: apps/webapp/src/components/workspace/WorkspaceLayout.tsx — visual integration point]
- [Source: apps/webapp/src/stores/workspace-ui-store.ts — tutorExpanded, tutorAvailable state]
- [Source: apps/webapp/src/hooks/use-tutor-stream.ts — SSE parsing pattern reference]
- [Source: apps/webapp/src/hooks/use-tutor-messages.ts — TanStack Query cache pattern reference]
- [Source: apps/backend/src/plugins/tutor/routes/stream.ts — backend SSE streaming pattern]
- [Source: apps/backend/src/plugins/tutor/services/context-assembler.ts — context assembly pattern]
- [Source: apps/backend/src/plugins/tutor/index.ts — plugin registration pattern]
- [Source: apps/backend/src/plugins/curriculum/content-loader.ts — metadata parsing pattern]
- [Source: apps/backend/src/plugins/curriculum/routes/milestones.ts — curriculum API response]
- [Source: packages/shared/src/types/api.ts — TutorStreamEvent types]
- [Source: packages/shared/src/types/curriculum.ts — MilestoneContent type]
- [Source: _bmad-output/implementation-artifacts/6-3-tutor-chat-ui-and-panel-integration.md — previous story]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6

### Debug Log References

None

### Completion Notes List

- Task 1: Extended milestone content pipeline with `stuckDetection` config. Created metadata.yaml for milestones 2-5. Extended MilestoneMetadata, MilestoneContent, shared types. Updated curriculum API and useWorkspaceData to read dynamic thresholds with hardcoded fallback. Moved StuckDetectionConfig to @mycscompanion/shared.
- Task 2: Wired isStage1/isStage2 from useStuckDetection to WorkspaceLayout. Desktop collapsed button gets green glow (animate-pulse bg-primary/10 text-primary) with motion-reduce:animate-none. Small-desktop gets floating indicator button. Stage 2 auto-expands tutor panel (suppressed when tutorAvailable=false). Reset on dismiss via useEffect watching tutorExpanded.
- Task 3: Created stuck-context-assembler.ts with template variable replacement, stuck criterion detection, and recent diffs computation. Created stuck-intervention.ts route (POST /:sessionId/stuck-intervention) following exact SSE streaming pattern from stream.ts. Extended Anthropic service selectModel() to check isStuckIntervention first → Sonnet. Extracted shared context helpers (loadCurrentCode, loadCriteriaStatus, loadUserBackground, loadMilestoneBrief, loadSessionSummary) into context-helpers.ts — both assemblers now import from shared module.
- Task 4: Created useStuckIntervention hook with POST-based SSE streaming via parseSSEStream utility. Created shared parseSSEStream async generator and refactored useTutorStream to use it. Hook inserts synthetic user message and completed assistant message into TanStack Query cache. Silently fails on errors (console.warn only). Sets tutorAvailable=false on TUTOR_UNAVAILABLE.
- Task 5: Wired intervention to Stage 2 trigger with stage2TriggeredRef guard. Threaded interventionStreamingContent and isInterventionStreaming through WorkspaceLayout to TutorPanel. TutorPanel renders intervention streaming with priority over regular streaming. TutorInput disabled during either stream.
- Task 6: Created comprehensive test suites — 52 new tests across 8 files (context-helpers, stuck-context-assembler, stuck-intervention route, anthropic model routing, content-loader metadata, parse-sse-stream, use-stuck-intervention, WorkspaceLayout visuals, Workspace integration, use-workspace-data thresholds). All 882 tests pass (357 backend + 479 webapp + 46 shared).

### Change Log

- 2026-03-10: Implemented Story 6.4 — Two-Stage Stuck Detection & Proactive Intervention
- 2026-03-10: Code review fixes — (1) Fixed minutesStuck computation to include thresholdMinutes in total, (2) Moved synthetic user message insertion after response.ok to prevent dangling messages on failure, (3) Removed unused isStage2 prop from WorkspaceLayout, (4) Removed unused isTutorStreaming parameter from useStuckIntervention, (5) Added additionalProperties:false to stuck-intervention body schema

### File List

**New files:**
- content/milestones/02-storage-engine/metadata.yaml
- content/milestones/03-btree-indexing/metadata.yaml
- content/milestones/04-query-parser/metadata.yaml
- content/milestones/05-transactions/metadata.yaml
- apps/backend/src/plugins/tutor/services/context-helpers.ts
- apps/backend/src/plugins/tutor/services/context-helpers.test.ts
- apps/backend/src/plugins/tutor/services/stuck-context-assembler.ts
- apps/backend/src/plugins/tutor/services/stuck-context-assembler.test.ts
- apps/backend/src/plugins/tutor/routes/stuck-intervention.ts
- apps/backend/src/plugins/tutor/routes/stuck-intervention.test.ts
- apps/backend/src/plugins/tutor/services/__fixtures__/prompts/stuck-intervention.md
- apps/webapp/src/lib/parse-sse-stream.ts
- apps/webapp/src/lib/parse-sse-stream.test.ts
- apps/webapp/src/hooks/use-stuck-intervention.ts
- apps/webapp/src/hooks/use-stuck-intervention.test.ts

**Modified files:**
- content/milestones/01-kv-store/metadata.yaml
- apps/backend/src/plugins/curriculum/content-loader.ts
- apps/backend/src/plugins/curriculum/routes/milestones.ts
- apps/backend/src/plugins/tutor/services/anthropic.ts
- apps/backend/src/plugins/tutor/services/anthropic.test.ts
- apps/backend/src/plugins/tutor/services/context-assembler.ts
- apps/backend/src/plugins/tutor/index.ts
- apps/backend/src/plugins/curriculum/content-loader.test.ts
- packages/shared/src/types/curriculum.ts
- packages/shared/src/types/curriculum.test.ts
- packages/shared/src/types/api.ts
- apps/webapp/src/hooks/use-workspace-data.ts
- apps/webapp/src/hooks/use-workspace-data.test.tsx
- apps/webapp/src/hooks/use-stuck-detection.ts
- apps/webapp/src/hooks/use-tutor-stream.ts
- apps/webapp/src/routes/Workspace.tsx
- apps/webapp/src/routes/Workspace.test.tsx
- apps/webapp/src/components/workspace/WorkspaceLayout.tsx
- apps/webapp/src/components/workspace/WorkspaceLayout.test.tsx
- apps/webapp/src/components/workspace/TutorPanel.tsx
- _bmad-output/implementation-artifacts/sprint-status.yaml
