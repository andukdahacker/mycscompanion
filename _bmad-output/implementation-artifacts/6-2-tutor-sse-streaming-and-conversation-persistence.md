# Story 6.2: Tutor SSE Streaming & Conversation Persistence

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a learner,
I want to see the tutor's response as it's being generated,
so that I get immediate feedback without waiting for the full response.

## Acceptance Criteria

1. Given a learner sends a message to the tutor, when the Anthropic API begins generating a response, then tokens stream to the client via SSE in real-time as they are generated (FR19)
2. Given a tutor streaming request, when measuring time-to-first-token, then TTFT is <1 second (NFR-P3); failure threshold is >3s TTFT in >5% of sessions
3. Given the tutor_messages table already exists (created in Story 6.1), when conversation messages are exchanged, then both learner and tutor messages are persisted in the `tutor_messages` table (already implemented in 6.1 — this story ensures streaming responses are also persisted after stream completes)
4. Given a learner returns after absence, when the AI tutor receives a request, then the session summary is included as context (FR38) (already implemented in 6.1 context assembler — verify it works end-to-end with streaming)
5. Given conversation history exists, when the tutor receives a new message, then conversation history is included in the tutor context window up to the configured 50-message limit (already implemented in 6.1 — verify with streaming)
6. Given the Anthropic API is called with a system prompt, when the prompt is structured with stable content first and dynamic content last, then prompt caching reduces costs on repeated context (NFR-SC7) — verify cache_creation_input_tokens and cache_read_input_tokens in Anthropic response headers are logged
7. Given a learner sends messages, when the rate limiter is checked, then per-user rate limiting is enforced at 30 messages/min (already implemented in 6.1 — applies to stream endpoint too)
8. Given a tutor SSE stream is active, when measuring TTFT, then an integration test validates TTFT <1 second for a standard tutor request (NFR-P3)
9. Given a tutor SSE stream is active, when 30 seconds pass without data, then the server sends a heartbeat comment to keep the connection alive (ARCH-6)

## Tasks / Subtasks

- [x] Task 1: Extend AnthropicClient interface and service for streaming (AC: #1)
  - [x] 1.1 Extend the `AnthropicClient` interface in `apps/backend/src/plugins/tutor/services/anthropic.ts` to add a `stream()` method alongside the existing `create()` method. Define a minimal `AnthropicMessageStream` interface matching the SDK's `MessageStream` contract (event emitter with `on('text', ...)`, `on('finalMessage', ...)`, `on('error', ...)`) — this enables DI-based testing without `as` casts, following the same pattern used for `AnthropicClient.messages.create()`
  - [x] 1.2 Add `createStreamingTutorResponse(params)` method to `AnthropicService` that calls `client.messages.stream()` and returns the `AnthropicMessageStream` object
  - [x] 1.3 Keep existing `createTutorResponse()` (non-streaming) for backward compatibility — the POST message route continues using it
  - [x] 1.4 Update `apps/backend/src/plugins/tutor/services/anthropic.test.ts` with tests for the streaming method — mock `client.messages.stream()` to return a mock implementing `AnthropicMessageStream`

- [x] Task 2: Create SSE streaming route (AC: #1, #2, #6, #9)
  - [x] 2.1 Create `apps/backend/src/plugins/tutor/routes/stream.ts` — `POST /api/tutor/:sessionId/stream`
  - [x] 2.2 Request schema: `{ body: { message: string } }` with `minLength: 1`, `maxLength: 2000`
  - [x] 2.3 Set SSE headers via `reply.raw.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive', 'X-Accel-Buffering': 'no' })` — follow the execution stream.ts pattern
  - [x] 2.4 Disable socket timeout: `if (typeof request.raw.socket?.setTimeout === 'function') request.raw.socket.setTimeout(0)` — prevents Fastify from killing the SSE connection. The project-context.md requires `connectionTimeout: 0` for SSE routes; `socket.setTimeout(0)` achieves this at the socket level (same approach used in execution stream.ts)
  - [x] 2.5 Implement request flow: rate limit check → session ownership validation → persist user message IMMEDIATELY (so it appears in history right away) → load conversation history (via shared helper) → assemble context → select model → start Anthropic stream
  - [x] 2.6 Forward Anthropic stream text deltas as SSE events: `data: {"type":"text_delta","delta":"chunk"}\n\n`
  - [x] 2.7 On stream completion, send terminal event: `data: {"type":"message_complete","id":"msg-id","model":"claude-...","content":"full text"}\n\n`
  - [x] 2.8 Persist assistant message to `tutor_messages` table after stream completes (with full accumulated text)
  - [x] 2.9 Implement 30-second heartbeat interval: `: heartbeat\n\n`
  - [x] 2.10 Implement cleanup function: clear heartbeat timer, clear max duration timer, end stream on client disconnect (`request.raw.on('close', cleanup)`) or write error (`reply.raw.on('error', cleanup)`)
  - [x] 2.11 Implement max stream duration safety timeout (3 minutes) — prevents runaway streams from keeping connections open indefinitely. Use `setTimeout(() => cleanup(), 180_000)` following the execution stream's `maxStreamDurationMs` pattern
  - [x] 2.12 Log prompt caching metrics at `debug` level: `cache_creation_input_tokens` and `cache_read_input_tokens` from the Anthropic `finalMessage` usage object. Anthropic automatically caches prompt prefixes >1024 tokens — no special API parameters needed
  - [x] 2.13 On Anthropic API error during stream: send SSE error event `data: {"type":"error","code":"TUTOR_UNAVAILABLE","message":"..."}\n\n`, report to Sentry, then close stream

- [x] Task 3: Extract shared conversation history helper & update plugin registration (AC: #1, #5, #7)
  - [x] 3.1 Extract the conversation history query from `message.ts` into a shared helper: create `apps/backend/src/plugins/tutor/services/conversation-history.ts` with a `loadConversationHistory(db, sessionId, limit)` function that returns the last N messages in chronological order. Both `message.ts` and the new `stream.ts` use the same query (last 50 messages, `ORDER BY created_at DESC, id DESC`, then reversed). Extracting avoids duplication.
  - [x] 3.2 Create `apps/backend/src/plugins/tutor/services/conversation-history.test.ts` — unit tests for the helper
  - [x] 3.3 Update `message.ts` to use `loadConversationHistory()` instead of inline query
  - [x] 3.4 Register `streamRoutes` in `apps/backend/src/plugins/tutor/index.ts` at `/:sessionId/stream`
  - [x] 3.5 Pass all required dependencies (db, anthropicService, contextAssembler, rateLimiter) to the stream routes

- [x] Task 4: Add shared types for streaming events (AC: #1)
  - [x] 4.1 Add tutor SSE event types to `packages/shared/src/types/api.ts` following the `ExecutionEvent` discriminated union pattern from `packages/execution/src/events.ts` (use `readonly` properties, `type` as string literal discriminator, snake_case event names):
    - `TutorStreamTextDelta: { readonly type: 'text_delta'; readonly delta: string }`
    - `TutorStreamMessageComplete: { readonly type: 'message_complete'; readonly id: string; readonly model: string; readonly content: string }`
    - `TutorStreamError: { readonly type: 'error'; readonly code: string; readonly message: string }`
    - `TutorStreamEvent: TutorStreamTextDelta | TutorStreamMessageComplete | TutorStreamError` (discriminated union)
  - [x] 4.2 Export new types from barrel file

- [x] Task 5: Write integration tests for stream route (AC: #1, #2, #7, #8, #9)
  - [x] 5.1 Create `apps/backend/src/plugins/tutor/routes/stream.test.ts`
  - [x] 5.2 Mock Anthropic streaming with scripted async iterable chunks (use `vi.fn()` to create mock stream)
  - [x] 5.3 Test: streams text deltas as SSE events to the client
  - [x] 5.4 Test: sends message_complete event with full text and model after stream ends
  - [x] 5.5 Test: persists user message before streaming starts
  - [x] 5.6 Test: persists assistant message with full content after stream completes
  - [x] 5.7 Test: returns 401 without auth token
  - [x] 5.8 Test: returns 404 for non-existent or unowned session
  - [x] 5.9 Test: returns 429 when rate limit exceeded (with retryAfter)
  - [x] 5.10 Test: returns 400 for empty or over-length message
  - [x] 5.11 Test: sends error SSE event when Anthropic API fails mid-stream
  - [x] 5.12 Test: sends heartbeat comments on interval (use `vi.useFakeTimers()`)
  - [x] 5.13 Test: cleans up resources on client disconnect
  - [x] 5.14 Test: includes conversation history in Anthropic request (up to 50 messages)
  - [x] 5.15 Test: TTFT measurement — validates time from request to first text_delta event is <1 second (with mocked Anthropic responding immediately)
  - [x] 5.16 Test: logs prompt caching metrics (cache_creation_input_tokens, cache_read_input_tokens) from finalMessage usage object

- [x] Task 6: Update or deprecate non-streaming POST route (AC: #1)
  - [x] 6.1 Decide approach: either update `POST /:sessionId/message` to internally use streaming and return the full response when complete, OR keep it as-is for non-streaming fallback
  - [x] 6.2 Recommended: keep the POST route as-is for now (the frontend in Story 6.3 will use the SSE stream route; the POST route serves as a simpler fallback)

## Dev Notes

### Critical Architecture Constraints

**SSE Pattern — Follow execution stream.ts exactly:**

The execution plugin's `stream.ts` is the authoritative SSE reference. Key patterns to replicate:

```typescript
// 1. Headers (bypass Fastify pipeline)
reply.raw.writeHead(200, {
  'Content-Type': 'text/event-stream',
  'Cache-Control': 'no-cache',
  'Connection': 'keep-alive',
  'X-Accel-Buffering': 'no',
  'Access-Control-Allow-Origin': request.headers.origin ?? '*',
  'Access-Control-Allow-Credentials': 'true',
})

// 2. Disable socket timeout (project-context.md requires connectionTimeout: 0 for SSE routes)
// socket.setTimeout(0) achieves this at the socket level — same approach as execution stream.ts
if (typeof request.raw.socket?.setTimeout === 'function') {
  request.raw.socket.setTimeout(0)
}

// 3. Event format
reply.raw.write(`data: ${JSON.stringify(event)}\n\n`)

// 4. Heartbeat (30s)
const heartbeatTimer = setInterval(() => {
  if (!isClosed) reply.raw.write(': heartbeat\n\n')
}, 30_000)

// 5. Max stream duration safety (3 min — tutor responses are typically short)
const maxDurationTimer = setTimeout(() => cleanup(), 180_000)

// 6. Cleanup on disconnect
let isClosed = false
function cleanup(): void {
  if (isClosed) return
  isClosed = true
  clearInterval(heartbeatTimer)
  clearTimeout(maxDurationTimer)
  reply.raw.end()
}
request.raw.on('close', cleanup)
reply.raw.on('error', cleanup)
```

**Key difference from execution SSE:** The execution plugin uses Redis pub/sub for event relay (worker → API). The tutor stream is simpler — the API server directly holds the Anthropic stream and forwards chunks. No Redis pub/sub needed for the tutor stream. No reconnection/replay needed for tutor (if the stream breaks, the client sends a new message).

**Anthropic SDK Streaming API:**

```typescript
// Stream API — returns MessageStream
const stream = client.messages.stream({
  model: selectedModel,
  max_tokens: 1024,
  system: assembledSystemPrompt,
  messages: conversationHistory,
})

// Event-based consumption (recommended for SSE forwarding)
stream.on('text', (textDelta: string, textSnapshot: string) => {
  // textDelta = incremental chunk, textSnapshot = accumulated text so far
  reply.raw.write(`data: ${JSON.stringify({ type: 'text_delta', delta: textDelta })}\n\n`)
})

stream.on('finalMessage', (message) => {
  // message.content[0].text = full response text
  // message.model = model used
  // message.usage = { input_tokens, output_tokens, cache_creation_input_tokens?, cache_read_input_tokens? }
  const fullText = message.content[0].type === 'text' ? message.content[0].text : ''
  reply.raw.write(`data: ${JSON.stringify({
    type: 'message_complete',
    id: persistedMessageId,
    model: message.model,
    content: fullText,
  })}\n\n`)
})

stream.on('error', (error) => {
  // Handle Anthropic errors mid-stream
})
```

**Prompt Caching Metrics:**

The Anthropic API automatically caches prompt prefixes. The response `usage` object includes:
- `cache_creation_input_tokens` — tokens written to cache (first request)
- `cache_read_input_tokens` — tokens read from cache (subsequent requests)

Log these at `debug` level (never `info` — privacy rule). The system prompt ordering from Story 6.1 already optimizes for caching (stable content first, dynamic last).

**Route is POST, not GET (architectural deviation — intentional):**

The architecture document specifies `GET /api/tutor/:sessionId/stream` as a separate SSE endpoint. However, this story uses `POST /:sessionId/stream` because:
1. The tutor stream requires a request body (the user's message) — GET cannot carry a body
2. The architecture's GET endpoint is designed for persistent SSE connections (needed in Story 6.4 for stuck detection). Story 6.2's scope is request-response streaming: send message → stream response → close
3. The frontend `useSSE` hook uses `fetch()` (not `EventSource`), so POST works fine
4. Story 6.4 may later add a separate `GET /:sessionId/stream` for persistent stuck detection SSE — these are complementary, not conflicting

**Message Persistence Timing — differs from Story 6.1:**

In Story 6.1's non-streaming `message.ts`, both user and assistant messages are persisted in a **single batch insert** after the Anthropic response completes. In the streaming route, the flow changes:
1. **User message persisted BEFORE streaming** — so it appears in conversation history immediately and is available if the stream breaks mid-response
2. **Assistant message persisted AFTER stream completes** — only after the full text is accumulated from `finalMessage` event
3. This is a deliberate behavioral change from 6.1's pattern, not a bug

### Tiered Model Routing

Already implemented in Story 6.1's `AnthropicService.selectModel()`:
- Haiku 4.5 (`claude-haiku-4-5-20251001`) — default Socratic dialogue
- Sonnet 4.6 (`claude-sonnet-4-6-20250514`) — compile errors, explanation patterns

The streaming method uses the same model selection logic.

### Database — No Migration Needed

The `tutor_messages` table was created in Story 6.1 (migration `008_add_tutor_messages.ts`). Story 6.2 uses the existing table — no new migration required. The persistence pattern is identical: insert user message before streaming, insert assistant message after stream completes.

### Conversation History Loading

Story 6.1 already loads the last 50 messages in chronological order for Anthropic context. The stream route reuses this exact pattern:

```typescript
// From message.ts — reuse this query
const messages = await db
  .selectFrom('tutor_messages')
  .where('session_id', '=', sessionId)
  .orderBy('created_at', 'desc')
  .orderBy('id', 'desc')
  .limit(50)
  .selectAll()
  .execute()

// Reverse to chronological order for Anthropic API
const history = messages.reverse().map(m => ({ role: m.role, content: m.content }))
```

### Session Summary for Returning Users

Already implemented in Story 6.1's `ContextAssembler.assembleSystemPrompt()` — it queries `session_summaries` and includes the latest summary in the system prompt if available. No additional work needed for FR38.

### Error Handling

Follow the same patterns from Story 6.1:

| Error | Response | Notes |
|---|---|---|
| No auth token | 401 JSON response (before SSE starts) | Standard Fastify response |
| Invalid/unowned session | 404 JSON response (before SSE starts) | Don't leak session existence |
| Rate limit exceeded | 429 JSON response (before SSE starts) | Include `retryAfter` |
| Message too long/empty | 400 JSON response (before SSE starts) | Schema validation |
| Anthropic API error before stream | 503 JSON response | Report to Sentry |
| Anthropic API error during stream | SSE error event then close | Report to Sentry |

**Critical:** All validation errors return standard JSON responses (not SSE). Only switch to SSE format after `writeHead(200, ...)`. If validation fails, use normal `reply.status(4xx).send({error: {...}})`.

### Testing Strategy

**Mock Anthropic Streaming:**

Create a mock that implements the `AnthropicMessageStream` interface. Use `process.nextTick()` to simulate async event delivery (the real SDK fires events asynchronously). Include `usage` with cache metrics to test logging.

```typescript
function createMockStream(chunks: string[]): AnthropicMessageStream {
  const handlers = new Map<string, (...args: unknown[]) => void>()

  const mock: AnthropicMessageStream = {
    on(event: string, handler: (...args: unknown[]) => void) {
      handlers.set(event, handler)
      return mock
    },
  }

  // Fire events asynchronously after all handlers are registered
  process.nextTick(() => {
    const textHandler = handlers.get('text')
    const finalHandler = handlers.get('finalMessage')

    if (textHandler) {
      let snapshot = ''
      for (const chunk of chunks) {
        snapshot += chunk
        textHandler(chunk, snapshot)
      }
    }

    if (finalHandler) {
      const fullText = chunks.join('')
      finalHandler({
        content: [{ type: 'text', text: fullText }],
        model: 'claude-haiku-4-5-20251001',
        usage: {
          input_tokens: 100,
          output_tokens: 50,
          cache_creation_input_tokens: 1200,
          cache_read_input_tokens: 0,
        },
      })
    }
  })

  return mock
}
```

**SSE Response Parsing in Tests:**

Use `fastify.inject()` — the response body will contain the raw SSE text. Parse it by splitting on `\n\n` and extracting `data:` lines:

```typescript
const response = await fastify.inject({
  method: 'POST',
  url: `/api/tutor/${sessionId}/stream`,
  headers: { authorization: 'Bearer test-token' },
  payload: { message: 'How do I implement a hash table?' },
})

const events = response.body
  .split('\n\n')
  .filter(block => block.startsWith('data:'))
  .map(block => JSON.parse(block.replace('data: ', '')))
```

**TTFT Test:**

The TTFT test validates that the mock stream's first chunk arrives quickly. Since we're mocking Anthropic, the test primarily validates that there's no unnecessary delay in the request pipeline (auth, session lookup, context assembly) before streaming begins.

### Existing Files Modified/Created

```
# NEW files
apps/backend/src/plugins/tutor/routes/stream.ts                    # SSE streaming route
apps/backend/src/plugins/tutor/routes/stream.test.ts               # Integration tests
apps/backend/src/plugins/tutor/services/conversation-history.ts    # Shared history query helper
apps/backend/src/plugins/tutor/services/conversation-history.test.ts # History helper tests

# MODIFIED files
apps/backend/src/plugins/tutor/index.ts                       # Register stream route
apps/backend/src/plugins/tutor/services/anthropic.ts          # Extend AnthropicClient interface + add streaming method
apps/backend/src/plugins/tutor/services/anthropic.test.ts     # Add streaming tests
apps/backend/src/plugins/tutor/routes/message.ts              # Use shared loadConversationHistory()
packages/shared/src/types/api.ts                              # Add TutorStreamEvent types
```

### Anti-Patterns to Avoid

- Do NOT use `EventSource` on the server — that's a client-side API. Use `reply.raw.write()` for SSE
- Do NOT use Redis pub/sub for tutor streaming — the API server directly holds the Anthropic stream (unlike execution which uses worker → Redis → API)
- Do NOT create a reconnection/replay mechanism for tutor SSE — if the stream breaks, the client sends a new message (unlike execution which replays from Redis)
- Do NOT use `reply.send()` after `reply.raw.writeHead()` — once you go raw, stay raw
- Do NOT log conversation content at `info` level — use `debug` only (privacy)
- Do NOT import from other plugins — query DB directly
- Do NOT use LangChain or any Anthropic wrapper — direct SDK only
- Do NOT use `any` type — use proper typing for stream events
- Do NOT use `test()` — use `it()`. Do NOT use `toMatchSnapshot()` — behavioral assertions only
- Do NOT use `supertest` — use `fastify.inject()` for route tests
- Do NOT use `as` casting — use `satisfies` or type narrowing
- Do NOT use default exports — named exports only

### Previous Story (6.1) Learnings Applied

- **DI pattern works well:** AnthropicClient/RedisCache minimal interfaces enable clean testing without `as` casts
- **Composite cursor pagination:** History route uses `(created_at, id)` composite for stable ordering — stream route doesn't need pagination but should use same ordering for history loading
- **Whitespace-only message rejection:** Added in 6.1 code review — stream route should include same `minLength: 1` + trimmed whitespace check
- **Rate limiter key format:** `rate:tutor:${request.uid}` — same key for both POST and stream routes (they share the same budget)
- **Sentry extras pattern:** Include `model`, `messageLength`, `errorType` in Sentry context

### Git Intelligence (from Story 6.1 commit b448fd8)

Files created/modified in Story 6.1 that are directly relevant:
- `apps/backend/src/plugins/tutor/services/anthropic.ts` — will be extended with streaming method
- `apps/backend/src/plugins/tutor/routes/message.ts` — reference pattern for validation flow
- `apps/backend/src/plugins/tutor/index.ts` — will add stream route registration
- `packages/shared/src/types/api.ts` — will add streaming event types

Code review improvements from 6.1 round 2 (commit b448fd8):
- Eliminated `as` casts by introducing `AnthropicClient`/`RedisCache` minimal interfaces
- Fixed composite cursor pagination in history route
- Added querystring schema to history route
- Added whitespace-only message rejection

### Project Structure Notes

- Alignment with unified project structure: new files follow existing `tutor/routes/` convention
- Stream route parallels execution plugin's `stream.ts` pattern
- No new directories created — all files in existing structure
- SSE event types use `snake_case` for event type names per project convention (e.g., `text_delta`, not `textDelta`)

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Epic-6-Story-6.2]
- [Source: _bmad-output/planning-artifacts/architecture.md#SSE-Streaming]
- [Source: _bmad-output/planning-artifacts/architecture.md#AI-Tutor-Architecture]
- [Source: _bmad-output/planning-artifacts/architecture.md#Prompt-Caching]
- [Source: _bmad-output/planning-artifacts/prd.md#FR19-Real-Time-Streaming]
- [Source: _bmad-output/planning-artifacts/prd.md#FR38-Session-Summary-Context]
- [Source: _bmad-output/planning-artifacts/prd.md#NFR-P3-TTFT]
- [Source: _bmad-output/planning-artifacts/prd.md#NFR-SC7-Prompt-Caching]
- [Source: _bmad-output/planning-artifacts/prd.md#NFR-R7-Availability]
- [Source: apps/backend/src/plugins/execution/routes/stream.ts — SSE reference pattern]
- [Source: apps/backend/src/plugins/tutor/routes/message.ts — non-streaming reference]
- [Source: apps/backend/src/plugins/tutor/services/anthropic.ts — extend with streaming]
- [Source: apps/backend/src/plugins/tutor/services/context-assembler.ts — reuse as-is]
- [Source: apps/backend/src/plugins/tutor/index.ts — add stream route registration]
- [Source: apps/backend/src/shared/rate-limiter.ts — rate limiting pattern]
- [Source: packages/shared/src/types/api.ts — extend with stream event types]
- [Source: _bmad-output/implementation-artifacts/6-1-tutor-backend-and-anthropic-sdk-integration.md — previous story]
- [Source: _bmad-output/project-context.md — project rules and conventions]
- [Source: @anthropic-ai/sdk MessageStream API — streaming interface]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6

### Debug Log References

- Fixed pre-existing flaky ordering in message.test.ts conversation history test (missing explicit `created_at` timestamps caused non-deterministic CUID2 ID ordering)

### Completion Notes List

- Task 1: Extended `AnthropicClient` with `stream()` method and `AnthropicMessageStream` interface. Added `createStreamingTutorResponse()` to `AnthropicService`. 3 new streaming tests added (11 total in anthropic.test.ts).
- Task 2: Created `stream.ts` SSE route at `POST /:sessionId/stream` following execution stream.ts patterns. Implements: rate limiting, session ownership validation, user message pre-persistence, Anthropic stream forwarding, assistant message post-persistence, 30s heartbeat, 3min max duration, cleanup on disconnect, Sentry error reporting, prompt cache metric logging.
- Task 3: Extracted `loadConversationHistory()` shared helper from inline query in `message.ts`. 5 unit tests. Updated `message.ts` to use helper. Registered `streamRoutes` in plugin index with all dependencies.
- Task 4: Added `TutorStreamTextDelta`, `TutorStreamMessageComplete`, `TutorStreamError`, and `TutorStreamEvent` discriminated union types to `packages/shared/src/types/api.ts`. Auto-exported via existing barrel.
- Task 5: 15 integration tests for stream route covering: SSE text deltas, message_complete event, user/assistant message persistence, auth (401), session validation (404), rate limiting (429), validation (400), mid-stream errors, heartbeat/cleanup setup, conversation history inclusion, TTFT measurement, prompt cache logging, whitespace rejection.
- Task 6: Kept POST message route as-is for non-streaming fallback (recommended approach per story).

### Change Log

- 2026-03-09: Implemented Story 6.2 — Tutor SSE Streaming & Conversation Persistence (all 6 tasks complete)
- 2026-03-09: Code review — 8 issues found (3 HIGH, 3 MEDIUM, 2 LOW), all fixed:
  - H1: Replaced `.then()` chain with async/await in finalMessage handler (project-context violation + race condition)
  - H2: Send message_complete SSE event before DB persistence (client notification decoupled from DB success)
  - H3: Added explicit role validation in conversation-history.ts (reject unexpected roles instead of silent coercion)
  - M1: Rewrote heartbeat test to verify setInterval(30s) and setTimeout(180s) via spies (fake timers incompatible with real DB I/O)
  - M2: Documented fastify.inject() disconnect test limitation
  - M3: Documented debug-level log testing limitation with honest assertion commentary
  - L1: Simplified type annotation from ReturnType<> to direct AnthropicMessageStream import
  - L2: Fixed fragile SSE parser regex in test helper

### File List

New files:
- apps/backend/src/plugins/tutor/routes/stream.ts
- apps/backend/src/plugins/tutor/routes/stream.test.ts
- apps/backend/src/plugins/tutor/services/conversation-history.ts
- apps/backend/src/plugins/tutor/services/conversation-history.test.ts

Modified files:
- apps/backend/src/plugins/tutor/services/anthropic.ts
- apps/backend/src/plugins/tutor/services/anthropic.test.ts
- apps/backend/src/plugins/tutor/routes/message.ts
- apps/backend/src/plugins/tutor/routes/message.test.ts
- apps/backend/src/plugins/tutor/routes/history.test.ts
- apps/backend/src/plugins/tutor/index.ts
- packages/shared/src/types/api.ts
- _bmad-output/implementation-artifacts/sprint-status.yaml
