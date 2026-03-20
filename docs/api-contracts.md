# API Contracts — mycscompanion Backend

**Generated:** 2026-03-20 | **Scan Level:** Exhaustive
**Framework:** Fastify 5 | **Auth:** Firebase Bearer Token | **Base:** `/api`

## Authentication

All routes require `Authorization: Bearer <Firebase ID Token>` except:
- `GET /health` — public health check
- `GET /admin/*` — basic auth (username/password)

On success, `request.uid` is populated with the Firebase UID.
On 401, client force-refreshes token via `getIdToken(true)`, retries once, then redirects to `/sign-in`.

## Rate Limits (Redis sliding window)

| Scope | Limit | Window |
|---|---|---|
| Code submissions | 10 requests | 60 seconds |
| Tutor messages | 30 requests | 60 seconds |
| Data export | 1 request | 5 minutes |

Response on limit: `429 { error: { code: "RATE_LIMITED", message: "...", retryAfter: N } }`

## Response Format

```typescript
// Success — direct response, no wrapper
200 { milestoneId, brief, criteria, ... }

// Error — structured error object
4xx/5xx { error: { code: "ERROR_CODE", message: "Human-readable message" } }
```

---

## Execution API (`/api/execution`)

### POST `/api/execution/submit`
Submit code for compilation, testing, and optional benchmarking.

**Rate Limit:** 10/min
**Request:**
```typescript
{
  milestoneId: string
  code?: string                    // Single-file (M1)
  files?: Record<string, string>  // Multi-file (M2+)
}
```
**Validation:** Either `code` OR `files` required; max 128KB total.
**Response (202):**
```typescript
{ submissionId: string }
```
**Side Effects:** Creates submission row (queued), enqueues BullMQ job, creates code snapshot.

### GET `/api/execution/:submissionId/stream`
SSE stream of execution progress events.

**Auth:** Must own submission.
**Headers:** `Content-Type: text/event-stream`, `X-Accel-Buffering: no`
**Reconnect:** `Last-Event-ID` header with sequenceId deduplication.
**Heartbeat:** Every 30 seconds. Hard cap: 5 minutes (Railway limit).

**Event Types:**
```typescript
type ExecutionEvent =
  | { type: 'queued'; submissionId: string }
  | { type: 'output'; phase: 'preparing' | 'executing' | 'completed'; data: string; sequenceId: number }
  | { type: 'compile_output' | 'compile_error'; phase: 'compiling'; data: string; sequenceId: number }
  | { type: 'test_output' | 'test_result'; phase: 'testing'; data: string; sequenceId: number }
  | { type: 'benchmark_progress'; phase: 'benchmarking'; iteration: number; total: number; sequenceId: number }
  | { type: 'benchmark_result'; phase: 'benchmarking'; data: BenchmarkResult; sequenceId: number }
  | { type: 'criteria_results'; results: CriterionResult[]; sequenceId: number }
  | { type: 'complete'; data: object; sequenceId: number }
  | { type: 'error'; data: string; sequenceId: number }
  | { type: 'timeout'; sequenceId: number }
  | { type: 'heartbeat' }
```

### GET `/api/execution/:submissionId/benchmark`
Retrieve benchmark result for a submission.

**Response (200):**
```typescript
{
  id: string
  submissionId: string
  benchmarkName: string
  opsPerSec: number
  normalizedRatio: number
  userMedian: number
  referenceMedian: number
  p50LatencyUs: number | null
  p99LatencyUs: number | null
  referenceVersion: string
  createdAt: string  // ISO 8601
}
```

### GET `/api/execution/benchmark-results/history/:milestoneId`
Paginated benchmark history for a milestone.

**Query:** `afterCursor?: string`, `pageSize?: number (1-50, default 20)`
**Response (200):**
```typescript
{
  results: BenchmarkResult[]
  nextCursor: string | null
  totalCount: number
}
```

### GET `/api/execution/benchmark-results/trajectory`
Historical benchmark progression across all milestones.

**Response (200):**
```typescript
{
  dataPoints: {
    milestoneId: string
    milestoneName: string
    milestoneNumber: number
    benchmarkName: string
    bestOpsPerSec: number
    bestNormalizedRatio: number
    totalSubmissions: number
    achievedAt: string
  }[]
}
```

### GET `/api/execution/benchmark-results/latest/:milestoneId`
Latest benchmark result for a specific milestone.

---

## Progress API (`/api/progress`)

### GET `/api/progress/overview`
Get current/next milestone overview with progress data.

**Side Effects:** Processes stale sessions (>15 min), backfills missing summaries.
**Response (200):**
```typescript
{
  variant: 'first-time' | 'milestone-start'
  milestone: {
    id: string
    slug: string
    title: string
    position: number
    briefExcerpt: string
    csConceptLabel: string
  }
  criteriaProgress: { met: number; total: number; nextCriterionName: string } | null
  sessionSummary: string | null
  lastBenchmark: { opsPerSec: number; normalizedRatio: number; trend: string } | null
}
```

### POST `/api/progress/save`
Auto-save code snapshot.

**Request:**
```typescript
{
  milestoneId: string
  code?: string                    // Single-file
  files?: Record<string, string>  // Multi-file
}
```
**Response (200):** `{ snapshotId: string }`

### GET `/api/progress/snapshots/:milestoneId/latest`
Get latest code snapshot.

**Response (200):**
```typescript
{ snapshot: { id: string; code: string | null; files: Record<string, string> | null; createdAt: string } | null }
```

### POST `/api/progress/sessions`
Create or retrieve active session (one active per user+milestone).

**Request:** `{ milestoneId: string }`
**Response (200):** `{ session: { id: string; startedAt: string }; created: boolean }`
**Concurrency:** Transaction + FOR UPDATE to prevent race conditions.

### POST `/api/progress/sessions/end`
End active session (triggers summary generation).

**Request:** `{ sessionId: string }`
**Response (200):** `{ ended: boolean }`

### GET `/api/progress/resume/:milestoneId`
Get resume data (latest snapshot + last submission criteria).

**Response (200):**
```typescript
{
  latestSnapshot: { id: string; code: string | null; files: Record<string, string> | null; createdAt: string } | null
  lastSubmissionId: string | null
  lastSubmissionCriteria: CriterionResult[] | null
}
```

### GET `/api/progress/track-progress`
Full track progress with all milestone statuses.

**Response (200):**
```typescript
{
  trackName: string
  trackSlug: string
  milestones: {
    id: string; slug: string; title: string; position: number; description: string
    status: 'not-started' | 'in-progress' | 'completed'
    criteriaMet: number; criteriaTotal: number
    completedAt: string | null
    lastBenchmark: { opsPerSec: number; normalizedRatio: number } | null
  }[]
  completedCount: number
  totalCount: number
}
```

---

## Curriculum API (`/api/curriculum`)

### GET `/api/curriculum/tracks`
List all curriculum tracks with milestones.

**Query:** `afterCursor?: string`, `pageSize?: number (1-100, default 20)`
**Response (200):**
```typescript
{
  items: {
    id: string; name: string; slug: string; description: string
    milestones: { id: string; slug: string; title: string; position: number }[]
  }[]
  nextCursor: string | null
}
```

### GET `/api/curriculum/milestones/:id`
Full milestone content (brief, criteria, starter code, benchmarks).

**Params:** `id` can be UUID or slug.
**Response (200):**
```typescript
{
  milestoneId: string; trackId: string; slug: string; title: string; position: number
  brief: string                                    // Markdown
  acceptanceCriteria: AcceptanceCriterion[]
  benchmarkConfig: BenchmarkConfig | null
  conceptExplainerAssets: ConceptExplainerAsset[]
  starterCode: string | null                       // Single-file (M1)
  starterFiles: Record<string, string> | null      // Multi-file (M2+)
  editableFiles: string[] | null                   // Which files learner can edit
  csConceptLabel: string | null
  stuckDetection: { thresholdMinutes: number; stage2OffsetSeconds: number } | null
}
```

---

## Completion API (`/api/completion`)

### GET `/api/completion/:milestoneId`
Get milestone completion summary.

**Response (200):**
```typescript
{
  milestoneId: string; milestoneName: string; milestoneNumber: number
  completedAt: string
  criteriaResults: CriterionResult[]
  nextMilestone: { id: string; title: string; position: number; briefExcerpt: string } | null
}
```

### POST `/api/completion/:milestoneId/complete`
Mark milestone as complete.

**Request:** `{ submissionId: string }`
**Validations:** Submission completed + all criteria met.
**Response (200):** `{ nextMilestoneId: string | null }`

---

## Tutor API (`/api/tutor`)

### POST `/api/tutor/:sessionId/message`
Send message and get non-streaming response.

**Rate Limit:** 30/min
**Request:** `{ message: string }` (1-2000 chars)
**Response (200):**
```typescript
{
  role: 'assistant'
  content: string
  model: string
  usage: { inputTokens: number; outputTokens: number; cacheCreationInputTokens?: number; cacheReadInputTokens?: number }
}
```

### POST `/api/tutor/:sessionId/stream`
Send message and get SSE streaming response.

**Rate Limit:** 30/min
**Request:** `{ message: string }`
**SSE Events:**
```typescript
{ type: 'text_delta'; data: string }
{ type: 'message_complete'; content: string; model: string; usage: object }
{ type: 'error'; code: string; message: string }
```

### GET `/api/tutor/:sessionId/messages`
Paginated conversation history.

**Query:** `afterCursor?: string`, `pageSize?: string (default 20, max 100)`
**Response (200):**
```typescript
{
  messages: { id: string; role: 'user' | 'assistant'; content: string; model: string | null; createdAt: string }[]
  nextCursor: string | null
}
```

### GET `/api/tutor/health`
Tutor service health with circuit breaker state.

**Response (200):**
```typescript
{ status: 'ok' | 'degraded' | 'unavailable'; circuitBreaker: 'CLOSED' | 'OPEN' | 'HALF_OPEN' }
```

### POST `/api/tutor/:sessionId/stuck-intervention`
Trigger stuck detection hint (SSE stream).

---

## Account API (`/api/account`)

### GET `/api/account/profile`
User profile with all onboarding fields.

### POST `/api/account/onboarding`
Submit onboarding questionnaire (upsert).

**Request:**
```typescript
{
  email: string
  displayName?: string | null
  role: 'backend-engineer' | 'frontend-engineer' | 'fullstack-engineer' | 'devops-sre' | 'student' | 'other'
  experienceLevel: 'less-than-1' | '1-to-3' | '3-to-5' | '5-plus'
  primaryLanguage: 'go' | 'python' | 'javascript-typescript' | 'rust' | 'java' | 'c-cpp' | 'other'
}
```

### POST `/api/account/skill-assessment`
Submit skill floor assessment result.

**Request:** `{ passed: boolean }`

### POST `/api/account/export`
Start GDPR data export (async via BullMQ).

**Rate Limit:** 1 per 5 minutes.
**Response (200):** `{ exportId: string; status: 'processing' }`

### GET `/api/account/export/status`
Check export status.

### GET `/api/account/export/download`
Download exported JSON file.

### DELETE `/api/account`
Delete account (Firebase + DB cascade).

**Request:** `{ password: string }`

---

## Admin API (`/admin`)

**Auth:** Basic Auth (MCC_ADMIN_USER / MCC_ADMIN_PASSWORD)

### GET `/admin/queues`
Bull Board queue monitoring dashboard.

### POST `/admin/reload-config`
Reload runtime configuration.

**Request:** `{ type: 'prompts' | 'model-routing' | 'content' }`

---

## Health Check

### GET `/health`
**Auth:** None
**Response (200):** `{ status: 'ok' }`
