# Story 9.5: SEO & Social Sharing

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **visitor**,
I want to find mycscompanion via search engines and see a compelling preview when someone shares it,
So that the platform is discoverable and shareable.

**Requirements Traced:** FR49, FR50, UX-8, ARCH-3, NFR-P4, NFR-P9, NFR-A6

## Acceptance Criteria

1. **Given** the landing page is deployed **When** a search engine crawls the site **Then** all pages have appropriate `<title>`, `<meta description>`, and canonical URL tags (FR50)
2. **And** structured data (JSON-LD) is included for rich search result snippets — using `WebSite` schema (FR50)
3. **And** Open Graph cards are optimized for social sharing with engineering-grade visuals — a benchmark screenshot or code snippet at 1200x630px (FR49)
4. **And** Twitter Card meta tags are included for Twitter/X sharing using `summary_large_image` card type
5. **And** OG images are pre-rendered at the correct dimensions for major platforms (1200x630px) and placed in `public/og/`
6. **And** the OG card content is self-contained — communicates value without requiring click-through (UX-8)
7. **And** a `robots.txt` is generated in the build output allowing all crawlers
8. **And** a sitemap is generated as part of the Astro build via `@astrojs/sitemap` integration (generates `sitemap-index.xml` referencing `sitemap-0.xml`)
9. **And** the `site` property is configured in `astro.config.mjs` as `https://mycscompanion.dev`
10. **And** the page builds successfully with `pnpm --filter website build`
11. **And** `validate-no-red.sh` and `validate-primary-action.sh` CI scripts continue to pass
12. **And** Lighthouse CI assertions continue to pass: LCP <1.5s on 4G throttle, accessibility >=90. Note: the JS <50KB budget is already exceeded (194KB React runtime from Story 9.3) — verify this story adds zero new client-side JS but do not block on pre-existing Lighthouse JS failure

**Task dependency order:** Tasks 1-3 must complete before Task 4 (which uses `Astro.site`). Task 7 is final verification.

## Tasks / Subtasks

- [x] Task 1: Configure Astro for SEO infrastructure (AC: #8, #9)
  - [x] 1.1 Install `@astrojs/sitemap` — run `pnpm --filter website add @astrojs/sitemap`
  - [x] 1.2 Update `apps/website/astro.config.mjs`: add `site: 'https://mycscompanion.dev'` and add the sitemap integration via `import sitemap from '@astrojs/sitemap'` and `integrations: [sitemap()]`. **CRITICAL:** `Astro.site` is `undefined` until `site` is set here — Task 4 depends on this
  - [x] 1.3 Verify `sitemap-index.xml` is generated in build output after `pnpm --filter website build`

- [x] Task 2: Create `robots.txt` (AC: #7)
  - [x] 2.1 Create `apps/website/public/` directory (does not exist yet)
  - [x] 2.2 Create `apps/website/public/robots.txt` with content: `User-agent: *\nAllow: /\nSitemap: https://mycscompanion.dev/sitemap-index.xml` (Astro @astrojs/sitemap generates `sitemap-index.xml` by default, not `sitemap.xml`)

- [x] Task 3: Create OG image (AC: #3, #5, #6) — MANUAL: dev agent likely cannot generate images
  - [x] 3.1 Create `apps/website/public/og/` directory
  - [x] 3.2 **MANUAL TASK — requires human intervention if dev agent cannot create images.** Create a static OG image at `apps/website/public/og/default.png` — 1200x630px, engineering-grade visual. The image should be self-contained: dark background matching `oklch(0.14 0.005 250)`, the "tycs" brand name, tagline "Learn CS by Building", and a code/benchmark snippet visual. Use the design tokens: green accent, Inter font, JetBrains Mono for code. Alternative approach: create an HTML file and use a screenshot tool (e.g., Playwright screenshot) to render to PNG
  - [x] 3.3 Verify the image file size is reasonable (<200KB). If it exceeds 200KB, compress with pngquant/optipng or consider JPEG format for photographic content

- [x] Task 4: Add Open Graph and Twitter Card meta tags to Base.astro (AC: #1, #3, #4, #5, #6) — REQUIRES Task 1 completed first
  - [x] 4.1 Extend the `Props` interface in `apps/website/src/layouts/Base.astro` to add optional OG props: `ogImage?: string`, `ogType?: string`, `siteName?: string`
  - [x] 4.2 Add Open Graph meta tags in the `<head>`. Note: `Astro.site` is guaranteed to be defined because Task 1.2 sets `site` in config. In static builds, `Astro.url` returns the full URL derived from the file path (e.g., `https://mycscompanion.dev/` for `index.astro`):
    ```html
    <meta property="og:title" content={title} />
    <meta property="og:description" content={description} />
    <meta property="og:type" content={ogType ?? 'website'} />
    <meta property="og:url" content={canonicalUrl ?? Astro.url.href} />
    <meta property="og:image" content={new URL(ogImage ?? '/og/default.png', Astro.site).href} />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:image:alt" content={description} />
    <meta property="og:site_name" content={siteName ?? 'tycs'} />
    <meta property="og:locale" content="en_US" />
    ```
  - [x] 4.3 Add Twitter Card meta tags in the `<head>`:
    ```html
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content={title} />
    <meta name="twitter:description" content={description} />
    <meta name="twitter:image" content={new URL(ogImage ?? '/og/default.png', Astro.site).href} />
    ```
  - [x] 4.4 Ensure the canonical URL always resolves — use `canonicalUrl ?? Astro.url.href` as the default
  - [x] 4.5 Add `<link rel="canonical" href={canonicalUrl ?? Astro.url.href} />` unconditionally (replace the current conditional canonical)

- [x] Task 5: Add JSON-LD structured data (AC: #2)
  - [x] 5.1 In `apps/website/src/pages/index.astro`, add a JSON-LD `<script type="application/ld+json">` block in the page content (or pass as a slot to Base.astro). Use `WebSite` schema only — `EducationalOrganization` is not appropriate for a marketing landing page:
    ```json
    {
      "@context": "https://schema.org",
      "@type": "WebSite",
      "name": "tycs",
      "url": "https://mycscompanion.dev",
      "description": "Master computer science fundamentals by building real systems in Go. Write a key-value store, measure it against a reference implementation, iterate until yours is faster."
    }
    ```
  - [x] 5.2 Validate JSON-LD output is valid JSON when built — no trailing commas, no template syntax leaks

- [x] Task 6: Pass canonical URL from index.astro (AC: #1)
  - [x] 6.1 Update the `<Base>` component usage in `apps/website/src/pages/index.astro` to pass `canonicalUrl="https://mycscompanion.dev/"` explicitly

- [x] Task 7: Verify CI compliance and build (AC: #10, #11, #12)
  - [x] 7.1 Run `pnpm --filter website build` — must succeed with zero errors
  - [x] 7.2 Verify `sitemap-index.xml` exists in `apps/website/dist/`
  - [x] 7.3 Verify `robots.txt` exists in `apps/website/dist/`
  - [x] 7.4 Verify OG image exists in `apps/website/dist/og/default.png`
  - [x] 7.5 Run `scripts/validate-no-red.sh` — must pass
  - [x] 7.6 Run `scripts/validate-primary-action.sh` — must pass
  - [x] 7.7 Verify total JS in built output has not increased (no new client JS added). Pre-existing 194KB React runtime (from Story 9.3) will fail the <50KB Lighthouse assertion — this is NOT a 9.5 regression
  - [x] 7.8 Run `pnpm test` to confirm zero regressions

## Dev Notes

### What Already Exists (DO NOT recreate)

Stories 9.1-9.4 built the complete landing page. The page has semantic HTML, proper heading hierarchy, ARIA labels, `<title>`, and `<meta description>`. This story adds SEO infrastructure and social sharing meta tags on top.

| File | Status | Action for 9.5 |
|---|---|---|
| `apps/website/src/layouts/Base.astro` | EXISTS | MODIFY — add OG tags, Twitter Card tags, unconditional canonical URL |
| `apps/website/src/pages/index.astro` | EXISTS | MODIFY — add JSON-LD structured data, pass canonicalUrl prop |
| `apps/website/astro.config.mjs` | EXISTS | MODIFY — add `site` property, add `@astrojs/sitemap` integration |
| `apps/website/package.json` | EXISTS | MODIFIED BY pnpm add (auto) |
| `apps/website/public/robots.txt` | NEW | CREATE — robots.txt allowing all crawlers |
| `apps/website/public/og/default.png` | NEW | CREATE — 1200x630px OG image |

### Current Meta Tags in Base.astro

**Present:**
- `<meta charset="utf-8" />`
- `<meta name="viewport" content="width=device-width, initial-scale=1" />`
- `<title>{title}</title>`
- `<meta name="description" content={description} />`
- Conditional `<link rel="canonical" href={canonicalUrl} />`

**Missing (this story adds):**
- All `og:*` meta tags
- All `twitter:*` meta tags
- JSON-LD structured data
- Unconditional canonical URL

### Current Page Props

`index.astro` passes to `Base`:
- `title="tycs — Learn CS by Building"`
- `description="Master computer science fundamentals by building real systems in Go. Write a key-value store, measure it against a reference implementation, iterate until yours is faster."`
- `canonicalUrl` — NOT currently passed

### Astro Config — Current vs Target

**Current:**
```javascript
import { defineConfig } from 'astro/config'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  vite: {
    plugins: [tailwindcss()],
  },
})
```

**Target:**
```javascript
import { defineConfig } from 'astro/config'
import tailwindcss from '@tailwindcss/vite'
import sitemap from '@astrojs/sitemap'

export default defineConfig({
  site: 'https://mycscompanion.dev',
  integrations: [sitemap()],
  vite: {
    plugins: [tailwindcss()],
  },
})
```

### OG Image Requirements

- **Dimensions:** 1200x630px (standard for Facebook, LinkedIn, Twitter large image)
- **Format:** PNG (best quality for text/code visuals)
- **Content (self-contained per UX-8):** Must communicate value without click-through — include "tycs" branding, "Learn CS by Building" tagline, and a visual hint of what the platform does (code snippet or benchmark output)
- **Style:** Dark background matching design tokens (`oklch(0.14 0.005 250)`), green accent, engineering-grade typography
- **File size:** Keep under 200KB. If exceeding, compress with pngquant/optipng or use JPEG for photographic content
- **Creation approach:** This is a static pre-rendered design asset. Recommended: create an HTML page styled with project design tokens, then screenshot at 1200x630 using Playwright (`page.setViewportSize({width: 1200, height: 630})` + `page.screenshot()`). Alternative: manually design in Figma or similar. **This task likely requires human intervention if the dev agent cannot generate images**

### JSON-LD Schema Selection

Use `WebSite` schema for MVP. This enables Google Search to display a sitelinks search box and site name in results. Keep it minimal:

```json
{
  "@context": "https://schema.org",
  "@type": "WebSite",
  "name": "tycs",
  "url": "https://mycscompanion.dev",
  "description": "Master computer science fundamentals by building real systems in Go. Write a key-value store, measure it against a reference implementation, iterate until yours is faster."
}
```

Do NOT add `Course`, `ItemList`, or `EducationalOrganization` schemas — the landing page is a marketing page, not a course catalog. `WebSite` schema is sufficient for MVP and enables Google's site name display in search results.

### @astrojs/sitemap Behavior

- Generates `sitemap-index.xml` (not `sitemap.xml`) at the root
- Requires `site` property in `astro.config.mjs`
- Automatically discovers all static pages from the `src/pages/` directory
- Currently only one page (`/`), so the sitemap will be minimal
- The `robots.txt` should reference `sitemap-index.xml` specifically

### Constraints & Anti-Patterns

**Architecture constraints:**
- **Zero Firebase (ARCH-3):** No auth SDK, no JavaScript handlers — all meta tags are static HTML
- **Zero new client-side JS:** All meta tags and JSON-LD are server-rendered by Astro at build time. No JS added
- **Static only:** No API calls, no dynamic OG image generation — pre-rendered static assets
- **Performance budgets:** LCP <1.5s, accessibility >=90 (meta tags are zero-cost). JS <50KB budget already exceeded by pre-existing 194KB React runtime (Story 9.3) — not a 9.5 concern, just verify zero new JS added

**Do NOT:**
- Generate OG images dynamically at runtime (static pre-rendered only)
- Add `@astrojs/image` or image optimization packages — not needed for a single static OG image
- Add default exports (named exports only per project rules)
- Add `@/` aliases
- Change `font-display` from `swap`
- Use `dark:` prefix (dark-first, no light mode)
- Add `Course` or `ItemList` JSON-LD schemas — keep it to `WebSite` for MVP
- Install `astro-seo` or similar third-party SEO packages — Astro's built-in features + manual meta tags are sufficient

### Previous Story (9.4) Intelligence

Key learnings from Story 9.4:
- Only `index.astro` was modified — 9.5 modifies both `Base.astro` and `index.astro` plus config
- Code review caught: false JS budget claim (194KB pre-existing from 9.3), ephemeral task IDs in comments
- Pre-existing tech debt: React runtime 194KB from `@astrojs/react` — already exceeds <50KB budget. This story should NOT make it worse
- `validate-primary-action.sh` counts by href target — no new CTAs added in 9.5
- Pattern: extract repeated strings to frontmatter consts for DRY

### Git Intelligence

Recent commits (Epic 9):
- `1ab4e3f` Implement Story 9.4: Signup CTA & Auth Redirect with code review fixes
- `7889661` Implement Story 9.3: Milestone 1 Preview with code review fixes
- `004b3d0` Implement Story 9.2: Value Proposition & Concrete Proof with code review fixes
- `5161a45` Implement Story 9.1: Astro Landing Page Scaffold and Design System with code review fixes

Pattern: Single commit per story. Website app modified in all stories. Build verification standard.

### Project Structure Notes

- `apps/website/src/layouts/Base.astro` — layout modified (add meta tags)
- `apps/website/src/pages/index.astro` — page modified (add JSON-LD, canonicalUrl prop)
- `apps/website/astro.config.mjs` — config modified (add site URL, sitemap integration)
- `apps/website/public/robots.txt` — NEW file (static asset)
- `apps/website/public/og/default.png` — NEW file (OG image asset)
- `apps/website/package.json` — modified by `pnpm add` (new dependency)
- No impact on other apps (webapp, backend)
- No migration, no database changes, no API changes

### References

- [Source: _bmad-output/planning-artifacts/epics.md — Epic 9, Story 9.5 (lines 1387-1403)]
- [Source: _bmad-output/planning-artifacts/prd.md — FR49 (OG cards for social sharing), FR50 (SEO meta tags and structured data)]
- [Source: _bmad-output/planning-artifacts/architecture.md — ARCH-3 (Landing page is pure static)]
- [Source: _bmad-output/planning-artifacts/epics.md — UX-8 (shareable artifact design, self-contained context)]
- [Source: _bmad-output/project-context.md — Astro rules, font-display: swap, anti-patterns]
- [Source: _bmad-output/implementation-artifacts/9-4-signup-cta-and-auth-redirect.md — Previous story learnings]
- [Source: apps/website/src/layouts/Base.astro — Current meta tag state]
- [Source: apps/website/astro.config.mjs — Current Astro configuration]
- [Source: apps/website/lighthouserc.js — Performance budget constraints]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6 (1M context)

### Debug Log References

### Completion Notes List

- Tasks 1-2 (astro.config.mjs site+sitemap, robots.txt) were pre-configured from a previous partial session
- Task 3: Generated OG image via Playwright screenshot of `scripts/og-image.html` — 1200x630px PNG, 42KB, dark background with tycs branding, code snippet, benchmark output
- Task 4: Added OG + Twitter Card meta tags to Base.astro with `resolvedCanonical` and `resolvedOgImage` computed variables. Replaced conditional canonical with unconditional.
- Task 5: Added JSON-LD WebSite schema via `set:html={JSON.stringify(...)}` for safe serialization — validated in build output
- Task 6: Passed `canonicalUrl="https://mycscompanion.dev/"` from index.astro
- Task 7: Build succeeds, sitemap-index.xml + robots.txt + og/default.png in dist/, zero JS files in output, validate-no-red.sh + validate-primary-action.sh pass, pnpm test 465 passed 0 failed

### Change Log

- 2026-03-14: Implemented Story 9.5 — SEO infrastructure, OG/Twitter meta tags, JSON-LD structured data, robots.txt, sitemap, OG image
- 2026-03-14: Code review fixes — moved JSON-LD from `<main>` to `<head>` via slot, added dependency/reproducibility comments to OG generation scripts

### File List

- `apps/website/astro.config.mjs` — MODIFIED (site property, sitemap integration)
- `apps/website/package.json` — MODIFIED (added @astrojs/sitemap dependency)
- `apps/website/src/layouts/Base.astro` — MODIFIED (OG tags, Twitter Card tags, unconditional canonical, new Props)
- `apps/website/src/pages/index.astro` — MODIFIED (JSON-LD structured data, canonicalUrl prop)
- `apps/website/public/robots.txt` — NEW (robots.txt allowing all crawlers)
- `apps/website/public/og/default.png` — NEW (1200x630px OG image, 42KB)
- `apps/website/scripts/og-image.html` — NEW (HTML template for OG image generation)
- `apps/website/scripts/generate-og-image.mjs` — NEW (Playwright screenshot script for OG image)
- `pnpm-lock.yaml` — MODIFIED (new dependency lockfile entries)
