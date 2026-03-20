# Integration Architecture — mycscompanion

**Generated:** 2026-03-20 | **Scan Level:** Exhaustive

## Overview

mycscompanion is a monorepo with 9 parts that communicate via HTTP APIs, SSE streaming, Redis pub/sub, and BullMQ job queues. This document maps how all parts integrate.

## Part Dependency Graph

```
                    ┌──────────────────┐
                    │   apps/website   │  Pure static (Astro)
                    │   (landing page) │  Build-time content loading only
                    └──────────────────┘
                              │ reads content/ at build time
                              ▼
┌──────────────────────────────────────────────────────────────┐
│                      content/milestones/                      │
│  (Go code, YAML criteria, benchmark configs, tutor prompts)  │
└────────────────────────────┬─────────────────────────────────┘
                              │ loaded at runtime by
                              ▼
┌──────────────────┐   HTTP API    ┌──────────────────┐
│   apps/webapp    │◄─────────────►│   apps/backend   │
│   (React SPA)    │   + SSE       │   (Fastify API)  │
└──────────────────┘               └────────┬─────────┘
        │                                    │
        │ imports                    BullMQ  │  Redis pub/sub
        ▼                           jobs     │  events
┌──────────────────┐               ┌────────▼─────────┐
│   packages/ui    │               │  backend/worker   │
│   packages/shared│               │  (BullMQ worker)  │
│   packages/execution│            └────────┬─────────┘
└──────────────────┘                        │
                                    HTTP    │  execution calls
                                            ▼
                               ┌──────────────────┐
                               │ infra/fly-exec.  │
                               │ (Go server)      │
                               └──────────────────┘
```

## Integration Points

### 1. Webapp ↔ Backend API (HTTP + SSE)

**Protocol:** REST API over HTTPS + Server-Sent Events
**Auth:** Firebase Bearer token on every request
**Base URL:** `VITE_API_URL` (default: `http://localhost:3001`)

**Request flow:**
1. Webapp calls `apiFetch()` utility which attaches Firebase token
2. Token refresh on 401 → retry once → redirect to `/sign-in`
3. Responses use camelCase JSON (converted from snake_case DB)

**SSE Streams:**
| Endpoint | Direction | Purpose |
|---|---|---|
| `GET /api/execution/:id/stream` | Backend → Webapp | Compilation output, test results, benchmark progress |
| `POST /api/tutor/:sessionId/stream` | Backend → Webapp | AI tutor response streaming |
| `POST /api/tutor/:sessionId/stuck-intervention` | Backend → Webapp | Stuck detection auto-hint |

**SSE Reconnection:**
- `Last-Event-ID` header sent on reconnect
- Backend replays events from Redis list (TTL: 10 min)
- Client deduplicates by `sequenceId`
- Railway 5-minute SSE hard timeout → auto-reconnect via native `EventSource`

### 2. Backend API ↔ Worker (BullMQ + Redis)

**Protocol:** BullMQ job queue (Redis-backed)

**Job Queues:**

| Queue | Producer | Consumer | Concurrency |
|---|---|---|---|
| `execution-run` | API (submit route) | Worker (execution-processor) | 10 |
| `account-export` | API (export route) | Worker (export-processor) | 2 |

**Job Flow (execution-run):**
1. API creates submission row (status: queued)
2. API enqueues BullMQ job `{ submissionId, milestoneId, code/files }`
3. Worker picks up job, updates status to "running"
4. Worker calls Fly.io execution server
5. Worker publishes events via Redis pub/sub
6. API subscribes to events and streams to client via SSE
7. Worker updates submission row on completion/failure

**Event Communication (Redis):**
- **Pub/Sub channel:** `execution:{submissionId}` — live events
- **Event log list:** `execution:{submissionId}:log` — for SSE reconnect replay (TTL: 10 min)
- **Publisher:** `shared/event-publisher.ts` (worker writes)
- **Subscriber:** `execution/routes/stream.ts` (API reads)

### 3. Worker ↔ Fly.io Execution Server (HTTP)

**Protocol:** HTTP POST with Bearer token auth
**Client:** `ExecutionServiceClient` from `packages/execution`

**Request:**
```typescript
POST /execute
Authorization: Bearer <MCC_EXECUTION_SECRET>

{
  code?: string                    // base64-encoded Go source (M1)
  files?: Record<string, string>  // filename → base64 (M2+)
  args: string[]                   // CLI arguments
  timeoutSeconds: number           // 30s default, 60s max
}
```

**Response:**
```typescript
{
  stdout: string
  stderr: string
  exitCode: number
  durationMs: number
  buildDurationMs: number
  runDurationMs: number
  timedOut: boolean
}
```

**Execution isolation:**
- Each request runs in isolated tmpdir
- Go code compiled with `go build`, run with args
- Process group isolation for clean timeout kills
- `ulimit -u 256` for fork bomb prevention
- 128KB max code size, 1MB max output
- Concurrency limited by semaphore (default 10)

### 4. Backend ↔ Anthropic API (HTTP SDK)

**Protocol:** Anthropic TypeScript SDK (HTTPS)
**Client:** `@anthropic-ai/sdk` in `plugins/tutor/services/anthropic.ts`

**Model Routing:**

| Interaction | Model | Rationale |
|---|---|---|
| Default dialogue | claude-haiku-4-5-20251001 | Fast, cheap |
| Stuck intervention | claude-sonnet-4-6 | Deeper reasoning |
| Compile errors | claude-sonnet-4-6 | Code analysis |
| Explain patterns | claude-sonnet-4-6 | Deeper explanations |

**Context Assembly (`context-assembler.ts`):**
```
System prompt = [
  Tutor base prompt (content/prompts/tutor-base.md)
  + Milestone brief
  + Current code snapshot
  + Acceptance criteria status (met/not-met)
  + User background (role, experience, language)
  + Session summary (if returning user)
  + Available concept explainers
]
```

**Resilience:**
- Circuit breaker: 3 failures → OPEN (30s recovery → HALF_OPEN → test → CLOSED)
- TTFT timeout: 30s (configurable)
- Stream timeout: 120s (configurable)
- Graceful degradation: workspace works without tutor

### 5. Backend ↔ Firebase Auth (Admin SDK)

**Protocol:** Firebase Admin SDK (HTTPS)
**Init:** `plugins/auth/firebase.ts` — initializes with service account JSON
**Usage:** `auth.verifyIdToken(token)` on every API request (global onRequest hook)

### 6. Website ↔ Content (Build-time)

**Protocol:** Filesystem read at Astro build time
**File:** `apps/website/src/pages/index.astro`

Reads from `content/milestones/01-kv-store/`:
- `brief.md` — parsed as markdown
- `acceptance-criteria.yaml` — parsed for criteria list
- `starter-code/main.go` — displayed as code sample

### 7. Shared Packages (TypeScript Imports)

All packages under `packages/` are **internal packages** — consumed as TypeScript source directly. No build step required for consumers.

| Package | Consumed By | Key Exports |
|---|---|---|
| `@mycscompanion/shared` | backend, webapp, website | DB types, API types, curriculum types, domain types, constants, `toCamelCase()` |
| `@mycscompanion/ui` | webapp, website | 13 shadcn/ui components, `cn()` utility |
| `@mycscompanion/execution` | backend (API + worker), webapp | `ExecutionServiceClient`, `ExecutionEvent` types, `parseBenchmarkOutput()` |
| `@mycscompanion/config` | all apps | ESLint config, Vitest config, Tailwind tokens, test utilities |

### 8. Content ↔ CI Pipeline

**Trigger:** Push to `content/**` on main or PR
**Pipeline:** `.github/workflows/content-ci.yml` (currently scaffold)
**Planned steps:**
1. JSON schema validation for milestone YAML
2. Go compilation check via Fly execution service
3. Benchmark baseline validation

## Data Flow: Code Submission (End-to-End)

```
User clicks "Run" in workspace
  │
  ▼
[Webapp] useSubmitCode hook
  │ POST /api/execution/submit { milestoneId, code/files }
  ▼
[Backend API] submit.ts route
  │ 1. Rate check (10/min)
  │ 2. Create submission row (status: queued)
  │ 3. Enqueue BullMQ job
  │ 4. Return { submissionId }
  ▼
[Webapp] Opens SSE at /api/execution/:submissionId/stream
  │
  ▼
[Backend API] stream.ts SSE route
  │ Subscribes to Redis channel execution:{submissionId}
  │
  ▼
[Worker] execution-processor picks up job
  │ 1. Update submission → running
  │ 2. Publish "preparing" event via Redis
  │ 3. Call Fly execution server
  │    POST /execute { code (base64), args, timeout }
  │
  ▼
[Fly.io Go Server] executor.go
  │ 1. Decode base64 → write files to tmpdir
  │ 2. go build → capture stdout/stderr
  │ 3. ./main [args] → capture output
  │ 4. Return { stdout, stderr, exitCode, timing }
  │
  ▼
[Worker] receives execution result
  │ 1. Publish output events via Redis pub/sub
  │ 2. Evaluate acceptance criteria
  │ 3. Publish criteria_results event
  │ 4. If benchmark: run user + reference sequentially
  │ 5. Publish benchmark_result event
  │ 6. Update submission → completed
  │ 7. Publish complete event
  │
  ▼
[Backend API] stream.ts forwards Redis events → SSE
  │
  ▼
[Webapp] useSubmitCode processes events
  │ Updates TanStack Query cache
  │ Updates TerminalPanel (output, criteria, benchmarks)
  │ Announces results via ARIA live region
  ▼
User sees compilation output, criteria results, benchmark scores
```

## Data Flow: AI Tutor Chat

```
User types message in TutorPanel
  │
  ▼
[Webapp] useTutorStream hook
  │ POST /api/tutor/:sessionId/stream { message }
  ▼
[Backend API] tutor/routes/stream.ts
  │ 1. Rate check (30/min)
  │ 2. Save user message to tutor_messages
  │ 3. Load context (brief, code, criteria, background, summary)
  │ 4. Route to model (Haiku default, Sonnet for errors/explain)
  │ 5. Call Anthropic SDK with streaming
  ▼
[Anthropic API] Claude model
  │ Streams text tokens
  ▼
[Backend API] Forwards as SSE events
  │ text_delta → incremental text
  │ message_complete → full message + usage stats
  ▼
[Webapp] useTutorStream accumulates text_delta events
  │ On message_complete: insert into TQ InfiniteQuery cache
  │ Save assistant message to tutor_messages via callback
  ▼
User sees streaming AI response in TutorPanel
```
