# Story 11.1: Go Execution Server & Dockerfile

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **developer**,
I want a persistent Go HTTP execution service that compiles and runs user Go code,
so that code submissions return output directly in the HTTP response without VM provisioning.

## Acceptance Criteria

1. **AC1: Go HTTP server structure** — A Go HTTP server exists in `infra/fly-execution/server/` with `main.go` (HTTP server, routing, auth middleware), `executor.go` (subprocess management, tmpdir lifecycle, timeout), `go.mod`, and `go.sum`.
2. **AC2: /execute endpoint** — `POST /execute` accepts JSON `{ code (base64), args (string[]), timeout_seconds (int) }` and returns `{ stdout, stderr, exit_code, duration_ms, build_duration_ms, run_duration_ms }` with HTTP 200 always (exit_code conveys success/failure: 0 = success, 2 = compilation failure, non-zero = runtime failure).
3. **AC3: Isolated workspace lifecycle** — Each request creates an isolated temporary workspace via `os.MkdirTemp`, writes `main.go` (base64-decoded) and `go.mod` (with `module workspace` and `go 1.23` — matching existing backend convention), runs `go build` then the binary, and cleans up via `defer os.RemoveAll` (runs even on panic).
4. **AC4: /health endpoint** — `GET /health` returns 200 OK for Fly.io health checks.
5. **AC5: Bearer token authentication** — Every `/execute` request requires `Authorization: Bearer <MCC_EXECUTION_SECRET>`. Missing or wrong token returns 401. `/health` is unauthenticated.
6. **AC6: Concurrency semaphore** — A semaphore (buffered channel) caps concurrent executions (default 10) to prevent CPU/memory exhaustion. Requests exceeding the limit receive 503 Service Unavailable immediately (non-blocking `select`/`default` pattern — never block waiting for a slot).
7. **AC6a: Code size validation** — Server validates base64-decoded code size does not exceed 64KB (`MAX_CODE_SIZE_BYTES = 64 * 1024`) before writing to disk. Returns 400 with `{ "error": "code too large" }` if exceeded. Matches existing backend limit in `machine-request-builder.ts`.
8. **AC6b: Output size limits** — Server truncates stdout and stderr independently to 1MB (`MAX_OUTPUT_BYTES = 1 * 1024 * 1024`). If truncated, appends `\n[output truncated]` to the truncated field. Prevents OOM from runaway print loops.
9. **AC7: Subprocess isolation** — Fork bomb prevention via `sh -c "ulimit -u 256 && <cmd>"` wrapper (ulimit is a shell builtin — cannot be set via Go `SysProcAttr` alone), `context.WithTimeout` (kills subprocess tree after N seconds), isolated tmpdir per request, non-root `runner` user in Docker.
10. **AC8: Multi-stage Dockerfile** — `infra/fly-execution/Dockerfile` uses multi-stage build: Stage 1 builds the Go server binary from `server/`, Stage 2 is runtime image with Go toolchain (needed for compiling user code) + server binary + `runner` user.
11. **AC9: Go build cache pre-warming** — At image build time (Dockerfile `RUN` instruction), compile a hello-world program importing common stdlib packages (`fmt`, `os`, `strings`, `strconv`, `sync`, `io`, `bufio`, `encoding/json`) to bake the Go build cache into the image layer.
12. **AC10: Local Docker testing** — `docker build -t mcc-execution . && docker run -p 8080:8080 -e MCC_EXECUTION_SECRET=test mcc-execution` works, and curl tests against `/health` and `/execute` succeed.
13. **AC11: Go tests** — Unit and integration tests using `net/http/httptest` cover: successful compilation + execution, compilation errors (invalid Go returns stderr), timeout handling (infinite loop terminates correctly), concurrent request isolation, semaphore exhaustion (503 response), authentication rejection (missing/wrong token), `/health` returns 200, code size limit rejection (400), output truncation (stdout exceeding 1MB is truncated).
14. **AC12: Structured logging** — Log each `/execute` request using `log/slog` (structured JSON): duration_ms, exit_code, code_size_bytes, request_id. NEVER log user code content or stdout/stderr (privacy rule from project-context.md). Log at `info` level for successful requests, `warn` for timeouts, `error` for server-side failures.
15. **AC13: Graceful shutdown** — Server listens for `SIGTERM`/`SIGINT` via `signal.NotifyContext`, stops accepting new requests, waits for in-flight executions to complete (up to 30s drain timeout), then exits. Required for Fly.io deployments which send SIGTERM before killing.

## Tasks / Subtasks

- [x] Task 1: Create Go module and server skeleton (AC: #1)
  - [x] 1.1 Create `infra/fly-execution/server/` directory
  - [x] 1.2 Initialize `go.mod` with `module mcc-execution` and Go 1.23
  - [x] 1.3 Create `main.go` with HTTP server setup, routing, `log/slog` JSON logger
  - [x] 1.4 Read `MCC_EXECUTION_SECRET` and `MCC_MAX_CONCURRENT` (default 10) from environment
  - [x] 1.5 Wire routes: `POST /execute` → executeHandler, `GET /health` → healthHandler
  - [x] 1.6 Implement graceful shutdown: `signal.NotifyContext` for SIGTERM/SIGINT, `server.Shutdown(ctx)` with 30s drain timeout

- [x] Task 2: Implement authentication middleware (AC: #5)
  - [x] 2.1 Create auth middleware that extracts `Authorization: Bearer <token>` header
  - [x] 2.2 Compare against `MCC_EXECUTION_SECRET` env var using `subtle.ConstantTimeCompare`
  - [x] 2.3 Return 401 JSON `{ "error": "unauthorized" }` on failure
  - [x] 2.4 Apply to `/execute` only — `/health` is unauthenticated

- [x] Task 3: Implement executor (AC: #2, #3, #7, #6a, #6b)
  - [x] 3.1 Create `executor.go` with `Execute(ctx context.Context, req ExecuteRequest) ExecuteResponse` function
  - [x] 3.2 Define constants: `MAX_CODE_SIZE_BYTES = 64 * 1024`, `MAX_OUTPUT_BYTES = 1 * 1024 * 1024`
  - [x] 3.3 Validate decoded code size against `MAX_CODE_SIZE_BYTES` before writing to disk
  - [x] 3.4 Create tmpdir via `os.MkdirTemp("", "mcc-exec-*")` with `defer os.RemoveAll`
  - [x] 3.5 Base64-decode `code` field and write to `<tmpdir>/main.go`
  - [x] 3.6 Write `go.mod` with `module workspace` and `go 1.23` to tmpdir (matches existing `machine-request-builder.ts` convention)
  - [x] 3.7 Run build via `sh -c "ulimit -u 256 && go build -o main ."` in tmpdir with `context.WithTimeout` — capture stderr for compilation errors. ulimit is a shell builtin and MUST be invoked via sh wrapper, not directly.
  - [x] 3.8 If build succeeds, run via `sh -c "ulimit -u 256 && ./main <args...>"` in tmpdir with `context.WithTimeout` — capture stdout + stderr
  - [x] 3.9 Set process attributes: `Setpgid: true` for kill-group, subprocess kills via `syscall.Kill(-pid, syscall.SIGKILL)` on context cancel
  - [x] 3.10 Truncate stdout and stderr independently to `MAX_OUTPUT_BYTES`. If truncated, append `\n[output truncated]`
  - [x] 3.11 Return `ExecuteResponse` with stdout, stderr, exit_code, timing breakdowns
  - [x] 3.12 Exit code mapping: 0 = success, 2 = compilation failure (set explicitly), non-zero passthrough for runtime failures
  - [x] 3.13 Log each execution via `slog.Info`/`slog.Warn`: duration_ms, exit_code, code_size_bytes. NEVER log code content or stdout/stderr.

- [x] Task 4: Implement concurrency semaphore (AC: #6)
  - [x] 4.1 Create buffered channel `sem := make(chan struct{}, maxConcurrent)` in main
  - [x] 4.2 In `/execute` handler: non-blocking acquire via `select { case sem <- struct{}{}: /* acquired */ default: /* return 503 */ }`. NEVER use blocking send — it would hang the goroutine instead of returning 503.
  - [x] 4.3 `defer func() { <-sem }()` to release slot after execution

- [x] Task 5: Implement /health endpoint (AC: #4)
  - [x] 5.1 Return `200 OK` with `{ "status": "ok" }` JSON

- [x] Task 6: Update Dockerfile to multi-stage build (AC: #8, #9)
  - [x] 6.1 Stage 1 (`builder`): `FROM golang:1.23-alpine`, copy `server/`, `go build -o /execution-server .`
  - [x] 6.2 Stage 2 (runtime): `FROM golang:1.23-alpine` (Go toolchain needed for user code compilation)
  - [x] 6.3 Keep existing security hardening: remove wget, verify no curl/git/ssh, create `runner` user
  - [x] 6.4 `COPY --from=builder /execution-server /usr/local/bin/execution-server`
  - [x] 6.5 Create workspace dir, set runner user, expose 8080
  - [x] 6.6 `CMD ["execution-server"]`
  - [x] 6.7 Add cache warm script: `RUN echo 'package main; import (_ "fmt"; _ "os"; _ "strings"; _ "strconv"; _ "sync"; _ "io"; _ "bufio"; _ "encoding/json"); func main(){}' > /tmp/warm.go && cd /tmp && go build -o /dev/null warm.go && rm warm.go`

- [x] Task 7: Write Go tests (AC: #11)
  - [x] 7.1 Create `infra/fly-execution/server/executor_test.go`
  - [x] 7.2 Test: successful compilation and execution (hello world → stdout captured)
  - [x] 7.3 Test: compilation error (invalid Go → stderr contains error, exit_code = 2)
  - [x] 7.4 Test: runtime timeout (time.Sleep(60s) with 3s timeout → context cancelled, exit_code non-zero)
  - [x] 7.5 Test: concurrent request isolation (two parallel requests with different code don't leak output)
  - [x] 7.6 Test: code size limit rejection (>64KB code → error before writing to disk)
  - [x] 7.7 Test: output truncation (program printing >1MB → stdout truncated with `[output truncated]` suffix)
  - [x] 7.8 Create `infra/fly-execution/server/server_test.go`
  - [x] 7.9 Test: authentication rejection (missing token → 401, wrong token → 401)
  - [x] 7.10 Test: valid authentication → 200 response
  - [x] 7.11 Test: /health returns 200 without auth
  - [x] 7.12 Test: semaphore exhaustion (fill semaphore → next request gets 503)

- [x] Task 8: Local Docker validation (AC: #10)
  - [x] 8.1 Build image: `docker build -t mcc-execution -f Dockerfile .`
  - [x] 8.2 Run container: `docker run -p 8080:8080 -e MCC_EXECUTION_SECRET=test mcc-execution`
  - [x] 8.3 Verify `/health` returns 200
  - [x] 8.4 Verify `/execute` with valid Go code returns stdout
  - [x] 8.5 Verify `/execute` with invalid Go code returns stderr + exit_code 2
  - [x] 8.6 Verify `/execute` without auth returns 401

## Dev Notes

### Architecture Context

This story is Phase 1 of Epic 11 — the architecture pivot from ephemeral Fly Machines to a persistent execution service. The motivation is two critical production failures:
1. **~2 minute cold starts** per submission (Fly Machine provisioning: 30-90s before code compiles)
2. **Stdout capture completely broken** (Fly Machines API returns 404 for per-machine logs; platform logs API returns 401 with Machines API tokens)

The ADR is at `_bmad-output/implementation-artifacts/adr-persistent-execution-service.md`.

### Critical Design Decisions

- **HTTP 200 always** — exit_code conveys success/failure, not HTTP status. This prevents HTTP-level error handling from interfering with user-code error reporting. Only platform errors (auth failure, service busy) use non-200 status codes.
- **Go build cache pre-warming** — Without this, the first compilation after container start takes significantly longer. Pre-compile common stdlib packages at image build time.
- **Semaphore not request queue** — When the semaphore is full, return 503 immediately. BullMQ on the backend handles retry/backoff. Do NOT queue requests in the execution service itself.
- **No framework** — Pure `net/http`. The server is intentionally simple (~300 lines). No gorilla/mux, no gin, no fiber.
- **Process group kill** — Use `Setpgid: true` on subprocess and `syscall.Kill(-pid, syscall.SIGKILL)` to kill the entire process tree on timeout, not just the parent process.
- **ulimit via sh wrapper** — `ulimit -u 256` is a shell builtin. It cannot be set via Go `SysProcAttr` or `syscall.Setrlimit` portably. The existing codebase uses `sh -c "ulimit -u 256 && <cmd>"` (see `machine-request-builder.ts:72`). The Go executor MUST use the same pattern.
- **Output truncation** — Cap stdout and stderr independently at 1MB. The existing `truncateOutput` function in the backend is removed in Story 11.2 because the Go server handles it. Without this limit, a `for { fmt.Println("x") }` loop would OOM the server or produce a multi-GB HTTP response.
- **Code size validation** — Enforce 64KB limit matching `MAX_CODE_SIZE_BYTES` in `machine-request-builder.ts`. Defense in depth — the backend validates too, but the server must not trust input.
- **Structured logging** — Use `log/slog` with JSON handler (matches backend's pino JSON logging). Log request metadata only — NEVER log user code content or stdout/stderr (project-context.md privacy rule).

### Existing Code That Changes

| File | Change |
|---|---|
| `infra/fly-execution/Dockerfile` | Rewrite from single-stage to multi-stage build |
| `infra/fly-execution/server/` | **New directory** — all Go server code |

The existing Dockerfile is a single-stage image that only provides the Go toolchain for ephemeral machine code injection. The new Dockerfile adds the server binary via multi-stage build while keeping the same security hardening (no network utils, runner user).

Note: `fly.toml` changes are documented in dev notes for reference but the actual deployment configuration change belongs to Story 11.3.

### What This Story Does NOT Touch

- **No backend TypeScript changes** — Story 11.2 handles the execution processor rewrite
- **No deployment** — Story 11.3 handles Fly deployment and Railway env vars
- **No CI/CD** — Story 11.4 handles the GitHub Actions workflow
- The Go server is tested locally with Docker only in this story

### fly.toml Changes (for reference — deployment is Story 11.3)

The `fly.toml` needs these additions for the persistent service model:
```toml
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
Region changes from `ord` to `sin` (Singapore — matching current Fly config in `fly-config.ts`).

### Go Module Structure

```
infra/fly-execution/server/
├── main.go              # HTTP server, routing, auth middleware, slog setup, graceful shutdown (signal.NotifyContext)
├── executor.go          # Execute function: tmpdir lifecycle, sh -c ulimit wrapper, subprocess timeout, output truncation
├── executor_test.go     # Tests for executor logic (real subprocess execution, no mocks)
├── server_test.go       # Tests for HTTP handlers, auth, semaphore, via net/http/httptest
├── go.mod               # module mcc-execution, go 1.23
└── go.sum
```

### Request/Response Contract

**Request (POST /execute):**
```json
{
  "code": "<base64-encoded Go source>",
  "args": ["test"],
  "timeout_seconds": 30
}
```

**Response (always 200 OK):**
```json
{
  "stdout": "PASS: put-and-get\nPASS: get-missing-key\n",
  "stderr": "",
  "exit_code": 0,
  "duration_ms": 1847,
  "build_duration_ms": 923,
  "run_duration_ms": 924
}
```

**Response (compilation failure — still 200):**
```json
{
  "stdout": "",
  "stderr": "./main.go:12:5: undefined: foo",
  "exit_code": 2,
  "duration_ms": 456,
  "build_duration_ms": 456,
  "run_duration_ms": 0
}
```

### Subprocess Isolation Summary

| Concern | Mechanism | Notes |
|---|---|---|
| Process limit | `sh -c "ulimit -u 256 && <cmd>"` | Fork bomb prevention — shell builtin, must wrap each subprocess |
| CPU timeout | `context.WithTimeout` + process group kill | Kills entire process tree |
| Memory | Machine-level limits | Fly guest config: 1024MB |
| Filesystem | Isolated tmpdir per request | `os.MkdirTemp`, `defer os.RemoveAll` |
| Concurrent isolation | Separate tmpdir per goroutine | No cross-request filesystem leakage |
| User | Non-root `runner` user | Set in Dockerfile |
| Network | Not restricted at subprocess level | Acceptable for learning platform |

### Testing Approach

- **Unit tests** in `executor_test.go`: test the `Execute` function directly with real subprocess execution. These are integration-style but fast (Go compiles quickly).
- **HTTP tests** in `server_test.go`: use `net/http/httptest` to test the full HTTP layer (routing, auth, semaphore, JSON serialization).
- **No mocking of subprocess execution** — tests compile and run real Go code. This is the mock boundary rule: only mock what you don't own.
- **Timeout test**: Use a Go program with `select {}` (infinite block) and a short timeout (2s) to verify timeout kills the subprocess.
- **Concurrent isolation test**: Run two requests in parallel with different code, verify outputs don't leak.
- **Output truncation test**: Use a Go program that prints >1MB to stdout, verify response stdout ends with `\n[output truncated]` and is capped at ~1MB.
- **Code size test**: Send >64KB base64-encoded code, verify 400 response before any disk writes.

### Recent Git Context

Last 5 commits are all failed attempts to fix stdout capture with the ephemeral machine model:
- `c92bcd6` Add MCC_FLY_LOGS_TOKEN for platform logs API authentication
- `8042169` Add comprehensive log fetch debugging: try both endpoints, log all errors
- `d6a2908` Fix connection pool contention: fetch logs sequentially via Machines API
- `c4c2ac7` Switch log fetching to Machines API endpoint (api.machines.dev)
- `11e95d7` Fix log capture race: stream logs concurrently with machine execution

All returned 0 bytes of output. This confirms the ephemeral machine approach is fundamentally broken for stdout capture and validates the architectural pivot.

### Project Structure Notes

- Go server lives in `infra/fly-execution/server/` — NOT in a pnpm workspace, NOT in `apps/` or `packages/`
- The Dockerfile build context is `infra/fly-execution/` — the `COPY server/ .` in Stage 1 copies relative to this context
- `content/milestones/01-kv-store/reference-impl/main.go` is an example of the kind of Go code users will submit — use similar patterns for test fixtures
- The Go module name is `mcc-execution` (not `mycscompanion` — this is a standalone Go service)

### References

- [Source: _bmad-output/implementation-artifacts/adr-persistent-execution-service.md] — Full ADR with architecture, Dockerfile, API contract, trade-offs
- [Source: _bmad-output/planning-artifacts/epics.md#Epic-11] — Epic objectives, all stories, acceptance criteria
- [Source: _bmad-output/project-context.md#Technology-Stack] — Go 1.23, Fly.io, env var naming (MCC_ prefix)
- [Source: infra/fly-execution/Dockerfile] — Current single-stage Dockerfile to be replaced
- [Source: infra/fly-execution/fly.toml] — Current fly.toml (no HTTP service) to be updated
- [Source: content/milestones/01-kv-store/reference-impl/main.go] — Example Go code that users submit (for test fixtures)

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6 (1M context)

### Debug Log References

- Timeout test: `select {}` causes deadlock panic on Go runtime (exits immediately). Changed to `time.Sleep(60s)` for reliable timeout testing.
- `ulimit -u 256` causes `sh: fork: Resource temporarily unavailable` on macOS. Added `MCC_DISABLE_ULIMIT` env var toggle — ulimit is only meaningful in Docker/Linux. Production Dockerfile does not set this var, so ulimit is always active in production.

### Completion Notes List

- ✅ Go HTTP server implemented in `infra/fly-execution/server/` with `main.go` (HTTP server, routing, auth, graceful shutdown) and `executor.go` (subprocess management, tmpdir lifecycle, timeout, output truncation)
- ✅ `POST /execute` accepts base64-encoded Go code, returns stdout/stderr/exit_code/timing — HTTP 200 always for execution results
- ✅ Isolated workspace per request via `os.MkdirTemp` + `defer os.RemoveAll`
- ✅ Bearer token auth via `subtle.ConstantTimeCompare`, 401 on failure
- ✅ Concurrency semaphore (buffered channel, default 10) with non-blocking 503 on exhaustion
- ✅ Code size validation (64KB limit) returns 400 before disk write
- ✅ Output truncation (1MB per stream) with `\n[output truncated]` suffix
- ✅ Subprocess isolation: `sh -c "ulimit -u 256 && <cmd>"` wrapper, `Setpgid: true`, process group kill on timeout
- ✅ Multi-stage Dockerfile: builder stage compiles server, runtime stage includes Go toolchain + server binary + security hardening + cache pre-warming
- ✅ Structured JSON logging via `log/slog` — logs duration_ms, exit_code, code_size_bytes. Never logs user code or output.
- ✅ Graceful shutdown via `signal.NotifyContext` with 30s drain timeout
- ✅ 13 tests (8 executor, 5 server) all passing: successful execution, compilation errors, timeout handling, concurrent isolation, code size limit, output truncation, auth rejection, health check, semaphore exhaustion
- ✅ Docker build + local curl validation successful for /health, /execute (valid code, invalid code, no auth)

### File List

- `infra/fly-execution/server/go.mod` (new)
- `infra/fly-execution/server/main.go` (new)
- `infra/fly-execution/server/executor.go` (new)
- `infra/fly-execution/server/executor_test.go` (new)
- `infra/fly-execution/server/server_test.go` (new)
- `infra/fly-execution/Dockerfile` (modified — rewritten from single-stage to multi-stage build)

## Change Log

- 2026-03-18: Story 11.1 implemented — Go execution server with all ACs satisfied, 13 tests passing, Docker build validated locally
- 2026-03-18: Code review — 6 issues fixed (3 HIGH, 3 MEDIUM): extracted NewHandler for test fidelity, fixed Dockerfile cache warm user mismatch, added timeout cap, unique request IDs, typed error codes, UTF-8-safe output truncation
