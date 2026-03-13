# Story 9.3: Milestone 1 Preview

Status: done

## Story

As a **visitor**,
I want to preview the first milestone before signing up,
So that I can evaluate the quality and depth of the content and decide whether this is right for me.

**Requirements Traced:** FR47, ARCH-3, NFR-A6, NFR-P4, NFR-P9, UX-5, UX-9, UX-14

## Acceptance Criteria

1. **Given** a visitor is on the landing page **When** they scroll to the Milestone 1 preview section **Then** they can see the Milestone 1 brief with learning objectives extracted from `content/milestones/01-kv-store/brief.md` at build time (FR47)
2. **And** the starter code from `content/milestones/01-kv-store/starter-code/main.go` is displayed in a read-only code block with Go syntax highlighting — prefer Astro's built-in `<Code>` component (`astro:components`), fallback to styled `<pre><code>` if the import fails (FR47)
3. **And** the acceptance criteria from `content/milestones/01-kv-store/acceptance-criteria.yaml` are listed as a numbered checklist showing each criterion name and description (FR47)
4. **And** the preview is a static rendering — no Monaco editor, no interactive execution, no API calls, no authentication (ARCH-3)
5. **And** all content is loaded from `content/milestones/01-kv-store/` at Astro build time using Node.js `fs` in frontmatter — NOT hardcoded inline (FR47, architecture decision)
6. **And** the preview gives a tangible sense of the learning experience without requiring signup — brief excerpt, code structure, and acceptance criteria are enough to evaluate quality
7. **And** a CTA labeled "Sign Up to Build" (distinct from "Start Building" used elsewhere per UX Flow 4) is visible near the preview content with the same button styling
8. **And** the language remains engineering-grade — no hype, no gamification language (UX-5)
9. **And** all content uses design tokens exclusively — no hardcoded colors (UX-9)
10. **And** the page structure follows a logical reading order with proper heading hierarchy: h2 for preview section, h3 for subsections (NFR-A6)
11. **And** the page maintains responsive layout across all three breakpoints (UX-14)
12. **And** Lighthouse CI assertions continue to pass: LCP <1.5s on 4G throttle, total JS <50KB, accessibility >=90 (NFR-P4, NFR-P9)
13. **And** the `validate-no-red.sh` and `validate-primary-action.sh` CI scripts continue to pass
14. **And** the starter code display shows a meaningful excerpt (the `KVStore` struct + `Get`/`Put`/`Delete` method signatures with TODO comments) — NOT the entire 330-line file
15. **And** a sample benchmark result is displayed near the acceptance criteria (e.g., "1,000 sequential inserts in ~39ms") to show visitors what concrete performance targets look like (FR47, PRD Sam's Journey)

## Tasks / Subtasks

- [x] Task 1: Set up build-time content loading in `index.astro` frontmatter (AC: #5)
  - [x] 1.1 Import `fs` from `node:fs` and `path` from `node:path` in the Astro frontmatter block
  - [x] 1.2 Read `content/milestones/01-kv-store/brief.md` as UTF-8 string. Extract the "What You'll Learn" section (4 bullet points about byte-level I/O, binary serialization, file operations, memory vs disk gap). Parse these into an array of `{ title: string, description: string }` objects by splitting on `**bold**` markers
  - [x] 1.3 Read `content/milestones/01-kv-store/starter-code/main.go` as UTF-8 string. Extract a meaningful excerpt: the `KVStore` struct definition (lines 15-20), plus the `Get`, `Put`, and `Delete` method signatures with their TODO comments (lines 58-98). Join struct and methods with a `// ...` separator. This gives visitors the complete "core operations" picture (~47 lines) without the persistence internals or CLI harness
  - [x] 1.4 Read `content/milestones/01-kv-store/acceptance-criteria.yaml` as UTF-8 string. Install `yaml` as a devDependency (`pnpm --filter website add -D yaml`) and parse with `yaml.parse()`. This is the recommended approach because the YAML file contains multi-line `>` (folded block scalar) fields in `error_hint` that will break naive line-by-line parsing. Only extract `name` and `description` from each criterion — ignore `assertion`, `error_hint`, and `order` fields
  - [x] 1.5 If TypeScript complains about `fs` or `path` imports in Astro frontmatter, install `@types/node` as a devDependency: `pnpm --filter website add -D @types/node`. Astro frontmatter runs in Node.js but the website tsconfig may not include Node types
  - [x] 1.6 Use `path.resolve` relative to the Astro project root to construct paths. The content directory is at `../../content/milestones/01-kv-store` relative to `apps/website/`

- [x] Task 2: Transform the existing preview section into a full Milestone 1 preview (AC: #1, #4, #6, #10)
  - [x] 2.1 Replace the current preview section content (lines 117-141 of `index.astro`) with a comprehensive milestone preview. Keep the same `<section aria-labelledby="preview-heading">` wrapper
  - [x] 2.2 Section heading remains "Milestone 1: Key-Value Store" (`<h2>`)
  - [x] 2.3 Add a brief description paragraph: extract the "What You're Building" summary from the brief (first 3 sentences — "A key-value store that persists data to disk...")
  - [x] 2.4 Add a "What You'll Learn" subsection (`<h3>`) with the 4 learning objectives rendered as a `<ul>` list. Each item shows the bold title and description from the brief

- [x] Task 3: Display starter code with Go syntax highlighting (AC: #2, #14)
  - [x] 3.1 Add a "Starter Code" subsection (`<h3>`) below the learning objectives
  - [x] 3.2 Try Astro's built-in `<Code>` component first: `import { Code } from 'astro:components'` with `lang="go"` and `theme="github-dark"`. This is a virtual module (not an npm import) that uses Shiki for zero-JS server-rendered syntax highlighting. **Fallback:** If the import fails or `astro:components` is unavailable in Astro 5.18.0, use the same styled `<pre><code class="font-mono">` approach from Stories 9.1/9.2 — no syntax highlighting colors but visually consistent with existing code blocks
  - [x] 3.3 Display the extracted code excerpt (struct + Get/Put/Delete signatures with TODOs, ~47 lines). NOT the entire 330-line file
  - [x] 3.4 Add a brief note below the code: "80% scaffolded. Your job: implement the TODO functions." (text-muted-foreground, engineering tone)
  - [x] 3.5 Wrap in a container with `max-w-3xl mx-auto` for readability. If using `<Code>` component: wrap in `<div class="rounded-lg border border-border overflow-hidden">` — Shiki sets its own background, so do NOT add `bg-card` to the wrapper. If the Shiki theme background clashes with `--color-card`, try `[&_pre]:!bg-card` Tailwind override or switch to `github-dark-dimmed` / `night-owl` theme

- [x] Task 4: Display acceptance criteria checklist (AC: #3, #6)
  - [x] 4.1 Add an "Acceptance Criteria" subsection (`<h3>`) below the starter code
  - [x] 4.2 Render the 8 criteria from the YAML file as an ordered list (`<ol>`). Each item shows the criterion name (bold) and description
  - [x] 4.3 Style as `text-body text-muted-foreground` for descriptions, `text-foreground font-semibold` for criterion names
  - [x] 4.4 This gives visitors a concrete sense of "what does done look like" — the key selling point of structured acceptance criteria over vague assignments

- [x] Task 5: Add sample benchmark result (AC: #15)
  - [x] 5.1 Add a benchmark result line below the acceptance criteria list, styled as `font-mono text-body text-muted-foreground` (same pattern as the hero benchmark). Content: a concrete target from `content/milestones/01-kv-store/benchmark-config.yaml` or use "Results: 1,000 inserts, avg 39.12ms, 25,412 ops/sec" — shows visitors what "concrete benchmark targets" look like per PRD Sam's Journey
  - [x] 5.2 Keep it brief — one line, no wrapper card. Engineering-grade: raw numbers, no commentary

- [x] Task 6: Update CTA and layout (AC: #7, #8, #9, #11)
  - [x] 6.1 Change the preview section CTA label from "Start Building" to "Sign Up to Build" per UX Flow 4 specification. Keep the same button styling and link to `https://app.mycscompanion.dev/sign-in`. Note: `validate-primary-action.sh` counts by href target, not label — different label with same href is fine
  - [x] 6.2 Keep the responsive text swap pattern: "Sign Up to Build" on desktop, "Open on desktop to build" on mobile
  - [x] 6.3 Position the CTA after the benchmark result, with `mt-10` spacing
  - [x] 6.4 Ensure responsive layout: code block should `overflow-x-auto` on mobile, learning objectives and criteria lists should stack naturally

- [x] Task 7: Verify constraints and CI compliance (AC: #9, #12, #13)
  - [x] 7.1 Verify zero `text-primary` or `bg-primary` usage outside of CTA buttons — run `scripts/validate-primary-action.sh`
  - [x] 7.2 Verify zero red colors — run `scripts/validate-no-red.sh`
  - [x] 7.3 Verify `pnpm --filter website build` succeeds with zero errors (confirms frontmatter `fs` reads work at build time)
  - [x] 7.4 Verify heading hierarchy: h1 (hero) -> h2 (roadmap, preview) -> h3 (milestone cards, preview subsections)
  - [x] 7.5 Verify total JS in built output remains <50KB (Astro `<Code>` component is server-rendered, zero client JS)
  - [x] 7.6 Verify `font-display: swap` in built CSS
  - [x] 7.7 Verify all CTAs have correct links and labels ("Start Building" on hero/roadmap/footer, "Sign Up to Build" on preview section)
  - [x] 7.8 Run full test suite to confirm zero regressions

## Dev Notes

### What Already Exists (DO NOT recreate)

Stories 9.1 and 9.2 established the complete Astro landing page. All files exist:

| File | Status | Action for 9.3 |
|---|---|---|
| `apps/website/src/layouts/Base.astro` | EXISTS | No changes needed |
| `apps/website/src/pages/index.astro` | EXISTS | MODIFY — transform preview section, add frontmatter imports |
| `apps/website/src/styles/globals.css` | EXISTS | No changes needed |
| `apps/website/astro.config.mjs` | EXISTS | No changes needed |
| `apps/website/lighthouserc.js` | EXISTS | No changes needed |
| `apps/website/package.json` | EXISTS | MODIFY — add `yaml` and possibly `@types/node` as devDependencies |
| `scripts/validate-no-red.sh` | EXISTS | No changes needed |
| `scripts/validate-primary-action.sh` | EXISTS | No changes needed |

### Content Files to Read at Build Time

| File | Purpose | What to Extract |
|---|---|---|
| `content/milestones/01-kv-store/brief.md` | Milestone brief with learning objectives | "What You're Building" summary + "What You'll Learn" bullet points |
| `content/milestones/01-kv-store/starter-code/main.go` | Full starter code (330 lines) | Excerpt: `KVStore` struct (lines 15-20), `Get` + `Put` + `Delete` signatures with TODOs (lines 58-98) |
| `content/milestones/01-kv-store/acceptance-criteria.yaml` | 8 acceptance criteria | All criteria: name + description pairs |

### Files to Modify

| File | Change |
|---|---|
| `apps/website/src/pages/index.astro` | Add frontmatter `fs` imports, transform preview section into full M1 preview with brief, code, criteria |

### Files to Create

**None.** This story modifies `index.astro` and `package.json` (devDependency) only.

### Constraints & Anti-Patterns

**Architecture constraints:**
- **Build-time content loading (FR47, ARCH-3):** Use `fs.readFileSync` in Astro frontmatter. Do NOT use Astro content collections (overkill) and do NOT hardcode content inline
- **Zero Firebase (ARCH-3):** CTA remains a plain `<a>` link. No auth on landing page
- **Zero new client-side JS:** `<Code>` component (or fallback `<pre><code>`) is server-rendered. Verify <50KB JS budget
- **Static only:** No Monaco, no execution, no API calls. "Screenshot-quality preview, not a functional workspace" (UX spec)
- **Green = CTA only (UX-9, UX-19):** Code blocks, criteria, learning objectives MUST NOT use `text-primary` or `bg-primary`
- **`font-display: swap`** — do not change to `optional`

**Do NOT:**
- Use Astro content collections, display the entire 330-line starter file, add Monaco/interactive execution, add Firebase, hardcode milestone content inline, use images for code, use marketing language, skip heading levels, use `dark:` prefix, change `font-display`, drop `aria-labelledby` pattern, add default exports, add `@/` aliases

### Astro `<Code>` Component Notes

**Primary approach** — Astro's built-in `<Code>` component (virtual module, zero-JS, Shiki-powered):

```astro
---
import { Code } from 'astro:components'
---
<Code code={goExcerpt} lang="go" theme="github-dark" />
```

- `astro:components` is a virtual module (not an npm package) — do NOT `pnpm add` it
- Zero client JS — outputs `<pre><code>` with inline CSS from Shiki
- Theme: try `github-dark` first. If background clashes with `--color-card`, try `github-dark-dimmed` or `night-owl`, or override with `[&_pre]:!bg-card`
- Shiki sets its own background — do NOT add `bg-card` to the code wrapper

**Fallback approach** — if `astro:components` import fails in Astro 5.18.0:

```astro
<pre class="font-mono text-code-block text-foreground bg-card rounded-lg border border-border p-6 text-left overflow-x-auto"><code>{goExcerpt}</code></pre>
```

This matches the hero code block pattern from Story 9.2. No syntax highlighting colors, but visually consistent and proven to work.

### YAML Parsing

Install `yaml` as devDependency: `pnpm --filter website add -D yaml`. Then in frontmatter:

```typescript
import yaml from 'yaml'
const parsed = yaml.parse(criteriaRaw)
const criteria = parsed.criteria.map((c: { name: string; description: string }) => ({
  name: c.name,
  description: c.description,
}))
```

Only extract `name` and `description` — ignore `assertion`, `error_hint` (multi-line `>` scalars), and `order`. The YAML file has complex nested structures that will break naive line-by-line parsing.

### Code Excerpt Strategy

Extract ~47 lines from the 330-line starter code showing the "core operations" the visitor will implement:

| Section | Lines | Content |
|---|---|---|
| `KVStore` struct | 15-20 | Data structure (map, mutex, file handle) |
| `// ...` separator | — | Indicates omitted code |
| `Get` method | 58-70 | First TODO with guiding comments |
| `Put` method | 72-84 | Second TODO with persistence hint |
| `Delete` method | 86-98 | Third TODO completing CRUD operations |

The TODO comments are critical — they show the work is well-defined, not open-ended. The `Delete` method completes the set of "core operations" mentioned in the brief ("implement `Get`, `Put`, `Delete` with disk persistence"). Persistence methods (`saveToDisk`/`loadFromDisk`) are intentionally omitted — they're the deeper challenge, better discovered after signup.

### CTA Label Change (UX Flow 4)

The UX specification defines distinct CTA labels:
- Landing page (hero, after roadmap, footer): **"Start Building"** — generic action
- Milestone 1 preview section: **"Sign Up to Build"** — different label because this CTA appears after the visitor has evaluated content quality, implying a more informed decision to commit

This is a deliberate UX decision. Only change the CTA in the preview section.

### Design Token Usage

Same tokens as 9.2. Key additions for this story:

| Token | Tailwind Class | Usage in 9.3 |
|---|---|---|
| `--color-foreground` | `text-foreground` | Subsection headings (h3), criterion names |
| `--color-muted-foreground` | `text-muted-foreground` | Brief text, criterion descriptions, learning objectives |
| `--color-card` | `bg-card` | NOT on code block (Shiki provides background) |
| `--color-border` | `border-border` | Code block wrapper border, list item separators if needed |

### Copy Guidelines (UX-5)

Same as 9.2 — engineering language only:
- "acceptance criteria" not "quiz" or "challenge"
- "implement" not "learn about"
- "milestone" not "level"
- No exclamation marks, no superlatives

### Responsive Layout Notes

- Code block: `overflow-x-auto` ensures horizontal scroll on mobile
- Learning objectives list: natural `<ul>` stacking
- Acceptance criteria: natural `<ol>` stacking
- Max width containers: `max-w-3xl mx-auto` for readability
- Spacing: `py-16 lg:py-24 px-6 md:px-8` (consistent with other sections)

### Previous Story (9.2) Intelligence

Key learnings from Story 9.2:
- Only `index.astro` was modified — same for 9.3
- The preview section (lines 117-141) currently has 2 paragraphs + CTA — this is what we transform
- `aria-labelledby` + `id` pattern on every `<section>` — maintain this
- Code review caught: missing `lg:` responsive breakpoints, `role="img"` accessibility issues, bare `<span>` badges without `<p>` wrappers
- Ensure all `<article>` elements have `aria-labelledby` (pattern from 9.2 fix)
- Pre-existing lint error in `packages/execution/benchmark-runner.ts` — unrelated, ignore

### Git Intelligence

Recent commits show consistent pattern:
- Story implementation + code review fixes in single commits
- No new dependencies added in Epic 9 stories
- Only `apps/website/src/pages/index.astro` modified in 9.1 and 9.2

### Project Structure Notes

- Only `apps/website/src/pages/index.astro` is modified (+ `package.json` for `yaml` devDep)
- Content files at `content/milestones/01-kv-store/` are READ ONLY — do not modify
- No new directories or source files needed
- No impact on other apps (webapp, backend)
- No migration, no database changes, no API changes

### References

- [Source: _bmad-output/planning-artifacts/epics.md — Epic 9, Story 9.3]
- [Source: _bmad-output/planning-artifacts/prd.md — FR47 (Milestone 1 preview before signup)]
- [Source: _bmad-output/planning-artifacts/architecture.md — ARCH-3, FR47 gap resolution: "Astro reads content/milestones/01-kv-store/ at build time"]
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md — Flow 4, Milestone 1 preview boundary, CTA label "Sign Up to Build"]
- [Source: _bmad-output/implementation-artifacts/9-2-value-proposition-and-concrete-proof.md — Previous story learnings]
- [Source: _bmad-output/project-context.md — Astro rules, design tokens, anti-patterns]
- [Source: content/milestones/01-kv-store/brief.md — Learning objectives, what you build]
- [Source: content/milestones/01-kv-store/starter-code/main.go — Full starter code (330 lines)]
- [Source: content/milestones/01-kv-store/acceptance-criteria.yaml — 8 acceptance criteria]
- [Source: apps/website/astro.config.mjs — Astro config, React integration, no content collections]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6

### Debug Log References

None — clean implementation, no issues encountered.

### Completion Notes List

- Task 1: Added build-time content loading in Astro frontmatter using `fs.readFileSync` for brief.md, main.go, and acceptance-criteria.yaml. Installed `yaml` and `@types/node` as devDependencies. Used `path.resolve('../../content/milestones/01-kv-store')` for path resolution. Extracted learning objectives via regex parsing of markdown bold markers. Extracted code excerpt (struct + Get/Put/Delete with TODOs, ~47 lines) via line slicing. Parsed YAML with `yaml.parse()` extracting only name + description.
- Task 2: Transformed preview section from 2 paragraphs + CTA into full milestone preview. Kept `<section aria-labelledby="preview-heading">` wrapper. Added "What You're Building" summary from brief and "What You'll Learn" subsection with 4 learning objectives as `<ul>`.
- Task 3: Used Astro's built-in `<Code>` component from `astro:components` with `lang="go"` and `theme="github-dark"` for zero-JS Shiki-powered syntax highlighting. Wrapped in `<div class="rounded-lg border border-border overflow-hidden overflow-x-auto">` — no `bg-card` since Shiki provides its own background.
- Task 4: Rendered 8 acceptance criteria from YAML as `<ol>` with criterion name (bold) + description. Styled with design tokens only.
- Task 5: Added single-line benchmark result: "Results: 1,000 inserts, avg 39.12ms, 25,412 ops/sec" in `font-mono text-body text-muted-foreground`.
- Task 6: Changed preview CTA label to "Sign Up to Build" (desktop) / "Open on desktop to build" (mobile). Other CTAs (hero, roadmap, footer) remain "Start Building". CTA positioned after benchmark with `mt-10`.
- Task 7: All validations passed — validate-no-red.sh, validate-primary-action.sh, build succeeds, heading hierarchy correct (h1 → h2 → h3), font-display: swap confirmed, CTA labels correct, full test suite (465 tests) passes with zero regressions.

### Change Log

- 2026-03-13: Implemented Story 9.3 — Milestone 1 Preview with build-time content loading, Go syntax-highlighted code excerpt, acceptance criteria checklist, benchmark result, and "Sign Up to Build" CTA
- 2026-03-13: Code review fixes — stripped markdown backticks from rendered text (buildingSummary + learning objectives), fixed conflicting overflow classes (overflow-hidden → overflow-y-hidden), replaced `as` cast with type guard filter, fixed invalid `\Z` regex anchor to `$`

### File List

- `apps/website/src/pages/index.astro` — Modified: added frontmatter content loading (fs, path, yaml imports), transformed preview section into full M1 preview with learning objectives, Code component, acceptance criteria, benchmark result, updated CTA
- `apps/website/package.json` — Modified: added `yaml` and `@types/node` as devDependencies
- `pnpm-lock.yaml` — Modified: lockfile updated for new devDependencies
