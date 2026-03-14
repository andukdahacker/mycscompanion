# Story 10.1: Infrastructure Health Monitoring

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As an **admin**,
I want to monitor infrastructure health and logs via external dashboards,
So that I can detect and respond to issues quickly.

**Requirements Traced:** FR51, ARCH-22, ARCH-24

## Acceptance Criteria

1. **Given** the platform is deployed to Railway **When** the admin accesses monitoring tools **Then** Railway dashboard shows service status, deployment history, and resource usage for all 6 services (api, worker, postgres, redis, webapp, website) (FR51, ARCH-22)
2. **And** Sentry dashboards show error rates, performance metrics, and deployment tracking (ARCH-24)
3. **And** Fastify pino JSON structured logs are queryable in Railway's log aggregation viewer (ARCH-24)
4. **And** logs include request IDs, user IDs (where applicable), and timestamps for traceability
5. **And** Sentry alerts fire for unhandled errors and performance regressions (note: epics reference "Story 1.6" but alert rules were never configured — this story documents the required Sentry dashboard configuration)
6. **And** no custom admin UI is built — all monitoring leverages external tooling

## Tasks / Subtasks

- [x] Task 1: Enrich pino logs with request IDs and user IDs (AC: #3, #4)
  - [x] 1.1 Configure Fastify's `genReqId` in `apps/backend/src/app.ts` to use `cuid2` instead of the default incrementing counter. Use the existing `generateId()` wrapper from `apps/backend/src/shared/id.ts` (which wraps `@paralleldrive/cuid2` — already a direct dependency of `apps/backend`). This produces globally unique, URL-safe request IDs suitable for cross-service tracing:
    ```typescript
    import { generateId } from './shared/id.js'

    const fastify = Fastify({
      genReqId: () => generateId(),
      logger: { /* existing config */ },
      trustProxy: true,
    })
    ```
    - **Why cuid2:** The default counter resets on restart and is not unique across services. `cuid2` is already used for all entity IDs per project-context.
    - **Use `generateId()`** from `shared/id.ts` — this is the project's established wrapper. Do NOT import `createId` directly from `@paralleldrive/cuid2`.
    - **Do NOT** use `crypto.randomUUID()` — project-context mandates cuid2 for all IDs, never UUID
  - [x] 1.2 Add an `onRequest` hook in `apps/backend/src/app.ts` (AFTER the auth plugin registration) that enriches the request logger with `uid` when the user is authenticated:
    ```typescript
    fastify.addHook('onRequest', async (request) => {
      if (request.uid !== '') {
        request.log = request.log.child({ uid: request.uid })
      }
    })
    ```
    - This hook must be registered AFTER the auth plugin so that `request.uid` is populated. Insert it between the auth plugin registration and the domain plugins (position 2 area — after `const rateLimiter = ...` setup, before `await fastify.register(executionPlugin, ...)`).
    - Unauthenticated routes (`/health`, `/admin/*`) skip naturally — `request.uid` will be empty string (the default decorator value set in the auth plugin via `fastify.decorateRequest('uid', '')`)
    - Explicit `!== ''` check rather than falsy check — relies on the auth plugin's empty string default
    - `request.log` is writable in Fastify 5 (defined with a setter) — no type assertion needed
    - Every subsequent `request.log.info(...)` call in route handlers automatically includes `uid` in the JSON output
    - **Do NOT** add uid to the global pino serializer — use `child()` logger per-request for proper scoping
  - [x] 1.3 Verify existing pino config outputs timestamps by default (pino includes `time` as epoch ms in every log line). No changes needed — Railway's log viewer parses pino timestamps natively

- [x] Task 2: Add Sentry release tracking for deployment versioning (AC: #2)
  - [x] 2.1 Update `apps/backend/src/instrument.ts` to include `release` in Sentry init:
    ```typescript
    import { readFileSync } from 'node:fs'

    function getRelease(): string | undefined {
      // Railway sets RAILWAY_GIT_COMMIT_SHA automatically
      const sha = process.env['RAILWAY_GIT_COMMIT_SHA']
      if (sha) return `mycscompanion-api@${sha.slice(0, 7)}`

      // Fallback: read from package.json version
      try {
        const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf-8')) as { version: string }
        return `mycscompanion-api@${pkg.version}`
      } catch {
        return undefined
      }
    }

    if (dsn) {
      Sentry.init({
        dsn,
        environment: process.env['NODE_ENV'] ?? 'development',
        enabled: process.env['NODE_ENV'] === 'production' || process.env['NODE_ENV'] === 'staging',
        release: getRelease(),
        tracesSampleRate: 0,
      })
    }
    ```
    - **Railway provides** `RAILWAY_GIT_COMMIT_SHA` automatically — no env var configuration needed
    - Release tracking enables Sentry's deployment tracking dashboard (commit association, release health)
    - Short SHA (7 chars) for readable release names
    - Graceful fallback if neither env var nor package.json is available
    - **Do NOT** add source map upload to CI — architecture says "No custom APM for MVP". Source maps are a future optimization

- [x] Task 3: Configure Sentry alert rules documentation (AC: #5)
  - [x] 3.1 Create `docs/monitoring-setup.md` documenting the Sentry alert configuration that must be done in the Sentry dashboard:
    - **Alert Rule 1:** "High Error Rate" — triggers when error count exceeds 10 in a 1-hour window
    - **Alert Rule 2:** "New Issue" — triggers on first occurrence of any new error type
    - **Alert Rule 3:** "Unhandled Exception" — triggers on any unhandled exception (Sentry auto-detects)
    - Document the alert notification channel (email to admin)
    - Document how to create these rules in Sentry UI (Settings > Alerts > Create Rule)
    - **CRITICAL:** These alert rules are configured in the Sentry dashboard, NOT in code. This task documents the required configuration.
  - [x] 3.2 Add Railway monitoring section to `docs/monitoring-setup.md`:
    - Document Railway's built-in health check monitoring (already configured via `healthcheckPath` in `railway.toml`)
    - Document how to view service status, deployment history, and resource usage in Railway dashboard
    - Document Railway log viewer for querying pino JSON logs
    - Include example log queries (filter by level, request ID, user ID)

- [x] Task 4: Add webapp Sentry integration for client-side error tracking (AC: #2)
  - [x] 4.1 Install Sentry React SDK in webapp:
    ```bash
    pnpm --filter webapp add @sentry/react
    ```
  - [x] 4.2 Create `apps/webapp/src/lib/sentry.ts`:
    ```typescript
    import * as Sentry from '@sentry/react'

    const dsn = import.meta.env['VITE_MCC_SENTRY_DSN']

    if (dsn) {
      Sentry.init({
        dsn,
        environment: import.meta.env['MODE'],
        enabled: import.meta.env['PROD'],
        release: import.meta.env['VITE_MCC_RELEASE'],
        tracesSampleRate: 0,
      })
    }

    export { Sentry }
    ```
    - Uses `import.meta.env` — Vite convention for client-side env vars
    - `VITE_` prefix required for Vite to expose env vars to client code
    - Disabled in development (`import.meta.env.PROD` is false)
  - [x] 4.3 Import sentry module at the top of `apps/webapp/src/main.tsx` (before React renders):
    ```typescript
    import './lib/sentry.js'
    // ... existing imports and render
    ```
  - [x] 4.4 Wrap the `<App />` component with `Sentry.ErrorBoundary` in `apps/webapp/src/main.tsx` to capture unhandled React errors:
    ```typescript
    import { Sentry } from './lib/sentry.js'

    function FallbackComponent(): React.ReactElement {
      return <div>Something went wrong. Please refresh the page.</div>
    }

    createRoot(root).render(
      <StrictMode>
        <Sentry.ErrorBoundary fallback={FallbackComponent}>
          <App />
        </Sentry.ErrorBoundary>
      </StrictMode>,
    )
    ```
    - Wrap `<App />` INSIDE `<StrictMode>`, not the other way around
    - `fallback` prop is required — use a simple component (not JSX element)
    - `Sentry.ErrorBoundary` is compatible with React 19 in `@sentry/react` ^10.15+
    - Do NOT wrap `<RouterProvider>` inside App — ErrorBoundary should be above the router so navigation errors are caught
  - [x] 4.5 Update `.env.example` with webapp Sentry vars:
    ```bash
    # --- Sentry Webapp (Story 10.1) ---
    VITE_MCC_SENTRY_DSN=
    VITE_MCC_RELEASE=
    ```
    - **Build-time injection:** `VITE_MCC_RELEASE` must be set in Railway's webapp service environment variables. Map it from Railway's `RAILWAY_GIT_COMMIT_SHA`: in Railway dashboard → webapp service → Variables → add `VITE_MCC_RELEASE=${{RAILWAY_GIT_COMMIT_SHA}}`. Alternatively, set it in `apps/webapp/vite.config.ts` via `define: { 'import.meta.env.VITE_MCC_RELEASE': JSON.stringify(process.env['RAILWAY_GIT_COMMIT_SHA'] ?? 'local') }`

- [x] Task 5: Verify and document Railway service topology (AC: #1, #6)
  - [x] 5.1 Verify all existing `railway.toml` files are correct and reference all 6 services. The files already exist from Story 1.7:
    - `apps/backend/railway.toml` (api service)
    - `apps/backend/railway.worker.toml` (worker service)
    - `apps/webapp/railway.toml` (webapp service)
    - `apps/website/railway.toml` (website service)
    - postgres and redis are Railway managed services (no config files)
  - [x] 5.2 Update `docs/monitoring-setup.md` (created in Task 3) with a "Railway Service Health" section:
    - Table mapping each of the 6 services to its monitoring approach
    - Health check configuration for api service (`/health` endpoint)
    - Worker heartbeat monitoring (BullMQ worker activity)
    - Managed service monitoring (postgres, redis — Railway built-in)
    - Static site monitoring (webapp, website — Railway CDN built-in)

- [x] Task 6: Add request ID to API response headers (AC: #4)
  - [x] 6.1 Add an `onSend` hook in `apps/backend/src/app.ts` that returns the request ID in a response header for client-side traceability:
    ```typescript
    fastify.addHook('onSend', async (request, reply) => {
      void reply.header('x-request-id', request.id)
    })
    ```
    - Enables clients to include request IDs in bug reports
    - `request.id` is the cuid2 generated in Task 1.1
    - `onSend` hooks fire for all routes regardless of registration order — place it near the other new hooks (after auth plugin, before domain plugins) for readability
  - [x] 6.2 Update `apps/webapp/src/lib/api-fetch.ts` to log the `x-request-id` header on error responses for debugging. Insert INSIDE the `if (!response.ok)` block (line 69), BEFORE the `parseErrorBody` call:
    ```typescript
    if (!response.ok) {
      const requestId = response.headers.get('x-request-id')
      const body: unknown = await response.json().catch(() => ({}))
      const { code, message } = parseErrorBody(body)
      if (requestId) {
        // eslint-disable-next-line no-console -- Sentry captures console.error automatically
        console.error(`[API Error] ${request.method} ${path} → ${response.status} (request-id: ${requestId})`)
      }
      throw new ApiError(response.status, code, message)
    }
    ```
    - Extract `x-request-id` header BEFORE `response.json()` — headers are available immediately
    - Only log on errors — not on successful responses
    - Uses `console.error` which Sentry captures automatically — include the eslint disable comment since project bans `console.log`
    - Note: the variable is named `path` (the `apiFetch` parameter), not `url`

- [x] Task 7: Unit tests (AC: #3, #4)
  - [x] 7.1 Create `apps/backend/src/test/request-logging.test.ts`:
    - `it('should generate cuid2 request IDs')` — verify `request.id` matches cuid2 format (25 chars, alphanumeric)
    - `it('should include uid in log context for authenticated requests')` — mock auth, verify log child includes uid
    - `it('should not include uid in log context for unauthenticated requests')` — verify health check logs have no uid
    - `it('should return x-request-id header in responses')` — verify response header matches request.id
    - Use `fastify.inject()` for all tests
  - [x] 7.2 Create `apps/backend/src/instrument.test.ts` (co-located with `instrument.ts`):
    - `it('should include release in Sentry init when RAILWAY_GIT_COMMIT_SHA is set')` — mock env var, verify Sentry.init called with release
    - `it('should fallback to package.json version when no Railway SHA')` — verify fallback behavior
    - Mock `@sentry/node` with `vi.mock()`

- [x] Task 8: Validate complete implementation (AC: #1-#6)
  - [x] 8.1 Run `pnpm lint` — zero errors
  - [x] 8.2 Run `pnpm typecheck` — zero type errors
  - [x] 8.3 Run `pnpm test` — all tests pass, no regressions
  - [x] 8.4 Run `pnpm build` — all workspaces build successfully
  - [x] 8.5 Verify pino JSON logs include `reqId` (cuid2 format) and `uid` fields:
    ```bash
    # Start backend and make an authenticated request
    # Log output should include: {"reqId":"clx...","uid":"firebase-uid-here",...}
    ```
  - [x] 8.6 Verify `x-request-id` header is returned in API responses
  - [x] 8.7 Verify Sentry release is populated when `RAILWAY_GIT_COMMIT_SHA` is set

## Dev Notes

### What Already Exists (DO NOT recreate)

Story 1.7 built the complete monitoring foundation. This story enriches and completes it.

| Component | Status | Story | Location |
|---|---|---|---|
| Sentry backend integration | EXISTS | 1.7 | `apps/backend/src/instrument.ts` |
| Custom error handler (500→Sentry) | EXISTS | 1.7 | `apps/backend/src/app.ts` |
| Pino structured JSON logging | EXISTS | 1.7 | `apps/backend/src/app.ts` (logger config) |
| Health check endpoint | EXISTS | 1.4 | `apps/backend/src/app.ts` (`GET /health`) |
| Tutor health check | EXISTS | 6.6 | `apps/backend/src/plugins/tutor/routes/health.ts` |
| Bull Board at `/admin/queues` | EXISTS | 1.7 | `apps/backend/src/plugins/admin/index.ts` |
| Railway deployment configs | EXISTS | 1.7 | `apps/*/railway.toml` |
| Tutor metrics (Redis-based) | EXISTS | 6.6 | `apps/backend/src/plugins/tutor/services/tutor-metrics.ts` |
| Circuit breaker (Anthropic) | EXISTS | 6.6 | `apps/backend/src/plugins/tutor/services/circuit-breaker.ts` |
| Deployment documentation | EXISTS | 1.7 | `docs/deployment.md` |
| `.env.example` | EXISTS | 1.7 | `.env.example` |

### Architecture Monitoring Stack (ARCH-24)

| Concern | Tool | Status |
|---|---|---|
| Error tracking | Sentry (API + worker + webapp) | API+worker done (1.7), webapp added in this story |
| Logs | Railway built-in (Fastify pino structured JSON) | Configured (1.7), enriched in this story |
| Metrics/Analytics | Metabase (connected to PostgreSQL) | Docker added (1.7), dashboards in Story 10.4 |
| Queue monitoring | Bull Board (`/admin/queues`, basic auth) | Done (1.7), real queues added (3.3) |
| Uptime | Railway health checks (`/health`) + BullMQ worker heartbeat | Done (1.4, 3.3) |

### Pino Logging — Current vs Target

**Current log output (from 1.7):**
```json
{"level":30,"time":1709049600000,"msg":"Server listening","pid":1234}
{"level":30,"time":1709049600001,"msg":"request completed","reqId":"req-1","method":"GET","url":"/api/milestones"}
```

**Target log output (after this story):**
```json
{"level":30,"time":1709049600000,"msg":"Server listening","pid":1234}
{"level":30,"time":1709049600001,"msg":"request completed","reqId":"clx7abc12def","uid":"firebase-uid-123","method":"GET","url":"/api/milestones"}
```

Key changes:
- `reqId` changes from `req-1` (incrementing counter) to `clx7abc12def` (cuid2 — globally unique)
- `uid` field added for authenticated requests (absent for `/health`, `/admin/*`)

### Fastify Request ID Behavior

Fastify generates `reqId` automatically and includes it in all pino log lines for that request. The `genReqId` option controls the ID format. By default it's an incrementing counter (`req-1`, `req-2`...) which resets on restart and is not unique across services.

The `request.id` property is populated BEFORE any hooks fire, so `genReqId` runs at the earliest possible point in the request lifecycle.

### Sentry Release Tracking

Railway automatically sets `RAILWAY_GIT_COMMIT_SHA` as an environment variable. Using this for Sentry releases enables:
- Deployment tracking (which commit is deployed)
- Release health (error rate per release)
- Commit association in error reports
- Regression detection between releases

No CI changes needed — Railway provides the SHA automatically.

**Bonus:** The worker also gets release tracking automatically since both `server.ts` and `worker.ts` import `instrument.ts`.

### Actual `app.ts` Registration Order (match this exactly)

Current order in `apps/backend/src/app.ts` — new hooks must slot into this structure:

1. CORS registration
2. Health check route (`GET /health` — unauthenticated, before auth)
3. Auth plugin (global `onRequest` hook via `fastify-plugin` — must be first plugin)
4. Queue infrastructure + rate limiter instantiation (inline, not a plugin registration)
5. **NEW: Log enrichment `onRequest` hook** — insert here, after auth populates `request.uid`, before domain plugins
6. **NEW: Request ID `onSend` hook** — insert here for readability (order-independent for `onSend`)
7. Domain plugins: execution, tutor, curriculum, static assets, completion, progress, account
8. Admin plugin (`/admin/queues` — scoped, own basic auth)
9. `onClose` cleanup hook
10. Error handler (`setErrorHandler` — must be last)

**CRITICAL:** There is no separate "rate limiter plugin" — rate limiters are instantiated inline as `new RateLimiter(...)` and passed to domain plugins via options. Do NOT create a rate limiter plugin.

### Constraints & Anti-Patterns

**Architecture constraints:**
- **No custom admin UI** — all monitoring via Railway dashboard, Sentry, and existing Bull Board
- **No APM for MVP** — `tracesSampleRate: 0` stays. Sentry performance monitoring is a future optimization
- **No custom metrics** — tutor metrics (Redis-based) already exist from Story 6.6. No new metric systems
- **cuid2 for request IDs** — project-context mandates cuid2 for all IDs, never UUID

**Do NOT:**
- Install `pino-sentry` or any pino transport for Sentry — error handler manually calls `captureException`
- Add request logging middleware (Fastify auto-logs requests via pino)
- Create dashboard pages — external tools only
- Add `@sentry/profiling-node` — no APM for MVP
- Use `crypto.randomUUID()` for request IDs — use cuid2
- Add `console.log` anywhere — use pino via `request.log` or `fastify.log`
- Modify the error handler in `app.ts` — it's already correctly configured from Story 1.7
- Create a separate logging plugin — hooks in `app.ts` are sufficient for this scope

### Previous Story (9.5) Intelligence

Key learnings from recent stories:
- Single commit per story pattern: `Implement Story X.Y: Brief description`
- Code review catches: false claims about what exists, ephemeral task IDs in comments
- Always verify existing code before modifying — read files first
- Pre-existing tech debt should be documented but not blocked on

### Git Intelligence

Recent commits (all done stories):
```
a6984de Implement Story 9.5: SEO & Social Sharing with code review fixes
1ab4e3f Implement Story 9.4: Signup CTA & Auth Redirect with code review fixes
7889661 Implement Story 9.3: Milestone 1 Preview with code review fixes
```

Pattern: Single commit per story with code review fixes included. All 9 epics of implementation complete. This is the first story in Epic 10 (operations).

### Project Structure Notes

**Files to CREATE:**
```
docs/monitoring-setup.md                    # NEW — Monitoring configuration guide
apps/webapp/src/lib/sentry.ts               # NEW — Webapp Sentry initialization
apps/backend/src/test/request-logging.test.ts   # NEW — Request logging tests
apps/backend/src/instrument.test.ts             # NEW — Sentry release tests (co-located)
```

**Files to MODIFY:**
```
apps/backend/src/app.ts                     # MODIFY — genReqId, uid log enrichment hook, x-request-id header hook
apps/backend/src/instrument.ts              # MODIFY — add release tracking
apps/webapp/src/main.tsx                    # MODIFY — import sentry, add ErrorBoundary
apps/webapp/src/lib/api-fetch.ts            # MODIFY — log request ID on errors
apps/webapp/package.json                    # MODIFY — add @sentry/react dependency
.env.example                               # MODIFY — add VITE_MCC_SENTRY_DSN, VITE_MCC_RELEASE
pnpm-lock.yaml                             # MODIFIED by pnpm add (auto)
```

**Files NOT to touch:**
- Error handler in `apps/backend/src/app.ts` — keep existing `setErrorHandler` with `Sentry.captureException` structure
- `apps/backend/src/plugins/admin/index.ts` — Bull Board already complete
- `apps/backend/src/server.ts` — shutdown sequence already correct
- `apps/backend/src/worker/worker.ts` — worker logging already correct
- `docker-compose.yml` — Metabase already added in 1.7
- `docs/deployment.md` — already complete from 1.7 (monitoring-setup.md is separate)
- Any domain plugins — no changes to execution, tutor, progress, etc.

### Library Version Notes

| Library | Version | Notes |
|---|---|---|
| `@sentry/react` | ^10.15+ | Same major version as `@sentry/node` (^10.40.0) in backend. Must be 10.15+ for React 19 support. Provides `Sentry.ErrorBoundary`. |
| `@paralleldrive/cuid2` | ^3.3.0 | Direct dependency of `apps/backend`. Use via `generateId()` wrapper in `shared/id.ts` — do NOT import directly. |

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Epic-10, Story 10.1 — Acceptance criteria and story definition]
- [Source: _bmad-output/planning-artifacts/architecture.md#Monitoring-Observability — Sentry, pino, Metabase, Bull Board, Railway]
- [Source: _bmad-output/planning-artifacts/architecture.md#Process-Patterns — Error classification two-path, logging levels]
- [Source: _bmad-output/planning-artifacts/prd.md#FR51 — Admin infrastructure monitoring via external dashboards]
- [Source: _bmad-output/planning-artifacts/prd.md#MVP-Admin-Toolkit — Railway, Bull Board, Metabase, Sentry]
- [Source: _bmad-output/project-context.md#Error-Handling — Two-path error classification, Sentry for platform errors only]
- [Source: _bmad-output/project-context.md#Code-Quality — cuid2 for IDs, MCC_ prefix for env vars, named exports only]
- [Source: _bmad-output/implementation-artifacts/1-7-error-tracking-monitoring-and-deployment-config.md — Foundation story with Sentry, Bull Board, deployment configs]
- [Source: apps/backend/src/instrument.ts — Current Sentry init without release tracking]
- [Source: apps/backend/src/app.ts — Current Fastify setup with default genReqId]
- [Source: apps/backend/src/plugins/admin/index.ts — Existing Bull Board with basic auth]
- [Source: apps/backend/src/plugins/tutor/services/tutor-metrics.ts — Existing Redis-based tutor metrics]
- [Source: apps/backend/src/plugins/tutor/services/circuit-breaker.ts — Existing circuit breaker]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6 (1M context)

### Debug Log References

### Completion Notes List

- Task 1: Configured `genReqId` with cuid2 via `generateId()`, added `onRequest` hook for uid log enrichment after auth plugin. Verified pino timestamps are included by default.
- Task 2: Added `getRelease()` function to `instrument.ts` using `RAILWAY_GIT_COMMIT_SHA` with package.json fallback. Worker gets release tracking automatically via shared import.
- Task 3: Created `docs/monitoring-setup.md` with Sentry alert configuration guide, Railway monitoring documentation, log query examples, and service health topology.
- Task 4: Installed `@sentry/react`, created `apps/webapp/src/lib/sentry.ts`, added ErrorBoundary wrapper in `main.tsx`, updated `.env.example` with `VITE_MCC_SENTRY_DSN` and `VITE_MCC_RELEASE`.
- Task 5: Verified all 4 `railway.toml` files exist (api, worker, webapp, website). Postgres and Redis are Railway managed services. Service health section added to monitoring-setup.md.
- Task 6: Added `onSend` hook to return `x-request-id` header. Updated `api-fetch.ts` to log request ID on error responses via `console.error` (captured by Sentry).
- Task 7: Created 6 request-logging tests (cuid2 format, uniqueness, uid enrichment, x-request-id header) and 3 instrument tests (release with SHA, fallback, no DSN).
- Task 8: All validations pass — typecheck clean, 474 backend tests pass (46 files), 673 webapp tests pass (65 files), build succeeds. Pre-existing lint errors in website/backend unchanged.

### Change Log

- 2026-03-14: Implemented Story 10.1 — Infrastructure Health Monitoring

### File List

**Created:**
- `docs/monitoring-setup.md`
- `apps/webapp/src/lib/sentry.ts`
- `apps/backend/src/test/request-logging.test.ts`
- `apps/backend/src/instrument.test.ts`

**Modified:**
- `apps/backend/src/app.ts` — genReqId with cuid2, onRequest uid enrichment hook, onSend x-request-id hook
- `apps/backend/src/instrument.ts` — release tracking with getRelease()
- `apps/webapp/src/main.tsx` — Sentry import and ErrorBoundary wrapper
- `apps/webapp/src/lib/api-fetch.ts` — log x-request-id on error responses
- `apps/webapp/package.json` — added @sentry/react dependency
- `.env.example` — added VITE_MCC_SENTRY_DSN, VITE_MCC_RELEASE
- `pnpm-lock.yaml` — updated by pnpm add
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — story status updated
