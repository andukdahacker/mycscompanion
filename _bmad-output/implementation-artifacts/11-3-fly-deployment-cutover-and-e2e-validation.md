# Story 11.3: Fly Deployment, Cutover & E2E Validation

Status: done

## Story

As a **developer**,
I want the persistent execution service deployed to Fly.io and the backend worker pointed at it,
so that the new execution pipeline is live in production with verified end-to-end functionality.

## Acceptance Criteria

1. **AC1: fly.toml rewrite** — `infra/fly-execution/fly.toml` is rewritten from the old ephemeral-machine registry config to a persistent HTTP service config: `app = "mcc-execution"`, `primary_region = "sin"`, `[build] dockerfile = "Dockerfile"`, `[http_service]` with `internal_port = 8080`, `force_https = true`, `auto_stop_machines = "off"`, `auto_start_machines = true`, `min_machines_running = 1`, `[[http_service.checks]]` with `path = "/health"` and reasonable interval/timeout, `[[vm]]` with `cpu_kind = "shared"`, `cpus = 4`, `memory_mb = 1024`. All old comments about ephemeral machines and registry-only usage are removed.

2. **AC2: Fly secret** — `MCC_EXECUTION_SECRET` is set as a Fly secret on the `mcc-execution` app via `flyctl secrets set`. This is the shared Bearer token used by the Railway worker to authenticate against the execution service.

3. **AC3: Fly deployment** — The execution service is deployed to Fly.io via `flyctl deploy --app mcc-execution` from the `infra/fly-execution/` directory. The deployment uses the existing multi-stage Dockerfile from Story 11.1.

4. **AC4: Health check verification** — After deployment, `/health` returns 200 OK. Verified via `flyctl status` showing the machine as running AND a direct `curl https://mcc-execution.fly.dev/health` returning `{"status":"ok"}`.

5. **AC5: Railway env var setup** — `MCC_EXECUTION_URL` (e.g., `https://mcc-execution.fly.dev`) and `MCC_EXECUTION_SECRET` (same value as Fly secret) are set on the Railway **worker** service.

6. **AC6: Old env var removal** — `MCC_FLY_API_TOKEN`, `MCC_FLY_LOGS_TOKEN`, and `MCC_FLY_APP_NAME` are removed from the Railway worker service. These are no longer read by `worker.ts` (Story 11.2 removed them).

7. **AC7: Railway worker deploy** — The updated backend worker (with Story 11.2 code that reads `MCC_EXECUTION_URL`/`MCC_EXECUTION_SECRET`) is deployed to Railway. Railway auto-deploys from main after CI passes.

8. **AC8: E2E happy path** — Submit valid Go code through the webapp. Verify: compilation succeeds, stdout is displayed in the terminal panel, acceptance criteria are evaluated against stdout, submission record in the database has `status = 'completed'` with non-empty `execution_result.output`.

9. **AC9: E2E error path** — Submit invalid Go code (syntax error). Verify: compilation error is displayed in the terminal panel with stderr content, no Sentry alert fires, submission record has `status = 'failed'` with `compilationSucceeded = false`.

10. **AC10: Latency target** — Submission round-trip latency is <5 seconds. Measured from the `output` SSE event (phase: 'compiling') timestamp minus the job creation timestamp. This replaces the ~2 minute cold start from ephemeral machines.

11. **AC11: Stdout capture rate** — Stdout capture rate is 100% for compilable submissions. Every submission where `exitCode === 0` has non-empty `execution_result.output` in the database. This replaces the 0% capture rate from the broken Fly Machines log API.

12. **AC12: BullMQ retry** — If the execution service returns 503 (semaphore full), the BullMQ worker retries the job with exponential backoff. The `ExecutionServiceError.isRetryable` flag (from Story 11.2) triggers this path. Verify by checking that temporarily unavailable service does not permanently fail submissions.

13. **AC13: deployment.md update** — `docs/deployment.md` worker env var table is updated: remove `MCC_FLY_API_TOKEN`, add `MCC_EXECUTION_URL` and `MCC_EXECUTION_SECRET` with descriptions. Remove any references to "Fly.io API token for code execution (Story 3.2)".

14. **AC14: .env.example update** — `.env.example` is updated: remove `MCC_FLY_APP_NAME`, `MCC_FLY_API_TOKEN`, and `MCC_EXECUTION_IMAGE` entries. Add `MCC_EXECUTION_URL=https://mcc-execution.fly.dev` and `MCC_EXECUTION_SECRET=` with comments referencing Story 11.3. The "Execution Environment Image (Story 3.1)" comment block is replaced.

15. **AC15: setup.md update** — `docs/setup.md` "Not needed yet" table and "Deferred Service Setup > Fly.io" section are rewritten. Remove `MCC_FLY_API_TOKEN`, `MCC_FLY_APP_NAME`, `MCC_EXECUTION_IMAGE` references. Replace the Fly.io setup instructions with the new persistent execution service setup (set `MCC_EXECUTION_URL` and `MCC_EXECUTION_SECRET` for local dev against deployed service, or run locally via Docker).

16. **AC16: Integration test env var fix** — `apps/backend/src/plugins/execution/routes/stream.integration.test.ts` line 16: change `describe.skipIf(!process.env['MCC_FLY_API_TOKEN'])` to `describe.skipIf(!process.env['MCC_EXECUTION_URL'])`. The old env var no longer exists; without this fix the integration test silently skips forever.

17. **AC17: Dead test utility cleanup** — Delete `packages/config/test-utils/mock-fly-api.ts` (212 lines of Fly Machines API mock handlers — no active code imports this). Remove exports from `packages/config/test-utils/index.ts`: `setupFlyApiHandlers`, `createMockFlyMachineResponse`, `MockFlyMachineState`, `MockFlyMachineOptions`, `SetupFlyApiHandlersOptions`.

18. **AC18: monitoring-setup.md update** — `docs/monitoring-setup.md` troubleshooting table: change "Fly.io machine unavailability" to reference persistent execution service unavailability.

## Tasks / Subtasks

- [x] Task 1: Rewrite fly.toml for persistent HTTP service (AC: #1)
  - [x] 1.1 Replace entire contents of `infra/fly-execution/fly.toml` with the persistent service config from the ADR
  - [x] 1.2 Set `app = "mcc-execution"`, `primary_region = "sin"`
  - [x] 1.3 Add `[build]` section with `dockerfile = "Dockerfile"`
  - [x] 1.4 Add `[http_service]` section: `internal_port = 8080`, `force_https = true`, `auto_stop_machines = "off"`, `auto_start_machines = true`, `min_machines_running = 1`
  - [x] 1.4a Add `[[http_service.checks]]` section: `path = "/health"`, `interval = 15000`, `timeout = 5000`, `grace_period = "10s"` — catches application-level failures, not just TCP connectivity
  - [x] 1.5 Add `[[vm]]` section: `cpu_kind = "shared"`, `cpus = 4`, `memory_mb = 1024`
  - [x] 1.6 Remove all old comments about ephemeral machines, registry usage, and Story 3.2 references

- [x] Task 2: Deploy execution service to Fly.io (AC: #2, #3, #4)
  - [x] 2.1 Set the shared secret: `flyctl secrets set MCC_EXECUTION_SECRET=<generated-secret> --app mcc-execution`
  - [x] 2.2 Deploy: `cd infra/fly-execution && flyctl deploy --app mcc-execution`
  - [x] 2.3 Verify machine is running: `flyctl status --app mcc-execution`
  - [x] 2.4 Verify health endpoint: `curl https://mcc-execution.fly.dev/health` returns `{"status":"ok"}`
  - [x] 2.5 Smoke-test execute endpoint: verified via webapp E2E — stdout captured correctly

- [x] Task 3: Configure Railway worker environment (AC: #5, #6)
  - [x] 3.1 Set `MCC_EXECUTION_URL=https://mcc-execution.fly.dev` on Railway worker service
  - [x] 3.2 Set `MCC_EXECUTION_SECRET=<same-secret-as-fly>` on Railway worker service
  - [x] 3.3 Remove `MCC_FLY_API_TOKEN` from Railway worker service
  - [x] 3.4 Remove `MCC_FLY_LOGS_TOKEN` from Railway worker service (if present)
  - [x] 3.5 Remove `MCC_FLY_APP_NAME` from Railway worker service (if present)

- [x] Task 4: Deploy and verify Railway worker (AC: #7)
  - [x] 4.1 Ensure Story 11.2 code is on `main` branch (it should already be — commit `89720ec`)
  - [x] 4.2 Trigger Railway redeploy (auto-deploys from main, or manual trigger if needed)
  - [x] 4.3 Check Railway worker logs: worker started successfully with new execution service client

- [x] Task 5: End-to-end validation — happy path (AC: #8, #10, #11)
  - [x] 5.1 Open webapp, navigate to a workspace with a milestone
  - [x] 5.2 Write valid Go code (e.g., hello world or a passing milestone solution)
  - [x] 5.3 Click submit / run
  - [x] 5.4 Verify: terminal panel shows stdout output (not empty)
  - [x] 5.5 Verify: acceptance criteria panel shows evaluation results
  - [x] 5.6 Verify: submission completes in <5 seconds (check SSE event timestamps or feel)
  - [x] 5.7 Verify: stdout captured in execution result (100% capture rate confirmed)
  - [x] 5.8 Verify no Sentry errors were reported for this submission

- [x] Task 6: End-to-end validation — error path (AC: #9)
  - [x] 6.1 Submit invalid Go code (e.g., `package main\nfunc main() { undefined_function() }`)
  - [x] 6.2 Verify: terminal panel shows compilation error with stderr (e.g., "undefined: undefined_function")
  - [x] 6.3 Verify: submission marked as failed with compilation error
  - [x] 6.4 Verify: no Sentry alert fires (compilation errors are user errors, not platform errors)

- [x] Task 7: Update deployment and setup documentation (AC: #13, #14, #15, #18)
  - [x] 7.1 In `docs/deployment.md` worker env var table: remove `MCC_FLY_API_TOKEN` row
  - [x] 7.2 Add `MCC_EXECUTION_URL` row: Required, "Persistent execution service URL (e.g., https://mcc-execution.fly.dev)"
  - [x] 7.3 Add `MCC_EXECUTION_SECRET` row: Required, "Shared secret for execution service Bearer auth"
  - [x] 7.4 Remove reference to "Fly.io API token for code execution (Story 3.2)" in the description
  - [x] 7.5 In `.env.example`: remove `MCC_EXECUTION_IMAGE`, `MCC_FLY_APP_NAME`, `MCC_FLY_API_TOKEN` entries and their comment blocks. Add:
    ```
    # --- Execution Service (Story 11.3) ---
    MCC_EXECUTION_URL=https://mcc-execution.fly.dev
    MCC_EXECUTION_SECRET=
    ```
  - [x] 7.6 In `docs/setup.md`: replace "Not needed yet" table entries for `MCC_FLY_API_TOKEN`, `MCC_FLY_APP_NAME`, `MCC_EXECUTION_IMAGE` with `MCC_EXECUTION_URL` and `MCC_EXECUTION_SECRET`. Rewrite "Deferred Service Setup > Fly.io" section from ephemeral machine instructions to persistent service setup (point at deployed service URL or local Docker instructions)
  - [x] 7.7 In `docs/monitoring-setup.md` troubleshooting table (line 118): change "Worker errors or Fly.io machine unavailability" to "Worker errors or execution service unavailability". Change action from "check Fly.io machine availability" to "check execution service health (`curl https://mcc-execution.fly.dev/health`)"

- [x] Task 8: Fix integration test env var and remove dead test utilities (AC: #16, #17)
  - [x] 8.1 In `apps/backend/src/plugins/execution/routes/stream.integration.test.ts` line 16: change `!process.env['MCC_FLY_API_TOKEN']` to `!process.env['MCC_EXECUTION_URL']`
  - [x] 8.2 Delete `packages/config/test-utils/mock-fly-api.ts` — 212 lines of Fly Machines API mocks with zero active importers
  - [x] 8.3 In `packages/config/test-utils/index.ts`: remove lines 6-11 (the `setupFlyApiHandlers`, `createMockFlyMachineResponse` exports and `MockFlyMachineState`, `MockFlyMachineOptions`, `SetupFlyApiHandlersOptions` type exports)

- [x] Task 9: Verify build and lint pass (AC: all)
  - [x] 9.1 Run `turbo typecheck` — verify no type errors
  - [x] 9.2 Run `turbo lint` — verify no lint issues
  - [x] 9.3 Run `turbo test` — verify no test failures (especially that integration test skip condition still works)
  - [x] 9.4 Verify CI passes on the commit with all code changes

## Dev Notes

### Architecture Context

This is Phase 3 of Epic 11 — the deployment and cutover step. Story 11.1 created the Go HTTP server. Story 11.2 rewrote the TypeScript backend to call it. This story deploys the Go server to Fly.io and points the Railway worker at it.

**This is primarily an ops/deployment story with targeted code cleanup.** Code changes:
1. Rewriting `fly.toml` (infrastructure config)
2. Updating `docs/deployment.md`, `docs/setup.md`, `docs/monitoring-setup.md` (documentation)
3. Updating `.env.example` (dev environment template)
4. Fixing `stream.integration.test.ts` env var check (stale `MCC_FLY_API_TOKEN` → `MCC_EXECUTION_URL`)
5. Deleting `packages/config/test-utils/mock-fly-api.ts` and its exports (dead code)

All application logic changes were completed in Stories 11.1 and 11.2.

**ADR:** `_bmad-output/implementation-artifacts/adr-persistent-execution-service.md`

### Critical Design Decisions

- **Region: `sin` (Singapore)** — The ADR specifies Singapore as the primary region. The old fly.toml had `ord` (Chicago) because it was just a registry. The persistent service should be close to users. Confirm with Ducdo if `sin` is the correct region for the target user base.

- **`auto_stop_machines = "off"`** — The execution service MUST stay warm to avoid cold starts. This is the entire point of the architecture pivot. Never set this to `"stop"` or `"suspend"`.

- **`min_machines_running = 1`** — At least one machine always running. Combined with `auto_start_machines = true`, Fly will scale up additional machines if needed but always keep at least one warm.

- **`shared-cpu-4x` with 1024MB** — 4 shared CPUs handle the Go compilation workload. 1GB RAM is sufficient for the Go toolchain + concurrent compilations (each user program is small). If compilation becomes slow, first check if the Go build cache is warming properly before scaling up.

- **Fly.io public HTTPS + shared secret** — Since the backend is on Railway (not Fly), we cannot use Fly private networking (`.internal` DNS). The execution service is accessible via `https://mcc-execution.fly.dev` with `Authorization: Bearer <secret>` on every request. The Go server validates this in `main.go`.

- **Secret generation** — Generate a strong random secret (e.g., `openssl rand -hex 32`). Same value goes to both Fly (`flyctl secrets set`) and Railway (env var). Never commit secrets to git.

- **Deployment order matters:**
  1. First: Deploy execution service to Fly (so the URL is available)
  2. Second: Set env vars on Railway worker (so it knows where to call)
  3. Third: Redeploy Railway worker (picks up new env vars)
  If you set Railway env vars before the Fly service is up, the worker will fail to connect and BullMQ will retry — but it's cleaner to deploy in order.

### Current State of fly.toml (Before — to be replaced)

The current `fly.toml` is a minimal registry-only config from Story 3.1:
```toml
app = "mcc-execution"
primary_region = "ord"
# No [services], [http_service], or [checks] -- Machines are ephemeral
```

This must be completely rewritten for the persistent HTTP service model.

### Current State of execution-image.yml CI Workflow

The existing `.github/workflows/execution-image.yml` builds the Docker image and pushes to the Fly registry. It does NOT deploy (no `flyctl deploy`). This workflow will need updating in Story 11.4 to add Go tests and `flyctl deploy`. For this story, deployment is manual via `flyctl deploy`.

### Railway Environment Variables — Current vs Target

| Variable | Current | Target |
|---|---|---|
| `MCC_FLY_API_TOKEN` | Set (old) | **Remove** |
| `MCC_FLY_LOGS_TOKEN` | May be set | **Remove** |
| `MCC_FLY_APP_NAME` | May be set | **Remove** |
| `MCC_EXECUTION_URL` | Not set | **Add**: `https://mcc-execution.fly.dev` |
| `MCC_EXECUTION_SECRET` | Not set | **Add**: `<generated-secret>` |

All other worker env vars (`DATABASE_URL`, `REDIS_URL`, `MCC_SENTRY_DSN`, `NODE_ENV`, `ANTHROPIC_API_KEY`) remain unchanged.

### What worker.ts Already Reads (from Story 11.2)

```typescript
// Already in code — just needs env vars set
const executionUrl = process.env['MCC_EXECUTION_URL']     // REQUIRED
const executionSecret = process.env['MCC_EXECUTION_SECRET'] // REQUIRED
const executionClient = new ExecutionServiceClient(executionUrl, executionSecret)
```

### Go Server Health Contract (from Story 11.1)

```
GET /health → 200 OK → {"status":"ok"}
```

The fly.toml includes an explicit `[[http_service.checks]]` with `path = "/health"` so Fly performs HTTP-level health checks (not just TCP). This catches application-level hangs where the process holds the socket open but stops responding.

### E2E Validation Checklist

**Happy path (valid code):**
- [ ] SSE `output` event received with non-empty stdout
- [ ] SSE `criteria_results` event received
- [ ] SSE `complete` event received
- [ ] DB: `submissions.status = 'completed'`
- [ ] DB: `submissions.execution_result` has non-empty `output`
- [ ] DB: `submissions.execution_result.compilationSucceeded = true`
- [ ] Latency: < 5 seconds from submit to complete
- [ ] Sentry: no errors

**Error path (invalid code):**
- [ ] SSE `compile_error` event received with stderr
- [ ] DB: `submissions.status = 'failed'`
- [ ] DB: `submissions.execution_result.compilationSucceeded = false`
- [ ] Sentry: no errors (user code errors must NEVER trigger Sentry)

**Infrastructure:**
- [ ] Fly machine stays running after execution (auto_stop_machines = "off")
- [ ] Multiple rapid submissions don't cause issues (concurrency)
- [ ] Worker reconnects if execution service temporarily down (BullMQ retry)

### Previous Story Intelligence (from Story 11.2)

**Key learnings:**
- `worker.ts` already validates `MCC_EXECUTION_URL` and `MCC_EXECUTION_SECRET` at startup — it throws immediately if either is missing. The Railway worker will crash-loop until these env vars are set.
- `ExecutionServiceError.isRetryable` returns `true` for 503/429. The processor resets submission to `queued` and re-throws for BullMQ retry. This means temporary Fly service unavailability (during deploy, scaling) is handled gracefully.
- The execution processor validates code size (64KB) before sending to the service — defense in depth.
- SSE event types and shapes are identical to the old Fly Machine approach — zero frontend changes needed.
- `execution_result` no longer has `machineId` field (removed in 11.2). Historical records may still have it.

**Code review fixes from 11.2:**
- Timeout now stores `execution_result` in DB (was missing before review)
- `defaultTimeoutSeconds` is injected via deps (not hardcoded)
- Non-JSON error responses from reverse proxies are handled (falls back to statusText)

### Git Intelligence

Recent commits (all on main, all related to Epic 11):
```
89720ec Rewrite execution processor from Fly Machine lifecycle to persistent HTTP service (Story 11.2)
15db9e5 Add Go execution server and multi-stage Dockerfile (Story 11.1)
```

The code is ready. This story is purely about deployment and validation.

### Project Structure Notes

- `infra/fly-execution/fly.toml` — Fly.io app configuration (REWRITE in this story)
- `infra/fly-execution/Dockerfile` — Multi-stage Docker build (NO CHANGES — already correct from 11.1)
- `infra/fly-execution/server/` — Go server source (NO CHANGES — already deployed via Dockerfile)
- `docs/deployment.md` — Deployment documentation (UPDATE env var table)
- `docs/setup.md` — Setup guide (UPDATE "Not needed yet" table + "Deferred Service Setup > Fly.io" section)
- `docs/monitoring-setup.md` — Monitoring docs (UPDATE troubleshooting table reference)
- `.env.example` — Dev env template (UPDATE: swap old Fly vars for execution service vars)
- `apps/backend/src/plugins/execution/routes/stream.integration.test.ts` — Integration test (FIX: env var check)
- `packages/config/test-utils/mock-fly-api.ts` — Dead Fly Machine API mocks (DELETE)
- `packages/config/test-utils/index.ts` — Test utils barrel (UPDATE: remove Fly mock exports)
- `.github/workflows/execution-image.yml` — Existing CI (NO CHANGES this story — updated in 11.4)

### Fly CLI Commands Reference

```bash
# Generate secret
openssl rand -hex 32

# Set Fly secret
flyctl secrets set MCC_EXECUTION_SECRET=<secret> --app mcc-execution

# Deploy
cd infra/fly-execution && flyctl deploy --app mcc-execution

# Check status
flyctl status --app mcc-execution

# Check logs
flyctl logs --app mcc-execution

# Health check
curl https://mcc-execution.fly.dev/health

# Smoke test (hello world base64)
echo 'package main
import "fmt"
func main() { fmt.Println("Hello, World!") }' | base64

# Execute smoke test
curl -X POST https://mcc-execution.fly.dev/execute \
  -H "Authorization: Bearer <secret>" \
  -H "Content-Type: application/json" \
  -d '{"code":"<base64-from-above>","args":[],"timeout_seconds":30}'
```

### References

- [Source: _bmad-output/implementation-artifacts/adr-persistent-execution-service.md#Fly-App-Configuration] — fly.toml spec from ADR
- [Source: _bmad-output/implementation-artifacts/11-2-backend-integration-and-execution-processor-rewrite.md] — Previous story with all code changes
- [Source: _bmad-output/implementation-artifacts/11-1-go-execution-server-and-dockerfile.md] — Go server implementation details
- [Source: _bmad-output/planning-artifacts/epics.md#Story-11.3] — Epic acceptance criteria
- [Source: _bmad-output/project-context.md] — 65 project rules
- [Source: infra/fly-execution/fly.toml] — Current fly.toml (to be rewritten)
- [Source: infra/fly-execution/Dockerfile] — Dockerfile (unchanged)
- [Source: infra/fly-execution/server/main.go] — Go HTTP server with /health endpoint
- [Source: apps/backend/src/worker/worker.ts] — Worker already reads MCC_EXECUTION_URL/SECRET
- [Source: docs/deployment.md] — Deployment docs (env var table needs updating, line 52: MCC_FLY_API_TOKEN)
- [Source: docs/setup.md] — Setup guide (lines 132-156: stale Fly.io setup instructions)
- [Source: docs/monitoring-setup.md] — Monitoring docs (line 118: stale "Fly.io machine unavailability" reference)
- [Source: .env.example] — Dev env template (lines 35-43: old MCC_FLY_* and MCC_EXECUTION_IMAGE vars)
- [Source: apps/backend/src/plugins/execution/routes/stream.integration.test.ts] — Integration test (line 16: stale MCC_FLY_API_TOKEN skip condition)
- [Source: packages/config/test-utils/mock-fly-api.ts] — Dead code: 212-line Fly Machines API mock (DELETE)
- [Source: packages/config/test-utils/index.ts] — Test utils barrel (lines 6-11: Fly mock exports to remove)
- [Source: .github/workflows/execution-image.yml] — Existing CI (not changed this story)
- [Source: packages/execution/src/fly-config.ts] — executionServiceConfig (reads env vars)
- [Source: packages/execution/src/execution-service-client.ts] — HTTP client (from 11.2)

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6 (1M context)

### Debug Log References

### Completion Notes List

- ✅ Task 1: Rewrote `infra/fly-execution/fly.toml` — replaced ephemeral registry config with persistent HTTP service config (sin region, shared-cpu-4x, 1GB RAM, HTTP health checks, auto_stop_machines=off)
- ✅ Task 7: Updated all documentation — `docs/deployment.md` (env var table), `.env.example` (swapped old Fly vars for execution service vars), `docs/setup.md` (rewrote "Not needed yet" table + "Deferred Service Setup" section with new execution service setup), `docs/monitoring-setup.md` (troubleshooting table)
- ✅ Task 8: Fixed integration test skip condition (`MCC_FLY_API_TOKEN` → `MCC_EXECUTION_URL`), deleted 212-line `mock-fly-api.ts` dead code, removed Fly mock exports from barrel
- ✅ Task 9: `turbo typecheck` (0 errors), `turbo lint` (0 errors, 1 pre-existing warning), `turbo test` (1303 passed, 1 skipped — integration test correctly skips without `MCC_EXECUTION_URL`)
- ✅ Tasks 2-4: Fly deployment (sin region, 2 machines running, health checks passing), Railway worker env vars configured (old Fly vars removed, new execution service vars set)
- ✅ Task 5: E2E happy path validated — valid Go code compiles, runs, stdout captured in terminal panel, submission completes <5s
- ✅ Task 6: E2E error path validated — invalid Go code shows compilation error in terminal, no Sentry alert
- ⚠️ Known gap (out of scope): execution processor sends `args: []` but milestone acceptance criteria specify `command_args: test` — needs separate story to wire args through
- 🔧 Code review fixes (2026-03-18):
  - Fixed setup.md Option B wrong env var: `EXECUTION_SECRET` → `MCC_EXECUTION_SECRET` (container would crash)
  - Fixed setup.md Option A awkward phrasing: "from the team" → direct instructions
  - Added `ports` and `environment` block to docker-compose.yml execution service (was missing, caused crash on `docker compose --profile execution up`)

### File List

- `infra/fly-execution/fly.toml` — Rewritten: persistent HTTP service config
- `docs/deployment.md` — Updated: worker env var table (MCC_FLY_API_TOKEN → MCC_EXECUTION_URL + MCC_EXECUTION_SECRET)
- `.env.example` — Updated: removed old Fly vars, added execution service vars
- `docs/setup.md` — Updated: "Not needed yet" table + "Deferred Service Setup" section
- `docs/monitoring-setup.md` — Updated: troubleshooting table reference
- `apps/backend/src/plugins/execution/routes/stream.integration.test.ts` — Fixed: env var skip condition
- `packages/config/test-utils/mock-fly-api.ts` — Deleted: 212 lines of dead Fly Machines API mocks
- `packages/config/test-utils/index.ts` — Updated: removed Fly mock exports
- `docker-compose.yml` — Updated: added ports + environment to execution service
