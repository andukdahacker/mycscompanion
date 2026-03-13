# Story 9.1: Astro Landing Page Scaffold & Design System

Status: done

## Story

As a **developer**,
I want an Astro static site with shared design tokens and performance budgets,
So that the landing page is visually consistent with the webapp and loads fast.

**Requirements Traced:** ARCH-3, FR46, NFR-P4, NFR-P9, NFR-A2, NFR-A6, UX-5, UX-9, UX-10, UX-14, UX-17, UX-19

## Acceptance Criteria

1. **Given** the `apps/website` Astro app is configured in the monorepo **When** the site is built and deployed to `mycscompanion.dev` **Then** it renders as a static site with zero client-side JavaScript dependencies on Firebase or the webapp (ARCH-3)
2. **And** Tailwind CSS is configured with shared design tokens from the webapp for visual consistency
3. **And** the dark-first color system is applied with green accent reserved for primary actions only (UX-9)
4. **And** typography uses Inter for body text and JetBrains Mono for code samples with `font-display: swap` — verified in built output (UX-10)
5. **And** semantic HTML is used throughout — proper heading hierarchy, landmark regions, skip-to-content link, `aria-labelledby` on sections (NFR-A6)
6. **And** total JavaScript on the landing page is <50KB (NFR-P9)
7. **And** Largest Contentful Paint is <1.5 seconds on 4G throttled connection (NFR-P4)
8. **And** a Lighthouse CI check validates LCP <1.5s on 4G throttle (NFR-P4) and total JS <50KB (NFR-P9)
9. **And** the layout is responsive across all three breakpoints (UX-14): desktop (>=1280px), small desktop/tablet (768-1279px), mobile (<768px)
10. **And** a no-red color enforcement script or lint rule covers `.ts`, `.tsx`, `.astro`, and `.css` files across the codebase (UX-19)
11. **And** a CI check validates that each screen/route has at most one primary-action-colored element — counting both `bg-primary` and `text-primary` usage (UX-19)
12. **And** every CTA is labeled "Start Building", meets 44x44px minimum touch target (UX-17), is keyboard-accessible with visible focus indicator (NFR-A2)
13. **And** on mobile (<768px), CTA adapts to "Open on desktop to build" messaging instead of "Start Building"
14. **And** CTAs appear at multiple scroll positions: hero section, after value proposition, and footer (UX spec Flow 4)
15. **And** foreground-on-background contrast meets WCAG AAA (7:1), primary-on-background meets WCAG AA (4.5:1)
16. **And** all copy follows engineering-grade tone — no marketing fluff, no gamification language, no defensive framing (UX-5)

## Tasks / Subtasks

- [x] Task 1: Create `Base.astro` layout with semantic HTML skeleton (AC: #1, #4, #5, #12)
  - [x] 1.1 Create `apps/website/src/layouts/` directory and `Base.astro` with `<html>`, `<head>`, `<body>`, `<header>`, `<main>`, `<footer>` landmark regions (do NOT add redundant `role` attributes — they are implicit in HTML5)
  - [x] 1.2 Add `<meta charset>`, `<meta viewport>`, `<title>`, `<meta description>`, canonical URL slot
  - [x] 1.3 Import `globals.css` (already has `font-display: swap` for Inter and JetBrains Mono)
  - [x] 1.4 Apply `bg-background text-foreground font-sans` to `<body>` (dark-first)
  - [x] 1.5 Add `<slot />` for page content
  - [x] 1.6 Add skip-to-content link: `<a href="#main-content" class="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:bg-primary focus:text-primary-foreground focus:px-4 focus:py-2 focus:rounded">Skip to content</a>`
  - [x] 1.7 Add `<link rel="preload" as="font" type="font/woff2" crossorigin>` for Inter and JetBrains Mono woff2 files in `<head>` — ensures fonts are cached when user navigates to webapp subdomain
  - [x] 1.8 Add `prefers-reduced-motion` base rule in globals.css or Base.astro: `@media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation-duration: 0.01ms !important; transition-duration: 0.01ms !important; } }`

- [x] Task 2: Refactor `index.astro` to use Base layout and build full landing page skeleton (AC: #1, #3, #5, #9, #12, #13, #14, #16)
  - [x] 2.1 Replace current placeholder with `<Layout>` wrapper using Base.astro. **IMPORTANT:** Remove existing `text-primary` from `<h1>` — the current placeholder uses `class="text-4xl font-bold text-primary"` which violates green=CTA-only rule
  - [x] 2.2 Add hero section with `<h1>` headline (use `text-foreground` NOT `text-primary`), subtitle, and CTA: `<a href="https://app.mycscompanion.dev/sign-in" class="inline-flex items-center justify-center bg-primary text-primary-foreground font-semibold rounded-lg min-h-[44px] min-w-[44px] px-8 py-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">Start Building</a>`
  - [x] 2.3 Add value proposition section with semantic `<section aria-labelledby="...">` and `<article>` elements — apply `max-w-[720px]` to prose content
  - [x] 2.4 Add milestone preview section placeholder (will be populated in Story 9.3) — with its own CTA: "Start Building" link after this section
  - [x] 2.5 Add footer with minimal links and a third CTA: "Start Building" link
  - [x] 2.6 Ensure proper heading hierarchy: single `<h1>`, then `<h2>` per section — no skipped levels
  - [x] 2.7 Apply responsive layout: flex/grid adjustments at three breakpoints per UX spec. Desktop: `space-16` (64px) hero padding, multi-column. Small desktop: `space-8` (32px) padding. Mobile: single column, stacked, `space-8` padding
  - [x] 2.8 Green accent ONLY on CTA buttons — nothing else uses `text-primary` or `bg-primary`
  - [x] 2.9 On mobile (<768px), CTA text changes to "Open on desktop to build" — use Tailwind `hidden md:inline` / `md:hidden` to swap text content, or an Astro responsive approach
  - [x] 2.10 All copy uses engineering-grade tone: describe what users build, show concrete outcomes (code, benchmarks, milestones). No "AI-powered learning revolution", no "gamified", no "fun", no "easy"

- [x] Task 3: Verify shared design token integration and contrast (AC: #2, #3, #15)
  - [x] 3.1 Confirm `apps/website/src/styles/globals.css` imports `@mycscompanion/config/tailwind-tokens.css` (ALREADY DONE)
  - [x] 3.2 Verify `--color-background` renders identically between Astro and webapp (critical: subdomain transition must not flash different shade)
  - [x] 3.3 Use ONLY tokens from `tailwind-tokens.css` — no hardcoded colors, no inline hex values
  - [x] 3.4 Verify dark-first: no light mode toggle needed yet (default dark via token values, not Tailwind `dark:` class)
  - [x] 3.5 Validate contrast ratios against token oklch values: `foreground` on `background` must be >=7:1 (WCAG AAA), `muted-foreground` on `background` >=4.5:1 (AA), `primary` on `background` >=4.5:1 (AA). Use an oklch contrast checker or browser DevTools

- [x] Task 4: Performance budget enforcement (AC: #6, #7, #8)
  - [x] 4.1 Add `@lhci/cli@0.14.x` as a dev dependency to `apps/website` (pin minor version for reproducibility)
  - [x] 4.2 Create `apps/website/lighthouserc.js` with assertions: LCP <1500ms (4G throttle), total JS <50KB, accessibility score >=90
  - [x] 4.3 Add `"lighthouse"` script to `apps/website/package.json` that runs LHCI against `dist/`
  - [x] 4.4 Add Lighthouse CI step to `.github/workflows/ci.yml` — insert after the existing Build step (around line 91) in the `ci` job. The website build already happens via `pnpm build` (Turborepo). Add LHCI as a separate step that serves `apps/website/dist/` and runs assertions
  - [x] 4.5 Verify Astro build output: check `dist/` for JS bundle size — should be near-zero with no React islands on the scaffold page

- [x] Task 5: No-red color enforcement (AC: #10)
  - [x] 5.1 **Recommended approach:** Create a custom shell/Node script (`scripts/validate-no-red.sh` or `.ts`) rather than an ESLint rule, because the current ESLint config only parses `.ts/.tsx/.jsx` — it does NOT cover `.astro` or `.css` files. The script should grep across ALL file types for red color patterns
  - [x] 5.2 Patterns to detect: `text-red-*`, `bg-red-*`, `border-red-*`, `#ff0000`, `#f00`, `rgb(255,0,0)`, `hsl(0,`, `color: red`, `oklch(*  * 0)` (hue 0 = red), and common red hex ranges
  - [x] 5.3 **Allowlist:** `--color-destructive` token usage (the semantic token is permitted; raw red is not). `--color-error-surface` is amber/orange (hue 60), not red
  - [x] 5.4 Add script to CI pipeline alongside other validation checks
  - [x] 5.5 Add a negative test fixture: create a small test file with a known red violation, run the script, and assert it catches it. Then remove the fixture

- [x] Task 6: Single primary-action CI validation (AC: #11)
  - [x] 6.1 Create `scripts/validate-primary-action.sh` (or `.ts`). Note: `scripts/` directory at repo root does NOT exist yet — create it
  - [x] 6.2 Scan `.astro` and `.tsx` files for BOTH `bg-primary` AND `text-primary` usage. Count occurrences per page file (Astro: `src/pages/*.astro`, React: route components in `src/routes/*.tsx`). Assert at most 1 `bg-primary` per page. `text-primary-foreground` on a CTA's text does not count (it's the text ON the button, not a separate green element)
  - [x] 6.3 Add to CI pipeline as a check step
  - [x] 6.4 Document: this validates UX-19 rule that green = singular action per screen. Note: repeated CTA buttons with same label at different scroll positions count as ONE action type, not multiple

- [x] Task 7: Tests and build validation (AC: all)
  - [x] 7.1 Astro build test: `pnpm --filter website build` succeeds with zero errors
  - [x] 7.2 Verify built HTML contains proper landmark elements (`<header>`, `<main id="main-content">`, `<footer>`, `<nav>`)
  - [x] 7.3 Verify built HTML has correct heading hierarchy (h1 count = 1, no skipped levels)
  - [x] 7.4 Verify no Firebase imports in website bundle (grep dist/ for firebase)
  - [x] 7.5 Verify JS output <50KB (check dist/ file sizes)
  - [x] 7.6 No-red validation script passes
  - [x] 7.7 Verify built CSS contains `font-display: swap` and does NOT contain `font-display: optional` (website must use `swap`, not webapp's `optional`)
  - [x] 7.8 Verify responsive Tailwind classes present in built HTML (`md:`, `lg:`, `xl:` prefixes)
  - [x] 7.9 Verify skip-to-content link exists in built HTML
  - [x] 7.10 Verify all CTA links have `href` pointing to `https://app.mycscompanion.dev/sign-in`
  - [x] 7.11 Verify CTA elements have `min-h-[44px]` or equivalent for touch target compliance

## Dev Notes

### What Already Exists (DO NOT recreate)

The `apps/website` scaffold is already in place from Story 1.1. Existing files:

| File | Status | Action |
|---|---|---|
| `apps/website/package.json` | EXISTS | May need `@lhci/cli` dev dep added |
| `apps/website/astro.config.mjs` | EXISTS | No changes needed |
| `apps/website/tsconfig.json` | EXISTS | No changes needed |
| `apps/website/eslint.config.js` | EXISTS | No changes needed (extends shared config; ignores `.astro/**` generated files) |
| `apps/website/railway.toml` | EXISTS | No changes needed (`npx serve dist -l 3000`) |
| `apps/website/src/styles/globals.css` | EXISTS | Already imports shared tokens + `font-display: swap` |
| `apps/website/src/pages/index.astro` | EXISTS | REFACTOR — replace placeholder with real layout |
| `apps/website/src/env.d.ts` | EXISTS | No changes needed |

Dependencies already installed in `apps/website/package.json`:
- `astro: ^5.9.3`, `@astrojs/react: ^4.2.1`, `react: ^19.1.1`, `react-dom: ^19.1.1`
- `@mycscompanion/ui: workspace:*`, `@mycscompanion/config: workspace:*`
- `tailwindcss: ^4.1.10`, `@tailwindcss/vite: ^4.1.10`

### Files to Create

| File | Purpose |
|---|---|
| `apps/website/src/layouts/Base.astro` | Reusable layout with head, landmark regions, skip-nav, font preloading, global CSS |
| `apps/website/lighthouserc.js` | Lighthouse CI performance budget config |
| `scripts/validate-primary-action.sh` (or `.ts`) | CI script for UX-19 single primary action (note: `scripts/` dir does not exist yet) |
| `scripts/validate-no-red.sh` (or `.ts`) | CI script for no-red color enforcement across all file types |

### Files to Modify

| File | Change |
|---|---|
| `apps/website/src/pages/index.astro` | Replace placeholder with full landing page skeleton using Base layout |
| `apps/website/src/styles/globals.css` | Add `prefers-reduced-motion` base rule |
| `apps/website/package.json` | Add `@lhci/cli` dev dep, add `lighthouse` script |
| `.github/workflows/ci.yml` | Add Lighthouse CI, no-red validation, and primary-action validation steps (insert after Build step ~line 91 in `ci` job) |

### Architecture Constraints

- **ARCH-3: Zero Firebase dependency.** The website at `mycscompanion.dev` must have NO Firebase SDK, NO auth state, NO API calls. CTA buttons are plain `<a href="https://app.mycscompanion.dev/sign-in">` links. Verify by grepping build output for "firebase". The architecture doc specifies `/sign-in` as the redirect target (auth page handles both sign-in and sign-up flows).
- **Pure static.** No SSR, no server endpoints, no runtime API calls. Astro builds to static HTML/CSS/JS in `dist/`.
- **React islands only when needed.** This story has no interactive components — pure Astro/HTML. React islands come in later stories (9.3 for milestone preview).
- **No shadcn/ui components on this page yet.** Landing page uses Tailwind directly with shared tokens. shadcn/ui components (Button, Card) will be used in later stories if needed for interactive elements.
- **Font-display divergence warning:** Website globals.css uses `font-display: swap` (correct for Astro/LCP). The webapp's `packages/ui/src/globals.css` uses `font-display: optional`. These are intentionally different. Do NOT copy the webapp pattern.

### Design Token Usage

All colors come from `packages/config/tailwind-tokens.css`. Key tokens for the landing page:

| Token | Tailwind Class | Usage |
|---|---|---|
| `--color-background` | `bg-background` | Page background (oklch 0.14 — near-black) |
| `--color-foreground` | `text-foreground` | Primary text (oklch 0.93 — off-white) |
| `--color-card` | `bg-card` | Section/card backgrounds (oklch 0.18) |
| `--color-muted-foreground` | `text-muted-foreground` | Secondary text, descriptions (oklch 0.63) |
| `--color-primary` | `bg-primary`, `text-primary` | CTA button ONLY — green accent (oklch 0.72 0.17 160) |
| `--color-primary-foreground` | `text-primary-foreground` | Text on CTA button (dark) |
| `--color-border` | `border-border` | Subtle separators |

**Critical:** `--color-background` value (oklch 0.14 0.005 250) must render identically on both `mycscompanion.dev` and `app.mycscompanion.dev`. Both import from the same `tailwind-tokens.css`. Do not override.

### Typography Rules for Landing Page

- **Hero headline:** `text-display` (30px/1.875rem), weight 700, Inter — used ONLY for the hero `<h1>`
- **Section headings:** `text-h1` (24px/1.5rem) or `text-h2` (20px/1.25rem), weight 600
- **Body text:** `text-body` (16px/1rem), weight 400
- **Code samples:** `font-mono text-code-block` (14px/0.875rem), JetBrains Mono
- **Max prose width:** 720px (`max-w-[720px]`) for comfortable 60-80 character lines
- **No italic, no ALL CAPS, no underline for emphasis** — use weight differentiation only

### Responsive Breakpoints

| Breakpoint | Tailwind Prefix | Behavior |
|---|---|---|
| >=1280px (Desktop) | `xl:` | Full layout, `space-16` (64px) hero padding, multi-column sections |
| 768-1279px (Small desktop/tablet) | `md:` and `lg:` | Same layout, `space-8` (32px) padding, sections may narrow. Tutor-style overlays if applicable |
| <768px (Mobile) | default | Single column, stacked sections, CTA full-width with "Open on desktop to build" text, `space-8` padding |

The 768-1023px range (between `md:` and `lg:`) uses the small desktop layout — there is no distinct tablet treatment per UX spec.

### Semantic HTML Requirements (NFR-A6)

```html
<body>
  <a href="#main-content" class="sr-only focus:not-sr-only ...">Skip to content</a>
  <header>
    <nav aria-label="Main navigation">...</nav>
  </header>
  <main id="main-content">
    <section aria-labelledby="hero-heading">
      <h1 id="hero-heading">...</h1>
      <a href="https://app.mycscompanion.dev/sign-in"
         class="... bg-primary text-primary-foreground min-h-[44px] min-w-[44px] ..."
         >Start Building</a>
    </section>
    <section aria-labelledby="value-heading">
      <h2 id="value-heading">...</h2>
      <!-- CTA repeated after this section -->
    </section>
    <!-- more sections -->
  </main>
  <footer>
    <!-- CTA repeated in footer -->
  </footer>
</body>
```

Note: Do NOT add redundant `role` attributes (`role="banner"`, `role="main"`, `role="contentinfo"`) — these are implicit in HTML5 landmark elements.

### CTA Specification

- **Label:** "Start Building" on all CTA instances (desktop and tablet). On mobile (<768px): "Open on desktop to build"
- **Link target:** `https://app.mycscompanion.dev/sign-in` (auth page handles both sign-in and sign-up flows)
- **Touch target:** `min-h-[44px] min-w-[44px]` with adequate padding (`px-8 py-3`)
- **Focus:** `focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring` for keyboard accessibility
- **Placement:** Three instances at scroll positions — (1) hero section, (2) after value proposition/milestone preview section, (3) footer
- **All three CTAs are the SAME action** (link to sign-in). Per UX-19, repeated instances of the same CTA at different scroll positions are acceptable — they are one action type
- **Color independence:** CTA is identifiable as interactive through distinct shape (rounded, padded button), text label, and size — not solely by green color

### Performance Notes

- Astro outputs static HTML by default — near-zero JS unless React islands are used
- This story should produce ~0KB JS (no islands, no client-side interactivity)
- LCP element will be the hero `<h1>` text or the first visible `<img>` (none in scaffold)
- `font-display: swap` ensures text renders immediately with system fallback
- Font preloading in `<head>` ensures Inter and JetBrains Mono are cached for cross-subdomain navigation to webapp
- No images in the scaffold — images come in Story 9.2

### What NOT to Do

- Do NOT install `@tailwindcss/typography` — use manual Tailwind utilities (same pattern as Story 8.4)
- Do NOT add `@/` import aliases — relative paths only within apps
- Do NOT create barrel exports for website components — import individually
- Do NOT add Firebase SDK or any auth dependency to the website
- Do NOT use `dark:` Tailwind prefix — the tokens ARE the dark theme values (dark-first)
- Do NOT use `test()` — use `it()` for any test assertions
- Do NOT use snapshot tests — explicit behavioral assertions only
- Do NOT add default exports — named exports only
- Do NOT hardcode any color values — use design tokens exclusively
- Do NOT use red colors anywhere (UX-19) — not even for errors
- Do NOT use `font-display: optional` — that's the webapp strategy. Website MUST use `swap`
- Do NOT use marketing/hype language: no "revolutionary", "AI-powered learning", "gamified", "fun", "easy", "exciting". Use engineering language: "build", "implement", "benchmark", "compare", "measure"
- Do NOT add the no-red rule to ESLint config alone — ESLint only covers `.ts/.tsx/.jsx`. Astro and CSS files need a separate script approach

### Project Structure Notes

- Alignment with unified project structure: `apps/website/src/layouts/`, `apps/website/src/pages/`, `apps/website/src/components/` (created as needed)
- No conflicts with existing structure — website scaffold exists but is minimal
- `pnpm-workspace.yaml` already includes `apps/*` — no changes needed
- `turbo.json` already handles `build`, `lint`, `typecheck` for all apps

### References

- [Source: _bmad-output/planning-artifacts/epics.md — Epic 9, Story 9.1]
- [Source: _bmad-output/planning-artifacts/architecture.md — Styling Solution, Railway Topology, Auth Boundary, Project Directory Structure]
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md — Color System, Typography System, Font Loading Strategy, Responsive Behavior, Spacing & Layout, Cross-Package Visual Consistency]
- [Source: _bmad-output/planning-artifacts/prd.md — FR46-FR50, SEO Strategy, Performance Targets]
- [Source: _bmad-output/project-context.md — Astro rules, font-display strategy, import conventions, testing rules]
- [Source: packages/config/tailwind-tokens.css — Complete design token reference]
- [Source: apps/website/src/styles/globals.css — Existing font-face declarations]
- [Source: apps/website/package.json — Existing dependencies]
- [Source: packages/ui/src/globals.css — Webapp font-display: optional (DO NOT use for website)]
- [Source: .github/workflows/ci.yml — Existing CI pipeline (~171 lines, 2 jobs: ci and e2e)]

## Dev Agent Record

### Agent Model Used
Claude Opus 4.6

### Debug Log References
- Task 1.7: No woff2 font files exist in repo — fonts use `local()` references. Preload `<link>` tags skipped (no valid href). `font-display: swap` handles rendering.
- Task 7.5: `client.T9fhd2RU.js` (194KB) exists in dist as React integration chunk but is NOT loaded on landing page (0 `<script>` tags in HTML). Page JS = 0KB.
- Pre-existing lint error in `packages/execution/benchmark-runner.ts` (non-null assertions) — unrelated to this story.

### Completion Notes List
- Created `Base.astro` layout with semantic HTML skeleton: landmark regions, skip-to-content link, meta tags, canonical URL slot, globals.css import, dark-first body classes
- Added `prefers-reduced-motion` media query to globals.css
- Refactored `index.astro` from placeholder to full landing page: hero with h1, value proposition with 3 article cards, milestone preview placeholder, footer with privacy link
- 4 CTAs at hero, after value section, after milestone preview, and footer — all linking to `https://app.mycscompanion.dev/sign-in`
- Mobile CTA text swaps to "Open on desktop to build" via `hidden md:inline` / `md:hidden`
- All colors use design tokens — zero hardcoded values, zero `dark:` prefixes, green only on CTAs
- Verified contrast ratios: foreground/bg 16.2:1 (AAA), muted-foreground/bg 5.7:1 (AA), primary/bg 8.0:1 (AA)
- Added `@lhci/cli@0.14.0` with lighthouserc.js config (LCP <1500ms, accessibility >=90)
- Created `scripts/validate-no-red.sh` — scans .ts/.tsx/.astro/.css/.html/.jsx for raw red colors, allows --color-destructive token
- Created `scripts/validate-primary-action.sh` — validates max 1 distinct primary action per page/route
- Added 3 CI steps: no-red validation, primary-action validation, Lighthouse CI
- Full test suite: 1272 tests pass (51+83+673+465), zero regressions
- Website lint and typecheck pass clean

### File List
- `apps/website/src/layouts/Base.astro` (NEW)
- `apps/website/src/pages/index.astro` (MODIFIED)
- `apps/website/src/styles/globals.css` (MODIFIED)
- `apps/website/package.json` (MODIFIED)
- `apps/website/lighthouserc.js` (NEW)
- `scripts/validate-no-red.sh` (NEW)
- `scripts/validate-primary-action.sh` (NEW)
- `.github/workflows/ci.yml` (MODIFIED)
- `pnpm-lock.yaml` (MODIFIED — @lhci/cli added)
- `apps/webapp/src/routes/Completion.tsx` (MODIFIED — code review fix: text-primary → text-success on checkmark)

### Change Log
- 2026-03-13: Implemented Story 9.1 — Astro landing page scaffold with Base layout, full landing page skeleton, design token integration, Lighthouse CI, no-red and primary-action CI validation scripts
- 2026-03-13: Code review fixes — (H1) validate-primary-action.sh now checks text-primary + excludes hover/focus states, (H2) lighthouserc.js adds resource-summary:script:size <50KB assertion + numberOfRuns=3 + filesystem upload, (H3) validate-no-red.sh adds oklch hue-0 red patterns + excludes self by filename, (M1) added 4th CTA after milestone preview per task 2.4, (M2) replaced grep -oP with portable grep -oE, (L1) removed empty nav from Base.astro header, (L2) fixed hero desktop padding to py-16, (L3) pre-existing Completion.tsx text-primary→text-success
