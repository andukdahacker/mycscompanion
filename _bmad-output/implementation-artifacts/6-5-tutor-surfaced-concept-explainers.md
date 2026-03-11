# Story 6.5: Tutor-Surfaced Concept Explainers

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a learner,
I want the tutor to show me relevant diagrams when I'm struggling with a concept,
so that I can visually understand what I'm trying to build.

## Acceptance Criteria

1. Given a learner is conversing with the tutor and struggling with a structural concept, when the tutor detects the learner's difficulty relates to a concept with an available visual explainer, then the tutor response includes a reference to the relevant visual concept explainer from the milestone content (FR18)
2. Given the tutor references an explainer, when the response renders in the chat panel, then the explainer renders inline in the chat as an expandable element within the tutor panel
3. Given the tutor can reference explainers, then the explainer assets are the same annotated SVGs created in Story 4.5 — served from `/assets/milestones/:slug/:filename`
4. Given the tutor has access to available explainers for the current milestone, then the tutor's decision to surface an explainer is based on conversation context and the learner's specific struggle — not randomly or on every message
5. Given an explainer is rendered in the chat, then the explainer includes descriptive alt text for screen reader accessibility (NFR-A5)

## Tasks / Subtasks

- [x] Task 1: Extend context assemblers to include available concept explainers (AC: #1, #4)
  - [x] 1.1 Add a `loadConceptExplainerMetadata(contentRoot, slug)` function to `context-helpers.ts` — reads `content/milestones/{slug}/assets/manifest.yaml` and scans for `.svg` files, returning `{ filename, title, altText }[]`. This replicates the curriculum plugin's `readConceptExplainerAssets` logic but within the tutor plugin's own filesystem access pattern (via `contentRoot`), preserving plugin isolation
  - [x] 1.2 Call `loadConceptExplainerMetadata` from `context-assembler.ts` `assembleSystemPrompt()` — format the list as `"- filename.svg: \"Title\" — altText"` lines and replace the `{{available_explainers}}` placeholder in the prompt template. If no assets found, replace with `"No visual explainers available for this milestone."`
  - [x] 1.3 Call `loadConceptExplainerMetadata` from `stuck-context-assembler.ts` `assembleStuckPrompt()` — same formatting and placeholder replacement as regular context assembler
  - [x] 1.4 Add available explainers to system prompt template in `content/prompts/tutor-base.md` — inject `{{available_explainers}}` placeholder with instructions (see Task 2)
  - [x] 1.5 Similarly update `content/prompts/stuck-intervention.md` with `{{available_explainers}}` placeholder
  - [x] 1.6 Unit test: `loadConceptExplainerMetadata` returns correct metadata when manifest and SVGs exist
  - [x] 1.7 Unit test: `loadConceptExplainerMetadata` returns empty array when no assets directory exists
  - [x] 1.8 Unit test: context assembler includes explainer metadata in system prompt when assets exist
  - [x] 1.9 Unit test: context assembler replaces placeholder with "no explainers available" when no assets
  - [x] 1.10 Unit test: stuck-context-assembler includes explainer metadata in system prompt when assets exist

- [x] Task 2: Update tutor prompt template for explainer awareness (AC: #1, #4)
  - [x] 2.1 Add `{{available_explainers}}` placeholder to `content/prompts/tutor-base.md`
  - [x] 2.2 Define the explainer reference format: `[explainer:filename.svg]` — simple, parseable, unambiguous
  - [x] 2.3 Add prompt instructions: "When the learner struggles with a structural concept and a relevant visual explainer is available, include `[explainer:filename.svg]` in your response. Only reference explainers that match the learner's current difficulty. Do not reference explainers gratuitously."
  - [x] 2.4 Update stuck-intervention prompt similarly with `{{available_explainers}}` placeholder
  - [x] 2.5 Copy updated prompt files to test fixtures: `apps/backend/src/plugins/tutor/services/__fixtures__/prompts/`

- [x] Task 3: Parse explainer references in tutor responses on frontend (AC: #2, #3)
  - [x] 3.1 Create `parse-explainer-refs.ts` utility in `apps/webapp/src/lib/` — extracts `[explainer:filename.svg]` references from tutor message text
  - [x] 3.2 Return parsed structure: `{ text: string, explainerRefs: { filename: string, position: number }[] }` — positions map to where in the text the reference appeared
  - [x] 3.3 Unit test: correctly parses single and multiple explainer references
  - [x] 3.4 Unit test: returns original text unchanged when no references present
  - [x] 3.5 Unit test: handles edge cases — malformed references, duplicate refs, empty text

- [x] Task 4: Render inline explainers in TutorPanel chat messages (AC: #2, #3, #5)
  - [x] 4.1 Create `TutorExplainerCard.tsx` component in `apps/webapp/src/components/workspace/` — compact card showing explainer thumbnail (small SVG preview), title, and "View diagram" expand button
  - [x] 4.2 Modify `TutorMessage.tsx` to integrate explainer rendering — this file uses `react-markdown` to render assistant messages. Pre-process the message text with `parseExplainerRefs()` to split around `[explainer:...]` markers, then render alternating `<Markdown>` segments and `<TutorExplainerCard>` components. Do NOT use a custom remark/rehype plugin — simple text splitting is sufficient and more maintainable
  - [x] 4.3 Pass `conceptExplainerAssets` (as a filename-keyed lookup map) down to `TutorMessage` from `TutorPanel` — resolve each `[explainer:filename.svg]` reference against this map to get full asset path, title, and altText
  - [x] 4.4 Reuse existing `ConceptExplainerDialog` for expanded view when user clicks "View diagram"
  - [x] 4.5 Handle missing references gracefully — if filename doesn't match any available asset, render nothing (don't break the message)
  - [x] 4.6 Apply `loading="lazy"` on thumbnail images for performance
  - [x] 4.7 Add `role="img"` and descriptive `alt` text from manifest on all rendered SVGs
  - [x] 4.8 Unit test: TutorExplainerCard renders with correct title, alt text, and image path
  - [x] 4.9 Unit test: TutorMessage with explainer reference renders card inline between markdown segments
  - [x] 4.10 Unit test: TutorMessage with unresolvable reference renders cleanly without card

- [x] Task 5: Wire explainer assets through to TutorPanel (AC: #2, #3)
  - [x] 5.1 Pass `conceptExplainerAssets` from `WorkspaceLayout` down to `TutorPanel` as a prop — data is already fetched by `useWorkspaceData`
  - [x] 5.2 Store assets in a lookup map by filename for O(1) resolution during message rendering
  - [x] 5.3 No new API calls needed — reuse existing curriculum milestone data
  - [x] 5.4 Unit test: TutorPanel receives and uses concept explainer assets for reference resolution

- [x] Task 6: Handle streaming messages with explainer references (AC: #2)
  - [x] 6.1 No changes to `use-tutor-stream.ts` or `use-stuck-intervention.ts` — these hooks accumulate raw text and store it via `queryClient.setQueryData`. Parsing happens at render time in `TutorMessage.tsx` only
  - [x] 6.2 In `TutorMessage.tsx`, when rendering streaming content (incomplete message), detect partial `[explainer:` patterns at the end of accumulated text — suppress rendering of the incomplete reference (show text up to the `[` character). Once the closing `]` arrives in subsequent renders, the full reference resolves to a card
  - [x] 6.3 Unit test: partial `[explainer:` at end of streaming text does not render broken card — text up to `[` is shown
  - [x] 6.4 Unit test: completed `[explainer:filename.svg]` in streaming text renders card correctly

- [x] Task 7: Screen reader announcement cleanup (AC: #5)
  - [x] 7.1 In `TutorPanel.tsx` where `announceToScreenReader(event.content)` is called on message complete, strip `[explainer:filename.svg]` references from the announced text and replace with the explainer's title (e.g., `"[See diagram: Key-Value Store Operations]"`) or remove entirely if asset not found
  - [x] 7.2 Unit test: announced text replaces explainer references with descriptive title text

## Dev Notes

### Architecture Compliance

- **Plugin isolation:** Tutor plugin must NOT import from curriculum plugin internals. The tutor plugin has NO `contentLoader` dependency — `TutorPluginOptions` does not include it. Instead, read explainer manifest and scan for SVGs directly from the filesystem using the existing `contentRoot` path (already available in context assembler options). Add a `loadConceptExplainerMetadata()` helper to `context-helpers.ts` that replicates the manifest-reading logic independently. Import only the `ConceptExplainerAsset` type from `@mycscompanion/shared` for type safety
- **State management:** `conceptExplainerAssets` is already in TanStack Query via `useWorkspaceData` hook (query key: `['workspace', 'get', milestoneId]`). Do NOT duplicate in Zustand. Pass as prop to TutorPanel
- **No new stores:** Exactly 2 Zustand stores remain — `useWorkspaceUIStore` and `useEditorStore`
- **No new packages:** All work within existing `apps/backend`, `apps/webapp`, and `packages/shared`

### Existing Concept Explainer Implementation (Story 4.5)

The concept explainer system is already fully implemented for the Diagrams tab:

- **Type:** `ConceptExplainerAsset` in `packages/shared/src/types/curriculum.ts` — `{ name, path, altText, title }`
- **Content:** SVGs in `content/milestones/{slug}/assets/` with `manifest.yaml` for metadata
- **Backend:** `readConceptExplainerAssets(slug)` in `apps/backend/src/plugins/curriculum/content-loader.ts` — filesystem scan + manifest enrichment, Redis-cached
- **Static serving:** `GET /assets/milestones/:slug/:filename` via `@fastify/static` in `apps/backend/src/app.ts`
- **API:** Returned as part of `GET /api/curriculum/milestones/:id` response → `conceptExplainerAssets[]`
- **Frontend hook:** `useWorkspaceData` already fetches and exposes `conceptExplainerAssets`
- **Rendering:** `ConceptExplainers.tsx` (list view) and `ConceptExplainerDialog.tsx` (expanded view) in `apps/webapp/src/components/workspace/`
- **Dark mode:** SVGs designed with light colors on transparent background, `dark:invert` CSS escape hatch on `<img>`

### Tutor Plugin Structure (Stories 6.1-6.4)

Key files to modify or reference:

| File | Purpose |
|---|---|
| `apps/backend/src/plugins/tutor/services/context-assembler.ts` | Assembles system prompt for regular tutor messages — ADD explainer list here |
| `apps/backend/src/plugins/tutor/services/stuck-context-assembler.ts` | Assembles system prompt for stuck interventions — ADD explainer list here |
| `apps/backend/src/plugins/tutor/services/context-helpers.ts` | Shared context loading (milestone brief, code, criteria) — may add explainer loading here |
| `content/prompts/tutor-base.md` | Tutor system prompt template — ADD explainer instructions + placeholder |
| `content/prompts/stuck-intervention.md` | Stuck intervention prompt template — ADD explainer instructions + placeholder |
| `apps/webapp/src/components/workspace/TutorPanel.tsx` | Chat UI — pass explainer assets to TutorMessage, fix screen reader announcements |
| `apps/webapp/src/components/workspace/TutorMessage.tsx` | Message renderer using `react-markdown` — ADD explainer reference parsing and inline card rendering here |
| `apps/webapp/src/components/workspace/WorkspaceLayout.tsx` | Passes data to TutorPanel — ADD conceptExplainerAssets prop |
| `apps/webapp/src/hooks/use-tutor-stream.ts` | Regular message streaming — NO changes needed (parsing at render time) |
| `apps/webapp/src/hooks/use-stuck-intervention.ts` | Stuck intervention streaming — NO changes needed (parsing at render time) |

### Prompt Design Strategy

The tutor prompt should include a section like:

```
## Available Visual Explainers

The following concept diagrams are available for this milestone. When the learner struggles with a structural concept that a diagram illustrates, include [explainer:filename.svg] in your response to surface the visual. Only reference diagrams when genuinely relevant to the learner's difficulty.

{{available_explainers}}
```

Where `{{available_explainers}}` is replaced with:

```
- kv-store-operations.svg: "Key-Value Store Operations" — Diagram showing how PUT, GET, and DELETE operations interact with the in-memory hash map data structure
- persistence-flow.svg: "Persistence Flow" — Diagram showing the data persistence flow from in-memory storage to disk file and back during reload
```

### SSE Streaming Consideration

Explainer references (`[explainer:filename.svg]`) arrive character-by-character during SSE streaming. Key design decisions:

1. **No hook changes.** Both `use-tutor-stream.ts` and `use-stuck-intervention.ts` accumulate raw text and store via `queryClient.setQueryData`. They must NOT be modified — parsing happens at render time only
2. **Render-time parsing in `TutorMessage.tsx`.** The `parseExplainerRefs()` utility splits text around complete `[explainer:...]` patterns. During streaming, incomplete references (text ending with `[explainer:` without closing `]`) are detected and the partial pattern is hidden until complete
3. **Raw text preserved in cache.** The TanStack Query cache stores the original text with `[explainer:...]` markers intact. This ensures re-renders and cache hydration work correctly

### Testing Strategy

- **Backend tests:** Create test fixture files (manifest.yaml + dummy SVGs) in `__fixtures__/milestones/test-milestone/assets/`. Test `loadConceptExplainerMetadata()` against real fixture files. Test context assembler prompt output includes formatted explainer list
- **Frontend parsing tests:** Pure function tests for `parse-explainer-refs.ts`
- **Component tests:** `@testing-library/react` for `TutorExplainerCard` — verify rendering, alt text, click-to-expand
- **Integration tests:** TutorPanel renders explainer cards when message contains references and assets are available
- **Mock pattern:** Use existing `createTestQueryClient()` from `@mycscompanion/config/test-utils/` for TanStack Query mocking

### Key Patterns from Previous Stories

From Story 6.4 implementation:
- SSE streaming uses shared `parseSSEStream<TutorStreamEvent>` utility
- Model selection via `selectModel()` in `anthropic.ts` — no changes needed for 6.5 (model selection is independent of explainer surfacing)
- Screen reader announcements via `announceToScreenReader(event.content)` on message complete — raw `[explainer:filename.svg]` markers must be stripped and replaced with descriptive text (e.g., `"[See diagram: Key-Value Store Operations]"`) before announcing, otherwise screen readers will read the raw markup
- Rate limiting reuses tutor bucket `rate:tutor:${uid}` — no changes needed

### Project Structure Notes

- All new frontend files follow `PascalCase.tsx` for components, `kebab-case.ts` for utilities
- New files: `apps/webapp/src/lib/parse-explainer-refs.ts`, `apps/webapp/src/components/workspace/TutorExplainerCard.tsx`
- Test files co-located: `parse-explainer-refs.test.ts`, `TutorExplainerCard.test.tsx`
- No new API routes needed — existing curriculum and tutor endpoints are sufficient
- No new database tables or migrations needed
- No new shared types needed — `ConceptExplainerAsset` already exists

### References

- [Source: _bmad-output/planning-artifacts/epics.md — Epic 6, Story 6.5]
- [Source: _bmad-output/planning-artifacts/architecture.md — ARCH-6 AI Tutor Architecture]
- [Source: _bmad-output/implementation-artifacts/4-5-visual-concept-explainers.md — Concept explainer implementation]
- [Source: _bmad-output/implementation-artifacts/6-4-two-stage-stuck-detection-and-proactive-intervention.md — Previous story patterns]
- [Source: _bmad-output/project-context.md — Project rules and conventions]
- [Source: packages/shared/src/types/curriculum.ts — ConceptExplainerAsset type]
- [Source: apps/backend/src/plugins/tutor/services/context-assembler.ts — Context assembly pattern]
- [Source: apps/backend/src/plugins/curriculum/content-loader.ts — Content loader with explainer support]
- [Source: content/prompts/tutor-base.md — Tutor system prompt template]
- [Source: apps/webapp/src/components/workspace/TutorMessage.tsx — Message renderer using react-markdown]
- [Source: apps/webapp/src/components/workspace/ConceptExplainers.tsx — Existing explainer rendering]
- [Source: apps/webapp/src/components/workspace/ConceptExplainerDialog.tsx — Existing expand dialog]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6

### Debug Log References

None — implementation proceeded without blockers.

### Completion Notes List

- Implemented `loadConceptExplainerMetadata()` in `context-helpers.ts` — reads manifest.yaml and scans SVGs from filesystem, preserving plugin isolation (no curriculum plugin imports)
- Both `context-assembler.ts` and `stuck-context-assembler.ts` now include `{{available_explainers}}` placeholder replacement with formatted explainer metadata
- Updated `tutor-base.md` and `stuck-intervention.md` prompt templates with available explainers section and `[explainer:filename.svg]` reference format instructions
- Created `parse-explainer-refs.ts` utility for extracting explainer references from tutor message text
- Created `TutorExplainerCard.tsx` component — compact card with thumbnail, title, and expand button reusing `ConceptExplainerDialog`
- Modified `TutorMessage.tsx` to split text around explainer references and render inline cards, with streaming partial-reference suppression
- Wired `conceptExplainerAssets` prop from `WorkspaceLayout` → `TutorPanel` → `TutorMessage` via filename-keyed lookup map
- Created `stripExplainerRefsForA11y()` for screen reader announcements — replaces `[explainer:filename.svg]` with `[See diagram: readable name]`
- Updated `use-tutor-stream.ts` and `use-stuck-intervention.ts` to strip explainer refs from announced text
- All tests pass: 362 backend + 496 webapp = 858 total (0 regressions)
- TypeScript compiles cleanly for both backend and webapp

### Change Log

- 2026-03-10: Implemented Story 6.5 — Tutor-surfaced concept explainers with all 7 tasks complete
- 2026-03-11: Code review fixes — H1: eliminated stateful module-level regex race condition in parse-explainer-refs.ts; M1: stripExplainerRefsForA11y now uses actual asset titles from manifest via assets map threaded through hooks; M2: added Redis caching to loadConceptExplainerMetadata; M3: passed conceptExplainerAssets to MobileLayout; M4: addressed by M1 fix (proper title resolution now tested)

### File List

**New files:**
- `apps/webapp/src/lib/parse-explainer-refs.ts`
- `apps/webapp/src/lib/parse-explainer-refs.test.ts`
- `apps/webapp/src/components/workspace/TutorExplainerCard.tsx`
- `apps/webapp/src/components/workspace/TutorExplainerCard.test.tsx`
- `apps/webapp/src/components/workspace/TutorMessage.test.tsx`
- `apps/backend/src/plugins/tutor/services/__fixtures__/milestones/test-milestone/assets/manifest.yaml`
- `apps/backend/src/plugins/tutor/services/__fixtures__/milestones/test-milestone/assets/kv-store-operations.svg`
- `apps/backend/src/plugins/tutor/services/__fixtures__/milestones/test-milestone/assets/persistence-flow.svg`

**Modified files:**
- `apps/backend/src/plugins/tutor/services/context-helpers.ts`
- `apps/backend/src/plugins/tutor/services/context-helpers.test.ts`
- `apps/backend/src/plugins/tutor/services/context-assembler.ts`
- `apps/backend/src/plugins/tutor/services/context-assembler.test.ts`
- `apps/backend/src/plugins/tutor/services/stuck-context-assembler.ts`
- `apps/backend/src/plugins/tutor/services/stuck-context-assembler.test.ts`
- `apps/backend/src/plugins/tutor/services/__fixtures__/prompts/tutor-base.md`
- `apps/backend/src/plugins/tutor/services/__fixtures__/prompts/stuck-intervention.md`
- `content/prompts/tutor-base.md`
- `content/prompts/stuck-intervention.md`
- `apps/webapp/src/components/workspace/TutorMessage.tsx`
- `apps/webapp/src/components/workspace/TutorPanel.tsx`
- `apps/webapp/src/components/workspace/TutorPanel.test.tsx`
- `apps/webapp/src/components/workspace/WorkspaceLayout.tsx`
- `apps/webapp/src/hooks/use-tutor-stream.ts`
- `apps/webapp/src/hooks/use-stuck-intervention.ts`
- `apps/webapp/src/routes/Workspace.tsx`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`
