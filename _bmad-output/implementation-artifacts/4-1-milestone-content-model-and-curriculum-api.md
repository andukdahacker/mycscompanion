# Story 4.1: Milestone Content Model & Curriculum API

Status: done

## Story

As a developer,
I want a curriculum API that serves structured milestone content,
so that the workspace can display briefs, criteria, and assets for any milestone.

## Acceptance Criteria

1. Curriculum plugin is registered on the Fastify server with routes at `/api/curriculum`
2. `GET /api/curriculum/tracks` returns all tracks with milestone summaries, cursor-based pagination (`?afterCursor=&pageSize=`)
3. `GET /api/curriculum/milestones/:id` returns complete milestone content: brief as raw markdown (includes "Why This Matters" framing and learning objectives), acceptance criteria definitions, benchmark config, and concept explainer asset references (FR45)
4. Milestone content is loaded from structured files in `content/milestones/{slug}/` (brief.md, acceptance-criteria.yaml, benchmark-config.yaml, assets/)
5. The `tracks` and `milestones` database tables already exist (migration 001) — verify schema has all needed columns; add migration ONLY if columns are missing
6. API returns milestones in `position` order within a track
7. All responses use kebab-case routes and camelCase JSON fields via `toCamelCase()` (ARCH-21)
8. All endpoints require valid Firebase Auth token (global `onRequest` hook already handles this)
9. Content CI workflow (Story 1.6) can validate milestone content files against JSON schemas in `content/schema/`
10. Acceptance criteria assertion schema is defined as a TypeScript type in `packages/shared` and exported for use by evaluator (Story 4.3), API, and Content CI
11. Milestone content is cached in Redis with TTL until content deploy invalidates

## Tasks / Subtasks

- [x] Task 0: Install dependencies (prerequisite — do this first)
  - [x] 0.1 Run `pnpm --filter backend add js-yaml` and `pnpm --filter backend add -D @types/js-yaml` — js-yaml is NOT a direct backend dependency yet (only exists as transitive)
  - [x] 0.2 Check if `@fastify/static` is installed; if not, run `pnpm --filter backend add @fastify/static` (needed for serving SVG assets)

- [x] Task 1: Define acceptance criteria TypeScript types in `packages/shared` (AC: #10)
  - [x] 1.1 Add `AssertionType` union type: `'stdout-contains' | 'stdout-regex' | 'exit-code-equals' | 'output-line-count' | 'benchmark-threshold'`
  - [x] 1.2 Add `AcceptanceCriterion` interface: `{ name, order, description?, assertion: { type: AssertionType, expected: string | number, commandArgs?: string }, errorHint? }`
  - [x] 1.3 Add `BenchmarkWorkload` and `BenchmarkConfig` interfaces matching `content/schema/benchmark-config.schema.json`
  - [x] 1.4 Add `MilestoneContent` response type: `{ milestoneId, trackId, slug, title, position, brief, acceptanceCriteria, benchmarkConfig, conceptExplainerAssets, starterCodePath }` — `brief` is the full raw markdown string (contains learning objectives as sections, NOT extracted separately)
  - [x] 1.5 Add `TrackSummary` response type: `{ id, name, slug, description, milestones: { id, slug, title, position }[] }`
  - [x] 1.6 Export all from `packages/shared/src/types/index.ts`
  - [x] 1.7 Write unit tests for type exports (compile-time verification)

- [x] Task 2: Verify database schema and add migration if needed (AC: #5, #6)
  - [x] 2.1 Verify `tracks` table has: `id`, `name`, `slug`, `description`, `created_at`, `updated_at`
  - [x] 2.2 Verify `milestones` table has: `id`, `track_id`, `slug`, `title`, `description`, `position`, `created_at`, `updated_at`
  - [x] 2.3 If any columns are missing, create a new migration (do NOT modify existing migrations)
  - [x] 2.4 Run `pnpm --filter shared db:types` to regenerate Kysely types if migration added

- [x] Task 3: Implement content loader service (AC: #4, #11)
  - [x] 3.1 Create `apps/backend/src/plugins/curriculum/content-loader.ts`
  - [x] 3.2 Implement `loadMilestoneBrief(slug)` — reads and parses `content/milestones/{slug}/brief.md`
  - [x] 3.3 Implement `loadAcceptanceCriteria(slug)` — reads and parses `content/milestones/{slug}/acceptance-criteria.yaml`
  - [x] 3.4 Implement `loadBenchmarkConfig(slug)` — reads and parses `content/milestones/{slug}/benchmark-config.yaml`
  - [x] 3.5 Implement `listConceptExplainerAssets(slug)` — scans `content/milestones/{slug}/assets/*.svg`
  - [x] 3.6 Implement Redis caching layer: cache parsed content with configurable TTL key `curriculum:{slug}`
  - [x] 3.7 Accept Redis client via dependency injection (options parameter)
  - [x] 3.8 Write unit tests: mock `fs` reads + Redis, verify parsing, caching, and cache invalidation

- [x] Task 4: Implement curriculum plugin routes (AC: #1, #2, #3, #6, #7, #8)
  - [x] 4.1 Implement `GET /api/curriculum/tracks` in `routes/tracks.ts` — query `tracks` + `milestones` tables, cursor-based pagination, return `TrackSummary[]`
  - [x] 4.2 Implement `GET /api/curriculum/milestones/:id` in `routes/milestones.ts` — lookup milestone by id/slug, load content from files via content-loader, return `MilestoneContent`
  - [x] 4.3 Apply `toCamelCase()` to all DB query results before sending
  - [x] 4.4 Add JSON Schema request validation for query params (pageSize, afterCursor)
  - [x] 4.5 Wire routes into curriculum plugin `index.ts` with dependency injection for db + redis + content loader
  - [x] 4.6 Write route tests using `fastify.inject()` with real DB (test transaction rollback pattern)

- [x] Task 5: Validate content and verify seed data (AC: #9)
  - [x] 5.1 Verify existing seed script `apps/backend/src/scripts/seed.ts` populates tracks + milestones correctly (it already imports `TRACKS, MILESTONES` constants from `@mycscompanion/shared` — do NOT recreate)
  - [x] 5.2 Verify all 5 milestone directories have required files (brief.md, acceptance-criteria.yaml, benchmark-config.yaml). Note: milestones 02-05 have `.gitkeep` placeholders in starter-code/ and reference-impl/ — this is expected
  - [x] 5.3 Verify content files validate against JSON schemas in `content/schema/`
  - [x] 5.4 Write integration test that loads each milestone's content end-to-end (content loader must handle missing starter-code/reference-impl gracefully — return null for those fields)

- [x] Task 6: Wire plugin into app.ts (AC: #1, #8)
  - [x] 6.1 Update `apps/backend/src/app.ts` line 62: change `await fastify.register(curriculumPlugin, { prefix: '/api/curriculum' })` to pass redis — `await fastify.register(curriculumPlugin, { prefix: '/api/curriculum', redis })` (redis singleton is already imported from `./shared/redis.js`)
  - [x] 6.2 Verify auth hook applies to curriculum routes (should be automatic from global hook)
  - [x] 6.3 Write smoke test: unauthenticated request returns 401

## Dev Notes

### Existing Infrastructure (DO NOT recreate)

- **Database tables exist**: `tracks` and `milestones` created in migration `001_initial_schema.ts`. Check columns match needs before adding migration.
- **Curriculum plugin placeholder exists**: Already registered in `app.ts` at `prefix: '/api/curriculum'` (line 62). Replace placeholder implementation in `plugins/curriculum/index.ts`, don't create new registration. Current placeholder accepts no options — you must add the options interface.
- **Content directory exists**: `content/milestones/01-kv-store/` through `05-transactions/` with brief.md, acceptance-criteria.yaml, benchmark-config.yaml, assets/, reference-impl/, starter-code/. Note: milestones 02-05 have `.gitkeep` placeholders in starter-code/ and reference-impl/ — content loader must handle missing files gracefully (return `null`).
- **JSON schemas exist**: `content/schema/acceptance-criteria.schema.json` and `content/schema/benchmark-config.schema.json` — use these as the source of truth for TypeScript types
- **Seed script exists**: `apps/backend/src/scripts/seed.ts` already seeds the track ("Build Your Own Database") and all 5 milestones. It imports `TRACKS, MILESTONES` constants from `@mycscompanion/shared`. Do NOT recreate.
- **Frontend mock data**: `useWorkspaceData` hook in `apps/webapp/src/hooks/use-workspace-data.ts` currently returns mock data with shape `{ milestoneName, milestoneNumber, progress, initialContent, brief, criteria: string[], stuckDetection }`. Story 4.2 will adapt the frontend to consume this API — the API response shape defined here is the authoritative contract.

### Content File Formats (from existing files)

**CRITICAL: YAML files use `snake_case` keys.** The content loader MUST convert all keys to `camelCase` when parsing YAML before returning to routes. Examples: `command_args` -> `commandArgs`, `error_hint` -> `errorHint`, `warmup_iterations` -> `warmupIterations`, `num_operations` -> `numOperations`, `ops_per_sec` -> `opsPerSec`. Use `toCamelCase()` from `@mycscompanion/shared` (same utility used for DB results).

**acceptance-criteria.yaml structure (snake_case on disk):**
```yaml
milestone: 01-kv-store
criteria:
  - name: put-and-get
    order: 1
    description: Put a key-value pair and retrieve it with Get.
    assertion:
      type: stdout-contains
      expected: "PASS: put-and-get"
      command_args: test        # <-- snake_case in YAML, becomes commandArgs in API
    error_hint: Check that Put stores the key-value pair...  # <-- becomes errorHint
```

**benchmark-config.yaml structure (snake_case on disk):**
```yaml
milestone: 01-kv-store
benchmarks:
  - name: sequential-inserts
    description: Sequential insertion of 1,000 key-value pairs
    warmup_iterations: 2       # <-- becomes warmupIterations
    measured_iterations: 10    # <-- becomes measuredIterations
    workload:
      type: inserts
      num_operations: 1000     # <-- becomes numOperations
      key_size_bytes: 16
      value_size_bytes: 64
    target_metrics:            # <-- becomes targetMetrics
      ops_per_sec: 100         # <-- becomes opsPerSec
    reference_version: milestone-1-v1
```

### Plugin Pattern (follow existing conventions)

Follow the account plugin pattern in `apps/backend/src/plugins/account/index.ts`:
```typescript
interface CurriculumPluginOptions {
  readonly db?: Kysely<DB>
  readonly redis: Redis
}

export async function curriculumPlugin(
  fastify: FastifyInstance,
  opts: CurriculumPluginOptions
): Promise<void> {
  const db = opts.db ?? defaultDb
  await fastify.register(trackRoutes, { db })
  await fastify.register(milestoneRoutes, { db, redis: opts.redis })
}
```

### API Response Shape

**GET /api/curriculum/tracks:**
```json
{
  "items": [
    {
      "id": "cuid2...",
      "name": "Build Your Own Database",
      "slug": "build-your-own-database",
      "description": "...",
      "milestones": [
        { "id": "cuid2...", "slug": "01-kv-store", "title": "Simple Key-Value Store", "position": 1 }
      ]
    }
  ],
  "nextCursor": null
}
```

**GET /api/curriculum/milestones/:id (authoritative response shape):**
```json
{
  "milestoneId": "cuid2...",
  "trackId": "cuid2...",
  "slug": "01-kv-store",
  "title": "Simple Key-Value Store",
  "position": 1,
  "brief": "# Milestone 1: Simple Key-Value Store\n\n## What You're Building\n\n...\n\n## Why This Matters\n\n...\n\n## What You'll Learn\n\n...",
  "acceptanceCriteria": [
    {
      "name": "put-and-get",
      "order": 1,
      "description": "Put a key-value pair and retrieve it with Get.",
      "assertion": { "type": "stdout-contains", "expected": "PASS: put-and-get", "commandArgs": "test" },
      "errorHint": "Check that Put stores the key-value pair..."
    }
  ],
  "benchmarkConfig": {
    "benchmarks": [{ "name": "sequential-inserts", "warmupIterations": 2, "measuredIterations": 10, "workload": { "type": "inserts", "numOperations": 1000 }, "targetMetrics": { "opsPerSec": 100 } }]
  },
  "conceptExplainerAssets": [
    { "name": "kv-store-flow.svg", "path": "/assets/milestones/01-kv-store/kv-store-flow.svg", "altText": "..." }
  ],
  "starterCodePath": "content/milestones/01-kv-store/starter-code/"
}
```

Note: `brief` is the complete raw markdown from `brief.md` — it contains learning objectives, "Why This Matters", and all other sections. The frontend renders it directly. Do NOT extract `learningObjectives` as a separate field.

### Caching Strategy

- Key pattern: `curriculum:milestone:{slug}` — stores parsed JSON of full milestone content
- Key pattern: `curriculum:tracks` — stores track list (invalidated less often)
- TTL: No expiry — invalidated explicitly on content deploy (admin endpoint or deploy hook)
- Use `ioredis` (NOT `redis` npm package) — already a project dependency

### File Structure

Use the execution plugin pattern (`routes/` subdirectory) since this plugin has multiple route files + a service:

```
apps/backend/src/plugins/curriculum/
  index.ts                    # Plugin export + registration (all plugin logic here, no separate curriculum-plugin.ts)
  content-loader.ts           # File reading + YAML parsing + Redis caching
  content-loader.test.ts      # Unit tests for content loading
  routes/
    tracks.ts                 # GET /api/curriculum/tracks
    tracks.test.ts            # Route tests
    milestones.ts             # GET /api/curriculum/milestones/:id
    milestones.test.ts        # Route tests

packages/shared/src/types/
  curriculum.ts               # AcceptanceCriterion, MilestoneContent, TrackSummary types
```

### Project Structure Notes

- Content files in `content/` are NOT a pnpm workspace — read directly via `fs`
- YAML parsing: use `js-yaml` — MUST be installed first (Task 0): `pnpm --filter backend add js-yaml` + `pnpm --filter backend add -D @types/js-yaml`. It exists in node_modules as a transitive dep but is NOT a direct backend dependency.
- Markdown parsing: return raw markdown string as-is (frontend renders it). Do NOT parse or extract sections — the `brief` field is the complete `brief.md` content.
- SVG assets: return asset metadata (filename, path, altText) in the API response. Frontend fetches SVGs via a separate static file route. Register `@fastify/static` to serve `content/milestones/*/assets/` at `/assets/milestones/` prefix, or alternatively return file paths and let the frontend build URLs. Choose the `@fastify/static` approach — check if already installed (`pnpm --filter backend add @fastify/static` if needed).
- Plugin isolation: only import from `packages/shared`, `packages/config` — never cross-plugin

### Testing Requirements

- **Route tests**: Use `fastify.inject()` with real PostgreSQL (test transaction rollback). Mock Firebase auth via `verifyIdToken() → test uid`
- **Content loader tests**: Mock `fs` for file reads, mock Redis for cache. Verify YAML parsing produces correct TypeScript types
- **Co-located test files**: `content-loader.test.ts` next to `content-loader.ts`, route tests next to route files
- **Test syntax**: `describe()` + `it()`, never `test()`. `vi.restoreAllMocks()` in `afterEach`
- **Mock boundary**: Only mock external services (fs, Redis). Use real DB for route tests
- **Import test utilities from `@mycscompanion/config/test-utils/`**

### Anti-Patterns to Avoid

- Do NOT use `drizzle` — Kysely is authoritative
- Do NOT use `redis` npm package — use `ioredis`
- Do NOT create offset pagination — cursor-based only
- Do NOT wrap responses in `{ data: ..., success: true }` — direct response
- Do NOT use default exports — named exports only
- Do NOT use `any` type — use proper interfaces
- Do NOT use TS `enum` — use union types
- Do NOT create a new Zustand store — this is backend only
- Do NOT store milestone content in the database — content lives in `content/` directory files
- Do NOT import from other plugins — only from `packages/*` and local `shared/`

### Dependencies on Previous Work

- Auth plugin (global `onRequest` hook) — Story 2.1 ✓
- Database with `tracks` + `milestones` tables — Story 1.2 ✓
- Redis setup — Story 1.4 ✓
- Test infrastructure — Story 1.5 ✓
- Content directory structure — exists in repo ✓
- Content CI scaffold — Story 1.6 ✓

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Epic-4-Story-4.1]
- [Source: _bmad-output/planning-artifacts/architecture.md#ARCH-13-Pagination]
- [Source: _bmad-output/planning-artifacts/architecture.md#ARCH-19-Database-Schema]
- [Source: _bmad-output/planning-artifacts/architecture.md#ARCH-21-API-Naming]
- [Source: _bmad-output/planning-artifacts/architecture.md#Curriculum-Plugin]
- [Source: _bmad-output/planning-artifacts/prd.md#FR1-FR3-FR6-FR7-FR45]
- [Source: content/schema/acceptance-criteria.schema.json]
- [Source: content/schema/benchmark-config.schema.json]
- [Source: _bmad-output/project-context.md]
- [Source: _bmad-output/implementation-artifacts/3-8-workspace-state-management.md]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6

### Debug Log References

- Route tests initially returned 404 — fixed by adding `prefix` to sub-route registration in curriculum plugin index.ts
- Lint errors from inline `import('ioredis').Redis` — fixed by using proper `import type { Redis }` at top of file

### Completion Notes List

- Task 0: Installed `js-yaml`, `@types/js-yaml`, `@fastify/static` as backend dependencies
- Task 1: Created `packages/shared/src/types/curriculum.ts` with all types (AssertionType, AcceptanceCriterion, BenchmarkWorkload, BenchmarkConfig, MilestoneContent, TrackSummary, etc.). 16 compile-time verification tests pass.
- Task 2: Verified `tracks` and `milestones` tables in migration `001_initial_schema.ts` — all required columns present. No new migration needed.
- Task 3: Implemented `content-loader.ts` with functions for loading brief, acceptance criteria, benchmark config, concept explainer assets, and starter code path. Redis caching with key pattern `curriculum:milestone:{slug}`. YAML snake_case → camelCase conversion via `toCamelCase()`. 16 unit tests pass.
- Task 4: Implemented `routes/tracks.ts` (cursor-based pagination, position-ordered milestones) and `routes/milestones.ts` (lookup by id or slug, full content loading). JSON Schema validation on query params. 10 route tests pass.
- Task 5: Verified seed script, all 5 milestone directories, and content file formats. 9 integration tests pass covering real file loading for 01-kv-store, placeholder handling for 02-05, and graceful null returns for nonexistent milestones.
- Task 6: Updated `app.ts` to pass `redis` to curriculum plugin. Auth hook verified (401 tests in both route test files). Smoke test included in tracks.test.ts and milestones.test.ts.
- All 51 new tests pass. Full suite: 129 backend tests pass, 259 webapp tests pass, 16 shared tests pass. 0 regressions.

### File List

- `packages/shared/src/types/curriculum.ts` (new) — Curriculum TypeScript types
- `packages/shared/src/types/curriculum.test.ts` (new) — Type compile-time verification tests
- `packages/shared/src/types/index.ts` (modified) — Added curriculum type re-export
- `apps/backend/src/plugins/curriculum/index.ts` (modified) — Plugin with DI for db, redis, content loader
- `apps/backend/src/plugins/curriculum/content-loader.ts` (new) — Content file loading + Redis caching
- `apps/backend/src/plugins/curriculum/content-loader.test.ts` (new) — Content loader unit tests
- `apps/backend/src/plugins/curriculum/content-loader.integration.test.ts` (new) — Integration tests with real files
- `apps/backend/src/plugins/curriculum/routes/tracks.ts` (new) — GET /tracks route
- `apps/backend/src/plugins/curriculum/routes/tracks.test.ts` (new) — Tracks route tests
- `apps/backend/src/plugins/curriculum/routes/milestones.ts` (new) — GET /milestones/:id route
- `apps/backend/src/plugins/curriculum/routes/milestones.test.ts` (new) — Milestones route tests
- `apps/backend/src/app.ts` (modified) — Pass redis to curriculum plugin
- `apps/backend/package.json` (modified) — Added js-yaml, @types/js-yaml, @fastify/static
- `pnpm-lock.yaml` (modified) — Lock file updated

### Change Log

- 2026-03-05: Implemented Story 4.1 — Milestone Content Model & Curriculum API. Created curriculum types in shared package, content loader with Redis caching and YAML parsing, and two API routes (tracks list with cursor pagination, milestone detail with full content). All 51 new tests pass with 0 regressions.
- 2026-03-05: Code review fixes applied (9 issues). H1: Registered @fastify/static in app.ts with asset serving route for concept explainer SVGs. H2: Fixed N+1 query in tracks route — single batch query for milestones. H3: Added cache invalidation methods (invalidateCache, invalidateAllCaches) to ContentLoader. M1: Fixed integration test isolation (vi.restoreAllMocks, loader in beforeEach). M2: Removed redundant toCamelCase() wrapper in tracks route. M4: Added error logging for YAML parse failures in content-loader. L1: Added slug validation to prevent path traversal. Added 5 new tests (invalidation, slug validation). All 146 backend tests pass, 29 shared tests pass, 0 regressions.
- 2026-03-05: Code review #2 fixes applied (7 issues). H1: Added slug+filename validation to asset route in app.ts to prevent path traversal. M1: Expanded pagination test to verify nextCursor and multi-page traversal. M2: Added vi.restoreAllMocks() to tracks.test.ts afterEach. M3: Changed tracks.ts selectAll() to select specific columns. L2: Changed milestones.ts selectAll() to select specific columns. All 135 backend tests pass, 29 shared tests pass, 0 regressions.
