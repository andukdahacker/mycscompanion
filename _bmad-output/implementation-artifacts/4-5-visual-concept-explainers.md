# Story 4.5: Visual Concept Explainers

Status: done

## Story

As a learner,
I want to see annotated diagrams that explain key data structures,
so that I can visually understand the concepts behind what I'm building.

## Acceptance Criteria

1. Annotated SVG diagrams for key data structures are accessible within the milestone workspace context (FR13)
2. Explainers are static assets served with the milestone content via the curriculum API — backend already serves from `/assets/milestones/{slug}/{filename}` and API returns `conceptExplainerAssets[]`
3. All SVGs have descriptive alt text for screen reader accessibility (NFR-A5) — loaded from a `manifest.yaml` in each milestone's `assets/` directory
4. Explainers are relevant to the current milestone's data structures and concepts
5. The visual style is consistent with the dark-first design system (UX-9) — SVGs are designed with explicit light-colored strokes/text on transparent backgrounds; CSS `filter: invert(1)` via `dark:invert` applied as fallback for any non-compliant SVGs
6. Explainers load without blocking the primary workspace rendering — lazy-loaded images with loading state
7. Concept explainers display in a dedicated "Diagrams" tab in the TerminalPanel alongside Brief, Output, and Criteria tabs
8. When no concept explainer assets exist for a milestone, the Diagrams tab is hidden (not shown as empty)
9. SVGs are displayed at responsive widths with horizontal scroll for wide diagrams, and support click-to-expand for detail viewing

## Tasks / Subtasks

- [x] Task 1: Add alt text manifest support to content loader (AC: #3)
  - [x] 1.1 Define manifest schema in `content/schema/concept-explainer-manifest.schema.json`:
    ```json
    {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["filename", "altText"],
        "properties": {
          "filename": { "type": "string" },
          "altText": { "type": "string" },
          "title": { "type": "string" }
        }
      }
    }
    ```
  - [x] 1.2 Update `readConceptExplainerAssets()` in `apps/backend/src/plugins/curriculum/content-loader.ts`:
    - After scanning `assets/` for `.svg` files, check for `assets/manifest.yaml`
    - If manifest exists, parse it and match `filename` to discovered SVGs
    - Populate `altText` from manifest (keep `null` if no manifest or no matching entry)
    - Add `title` field to `ConceptExplainerAsset` (optional, for display heading)
    - **Merge behavior**: Filesystem scan is source of truth. Manifest enriches discovered SVGs. SVGs without manifest entries get `altText: null`, `title: null`. Manifest entries for nonexistent SVGs are silently ignored.
  - [x] 1.3 Update `ConceptExplainerAsset` type in `packages/shared/src/types/curriculum.ts`:
    ```typescript
    export interface ConceptExplainerAsset {
      readonly name: string
      readonly path: string
      readonly altText: string | null
      readonly title: string | null  // NEW: human-readable title from manifest
    }
    ```
  - [x] 1.4 Update compile-time tests in `packages/shared/src/types/curriculum.test.ts` for new `title` field
  - [x] 1.5 Update `content-loader.test.ts` — test manifest parsing, missing manifest fallback, partial manifest (some SVGs without entries), manifest entries for nonexistent SVGs (ignored). Note: tests mock `readFile` for manifest.yaml in addition to existing `readdir` mocks.
  - [x] 1.6 Update `content-loader.integration.test.ts` with manifest file tests
  - [x] 1.7 Verified `apps/backend/src/plugins/curriculum/routes/milestones.test.ts` — no `ConceptExplainerAsset` mock data exists in this file; no changes needed
  - [x] 1.8 Verified `apps/backend/src/worker/processors/execution-processor.test.ts` — `listConceptExplainerAssets` mock returns `[]` (empty array); no changes needed

- [x] Task 2: Create sample SVG assets for Milestone 1 (AC: #4, #5)
  - [x] 2.1 Create `content/milestones/01-kv-store/assets/kv-store-operations.svg`:
    - Annotated diagram showing PUT/GET/DELETE operations on an in-memory hash map
    - Use explicit light colors (white/light gray strokes, white text) on transparent background — works on dark `bg-background`
    - Do NOT use `currentColor` — it doesn't work when SVG is loaded via `<img>` tag (browser doesn't pass parent CSS context into `<img>`)
    - Include `<title>` and `<desc>` SVG elements for baseline accessibility
  - [x] 2.2 Create `content/milestones/01-kv-store/assets/persistence-flow.svg`:
    - Diagram showing how data flows from memory to disk and back on reload
    - Same light-on-transparent styling approach as 2.1
  - [x] 2.3 Create `content/milestones/01-kv-store/assets/manifest.yaml`:
    ```yaml
    - filename: kv-store-operations.svg
      altText: "Diagram showing how PUT, GET, and DELETE operations interact with the in-memory hash map data structure"
      title: "Key-Value Store Operations"
    - filename: persistence-flow.svg
      altText: "Diagram showing the data persistence flow from in-memory storage to disk file and back during reload"
      title: "Persistence Flow"
    ```
  - [x] 2.4 Remove `.gitkeep` from `content/milestones/01-kv-store/assets/` (no longer needed with real files)

- [x] Task 3: Expose concept explainer assets in frontend data hook (AC: #2, #8)
  - [x] 3.1 Update `WorkspaceData` interface in `apps/webapp/src/hooks/use-workspace-data.ts`:
    ```typescript
    interface WorkspaceData {
      readonly milestoneName: string
      readonly milestoneNumber: number
      readonly progress: number
      readonly initialContent: string
      readonly brief: string | null
      readonly criteria: readonly AcceptanceCriterion[]
      readonly stuckDetection: StuckDetectionConfig
      readonly conceptExplainerAssets: readonly ConceptExplainerAsset[]  // NEW
    }
    ```
  - [x] 3.2 Map `conceptExplainerAssets` from API response in the `queryFn`:
    ```typescript
    conceptExplainerAssets: content.conceptExplainerAssets,
    ```
  - [x] 3.3 Import `ConceptExplainerAsset` from `@mycscompanion/shared`
  - [x] 3.4 Update `use-workspace-data.test.tsx` — add `conceptExplainerAssets` to mock responses and verify pass-through

- [x] Task 4: Create ConceptExplainers display component (AC: #5, #6, #7, #9)
  - [x] 4.1 Create `apps/webapp/src/components/workspace/ConceptExplainers.tsx`:
    - Accepts `assets: readonly ConceptExplainerAsset[]`
    - Renders a vertical list of SVG diagrams, each with:
      - Optional `title` as heading (`<h3>`) if provided
      - `<img>` tag with `src={asset.path}`, `alt={asset.altText ?? asset.name}`, `role="img"`
      - Lazy loading: `loading="lazy"` attribute on `<img>`
      - Container with `overflow-x-auto` for wide diagrams
      - Click handler to open expanded view (dialog/modal with full-size SVG)
    - Dark-mode: SVGs are designed with light colors on transparent background. Apply `class="dark:invert"` only as fallback for SVGs that have dark-on-light designs (e.g., third-party diagrams)
    - Empty state: Return `null` if no assets (parent handles tab visibility)
  - [x] 4.2 Create `apps/webapp/src/components/workspace/ConceptExplainerDialog.tsx`:
    - Full-screen overlay dialog for expanded SVG viewing
    - Uses shadcn `Dialog` from `@mycscompanion/ui` (import individually, no barrel)
    - Shows SVG at full resolution with scroll
    - Close via Escape key, backdrop click, or close button
    - `aria-label` with asset title or alt text
  - [x] 4.3 Create `apps/webapp/src/components/workspace/ConceptExplainers.test.tsx`:
    - Renders all provided SVG assets with correct src and alt text
    - Falls back to filename for alt when altText is null
    - Shows title heading when title is provided
    - Does not render when assets array is empty (returns null)
    - Click opens expanded dialog
    - Images have `loading="lazy"` attribute
    - Dialog closes on Escape
  - [x] 4.4 Create `apps/webapp/src/components/workspace/ConceptExplainerDialog.test.tsx`:
    - Dialog renders with correct SVG and aria-label
    - Close button dismisses dialog
    - Escape key dismisses dialog

- [x] Task 5: Update Zustand store type and integrate Diagrams tab into TerminalPanel (AC: #7, #8)
  - [x] 5.1 Update `apps/webapp/src/stores/workspace-ui-store.ts`:
    - Update `activeTerminalTab` type from `'brief' | 'output' | 'criteria'` to `'brief' | 'diagrams' | 'output' | 'criteria'`
    - This is a TYPE-ONLY change — no logic changes needed in the store
  - [x] 5.2 Refactor `apps/webapp/src/components/workspace/TerminalPanel.tsx` tab rendering:
    - Accept new prop: `conceptExplainerAssets: readonly ConceptExplainerAsset[]`
    - **IMPORTANT**: Current tabs are HARDCODED individual `<button>` elements (not mapped from TABS array). The `TABS` const is only used for keyboard navigation. Tab refs are manually indexed as `tabRefs.current[0]`, `[1]`, `[2]`.
    - Refactor approach: Compute a `visibleTabs` array from the static TABS list + conditional 'diagrams' entry. Map over `visibleTabs` to render tab buttons dynamically instead of hardcoding each one. This makes the conditional tab clean and keeps keyboard navigation correct.
    - Example refactor pattern:
      ```typescript
      const visibleTabs = conceptExplainerAssets.length > 0
        ? (['brief', 'diagrams', 'output', 'criteria'] as const)
        : (['brief', 'output', 'criteria'] as const)

      // Tab labels map
      const TAB_LABELS: Record<string, string> = {
        brief: 'Brief', diagrams: 'Diagrams', output: 'Output', criteria: 'Criteria',
      }

      // Render tabs via .map() instead of hardcoded buttons
      {visibleTabs.map((tab, i) => (
        <button
          key={tab}
          ref={(el) => { tabRefs.current[i] = el }}
          id={`terminal-tab-${tab}`}
          role="tab"
          aria-selected={activeTab === tab}
          ...
        >
          {TAB_LABELS[tab]}
        </button>
      ))}
      ```
    - Update keyboard navigation to use `visibleTabs.length` instead of hardcoded `TABS.length`
    - Tab panel content: add `activeTab === 'diagrams'` case rendering `<ConceptExplainers assets={conceptExplainerAssets} />`
    - Tab order: [Brief, Diagrams, Output, Criteria] — Diagrams placed after Brief since both are reference content; Output and Criteria stay at their current end positions to preserve muscle memory for the run→check workflow
  - [x] 5.3 Update `TerminalPanel` props interface — add `conceptExplainerAssets`
  - [x] 5.4 Update `apps/webapp/src/components/workspace/TerminalPanel.test.tsx`:
    - Test Diagrams tab appears when assets are provided
    - Test Diagrams tab is hidden when assets array is empty
    - Test tab switching to Diagrams renders ConceptExplainers
    - Test keyboard navigation (ArrowRight/Left wrapping) works correctly with 3 and 4 tabs
    - Test Home/End keys work with variable tab count

- [x] Task 6: Wire data through workspace route and layout (AC: #2, #7)
  - [x] 6.1 Update `apps/webapp/src/routes/Workspace.tsx`:
    - Destructure `conceptExplainerAssets` from `useWorkspaceData()` result
    - Pass `conceptExplainerAssets` to `WorkspaceLayout`
  - [x] 6.2 Update `apps/webapp/src/components/workspace/WorkspaceLayout.tsx`:
    - Accept `conceptExplainerAssets` prop
    - Pass through to `TerminalPanel`
  - [x] 6.3 Update `Workspace.test.tsx` — verify conceptExplainerAssets flows to layout
  - [x] 6.4 Update `WorkspaceLayout.test.tsx` — verify prop pass-through

## Dev Notes

### Existing Infrastructure (DO NOT recreate)

- **Content loader SVG discovery** (Story 4.1): `readConceptExplainerAssets()` in `content-loader.ts` already scans `content/milestones/{slug}/assets/` for `.svg` files and returns `ConceptExplainerAsset[]`
- **Static file serving** (Story 4.1): `app.ts` already registers `@fastify/static` to serve `/assets/milestones/{slug}/{filename}` from the content directory
- **`ConceptExplainerAsset` type** exists in `packages/shared/src/types/curriculum.ts`: `{ name, path, altText }` — you're ADDING `title` field
- **`MilestoneContent` type** already includes `conceptExplainerAssets` field — API already returns it
- **`conceptExplainerAssets: []`** is already in API responses — just empty because no SVGs exist yet
- **TerminalPanel tabs**: Currently 3 tabs (Brief, Output, Criteria) rendered as **hardcoded individual `<button>` elements** (NOT mapped from TABS array). The `TABS` const is only used for keyboard navigation. You must refactor to dynamic rendering to support a conditional 4th tab cleanly.
- **`useWorkspaceUIStore`** in `stores/workspace-ui-store.ts`: Has `activeTerminalTab` typed as `'brief' | 'output' | 'criteria'` — you're adding `'diagrams'` to this union type
- **`use-workspace-data.ts`** fetches from `/api/curriculum/milestones/:id` and maps to `WorkspaceData` — currently drops `conceptExplainerAssets` from the response

### Architecture Compliance

- **No new Zustand stores**: Concept explainer data is server state → flows through TanStack Query via `useWorkspaceData()`
- **No new packages**: All code in existing apps and packages
- **Plugin isolation**: No backend plugin changes needed — content loader and static serving already exist
- **Component organization**: New components go in `apps/webapp/src/components/workspace/` (feature-grouped)
- **Named exports only** — no default exports
- **Import shadcn components individually** from `@mycscompanion/ui` (no barrel import)
- **`content/` is NOT a pnpm workspace** — no `package.json`, no TypeScript. SVGs are static files.

### Dark-Mode SVG Strategy

**CRITICAL**: `currentColor` does NOT work in `<img>`-loaded SVGs. The browser does not pass the parent element's CSS color context into `<img>` tags. `currentColor` in an `<img>` SVG resolves to black (SVG default), not the page's foreground color.

**Correct approach for this project:**

1. **Primary**: Design SVGs with explicit light colors (white/light-gray strokes, white text) on a **transparent background**. These render correctly on the dark `bg-background` without any CSS tricks.
2. **Fallback**: For any SVGs that have dark-on-light designs (e.g., imported diagrams), apply CSS `filter: invert(1)` in dark mode via Tailwind's `dark:invert` class on the `<img>` element.

All SVGs created for this project MUST follow approach #1. The component supports approach #2 as a safety net only.

### Non-Blocking Loading Pattern

SVGs are loaded as `<img>` tags with `loading="lazy"`, not inlined. This means:
- The browser handles loading asynchronously
- SVGs don't block the brief, editor, or criteria rendering
- Failed SVG loads show the alt text gracefully
- No JavaScript needed for rendering — just standard HTML

The trade-off vs inline SVG: can't style internal SVG elements with CSS. This is why SVGs must use explicit light colors (not `currentColor`). Inline SVG would bloat the API response and require sanitization.

### Downstream Reuse (Story 6.5)

Story 6.5 (Tutor-Surfaced Concept Explainers, Epic 6) will reuse the same SVG assets and render them inline in the tutor chat panel. The `ConceptExplainers` component created here is specific to the workspace TerminalPanel tab. Story 6.5 will create its own rendering component for the tutor context. The shared contract is the `ConceptExplainerAsset` type from `@mycscompanion/shared` — keep it stable.

### Tab Visibility Logic

The Diagrams tab is conditionally rendered based on `conceptExplainerAssets.length > 0`. This means:
- Milestones without SVGs show 3 tabs (Brief, Output, Criteria) — no empty tab
- When assets load (they come with the initial milestone fetch), the tab appears immediately
- No flash or layout shift — data is available from the same TanStack Query as brief and criteria

### Content CI Integration

The existing Content CI pipeline (Story 1.6 scaffold) should validate:
- SVG files are well-formed XML
- `manifest.yaml` entries match actual SVG files in the directory
- All SVGs referenced in manifest exist

This validation is NOT part of this story — it's a separate content CI enhancement. For now, the content loader handles missing files gracefully (empty array).

### Project Structure Notes

```
# Content (new)
content/milestones/01-kv-store/assets/kv-store-operations.svg    # Sample SVG
content/milestones/01-kv-store/assets/persistence-flow.svg       # Sample SVG
content/milestones/01-kv-store/assets/manifest.yaml              # Alt text + titles
content/schema/concept-explainer-manifest.schema.json            # Schema for manifest

# Shared packages (modified)
packages/shared/src/types/curriculum.ts                           # Add title to ConceptExplainerAsset
packages/shared/src/types/curriculum.test.ts                      # Update compile-time tests

# Backend (modified)
apps/backend/src/plugins/curriculum/content-loader.ts             # Read manifest.yaml for alt text
apps/backend/src/plugins/curriculum/content-loader.test.ts        # Manifest parsing tests
apps/backend/src/plugins/curriculum/content-loader.integration.test.ts  # Integration tests

# Frontend (new)
apps/webapp/src/components/workspace/ConceptExplainers.tsx        # SVG list component
apps/webapp/src/components/workspace/ConceptExplainers.test.tsx   # Component tests
apps/webapp/src/components/workspace/ConceptExplainerDialog.tsx   # Expanded view dialog
apps/webapp/src/components/workspace/ConceptExplainerDialog.test.tsx

# Frontend (modified)
apps/webapp/src/stores/workspace-ui-store.ts                      # Add 'diagrams' to activeTerminalTab type
apps/webapp/src/hooks/use-workspace-data.ts                       # Add conceptExplainerAssets to WorkspaceData
apps/webapp/src/hooks/use-workspace-data.test.tsx                 # Update mock data
apps/webapp/src/components/workspace/TerminalPanel.tsx            # Refactor to dynamic tabs, add conditional Diagrams tab
apps/webapp/src/components/workspace/TerminalPanel.test.tsx       # Tab visibility + keyboard nav tests
apps/webapp/src/components/workspace/WorkspaceLayout.tsx          # Pass-through prop
apps/webapp/src/components/workspace/WorkspaceLayout.test.tsx     # Update tests
apps/webapp/src/routes/Workspace.tsx                              # Destructure and pass assets
apps/webapp/src/routes/Workspace.test.tsx                         # Update tests

# Backend test mocks (modified)
apps/backend/src/plugins/curriculum/routes/milestones.test.ts     # Update ConceptExplainerAsset mock with title
apps/backend/src/worker/processors/execution-processor.test.ts    # Update listConceptExplainerAssets mock
```

### Testing Requirements

- **Content loader tests** (`content-loader.test.ts`): Test manifest.yaml parsing, fallback when no manifest, partial manifest coverage, title field extraction
- **Component tests** (`ConceptExplainers.test.tsx`): Render with assets, empty returns null, alt text fallback to filename, title heading, lazy loading attribute, click expands dialog
- **Dialog tests** (`ConceptExplainerDialog.test.tsx`): Render, close via button, close via Escape, aria-label
- **TerminalPanel tests**: Tab appears/hides based on assets, tab switching, keyboard navigation
- **Hook tests**: `conceptExplainerAssets` passed through from API response
- **Test syntax**: `describe()` + `it()`, never `test()`. `vi.restoreAllMocks()` in `afterEach`.
- **Import from `@mycscompanion/config/test-utils/`**: `createTestQueryClient()`, `TestProviders`
- **No snapshot tests** — explicit behavioral assertions only
- **Mock SVG loading**: In component tests, `<img>` src won't resolve — test that correct `src` and `alt` attributes are set, not visual rendering

### Anti-Patterns to Avoid

- Do NOT inline SVG content in API responses — serve as static files via existing `/assets/milestones/` route
- Do NOT create a new Fastify plugin for serving assets — `@fastify/static` in `app.ts` already handles this
- Do NOT add a new Zustand store for diagram state (expanded/collapsed) — use local React state in component
- Do NOT use `currentColor` in SVGs loaded via `<img>` tags — it doesn't work (browser doesn't pass parent CSS context). Use explicit light colors on transparent background instead.
- Do NOT block workspace rendering waiting for SVG loads — use `loading="lazy"` on `<img>` tags
- Do NOT use `dangerouslySetInnerHTML` to render SVGs — use `<img>` tags for security
- Do NOT show an empty Diagrams tab when no assets exist — conditionally render the tab
- Do NOT use default exports (except for React.lazy boundaries, none needed here)
- Do NOT use `any` type — typed with `ConceptExplainerAsset` from shared
- Do NOT use `jest.fn()` — use `vi.fn()`
- Do NOT forget to handle `altText: null` gracefully — fall back to filename
- Do NOT use barrel import from `@mycscompanion/ui` — import Dialog individually
- Do NOT add files to `content/` in `pnpm-workspace.yaml` — it's not a workspace

### Previous Story (4.4) Learnings

- Code review found cross-plugin imports (completion plugin importing ContentLoader directly) — fixed via DI with `BriefLoader` interface. No cross-plugin imports needed for this story since content loader already provides data via curriculum API.
- `vi.restoreAllMocks()` in `afterEach` was missing in some test files — always include it
- `as` casts found in route handlers — use runtime type checks or `satisfies` instead
- Dead code (unused import of `useCompleteMilestone` in `Completion.tsx`) caught in review — keep imports clean
- Story 4.4 pattern: new types in `packages/shared`, modified hooks to expose new data, updated TerminalPanel for new UI — this story follows the exact same pattern

### Git Intelligence (Recent Commits)

Recent commits follow pattern: "Implement Story X.Y: Title with code review fixes"

Story 4.4 touched 22 files (migrations, shared types, backend plugin, frontend routes/hooks/components). This story is lighter — no migrations, no new plugin, primarily frontend components + content loader enhancement + sample content.

Key patterns from 4.4:
- New shared types added to `packages/shared/src/types/` with compile-time verification tests
- Frontend hooks expose server data through TanStack Query
- TerminalPanel modified to add new UI elements (completion button → now adding a tab)
- WorkspaceLayout acts as prop pass-through between Workspace route and TerminalPanel
- All test files co-located next to source

### Dependencies on Previous Work

- Curriculum API with concept explainer asset discovery (Story 4.1) - done
- Static file serving for `/assets/milestones/` (Story 4.1) - done
- Workspace layout with terminal panel tabs (Stories 3.5, 3.7) - done
- Milestone brief and starter code loading (Story 4.2) - done
- `ConceptExplainerAsset` type in shared package (Story 4.1) - done

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story-4.5]
- [Source: _bmad-output/planning-artifacts/architecture.md#Content-Directory-Structure]
- [Source: _bmad-output/planning-artifacts/architecture.md#FR13-Visual-Explainers]
- [Source: _bmad-output/planning-artifacts/epics.md#NFR-A5-Screen-Reader]
- [Source: _bmad-output/planning-artifacts/epics.md#UX-9-Dark-First-Design]
- [Source: _bmad-output/implementation-artifacts/4-4-milestone-completion-and-advancement.md]
- [Source: _bmad-output/implementation-artifacts/4-1-milestone-content-model-and-curriculum-api.md]
- [Source: _bmad-output/project-context.md]
- [Source: apps/backend/src/plugins/curriculum/content-loader.ts]
- [Source: apps/backend/src/app.ts#L68-L86]
- [Source: apps/webapp/src/hooks/use-workspace-data.ts]
- [Source: apps/webapp/src/components/workspace/TerminalPanel.tsx]
- [Source: packages/shared/src/types/curriculum.ts#ConceptExplainerAsset]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6

### Debug Log References

None — clean implementation with no blocking issues.

### Completion Notes List

- Task 1: Added `title` field to `ConceptExplainerAsset` type in shared package. Updated content loader to parse `manifest.yaml` from assets directory, enriching SVG file entries with `altText` and `title`. Filesystem scan remains source of truth; manifest enriches discovered SVGs. SVGs without manifest entries get null fields; manifest entries for nonexistent SVGs are silently ignored.
- Task 2: Created two sample SVGs for Milestone 1 (kv-store-operations.svg, persistence-flow.svg) using light colors on transparent background for dark-mode compatibility. Created manifest.yaml with alt text and titles. Removed `.gitkeep`.
- Task 3: Added `conceptExplainerAssets` to `WorkspaceData` interface and mapped from API response in `useWorkspaceData` hook.
- Task 4: Created `ConceptExplainers` component (vertical list of SVG diagrams with lazy loading, click-to-expand) and `ConceptExplainerDialog` (full-screen overlay using shadcn Dialog). Added Dialog component to `@mycscompanion/ui` package (shadcn add + fixed import paths).
- Task 5: Added `'diagrams'` to `activeTerminalTab` union type. Refactored TerminalPanel from hardcoded tab buttons to dynamic `.map()` rendering with conditional Diagrams tab based on `conceptExplainerAssets.length > 0`. Updated keyboard navigation to work with variable tab count.
- Task 6: Wired `conceptExplainerAssets` from `useWorkspaceData` through `Workspace.tsx` → `WorkspaceLayout.tsx` → `TerminalPanel.tsx`.

### Change Log

- 2026-03-06: Implemented Story 4.5 — Visual Concept Explainers
- 2026-03-06: Code review fixes — added error logging to readManifest/readConceptExplainerAssets (M1/M2), fixed ManifestEntry altText optionality (M3), added $schema and additionalProperties to manifest JSON Schema (L1), corrected story File List for tasks 1.7/1.8 (H1/L3)

### File List

New files:
- content/schema/concept-explainer-manifest.schema.json
- content/milestones/01-kv-store/assets/kv-store-operations.svg
- content/milestones/01-kv-store/assets/persistence-flow.svg
- content/milestones/01-kv-store/assets/manifest.yaml
- packages/ui/src/components/ui/dialog.tsx
- apps/webapp/src/components/workspace/ConceptExplainers.tsx
- apps/webapp/src/components/workspace/ConceptExplainers.test.tsx
- apps/webapp/src/components/workspace/ConceptExplainerDialog.tsx
- apps/webapp/src/components/workspace/ConceptExplainerDialog.test.tsx

Modified files:
- packages/shared/src/types/curriculum.ts (added `title` field to ConceptExplainerAsset)
- packages/shared/src/types/curriculum.test.ts (updated compile-time tests)
- apps/backend/src/plugins/curriculum/content-loader.ts (manifest parsing)
- apps/backend/src/plugins/curriculum/content-loader.test.ts (manifest tests)
- apps/backend/src/plugins/curriculum/content-loader.integration.test.ts (manifest integration tests)
- apps/webapp/src/stores/workspace-ui-store.ts (added 'diagrams' to activeTerminalTab type)
- apps/webapp/src/hooks/use-workspace-data.ts (added conceptExplainerAssets to WorkspaceData)
- apps/webapp/src/hooks/use-workspace-data.test.tsx (added pass-through tests)
- apps/webapp/src/components/workspace/TerminalPanel.tsx (refactored to dynamic tabs, added Diagrams tab)
- apps/webapp/src/components/workspace/TerminalPanel.test.tsx (Diagrams tab tests)
- apps/webapp/src/components/workspace/WorkspaceLayout.tsx (pass-through prop)
- apps/webapp/src/components/workspace/WorkspaceLayout.test.tsx (pass-through tests)
- apps/webapp/src/routes/Workspace.tsx (destructure and pass conceptExplainerAssets)
- apps/webapp/src/routes/Workspace.test.tsx (pass-through tests)

Verified unchanged (no modifications needed):
- apps/backend/src/plugins/curriculum/routes/milestones.test.ts (no ConceptExplainerAsset mock data)
- apps/backend/src/worker/processors/execution-processor.test.ts (mock returns empty array)

Deleted files:
- content/milestones/01-kv-store/assets/.gitkeep
