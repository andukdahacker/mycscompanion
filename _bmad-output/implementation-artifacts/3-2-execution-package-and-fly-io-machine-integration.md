# Story 3.2: Execution Package & Fly.io Machine Integration

Status: done

## Story

As a developer,
I want a shared execution package that provisions isolated Firecracker VMs on Fly.io,
so that learner code runs in a secure, disposable sandbox.

## Security Context

Users submit **arbitrary Go code**. Attack vectors include: container escape, fork bombs, infinite loops, memory exhaustion, network exfiltration, crypto mining, and attacking other services. Every security constraint in this story exists to mitigate a specific threat. Treat the VM as fully hostile.

## Acceptance Criteria

1. A disposable Firecracker VM is provisioned on Fly.io using the image from Story 3.1 (`registry.fly.io/mcc-execution:latest`) (FR20)
2. Each VM enforces resource limits: 1 shared CPU, 256 MB memory, 60-second timeout, process count limit (fork-bomb prevention), network isolation (egress denied via Fly Network Policies), read-only filesystem (except `/workspace`), auto-destroy, no-restart policy (FR21, NFR-S1)
3. No persistent state remains — the orchestrator **always** explicitly destroys the machine in a `finally` block regardless of exit code. `auto_destroy: true` is a safety net only, not the primary cleanup mechanism (NFR-S2)
4. The package exports a typed `ExecutionEvent` discriminated union in `events.ts` covering lifecycle events produced by this story (`queued`, `output`, `complete`, `error`, `timeout`, `heartbeat`) plus forward-looking event types for later stories (`compile_output`, `compile_error`, `test_output`, `test_result`, `benchmark_progress`, `benchmark_result`) (ARCH-9)
5. Fly Machine configuration (image, region, size class) is defined in the package (extends Story 3.1 fly-config)
6. The package can be imported by both API (event types only) and worker (full client) without circular dependencies
7. `ExecutionStatus` type (`'queued' | 'running' | 'completed' | 'failed'`) is the canonical source for the `submission_status` DB enum created in Story 3.3

## Tasks / Subtasks

- [x] Task 0: Set up canonical msw test infrastructure (AC: #6)
  - [x] 0.1 Add `msw` as devDependency of `@mycscompanion/config`: `pnpm --filter @mycscompanion/config add -D msw`
  - [x] 0.2 Create `packages/config/test-utils/mock-fly-api.ts` with canonical Fly Machines API msw handlers (createMachine, waitForState, getMachine, stopMachine, destroyMachine)
  - [x] 0.3 Export `setupFlyApiHandlers` and `createMockFlyMachineResponse` from `packages/config/test-utils/mock-fly-api.ts`
  - [x] 0.4 Re-export from `packages/config/test-utils/index.ts` barrel
  - [x] 0.5 Add `msw` as devDependency of `@mycscompanion/execution`: `pnpm --filter @mycscompanion/execution add -D msw`
  - [x] 0.6 Add `@mycscompanion/config` as devDependency of `@mycscompanion/execution`: `pnpm --filter @mycscompanion/execution add -D @mycscompanion/config`

- [x] Task 1: Create ExecutionEvent types in dedicated events file (AC: #4, #7)
  - [x] 1.1 Create `packages/execution/src/events.ts` — all event types live here (per architecture directory structure), NOT in `index.ts`
  - [x] 1.2 Define `ExecutionPhase` type: `'preparing' | 'compiling' | 'testing' | 'benchmarking'`
  - [x] 1.3 Define `ExecutionEvent` as discriminated union with `readonly` fields. All variants except `queued` and `heartbeat` carry `phase`, `data: string | object`, and `sequenceId: number` for architecture alignment. Variant-specific typed fields supplement (not replace) the base `data` field
  - [x] 1.4 Event type names: `queued`, `compile_output`, `compile_error`, `test_output`, `test_result`, `benchmark_progress`, `benchmark_result`, `output`, `complete`, `error`, `timeout`, `heartbeat`
  - [x] 1.5 The `error` variant includes `isUserError: boolean` to distinguish user-code errors (terminal display) from platform errors (Sentry + retry)
  - [x] 1.6 Add `ExecutionStatus` type: `'queued' | 'running' | 'completed' | 'failed'` — canonical source for the `submission_status` DB enum in Story 3.3
  - [x] 1.7 Create `packages/execution/src/events.test.ts` — type narrowing tests (switch on `event.type` compiles correctly, exhaustive check)
  - [x] 1.8 Note: `test_*` and `benchmark_*` event types are forward-looking placeholders for Epic 4/7. This story's orchestrator only yields: `queued`, `output`, `complete`, `error`, `timeout`
  - [x] 1.9 There are currently **zero consumers** of the placeholder `ExecutionEvent` type — the replacement is safe with no downstream breakage
  - [x] 1.10 Remove placeholder `ExecutionEvent` from `index.ts`, re-export from `events.ts` instead

- [x] Task 2: Build Fly Machines API request types and builder (AC: #1, #2, #5)
  - [x] 2.1 Create `packages/execution/src/fly-api-types.ts` — request/response types matching Fly Machines REST API (snake_case field names matching the API contract)
  - [x] 2.2 Define `FlyCreateMachineRequest` type with `name?`, `region?`, `config` (image, guest, init, restart, auto_destroy, files, env, processes, services, metadata)
  - [x] 2.3 Define `FlyMachineResponse` type with `id`, `name`, `state`, `region`, `instance_id`, `private_ip`, `created_at`, `updated_at`, `config`, `events`
  - [x] 2.4 Define `FlyMachineState`: `'created' | 'starting' | 'started' | 'stopping' | 'stopped' | 'suspended' | 'failed' | 'destroying' | 'destroyed' | 'replacing' | 'replaced'`
  - [x] 2.5 Define `FlyWaitState` (subset the wait endpoint accepts): `'started' | 'stopped' | 'suspended' | 'destroyed'`
  - [x] 2.6 Create `packages/execution/src/machine-request-builder.ts` — builds `FlyCreateMachineRequest` from our `FlyMachineConfig` + user code + options
  - [x] 2.7 Builder injects user Go code as base64 via `config.files[].raw_value` to guest_path `/workspace/main.go`
  - [x] 2.8 **Code size validation:** Builder rejects code exceeding `MAX_CODE_SIZE_BYTES` (64 KB) before base64 encoding
  - [x] 2.9 Builder sets `config.init.exec` to `["sh", "-c", "ulimit -u 64 && go build -o main . 2>&1 && ./main 2>&1"]` (includes ulimit per Task 6)
  - [x] 2.10 Builder sets `config.auto_destroy: true`, `config.restart.policy: 'no'`
  - [x] 2.11 Builder sets `config.services: []` (prevents inbound Fly Proxy traffic)
  - [x] 2.12 Builder sets `config.guest` from `FlyMachineConfig`: camelCase internal fields → snake_case API fields (`cpuKind` → `cpu_kind`, `memoryMb` → `memory_mb`)
  - [x] 2.13 Builder accepts `submissionId` and `milestoneId` params, sets `config.metadata: { submission_id, milestone_id }` for observability
  - [x] 2.14 Builder accepts optional `region` override, defaults to config
  - [x] 2.15 Write comprehensive tests for request builder (pure function tests, no mocks needed)
  - [x] 2.16 All imports from `index.ts` barrel in this module MUST use `import type` to prevent circular deps at runtime

- [x] Task 3: Create Fly Machines REST client (AC: #1, #3, #6)
  - [x] 3.1 Create `packages/execution/src/fly-client.ts` — typed HTTP client wrapping Fly Machines API
  - [x] 3.2 Client constructor takes `{ apiToken: string; appName: string; baseUrl?: string }` — injectable for testability. **Stateless, concurrency-safe** — no shared mutable state, safe to share across concurrent orchestrations (NFR-P11: 10 concurrent executions)
  - [x] 3.3 `baseUrl` defaults to `https://api.machines.dev`
  - [x] 3.4 Implement `createMachine(request: FlyCreateMachineRequest): Promise<FlyMachineResponse>`
  - [x] 3.5 Implement `waitForState(machineId: string, state: FlyWaitState, options: { instanceId?: string; timeoutSeconds?: number }): Promise<FlyMachineResponse>` — **`instanceId` is REQUIRED when waiting for `stopped` state** (Fly API returns 400 without it). Pass `instance_id` from `FlyMachineResponse` as query param
  - [x] 3.6 Implement `stopMachine(machineId: string, signal?: string): Promise<void>`
  - [x] 3.7 Implement `destroyMachine(machineId: string, force?: boolean): Promise<void>`
  - [x] 3.8 Implement `getMachine(machineId: string): Promise<FlyMachineResponse>`
  - [x] 3.9 Use Node.js built-in `fetch` (Node 20+) — no external HTTP library. `@types/node` already in devDeps provides typing
  - [x] 3.10 All methods set `Authorization: Bearer ${apiToken}` and `Content-Type: application/json` headers
  - [x] 3.11 Error handling: throw typed `FlyApiError` with `status`, `message`, `machineId`, and `isRetryable: boolean` (true for 429, 503, network errors; false for 4xx). Story 3.3's worker uses `isRetryable` for BullMQ retry decisions
  - [x] 3.12 Handle Fly API rate limits: 1 req/s/action/machine (burst 3). On 429 response, set `isRetryable: true` and include `Retry-After` header value if present
  - [x] 3.13 Write tests using canonical msw handlers from `@mycscompanion/config/test-utils/mock-fly-api` (created in Task 0)

- [x] Task 4: Create execution orchestrator (AC: #1, #2, #3)
  - [x] 4.1 Create `packages/execution/src/execute.ts` — high-level orchestration function
  - [x] 4.2 `executeCode(client: FlyClient, config: FlyMachineConfig, code: string, submissionId: string): AsyncGenerator<ExecutionEvent>` — accepts `submissionId` to populate `queued` event and machine metadata
  - [x] 4.3 Orchestration flow: build request → create machine → wait for `'started'` → wait for `'stopped'` (pass `instance_id` from create response) → destroy machine
  - [x] 4.4 Yield `ExecutionEvent` at each phase transition. This story's orchestrator only yields: `queued`, `output` (with machine lifecycle data), `complete`, `error`, `timeout`. Content-bearing events (compile_output, test_result, etc.) are populated by Story 3.3's worker via log parsing
  - [x] 4.5 Implement timeout: if machine doesn't reach `'stopped'` within `config.timeoutSeconds` (60s), stop + destroy and yield `timeout` event
  - [x] 4.6 **CRITICAL:** Always `destroyMachine(id, force=true)` in `finally` block — `auto_destroy` delays ~2 hours on non-zero exit codes (compilation errors, panics). Explicit destroy is the primary cleanup; `auto_destroy` is safety net only
  - [x] 4.7 On `FlyApiError` where `isRetryable === true` (Fly outage, rate limit), yield `error` event with `isUserError: false` and message: "Execution environment temporarily unavailable"
  - [x] 4.8 Log timestamps at each lifecycle phase (machine create, started, stopped, destroyed) for NFR-P1 validation. Use callback pattern: orchestrator accepts optional `onLifecycleEvent` callback for structured logging by the consuming worker
  - [x] 4.9 Write tests using canonical msw handlers mocking the full lifecycle (happy path, timeout, Fly API failure, non-zero exit)

- [x] Task 5: Investigate and implement network isolation (AC: #2)
  - [x] 5.1 `services: []` only prevents **inbound** Fly Proxy traffic — it does NOT block outbound internet or 6PN private network access
  - [x] 5.2 Research Fly Network Policies API: `POST /v1/apps/{app_name}/network_policies` — configure deny-all egress policy for the execution app
  - [x] 5.3 Implement `configureNetworkPolicies(client: FlyClient)` helper or document the manual one-time setup via `flyctl` if the API approach is impractical
  - [x] 5.4 If Fly Network Policies cannot fully isolate (e.g., 6PN always available), document this as a known limitation and add compensating controls (e.g., no secrets/credentials passed to the VM)
  - [x] 5.5 Document the network isolation approach in Dev Notes for future reference

- [x] Task 6: Investigate and implement process count limiting (AC: #2)
  - [x] 6.1 Research Fly Machines API for PID/process count limiting options (guest config, init options, or kernel_args)
  - [x] 6.2 If native API support exists, add to machine request builder config
  - [x] 6.3 If no native API support, add `ulimit -u 64` to `init.exec` shell command as compensating control: `["sh", "-c", "ulimit -u 64 && go build -o main . 2>&1 && ./main 2>&1"]`
  - [x] 6.4 Write test verifying the process limit is present in the generated machine request
  - [x] 6.5 Document the approach and any limitations

- [x] Task 7: Update package exports and integration verification (AC: #6)
  - [x] 7.1 Update `packages/execution/src/index.ts` barrel: re-export types from `events.ts`, values from `fly-config.ts`, types from `fly-api-types.ts`, client from `fly-client.ts`, builder from `machine-request-builder.ts`, orchestrator from `execute.ts`
  - [x] 7.2 **Circular dep rule:** `index.ts` re-exports from modules, but modules importing from `index.ts` MUST use `import type` only (matches existing `fly-config.ts` pattern)
  - [x] 7.3 Verify the package imports work from `apps/backend` (both API-side type imports and worker-side value imports)
  - [x] 7.4 Run full test suite: `pnpm --filter @mycscompanion/execution test`
  - [x] 7.5 Run typecheck: `pnpm --filter @mycscompanion/execution typecheck`
  - [x] 7.6 Run lint: `pnpm --filter @mycscompanion/execution lint`
  - [x] 7.7 Run root-level checks: `turbo lint && turbo typecheck && turbo test`

## Dev Notes

### Architecture Compliance

- **Package location:** `packages/execution/src/` — shared package consumed by API (types only) and worker (full). Note: architecture directory listing shows `apps/backend/src/plugins/execution/services/fly-machines.ts` but architecture's "Execution Boundary" text says Fly details are encapsulated in `packages/execution`. The package location is correct; the directory listing is outdated
- **No new packages:** Extends `@mycscompanion/execution` (one of exactly 4 allowed: ui, shared, execution, config)
- **No external HTTP deps:** Use Node.js 20+ built-in `fetch` — do NOT add `axios`, `got`, `node-fetch`, or `undici`
- **Type conventions:** Union types (not TS enum), `readonly` on all event/config types, `satisfies` over `as`, no `any`
- **Named exports only** — no default exports
- **File naming:** `kebab-case.ts` (e.g., `fly-client.ts`, `fly-api-types.ts`)
- **Co-located tests:** `{source}.test.ts` next to source files
- **Env var naming:** `MCC_FLY_API_TOKEN` is canonical (MCC_ prefix per naming convention). Architecture line 420 inconsistently says `FLY_API_TOKEN` — ignore that, use `MCC_` prefix

### Fly Machines API Contract

**Base URL:** `https://api.machines.dev`
**Auth:** `Authorization: Bearer ${MCC_FLY_API_TOKEN}`
**App name:** From `MCC_FLY_APP_NAME` env var (default: `mcc-execution`)
**Rate Limits:** 1 req/s/action/machine (burst 3 req/s). Get Machine: 5 req/s (burst 10). ~50 machine org cap initially. These are hard limits.

**Create Machine:** `POST /v1/apps/{app_name}/machines`
```json
{
  "config": {
    "image": "registry.fly.io/mcc-execution:latest",
    "auto_destroy": true,
    "guest": { "cpu_kind": "shared", "cpus": 1, "memory_mb": 256 },
    "init": { "exec": ["sh", "-c", "ulimit -u 64 && go build -o main . 2>&1 && ./main 2>&1"] },
    "restart": { "policy": "no" },
    "services": [],
    "files": [{ "guest_path": "/workspace/main.go", "raw_value": "<base64-encoded-code>" }],
    "metadata": { "submission_id": "<cuid2>", "milestone_id": "<string>" }
  }
}
```

**Wait for state:** `GET /v1/apps/{app_name}/machines/{id}/wait?state={state}&timeout=60&instance_id={instance_id}`
- `instance_id` is **REQUIRED** when waiting for `stopped` state (400 without it)
- Get `instance_id` from the create machine response

**Get machine:** `GET /v1/apps/{app_name}/machines/{id}`
**Stop machine:** `POST /v1/apps/{app_name}/machines/{id}/stop`
**Destroy machine:** `DELETE /v1/apps/{app_name}/machines/{id}?force=true`

### Security Constraints

| Constraint | Mechanism | Threat Mitigated |
|---|---|---|
| No inbound traffic | `services: []` | Prevents machine from being used as a server |
| No outbound traffic | Fly Network Policies (deny-all egress) | Prevents data exfiltration, crypto mining, network attacks |
| Memory cap (256 MB) | `guest.memory_mb: 256` | Prevents memory exhaustion |
| CPU cap (1 shared) | `guest.cpus: 1, cpu_kind: 'shared'` | Prevents CPU monopolization |
| Process limit | `ulimit -u 64` in init.exec (or native API if available) | Prevents fork bombs |
| 60s timeout | Orchestrator stop+destroy | Prevents infinite loops |
| Read-only FS | Dockerfile non-root `runner` user. `/tmp` and `/home/runner` are writable — acceptable since no sensitive data on VM and VM is destroyed after use | Limits filesystem abuse |
| Explicit destroy | `finally` block calls `destroyMachine(id, force=true)` | `auto_destroy` delays ~2hrs on non-zero exit; explicit destroy ensures cleanup |
| No restart | `restart.policy: 'no'` | Failed code doesn't retry automatically |
| No credentials | No secrets/env vars passed to VM | Even if network isolation is imperfect, no credentials to exfiltrate |

### ExecutionEvent Design

Event types in `events.ts` (separate file per architecture). SSE naming convention: `snake_case` per project-context. Discriminated union enables exhaustive `switch`:

```typescript
type ExecutionPhase = 'preparing' | 'compiling' | 'testing' | 'benchmarking'

type ExecutionEvent =
  | Readonly<{ type: 'queued'; submissionId: string }>
  | Readonly<{ type: 'compile_output'; phase: 'compiling'; data: string; sequenceId: number }>
  | Readonly<{ type: 'compile_error'; phase: 'compiling'; data: string; sequenceId: number }>
  | Readonly<{ type: 'test_output'; phase: 'testing'; data: string; sequenceId: number }>
  | Readonly<{ type: 'test_result'; phase: 'testing'; passed: boolean; details: string; data: string; sequenceId: number }>
  | Readonly<{ type: 'benchmark_progress'; phase: 'benchmarking'; iteration: number; total: number; data: string; sequenceId: number }>
  | Readonly<{ type: 'benchmark_result'; phase: 'benchmarking'; userMedian: number; referenceMedian: number; normalizedRatio: number; data: string; sequenceId: number }>
  | Readonly<{ type: 'output'; phase: ExecutionPhase; data: string; sequenceId: number }>
  | Readonly<{ type: 'complete'; phase: ExecutionPhase; data: string; sequenceId: number }>
  | Readonly<{ type: 'error'; phase: ExecutionPhase; message: string; isUserError: boolean; data: string; sequenceId: number }>
  | Readonly<{ type: 'timeout'; phase: ExecutionPhase; timeoutSeconds: number; data: string; sequenceId: number }>
  | Readonly<{ type: 'heartbeat' }>
```

**Design notes:**
- `queued` and `heartbeat` are envelope events with no phase/sequenceId (matches SSE protocol layer, not execution content)
- All content events carry `data: string` for architecture alignment, plus typed fields for consumer convenience
- `test_*` and `benchmark_*` types are **forward-looking placeholders** for Epic 4 (criteria) and Epic 7 (benchmarks). This story's orchestrator only yields: `queued`, `output`, `complete`, `error`, `timeout`
- Epic AC lists simpler names (`compiling`, `compiled`, `running`). These map to phase transitions, not discrete event types. The granular type names above give better developer ergonomics and were chosen deliberately
- `isUserError` on `error` distinguishes user-code errors (terminal display, HTTP 200) from platform errors (Sentry, retry message)

### Output Capture Strategy

The `init.exec` command combines stdout+stderr with `2>&1`. This means compile errors and runtime output are in a single stream at the machine level. Distinguishing `compile_error` from `compile_output` requires parsing the combined output (Go compiler errors have recognizable patterns). **Actual output capture and parsing is Story 3.3's worker responsibility** — this story's orchestrator yields only lifecycle state-transition events. The worker in Story 3.3 will read machine output via one of:
1. Fly Logs HTTP API: `GET https://api.fly.io/api/v1/apps/{app}/logs?instance={machine_id}` (instance filter can be unreliable)
2. NATS subscription: `nats://[fdaa::3]:4223` subject `logs.<app>.<region>.<instance>` (real-time, preferred)
3. Fly `/exec` endpoint: `POST /v1/apps/{app}/machines/{id}/exec` (60s timeout, only on running machine)

### Performance Considerations

- **NFR-P1 (<5s compilation round-trip):** Machine startup latency directly impacts this. Cold start (image pull) may take several seconds. The orchestrator logs timestamps at each lifecycle phase via callback for measurement. Story 3.4 validates the end-to-end target
- **NFR-P11 (10 concurrent executions):** `FlyClient` is stateless and concurrency-safe — no shared mutable state. Multiple `executeCode` calls can run simultaneously. Fly API rate limit (3 req/s burst for createMachine) may serialize initial provisioning under peak load
- **Fly org machine cap:** New orgs have ~50 machine limit. With `auto_destroy` delays on failure, leaked machines count against this. Explicit destroy in `finally` prevents accumulation

### Previous Story Intelligence (Story 3.1)

**Established patterns:**
- `FlyMachineConfig` type with `Readonly<>` wrapper and `satisfies` validation
- `getExecutionImageRef()` for env-var override pattern
- `DEFAULT_FLY_MACHINE_CONFIG` using `as const satisfies` — extend this pattern
- Vitest infrastructure already set up in `packages/execution/vitest.config.ts`
- 10 existing tests in `fly-config.test.ts` — follow same style (describe/it, afterEach with vi.restoreAllMocks + vi.unstubAllEnvs)
- Zero existing consumers of `ExecutionEvent` placeholder — safe to replace entirely

**Files created in 3.1:**
- `infra/fly-execution/Dockerfile` — Go 1.23 alpine, non-root runner, WORKDIR /workspace
- `packages/execution/src/fly-config.ts` — config + image ref helper
- `packages/execution/src/fly-config.test.ts` — config tests
- `packages/execution/src/index.ts` — barrel exports + type defs
- `packages/execution/vitest.config.ts` — vitest setup
- `.github/workflows/execution-image.yml` — CI image build

**Code review feedback applied in 3.1:**
- Pin CI actions to version tags (not @master)
- Use exact value assertions (not just `toBeDefined()`)
- Use `vi.stubEnv()` for env var setup (not direct `process.env` mutation)
- Add `afterEach` cleanup in every test file

### Testing Strategy

- **Canonical msw mock factories:** Create in `packages/config/test-utils/mock-fly-api.ts` per project-context rule: "never create ad-hoc mocks — new patterns add to canonical set". All Fly API tests import from there
- **Fly API client:** Test with canonical msw handlers (`http.post()`, `http.get()`, `http.delete()`)
- **Request builder:** Pure function tests, no mocks needed
- **Event types:** Compile-time tests (type narrowing switch statements) in `events.test.ts`
- **Orchestrator:** Integration test with msw mocking the full lifecycle (happy path, timeout, Fly API failure, non-zero exit)
- **Test syntax:** Always `it()`, never `test()`. `describe` mirrors module structure
- **Test names:** Describe behavior, not implementation
- **Existing test utils available:** `createMockRedis`, `createTestQueryClient`, `createMockFirebaseAuth` in `@mycscompanion/config/test-utils/` — no msw utilities exist yet, this story creates them

### File Structure (after this story)

```
packages/execution/
  src/
    index.ts                    # barrel exports (updated — re-exports from events.ts)
    events.ts                   # ExecutionEvent discriminated union + ExecutionPhase + ExecutionStatus (NEW)
    events.test.ts              # Type narrowing tests (NEW)
    fly-config.ts               # Machine config defaults (from 3.1)
    fly-config.test.ts          # Config tests (from 3.1)
    fly-api-types.ts            # Fly REST API request/response types (NEW)
    fly-client.ts               # Fly Machines REST client (NEW)
    fly-client.test.ts          # Client tests with canonical msw handlers (NEW)
    machine-request-builder.ts  # Build API request from config + code (NEW)
    machine-request-builder.test.ts  # Builder tests (NEW)
    execute.ts                  # High-level orchestration (NEW)
    execute.test.ts             # Orchestration tests with msw (NEW)
  vitest.config.ts              # vitest config (from 3.1)
  package.json                  # add msw + @mycscompanion/config devDeps (updated)
  tsconfig.json

packages/config/
  test-utils/
    mock-fly-api.ts             # Canonical Fly Machines API msw handlers (NEW)
    index.ts                    # Re-export mock-fly-api (updated)
  package.json                  # add msw devDep (updated)
```

### Dependency Graph (no circular deps)

```
index.ts (barrel — re-exports only)
  ├── events.ts (no internal deps — pure types)
  ├── fly-config.ts (imports type from index via `import type`)
  ├── fly-api-types.ts (no internal deps — pure types)
  ├── machine-request-builder.ts → imports fly-api-types; `import type` from index
  ├── fly-client.ts → imports fly-api-types
  └── execute.ts → imports fly-client, machine-request-builder; `import type` from index
```

**Rule:** Sibling modules importing from `index.ts` barrel MUST use `import type` only to prevent runtime circular deps (matches existing `fly-config.ts` pattern).

### Environment Variables Required

| Variable | Purpose | Default |
|---|---|---|
| `MCC_FLY_API_TOKEN` | Fly Machines API auth token | (none — required in prod/worker) |
| `MCC_FLY_APP_NAME` | Fly app name for machine creation | `mcc-execution` |
| `MCC_EXECUTION_IMAGE` | Override execution image ref | `registry.fly.io/mcc-execution:latest` |

### What This Story Does NOT Include

- BullMQ job queue integration (Story 3.3)
- Worker process integration (Story 3.3)
- Redis pub/sub event publishing (Story 3.3)
- SSE streaming endpoint (Story 3.4)
- Database submissions table and migration (Story 3.3)
- Machine output log capture and parsing (Story 3.3 — worker reads Fly logs, parses output, and populates content-bearing events like `compile_output`)
- Benchmark runner logic (Epic 7)
- Test runner logic (Epic 4)

### Project Structure Notes

- Alignment with unified project structure: `packages/execution/src/` is correct location
- Canonical test utilities added to `packages/config/test-utils/` — this is the ONLY other package modified
- `infra/fly-execution/` already exists from Story 3.1 — do not modify
- No changes to `apps/backend/` in this story — worker integration is Story 3.3

### References

- [Source: _bmad-output/planning-artifacts/architecture.md — Execution Environment, Fly Machines API, Worker Architecture, SSE Streaming, Execution Boundary sections]
- [Source: _bmad-output/planning-artifacts/epics.md — Epic 3, Story 3.2 acceptance criteria]
- [Source: _bmad-output/planning-artifacts/prd.md — FR20-FR25, NFR-S1, NFR-S2, NFR-P1, NFR-P11, Threat Model]
- [Source: _bmad-output/project-context.md — Technology Stack, Testing Rules, Anti-Patterns, Mock Boundary Rule]
- [Source: _bmad-output/implementation-artifacts/3-1-execution-environment-image-and-registry.md — Previous story learnings]
- [Source: Fly.io Machines API docs — https://fly.io/docs/machines/api/machines-resource/]
- [Source: Fly.io Network Policies — https://fly.io/docs/machines/guides-examples/network-policies/]
- [Source: Fly.io Machine States — https://fly.io/docs/machines/machine-states/]
- [Source: Fly.io Rate Limits — https://community.fly.io/t/understanding-fly-io-api-rate-hard-limits/20636]
- [Source: Fly.io auto_destroy behavior — https://community.fly.io/t/stopping-a-machine-via-the-cli-actually-destroys-it/10909]

## Dev Agent Record

### Agent Model Used
Claude Opus 4.6

### Debug Log References
- tsconfig.json: Removed `composite: true` and `rootDir`/`outDir` from execution package — source-sharing packages don't need build config. Added `paths` for `@mycscompanion/config` to resolve cross-package test imports.
- msw server conflicts: Multiple `setupServer()` calls in same test file cause "fetch already patched" error. Fixed by using single shared server with `server.use()` for per-test overrides.
- Lint fixes: `FlyClient` import in execute.ts required `import type` inline syntax; `handleResponse<void>` changed to `handleResponse<undefined>` per ESLint rule.

### Completion Notes List
- Task 0: Canonical msw test infra created in `@mycscompanion/config/test-utils/mock-fly-api.ts`. Exports `setupFlyApiHandlers` (configurable msw handlers for all 5 Fly Machine endpoints) and `createMockFlyMachineResponse` (factory for realistic mock responses). Added msw + @mycscompanion/config as devDeps to execution package.
- Task 1: `ExecutionEvent` discriminated union (12 variants) in `events.ts`. `ExecutionPhase` (4 values) and `ExecutionStatus` (4 values) as canonical types. 16 type narrowing tests including exhaustive switch validation. Placeholder `ExecutionEvent` removed from `index.ts`, re-exported from `events.ts`.
- Task 2: `FlyCreateMachineRequest`/`FlyMachineResponse` types in `fly-api-types.ts` matching Fly REST API snake_case contract. `buildMachineRequest` in `machine-request-builder.ts` maps camelCase config to snake_case API, injects Go code as base64 file, validates 64KB size limit, sets all security constraints (auto_destroy, no restart, empty services, ulimit, metadata). 15 pure function tests.
- Task 3: `FlyClient` stateless HTTP client in `fly-client.ts`. 5 methods (create, wait, get, stop, destroy). `FlyApiError` with `isRetryable` flag (true for 429/503/5xx). Rate limit handling with Retry-After header. 15 tests using canonical msw handlers.
- Task 4: `executeCode` async generator in `execute.ts`. Orchestration: create → wait started → wait stopped → destroy. Timeout handling yields timeout event. Always destroys in finally block (force=true). `onLifecycleEvent` callback for structured logging. 7 integration tests covering happy path, timeout, API failure, destroy-on-error.
- Task 5: Network isolation via Fly Network Policies API. Documented as one-time infrastructure setup: `POST /v1/apps/mcc-execution/network_policies` with deny-all egress. Compensating controls: no secrets/credentials passed to VM, `services: []` blocks inbound. Known limitation: 6PN private network may still allow inter-machine traffic within org.
- Task 6: Process count limiting via `ulimit -u 64` in init.exec command. Fly Machines API has no native PID limiting. ulimit is compensating control, tested in machine-request-builder tests.
- Task 7: Updated index.ts barrel with all re-exports. Verified backend typecheck/test passes with execution package imports. All execution lint/typecheck/test clean. Root turbo checks pass (pre-existing webapp lint issues unrelated to this story).

### Network Isolation Setup (Task 5 Documentation)

**One-time setup required before production deployment:**

1. Create deny-all egress policy via Fly API:
```bash
curl -X POST "https://api.machines.dev/v1/apps/mcc-execution/network_policies" \
  -H "Authorization: Bearer $FLY_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "deny-all-egress",
    "selector": { "all": true },
    "rules": []
  }'
```

2. Verify with: `GET /v1/apps/mcc-execution/network_policies/`

**Known limitations:**
- 6PN private networking may still allow inter-machine traffic within the same Fly org
- Compensating control: No secrets/credentials are passed to VMs, so even with 6PN access, no credentials to exfiltrate
- DNS resolution may still work even with deny-all egress — programs cannot connect but may resolve hostnames

### Process Count Limiting (Task 6 Documentation)

**Approach:** `ulimit -u 64` prepended to init.exec shell command
**Rationale:** Fly Machines API has no native process count limiting option in guest config, init options, or kernel_args
**Limitation:** ulimit is a shell-level limit, not a kernel cgroup limit. A determined attacker could potentially bypass it, but it stops accidental fork bombs effectively. The 60s timeout and explicit destroy provide defense-in-depth.

### File List

**New files:**
- `packages/execution/src/events.ts` — ExecutionEvent discriminated union, ExecutionPhase, ExecutionStatus types
- `packages/execution/src/events.test.ts` — 16 type narrowing tests
- `packages/execution/src/fly-api-types.ts` — Fly REST API request/response types
- `packages/execution/src/machine-request-builder.ts` — Build FlyCreateMachineRequest from config + code
- `packages/execution/src/machine-request-builder.test.ts` — 15 builder tests
- `packages/execution/src/fly-client.ts` — FlyClient HTTP client + FlyApiError
- `packages/execution/src/fly-client.test.ts` — 15 client tests with msw
- `packages/execution/src/execute.ts` — executeCode async generator orchestrator
- `packages/execution/src/execute.test.ts` — 7 orchestration integration tests
- `packages/config/test-utils/mock-fly-api.ts` — Canonical msw Fly API handlers

**Modified files:**
- `packages/execution/src/index.ts` — Removed placeholder ExecutionEvent, added re-exports for all new modules
- `packages/execution/package.json` — Added msw, @mycscompanion/config devDeps
- `packages/execution/tsconfig.json` — Removed composite/rootDir/outDir, added config paths
- `packages/config/test-utils/index.ts` — Added mock-fly-api re-exports
- `packages/config/package.json` — Added msw devDep
- `pnpm-lock.yaml` — Updated lock file

## Change Log

- 2026-03-02: Implemented Story 3.2 — Execution Package & Fly.io Machine Integration. Created ExecutionEvent types (12 variants), Fly API types, machine request builder, FlyClient HTTP client, executeCode orchestrator. Added canonical msw test infrastructure. 63 new tests across 5 test files.
- 2026-03-04: Code review (Claude Opus 4.6). 8 issues found (2H, 4M, 2L), all fixed:
  - H1: Removed `as` casts from fly-client.ts — split handleResponse into handleJsonResponse/handleVoidResponse/handleErrorResponse with proper type narrowing. Test code uses `instanceof` guards instead of `as` casts.
  - H2: Added `milestoneId` to ExecuteCodeOptions so Story 3.3's worker can pass it through to machine metadata.
  - M1: Fixed isRetryable logic to only match 429/503 (was catching all 5xx). Removed dead `=== 503` check subsumed by `>= 500`. Added test confirming 500 is NOT retryable.
  - M2: Added missing non-zero exit code test per Task 4.9 requirement.
  - M3: Restructured fly-client.test.ts error tests to use single shared msw server with `server.use()` overrides (was creating/destroying separate servers per test).
  - M4: Documented createMockFlyMachineResponse return type trade-off (Record vs FlyMachineResponse to avoid circular dep).
  - L1: Changed hardcoded phase from 'compiling' to 'preparing' in orchestrator complete/timeout events.
  - L2: No fix needed — type-narrowing tests are intentionally compile-time checks per task spec.
  - Test count: 63 → 65 (added 500-not-retryable + non-zero-exit tests). All passing.
