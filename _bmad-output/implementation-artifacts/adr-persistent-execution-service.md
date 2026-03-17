# ADR: Persistent Execution Service (Replaces Ephemeral Fly Machines)

Status: proposed
Date: 2026-03-17
Author: Winston (Architect Agent)
Supersedes: Story 3.1, 3.2, 3.3 execution approach (ephemeral Fly Machines)

## Context & Problem Statement

The current execution architecture creates a new Fly.io Firecracker VM per code submission via the Machines REST API. This approach has two critical production failures:

1. **~2 minute cold starts.** Each submission triggers a full VM provisioning cycle: create machine → wait for started → compile → run → wait for stopped → fetch logs → destroy. The Fly Machine cold start alone takes 30-90 seconds before user code even begins compiling.

2. **Stdout capture is broken.** The Fly Machines API has no per-machine logs endpoint (returns 404). The platform logs API at `api.fly.io` requires a personal/org access token — Machines API tokens return 401. Even with the correct token, the streaming NDJSON endpoint is unreliable for ephemeral machines that have already stopped. Multiple fix attempts (concurrent streaming, sequential fetch, dual-endpoint fallback) all resulted in `logLineCount: 0`.

These are not fixable within the ephemeral machine model. The architecture must change.

### Current Flow (5+ API calls per submission)

```
Backend Worker                           Fly Machines API
    │                                         │
    ├── POST /machines (create)          ────→ │  VM provisioning (~30-90s)
    ├── GET  /machines/{id}/wait?started ────→ │
    ├── GET  /machines/{id}/wait?stopped ────→ │  Compile + run (~2-5s)
    ├── GET  api.fly.io/logs?instance=   ────→ │  ✗ 401 / 0 messages
    ├── GET  /machines/{id} (exit code)  ────→ │
    └── DELETE /machines/{id}            ────→ │
```

**Total latency:** ~2 minutes. **Output captured:** 0 bytes.

## Decision

**Replace ephemeral Fly Machines with a persistent Go HTTP execution service deployed as an always-on Fly app.**

The execution service accepts code via HTTP POST and returns stdout/stderr directly in the HTTP response body. No VM provisioning, no log fetching, no streaming NDJSON parsing.

### Proposed Flow (1 HTTP call per submission)

```
Backend Worker                         Execution Service (Fly - always on)
    │                                         │
    └── POST /execute { code, args }   ────→  │  Write tmpdir → go build → ./main
        ← { stdout, stderr, exit_code } ────  │  Return response (~2-5s)
```

**Total latency:** 2-5 seconds. **Output captured:** directly in HTTP response.

## Architecture

### Execution Service (Go HTTP Server)

A minimal Go HTTP server running as a persistent Fly app. It:

1. Receives a JSON request with base64-encoded Go code
2. Creates an isolated temporary workspace per request
3. Writes `main.go` and `go.mod` to the workspace
4. Runs `go build` with a timeout (captures stderr for compilation errors)
5. If build succeeds, runs the binary with args and a timeout (captures stdout+stderr)
6. Returns a structured JSON response with all output
7. Cleans up the temporary workspace

```
POST /execute
Authorization: Bearer <shared-secret>
Content-Type: application/json

Request:
{
  "code": "<base64-encoded Go source>",
  "args": ["test"],
  "timeout_seconds": 30
}

Response (200 OK — always 200, exit_code conveys success/failure):
{
  "stdout": "PASS: put-and-get\nPASS: get-missing-key\n...",
  "stderr": "",
  "exit_code": 0,
  "duration_ms": 1847,
  "build_duration_ms": 923,
  "run_duration_ms": 924
}

Response (compilation failure — still 200):
{
  "stdout": "",
  "stderr": "./main.go:12:5: undefined: foo",
  "exit_code": 2,
  "duration_ms": 456,
  "build_duration_ms": 456,
  "run_duration_ms": 0
}
```

### Subprocess Sandboxing

Each request executes user code as an isolated subprocess:

| Concern | Mechanism | Notes |
|---|---|---|
| Process limit | `ulimit -u 256` | Fork bomb prevention (same as current) |
| CPU timeout | `context.WithTimeout` | Kills subprocess tree after N seconds |
| Memory | Machine-level limits | Fly guest config enforces ceiling |
| Filesystem | Isolated tmpdir per request | `os.MkdirTemp`, cleaned up in `defer` |
| Concurrent isolation | Separate tmpdir per goroutine | No cross-request filesystem leakage |
| User | Non-root `runner` user | Same as current Dockerfile |
| Network | Not restricted at subprocess level | Acceptable for learning platform — revisit with `unshare --net` if needed |

### Fly App Configuration

```toml
# infra/fly-execution/fly.toml
app = "mcc-execution"
primary_region = "sin"

[build]
  dockerfile = "Dockerfile"

[http_service]
  internal_port = 8080
  force_https = true
  auto_stop_machines = "off"
  auto_start_machines = true
  min_machines_running = 1

[[vm]]
  cpu_kind = "shared"
  cpus = 4
  memory_mb = 1024
```

Key settings:
- `auto_stop_machines = "off"` — always warm, no cold starts
- `min_machines_running = 1` — at least one machine always available
- `auto_start_machines = true` — scale up if needed
- No public routing needed if using Fly private networking (`.internal` DNS). Alternatively, use `force_https = true` with a shared secret for auth.

### Dockerfile Changes

The existing Dockerfile needs minimal changes — add the Go HTTP server binary:

```dockerfile
# Stage 1: Build the execution server
FROM golang:1.23-alpine AS builder
WORKDIR /build
COPY server/ .
RUN go build -o /execution-server .

# Stage 2: Runtime image (same base as current)
FROM golang:1.23-alpine

RUN apk --no-cache upgrade \
 && rm -f /usr/bin/wget \
 && rm -rf /var/cache/apk/* /usr/share/doc /usr/share/man /tmp/*

RUN ! command -v curl && ! command -v wget && ! command -v git && ! command -v ssh

RUN adduser -D -h /home/runner runner
RUN mkdir -p /workspace && chown runner:runner /workspace

COPY --from=builder /execution-server /usr/local/bin/execution-server

WORKDIR /workspace
USER runner

EXPOSE 8080
CMD ["execution-server"]
```

The Go toolchain remains in the final image (needed for compiling user code). The execution server binary is added via multi-stage build.

### Go Execution Server Source

New directory: `infra/fly-execution/server/`

```
infra/fly-execution/server/
├── main.go          # HTTP server, /execute handler, /health handler
├── executor.go      # Subprocess management, tmpdir lifecycle, timeout
├── go.mod
└── go.sum
```

The server is intentionally simple — under 300 lines of Go. No framework, just `net/http`.

### Authentication

The execution service uses a shared secret for authentication:

- Backend sets `Authorization: Bearer <secret>` on requests
- Execution service validates the token on every request
- Secret stored as `MCC_EXECUTION_SECRET` in both Railway (backend) and Fly (execution service)
- Replaces: `MCC_FLY_API_TOKEN`, `MCC_FLY_LOGS_TOKEN` (both removed)

If using Fly private networking (`.internal` DNS from a Fly-deployed backend), auth can be simplified. Since the backend is on Railway, we need the shared secret approach over public HTTPS.

## Backend Changes

### Execution Processor (Simplified)

The execution processor loses ~70% of its code. The entire Fly Machine lifecycle, log fetching, NDJSON parsing, and output analysis is replaced by a single HTTP call.

**Before (execution-processor.ts — ~560 lines):**
```
buildMachineRequest → createMachine → waitForState('started')
→ waitForState('stopped') → fetchMachineLogs (broken)
→ getMachine (exit code) → analyzeOutput → destroyMachine
```

**After (~150 lines):**
```
POST /execute → parse JSON response → done
```

The processor retains:
- BullMQ job handling and retry logic
- SSE event publishing (output, compile_error, complete, error, timeout)
- Criteria evaluation against stdout
- Benchmark phase (when implemented)
- Database updates

The processor loses:
- `fetchMachineLogs` / `readNdjsonMessages` / `startLogStream`
- `analyzeOutput` (server returns structured exit_code + stderr)
- `truncateOutput` (server handles output limits)
- All Fly Machine lifecycle code (create, wait, destroy)
- `isLogEntryWithMessage` NDJSON parsing

### packages/execution Changes

| File | Action |
|---|---|
| `fly-client.ts` | Remove or keep for future Fly operations |
| `fly-api-types.ts` | Remove (no longer calling Machines API) |
| `machine-request-builder.ts` | Remove (code sent as JSON, not injected via files) |
| `fly-config.ts` | Simplify — just `executionServiceUrl` and timeout |
| `execute.ts` | Rewrite — single HTTP POST instead of async generator |
| `events.ts` | Keep unchanged (SSE events to frontend are the same) |
| `benchmark-runner.ts` | Keep unchanged (parses benchmark output same way) |
| `index.ts` | Update exports |

**New file: `execution-service-client.ts`**

```typescript
export interface ExecuteRequest {
  readonly code: string      // base64-encoded Go source
  readonly args: string[]    // e.g. ["test"]
  readonly timeoutSeconds: number
}

export interface ExecuteResponse {
  readonly stdout: string
  readonly stderr: string
  readonly exitCode: number
  readonly durationMs: number
  readonly buildDurationMs: number
  readonly runDurationMs: number
}

export class ExecutionServiceClient {
  constructor(
    private readonly baseUrl: string,
    private readonly secret: string,
  ) {}

  async execute(request: ExecuteRequest): Promise<ExecuteResponse> {
    const response = await fetch(`${this.baseUrl}/execute`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.secret}`,
      },
      body: JSON.stringify({
        code: request.code,
        args: request.args,
        timeout_seconds: request.timeoutSeconds,
      }),
    })

    if (!response.ok) {
      throw new Error(`Execution service error: ${response.status}`)
    }

    return await response.json() as ExecuteResponse
  }
}
```

### Environment Variable Changes

| Variable | Action | Notes |
|---|---|---|
| `MCC_FLY_API_TOKEN` | Remove | No longer calling Machines API |
| `MCC_FLY_LOGS_TOKEN` | Remove | No log fetching |
| `MCC_FLY_APP_NAME` | Remove | No machine creation |
| `MCC_EXECUTION_URL` | Add | URL of persistent execution service |
| `MCC_EXECUTION_SECRET` | Add | Shared secret for auth |

## What Does NOT Change

- **Frontend** — zero changes. SSE events are identical.
- **BullMQ queue** — same job data, same retry logic, same concurrency.
- **SSE streaming** — same event publisher, same stream route.
- **Criteria evaluation** — evaluates against `stdout` from HTTP response instead of log messages. Same logic.
- **Database schema** — `submissions` table unchanged. `execution_result` JSON shape unchanged.
- **Acceptance criteria YAML** — unchanged.
- **GitHub Actions** — execution image workflow updated to build the new image (same registry).

## Implementation Plan

### Phase 1: Build Go Execution Server

1. Create `infra/fly-execution/server/` with Go HTTP server
2. Implement `/execute` endpoint with subprocess sandboxing
3. Implement `/health` endpoint for Fly health checks
4. Add shared-secret authentication middleware
5. Update `infra/fly-execution/Dockerfile` for multi-stage build
6. Test locally with Docker

### Phase 2: Create ExecutionServiceClient

1. Add `execution-service-client.ts` to `packages/execution/`
2. Update `fly-config.ts` with execution service config
3. Update exports in `index.ts`

### Phase 3: Rewrite Execution Processor

1. Replace Fly Machine lifecycle with single HTTP POST
2. Map `ExecuteResponse` fields to existing `ExecutionResult` shape
3. Remove log fetching, NDJSON parsing, machine lifecycle code
4. Keep criteria evaluation, SSE publishing, benchmark phase
5. Update worker.ts env vars

### Phase 4: Deploy & Cutover

1. Deploy Go execution service to Fly (`fly deploy`)
2. Set `MCC_EXECUTION_URL` and `MCC_EXECUTION_SECRET` on Railway
3. Deploy updated backend worker
4. Remove old env vars (`MCC_FLY_API_TOKEN`, `MCC_FLY_LOGS_TOKEN`, `MCC_FLY_APP_NAME`)
5. Verify end-to-end: submit code → criteria pass → output displayed

### Phase 5: Cleanup

1. Remove dead code: `fly-client.ts`, `fly-api-types.ts`, `machine-request-builder.ts`
2. Remove old tests for Fly Machine lifecycle
3. Update architecture.md and project-context.md
4. Update deployment docs

## Trade-offs

### Gained
- **~60x faster** (2-5s vs ~2min)
- **Reliable output capture** (HTTP response vs broken log fetching)
- **Simpler code** (~150 lines vs ~560 lines in processor)
- **Fewer moving parts** (1 HTTP call vs 5+ API calls)
- **No token scoping issues** (shared secret vs Machines API + platform logs tokens)
- **Lower Fly costs** (1 always-on machine vs per-submission machine creation)

### Lost
- **VM-level isolation** → process-level isolation. Each submission no longer gets its own Firecracker VM. Mitigated by: ulimit, timeout, tmpdir isolation, non-root user. Acceptable for a learning platform where the threat model is accidental resource exhaustion, not adversarial attacks.
- **Horizontal scaling** is different. Ephemeral machines scale to concurrency automatically. The persistent service needs Fly auto-scaling configured (or multiple machines). At current scale (10 concurrent submissions), a single machine with goroutine-per-request handles this easily.
- **Blast radius** — a crash in the execution server affects all in-flight requests. Mitigated by: Go's goroutine isolation, Fly auto-restart, and the BullMQ retry mechanism on the backend.

## Open Questions

1. **Fly private networking vs public HTTPS?** If the backend were on Fly, we could use `.internal` DNS and skip auth. Since the backend is on Railway, we need public HTTPS + shared secret. This is fine.
2. **Go module caching?** The execution server could pre-cache the Go standard library build cache to speed up compilation. Worth investigating if build times exceed 3 seconds.
3. **Concurrent request limits?** Should the execution server enforce a max concurrent executions limit (e.g., 10) to prevent resource exhaustion? Or let Fly's machine resources be the natural limit?
4. **Benchmark execution?** The benchmark phase is currently stubbed (`runBenchmarkOnMachine` returns empty string). The persistent service makes benchmarks easier — just another `/execute` call with reference code. This can be implemented as a follow-up.
