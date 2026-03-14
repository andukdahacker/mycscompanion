# Story 10.2: Execution Queue Management via Bull Board

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As an **admin**,
I want to view and manage the code execution job queue,
So that I can identify stuck or failed jobs and take corrective action.

**Requirements Traced:** FR52, ARCH-24

## Acceptance Criteria

1. **Given** the Bull Board route is deployed with real queue data **When** the admin accesses Bull Board **Then** the dashboard shows all BullMQ queues with job counts by status: waiting, active, completed, failed, delayed (FR52)
2. **And** the admin can inspect individual job details including payload, error messages, and attempt history
3. **And** the admin can retry failed jobs or remove stuck jobs from the queue
4. **And** access to Bull Board is restricted to admin credentials — not publicly accessible
5. **And** the dashboard reflects real-time queue state

## Critical Context: This Story Is Largely Pre-Implemented

Bull Board was fully implemented in Story 1.7 and enhanced with the export queue in Story 8.3. **All 5 acceptance criteria are already satisfied by the existing implementation.** The developer's job is to **add missing test coverage, update monitoring documentation, and validate**.

**Note:** The epics file references "scaffolded in Story 1.6" for Bull Board — this is inaccurate. Bull Board was implemented in Story 1.7. Ignore any Story 1.6 references for Bull Board.

### What Already Exists (DO NOT recreate)

| Component | File | Status |
|---|---|---|
| Bull Board UI at `/admin/queues` | `apps/backend/src/plugins/admin/index.ts` | DONE — full setup with `@bull-board/api` + `@bull-board/fastify` |
| Basic auth (timing-safe) | `apps/backend/src/plugins/admin/index.ts` | DONE — `MCC_ADMIN_USER` + `MCC_ADMIN_PASSWORD` env vars |
| Execution queue (`execution-run`) | `apps/backend/src/shared/queue.ts` | DONE — 2 retries, exponential backoff |
| Export queue (`account-export`) | `apps/backend/src/shared/queue.ts` | DONE — 3 retries, exponential backoff |
| Both queues registered in Bull Board | `apps/backend/src/app.ts` line ~120 | DONE — `BullMQAdapter` wraps both |
| Admin auth tests (401/200/404) | `apps/backend/src/plugins/admin/admin.test.ts` | DONE — 4 tests |
| Queue config tests (execution only) | `apps/backend/src/shared/queue.test.ts` | PARTIAL — covers `EXECUTION_QUEUE_NAME` + `createExecutionQueue` only. Export queue (`EXPORT_QUEUE_NAME`, `createExportQueue`) has no tests. |
| Worker with error handling | `apps/backend/src/worker/worker.ts` | DONE — concurrency 10 (exec), 2 (export) |

### Bull Board Built-In Features (no code needed)

Bull Board `@bull-board/api@^6.20.3` provides these features out-of-the-box via its React UI:
- **Job counts by status** (waiting, active, completed, failed, delayed) — AC #1
- **Job detail inspection** (payload, error messages, attempt history, timestamps) — AC #2
- **Retry failed jobs** and **remove/clean stuck jobs** — AC #3
- **Real-time polling** for queue state updates — AC #5

### Queue Inventory (complete — only 2 queues exist)

| Queue Name | Job Name | Created By | Worker Concurrency |
|---|---|---|---|
| `execution-run` | `execution-run` | `POST /api/execution/submit` | 10 |
| `account-export` | `account-export` | `POST /api/account/export` | 2 |

**Note:** Architecture mentions `progress:auto-save` and `progress:session-summary` as BullMQ job names, but these processors run inline within the execution worker — they are NOT separate queues. No additional queues to register.

## Tasks / Subtasks

- [x] Task 1: Add missing queue management test coverage (AC: #1, #2, #3, #4)
  - [x] 1.1 Add tests to `apps/backend/src/plugins/admin/admin.test.ts` using the Bull Board REST API:
    - `it('should return both queues from Bull Board API')` — `GET /admin/queues/api/queues` with valid basic auth, expect 200 with JSON response containing both `execution-run` and `account-export` queue names
    - **IMPORTANT:** Bull Board serves a React SPA — the HTML at `/admin/queues` does NOT contain queue names as static text. Always test via the REST API endpoint, never parse HTML.
    - **Path discovery:** Bull Board exposes its API at `{basePath}/api/queues`. Since `basePath` is `/admin/queues`, the full path is `/admin/queues/api/queues`. If this 404s, try printing `app.printRoutes()` in the test to discover the correct path — the `prefix` + `setBasePath` interaction in FastifyAdapter can sometimes produce unexpected paths.
    - Use `fastify.inject()` with valid basic auth credentials
  - [x] 1.2 Add export queue config tests to `apps/backend/src/shared/queue.test.ts` (currently missing):
    - `it('should have EXPORT_QUEUE_NAME equal to account-export')` — verify constant value
    - `it('should create export queue with correct name and default job options')` — verify name = `account-export`, attempts = 3, backoff = exponential/5000, removeOnComplete.age = 3600, removeOnFail.age = 86400
    - Follow the exact same test pattern as existing `createExecutionQueue` tests

- [x] Task 2: Update monitoring documentation (AC: #1-#5)
  - [x] 2.1 Add a "Queue Management" section to `docs/monitoring-setup.md` (created in Story 10.1):
    - Document Bull Board access URL: `https://<api-host>/admin/queues`
    - Document authentication: HTTP Basic Auth with `MCC_ADMIN_USER` (default: `admin`) and `MCC_ADMIN_PASSWORD`
    - Document both queues and their purposes:
      - `execution-run`: Code execution submissions (compile + test + benchmark)
      - `account-export`: User data export requests
    - Document common admin actions:
      - Inspecting failed job error messages and stack traces
      - Retrying a failed job (click retry button in Bull Board UI)
      - Removing stuck jobs (clean waiting/delayed from Bull Board UI)
      - Monitoring queue depth during peak load
    - Document job retention policies:
      - Completed jobs: removed after 1 hour (`removeOnComplete.age: 3600`)
      - Failed jobs: retained for 24 hours (`removeOnFail.age: 86400`)
    - Document retry configuration:
      - Execution: 2 attempts, exponential backoff starting at 5s
      - Export: 3 attempts, exponential backoff starting at 5s
    - Include troubleshooting section:
      - "Queue shows many failed jobs" → check worker logs in Railway, check Fly.io machine availability
      - "Jobs stuck in waiting" → verify worker service is running in Railway, check Redis connectivity
      - "Jobs stuck in active" → possible worker crash; jobs will be moved to failed after stall timeout

- [x] Task 3: Validate complete implementation (AC: #1-#5)
  - [x] 3.1 Run `pnpm lint` — zero new errors (pre-existing website lint error unrelated)
  - [x] 3.2 Run `pnpm typecheck` — zero type errors
  - [x] 3.3 Run `pnpm test` — all backend tests pass (477/477), no regressions (pre-existing webapp api-fetch test failure unrelated)
  - [x] 3.4 Run `pnpm build` — all workspaces build successfully

## Dev Notes

### Admin Plugin Registration in `app.ts`

```typescript
// Line ~120 in apps/backend/src/app.ts
await fastify.register(adminPlugin, { prefix: '/admin/queues', executionQueue, exportQueue })
```

The `prefix` scopes both the basicAuth hook and Bull Board routes. `setBasePath('/admin/queues')` in the plugin handles UI link generation. Do NOT add a second prefix or the routes will double-prefix.

### Bull Board Version Notes

`@bull-board/api@^6.20.3` and `@bull-board/fastify@^6.20.3` are installed. Bull Board v6.x serves a **React SPA** — the HTML shell loads JS bundles that fetch queue data via a built-in REST API at `{basePath}/api/queues`. All AC features (job inspection, retry, remove, status counts) are provided out-of-the-box.

### Security Model

- HTTP Basic Auth with `@fastify/basic-auth@^6.2.0`
- Timing-safe password comparison via `crypto.timingSafeEqual`
- Bull Board disabled entirely if `MCC_ADMIN_PASSWORD` not set (returns 404)
- Admin routes are scoped — basicAuth hook only fires for `/admin/queues/*`
- No CORS needed — admin accesses directly via browser

### Constraints & Anti-Patterns

**Do NOT:**
- Create a custom admin UI — Bull Board IS the admin UI
- Add new queues — only 2 exist (`execution-run`, `account-export`)
- Modify the admin plugin's auth mechanism — timing-safe comparison is correct
- Add `@bull-board/ui` — the UI is bundled with `@bull-board/api`
- Create a separate admin dashboard page in the webapp — architecture says external tools only
- Add WebSocket support for "real-time" — Bull Board's polling is sufficient for admin use

**Do:**
- Use `fastify.inject()` for all admin route tests — never supertest
- Scope new tests in the existing `admin.test.ts` file
- Reference `docs/monitoring-setup.md` for documentation additions

### Previous Story (10.1) Intelligence

Key learnings from Story 10.1:
- `docs/monitoring-setup.md` was created — add queue management section to it
- Monitoring follows "external tools only" pattern — no custom UIs
- Railway service topology: api + worker + postgres + redis + webapp + website
- Single commit per story pattern: `Implement Story X.Y: Brief description`
- Pre-existing lint errors in website/backend — do not fix unrelated issues

### Git Intelligence

Recent commit: `3db2895 Implement Story 10.1: Infrastructure Health Monitoring with code review fixes`

Files modified in 10.1 relevant to this story:
- `docs/monitoring-setup.md` — add queue section here
- `apps/backend/src/app.ts` — already has admin plugin registration, do NOT re-register

### Project Structure Notes

**Files to MODIFY:**
```
docs/monitoring-setup.md                              # ADD queue management section
apps/backend/src/plugins/admin/admin.test.ts          # ADD Bull Board API queue visibility tests
apps/backend/src/shared/queue.test.ts                 # ADD export queue config tests
```

**Files NOT to touch:**
- `apps/backend/src/plugins/admin/index.ts` — already complete
- `apps/backend/src/shared/queue.ts` — already complete
- `apps/backend/src/app.ts` — admin registration already complete
- `apps/backend/src/worker/worker.ts` — worker already complete
- Any domain plugins — no changes needed

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Epic-10, Story 10.2 — Acceptance criteria and story definition]
- [Source: _bmad-output/planning-artifacts/architecture.md#Monitoring-Observability — Bull Board at /admin/queues, basic auth]
- [Source: _bmad-output/planning-artifacts/architecture.md#Railway-Service-Topology — Worker as separate Railway service]
- [Source: _bmad-output/planning-artifacts/prd.md#FR52 — Admin queue monitoring via external tooling]
- [Source: _bmad-output/project-context.md#Framework-Rules — Fastify plugin isolation, route testing with inject()]
- [Source: _bmad-output/project-context.md#Testing-Rules — Co-located tests, it() not test(), vi.restoreAllMocks()]
- [Source: _bmad-output/implementation-artifacts/10-1-infrastructure-health-monitoring.md — Previous story context, monitoring-setup.md creation]
- [Source: apps/backend/src/plugins/admin/index.ts — Complete Bull Board + basic auth implementation]
- [Source: apps/backend/src/shared/queue.ts — Queue definitions with job options]
- [Source: apps/backend/src/app.ts — Admin plugin registration with both queues]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6 (1M context)

### Debug Log References

None — implementation was straightforward with no blockers.

### Completion Notes List

- Task 1.1: Added Bull Board REST API test to `admin.test.ts` — verifies `GET /admin/queues/api/queues` returns both `execution-run` and `account-export` queue names with valid basic auth credentials
- Task 1.2: Added 2 export queue config tests to `queue.test.ts` — `EXPORT_QUEUE_NAME` constant verification and `createExportQueue` job options validation (attempts=3, exponential backoff, retention policies)
- Task 2.1: Added comprehensive "Queue Management (Bull Board)" section to `docs/monitoring-setup.md` — covers access/auth, queue inventory, retention policies, common admin actions, and troubleshooting guide
- Task 3: All validations pass — typecheck clean, lint clean on modified files (pre-existing website/backend errors unrelated), 477 backend tests pass, build succeeds

### Change Log

- 2026-03-14: Added missing test coverage for Bull Board queue visibility and export queue configuration; added queue management documentation to monitoring-setup.md
- 2026-03-14: Code review fixes — added array type guard in Bull Board API test, added `defaultOpts` defined checks in queue tests, documented stall timeout and Bull Board version in monitoring docs, improved test name specificity

## Senior Developer Review (AI)

**Review Date:** 2026-03-14
**Reviewer:** Claude Opus 4.6 (adversarial code review)
**Outcome:** Approve (after fixes applied)

### Findings Summary

| Severity | Count | Status |
|---|---|---|
| Critical | 0 | — |
| High | 0 | — |
| Medium | 2 | Fixed |
| Low | 2 | Fixed |

### Action Items

- [x] [M1] Add array type guard before `body.queues.map()` in admin.test.ts
- [x] [M2] Add `expect(defaultOpts).toBeDefined()` before property assertions in queue.test.ts (both execution and export)
- [x] [L1] Rename test to include endpoint path: `'should return both queues from /admin/queues/api/queues'`
- [x] [L2] Add Bull Board version and stall timeout value to monitoring-setup.md

### File List

- `apps/backend/src/plugins/admin/admin.test.ts` — MODIFIED (added Bull Board API queue visibility test)
- `apps/backend/src/shared/queue.test.ts` — MODIFIED (added EXPORT_QUEUE_NAME and createExportQueue tests)
- `docs/monitoring-setup.md` — MODIFIED (added Queue Management section)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — MODIFIED (status: in-progress → review)
- `_bmad-output/implementation-artifacts/10-2-execution-queue-management-via-bull-board.md` — MODIFIED (tasks marked complete, Dev Agent Record updated)
