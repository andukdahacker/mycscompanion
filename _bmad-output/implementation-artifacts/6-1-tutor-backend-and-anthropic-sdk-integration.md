# Story 6.1: Tutor Backend & Anthropic SDK Integration

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a learner,
I want an AI tutor that guides me with Socratic questions based on my actual code and progress,
so that I learn to solve problems myself rather than being given answers.

## Acceptance Criteria

1. Given the tutor plugin is registered on the Fastify server, when a learner sends a message to the tutor, then the system calls the Anthropic API with a system prompt enforcing Socratic questioning — the tutor asks guiding questions, never provides direct answers or code solutions (FR14)
2. Given a learner sends a message, when the tutor request is constructed, then it includes the learner's current code state, active milestone context, and acceptance criteria progress (FR15)
3. Given a learner sends a message, when the tutor request is constructed, then it includes the learner's background (role, experience level, primary language) for personalized responses (FR16)
4. Given a tutor interaction, when the system determines the appropriate model, then tiered model routing is implemented: Haiku 4.5 for Socratic dialogue (default), Sonnet 4.6 for code analysis and conceptual explanation (ARCH-7)
5. Given the tutor plugin source code, when reviewed for imports, then the tutor plugin imports only from `packages/shared` and `packages/*`, never from other plugins (ARCH-15)
6. Given a tutor request, when the endpoint is accessed, then it requires a valid Firebase Auth token (returns 401 without one)

## Tasks / Subtasks

- [x] Task 1: Install Anthropic SDK and create database migration (AC: #1, #5)
  - [x] 1.1 Install `@anthropic-ai/sdk` in backend workspace: `pnpm --filter backend add @anthropic-ai/sdk`
  - [x] 1.2 Create migration `008_add_tutor_messages.ts` adding the `tutor_messages` table (prepares for Story 6.2 persistence, but table needed for route type safety)
  - [x] 1.3 Run migration and regenerate Kysely types: `pnpm --filter backend db:migrate && pnpm --filter shared db:types`
  - [x] 1.4 Verify `ANTHROPIC_API_KEY` placeholder exists in `.env` and `.env.example`

- [x] Task 2: Create Anthropic service with tiered model routing (AC: #1, #4)
  - [x] 2.1 Create `apps/backend/src/plugins/tutor/services/anthropic.ts` — Anthropic client wrapper with model routing logic
  - [x] 2.2 Implement `createTutorResponse(params)` that selects model based on interaction context:
    - Compilation errors in context → Sonnet 4.6 (`claude-sonnet-4-6-20250514`)
    - Explanation patterns ("explain", "what is", "how does") → Sonnet 4.6
    - Default → Haiku 4.5 (`claude-haiku-4-5-20251001`)
  - [x] 2.3 Accept Anthropic client via dependency injection (constructor parameter, not hardcoded `new Anthropic()`)
  - [x] 2.4 Create `apps/backend/src/plugins/tutor/services/anthropic.test.ts` — unit tests with scripted mock streaming chunks

- [x] Task 3: Create context assembler service (AC: #2, #3)
  - [x] 3.1 Create `apps/backend/src/plugins/tutor/services/context-assembler.ts`
  - [x] 3.2 Implement `assembleSystemPrompt(params)` that builds the system prompt from:
    - Base persona template (loaded from `content/prompts/tutor-base.md`)
    - Milestone brief (from curriculum content loader or passed in)
    - Current code snapshot (latest auto-saved code from `code_snapshots` table)
    - Acceptance criteria status (from latest submission's `criteria_results`)
    - User background (role, experience level, primary language from `users` table)
    - Session summary (if returning user — from `session_summaries` table)
  - [x] 3.3 Implement template variable replacement for `{{milestone_brief}}`, `{{current_code}}`, `{{criteria_status}}`, `{{user_background}}`
  - [x] 3.4 Create `apps/backend/src/plugins/tutor/services/context-assembler.test.ts` — unit tests covering all context assembly scenarios

- [x] Task 4: Create tutor message route (AC: #1, #2, #3, #4, #6)
  - [x] 4.1 Create `apps/backend/src/plugins/tutor/routes/message.ts` — `POST /api/tutor/:sessionId/message`
  - [x] 4.2 Request schema: `{ body: { message: string } }` with max length 2000 characters
  - [x] 4.3 Validate session ownership (session belongs to `request.uid`)
  - [x] 4.4 Assemble context → call Anthropic → return response (non-streaming for this story; streaming added in 6.2)
  - [x] 4.5 Response shape: `{ id: string, role: 'assistant', content: string, model: string, createdAt: string }`
  - [x] 4.6 Create `apps/backend/src/plugins/tutor/routes/message.test.ts` — integration tests

- [x] Task 5: Create conversation history route (AC: #6)
  - [x] 5.1 Create `apps/backend/src/plugins/tutor/routes/history.ts` — `GET /api/tutor/:sessionId/messages`
  - [x] 5.2 Return messages for the session ordered by `created_at` ASC
  - [x] 5.3 Cursor-based pagination with `?afterCursor={lastId}&pageSize=20`
  - [x] 5.4 Validate session ownership
  - [x] 5.5 Create `apps/backend/src/plugins/tutor/routes/history.test.ts` — integration tests

- [x] Task 6: Wire up tutor plugin with dependency injection (AC: #5, #6)
  - [x] 6.1 Update `apps/backend/src/plugins/tutor/index.ts` with `TutorPluginOptions` interface accepting `db`, `redis`, `rateLimiter`, `anthropicClient`, `contentRoot`
  - [x] 6.2 Remove the `// eslint-disable-next-line @typescript-eslint/no-unused-vars` comment from the existing scaffold
  - [x] 6.3 Register route handlers with injected dependencies
  - [x] 6.4 Update `apps/backend/src/app.ts`: create a **separate** `RateLimiter` instance for tutor (`maxRequests: 30`, `windowMs: 60_000`) — do NOT reuse the execution rate limiter (10 req/min)
  - [x] 6.5 Pass tutor rate limiter, redis, and optionally Anthropic client to the plugin registration

- [x] Task 7: Add shared types for tutor API (AC: #1, #2)
  - [x] 7.1 Add tutor request/response types to `packages/shared/src/types/api.ts`:
    - `TutorMessageRequest`, `TutorMessageResponse`, `TutorConversationMessage`
  - [x] 7.2 Export new types from barrel file

## Dev Notes

### Critical Architecture Constraints

**Plugin Isolation:** The tutor plugin MUST only import from `packages/shared`, `packages/*`, and `apps/backend/src/shared/`. NEVER import from other plugins (e.g., `../../plugins/progress/...`). To access session data, code snapshots, or user profiles, query the database directly within the tutor plugin.

**Anthropic SDK Version:** Use `@anthropic-ai/sdk` version ^0.78.0 (latest stable). Direct SDK usage — no LangChain, no AI SDK wrapper, no abstraction layer.

**Model IDs (verified current as of March 2026):**
- Haiku 4.5: `claude-haiku-4-5-20251001`
- Sonnet 4.6: `claude-sonnet-4-6-20250514`

**Prompt Caching:** The Anthropic API automatically caches prompt prefixes. Structure the system prompt so stable content comes first and dynamic content last to maximize cache hits:

```
System prompt ordering (stable → dynamic):
1. Base persona (tutor-base.md) ← stable across all interactions
2. User background ← stable across session
3. Milestone brief ← stable across session
4. Session summary (if returning) ← stable across session
5. Acceptance criteria status ← changes on submission
6. Current code snapshot ← changes on auto-save (30-60s)
```

Cache write tokens cost 1.25x base; cache read tokens cost 0.1x base. With this ordering, items 1-4 are cached and only items 5-6 incur full token cost on repeated interactions.

**Prompt Templates:** Already exist at `content/prompts/tutor-base.md` and `content/prompts/stuck-intervention.md`. Load these at plugin initialization and cache in memory. Use template variable replacement for `{{milestone_brief}}`, `{{current_code}}`, `{{criteria_status}}`, `{{user_background}}`.

### Tiered Model Routing Logic

```typescript
function selectModel(context: TutorContext): string {
  // If latest submission has compile errors, use Sonnet for code analysis
  if (context.hasCompileErrors) return 'claude-sonnet-4-6-20250514'

  // If message matches explanation patterns, use Sonnet
  const explainPatterns = /\b(explain|what is|how does|why does|what happens|how would)\b/i
  if (explainPatterns.test(context.userMessage)) return 'claude-sonnet-4-6-20250514'

  // Default: Haiku for Socratic dialogue
  return 'claude-haiku-4-5-20251001'
}
```

### Database Migration: `tutor_messages` Table

All existing migrations use `text` for every column type (IDs, roles, content). Follow the same convention — do NOT use `varchar`.

```typescript
// 008_add_tutor_messages.ts
await db.schema
  .createTable('tutor_messages')
  .addColumn('id', 'text', (col) => col.primaryKey())  // cuid2
  .addColumn('session_id', 'text', (col) => col.references('sessions.id').onDelete('cascade').notNull())
  .addColumn('user_id', 'text', (col) => col.references('users.id').onDelete('cascade').notNull())
  .addColumn('role', 'text', (col) => col.notNull())  // 'user' | 'assistant'
  .addColumn('content', 'text', (col) => col.notNull())
  .addColumn('model', 'text')  // null for user messages
  .addColumn('created_at', sql`timestamptz`, (col) => col.notNull().defaultTo(sql`now()`))
  .execute()

// Indexes
await db.schema
  .createIndex('idx_tutor_messages_session_id_created_at')
  .on('tutor_messages')
  .columns(['session_id', 'created_at'])
  .execute()

await db.schema
  .createIndex('idx_tutor_messages_user_id')
  .on('tutor_messages')
  .column('user_id')
  .execute()
```

Note: The `created_at` column uses `sql\`timestamptz\`` (not string `'timestamptz'`) — this matches the pattern in `007_add_session_summaries.ts`.

### Context Assembly Architecture

Every tutor interaction assembles a system prompt from multiple sources:

```
System prompt = [
  Base persona (content/prompts/tutor-base.md)
  + Milestone brief (what the user is building)
  + Acceptance criteria status (what "done" looks like, what's met/unmet)
  + Current code snapshot (latest auto-saved code from code_snapshots)
  + User background (role, experience level, primary language from users table)
  + Session summary (if returning user — from session_summaries table)
]
```

**Milestone Lookup Chain (critical data access path):**

The routes receive `:sessionId`. To assemble context, you must resolve the full chain:
1. Query `sessions` WHERE `id = sessionId AND user_id = uid` → get `milestone_id` (also validates ownership)
2. Query `milestones` WHERE `id = milestone_id` → get `slug` (needed for loading brief from filesystem)
3. Use `slug` to load `content/milestones/{slug}/brief.md`

**Data Sources for Context (query directly, don't import from other plugins):**

| Context Piece | Table | Query | Index Used |
|---|---|---|---|
| Current code | `code_snapshots` | `WHERE user_id = ? AND milestone_id = ? ORDER BY created_at DESC LIMIT 1` | `idx_code_snapshots_user_milestone_created` |
| Criteria status | `submissions` | `WHERE user_id = ? AND milestone_id = ? AND status = 'completed' ORDER BY created_at DESC LIMIT 1` → extract `criteria_results` | `idx_submissions_user_id_milestone_id` |
| User background | `users` | `WHERE id = uid` → `role`, `experience_level`, `primary_language` | PK |
| Session summary | `session_summaries` | `WHERE user_id = ? AND milestone_id = ? ORDER BY created_at DESC LIMIT 1` | `idx_session_summaries_user_id_milestone_id` |
| Milestone brief | filesystem | `content/milestones/{slug}/brief.md` (Redis-cached, 1h TTL) | — |

**Criteria Results JSONB Casting (gotcha):**

The `criteria_results` column is JSONB. The codebase casts it like this:
```typescript
const criteriaResults = submission.criteria_results as unknown as readonly CriterionResult[] | null
```
Import `CriterionResult` from `@mycscompanion/shared` (defined in `packages/shared/src/types/curriculum.ts`).

**User Background Fields:**
- `role`: `'backend-engineer' | 'frontend-engineer' | 'fullstack-engineer' | 'devops-sre' | 'student' | 'other'`
- `experience_level`: `'less-than-1' | '1-to-3' | '3-to-5' | '5-plus'`
- `primary_language`: `'go' | 'python' | 'javascript-typescript' | 'rust' | 'java' | 'c-cpp' | 'other'`

These may be `null` if the user hasn't completed onboarding. Handle gracefully — omit from prompt if null.

### Anthropic SDK Usage Pattern

```typescript
import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

// Non-streaming (this story) — streaming added in Story 6.2
const response = await client.messages.create({
  model: selectedModel,
  max_tokens: 1024,
  system: assembledSystemPrompt,
  messages: conversationHistory,  // Array of { role, content }
})
```

**For Story 6.1, use non-streaming `messages.create()`.** Story 6.2 adds SSE streaming with `client.messages.stream()`.

### Rate Limiting

Use the existing `RateLimiter` class from `apps/backend/src/shared/rate-limiter.ts`. It uses Redis sorted sets with sliding window.

**IMPORTANT:** The `RateLimitChecker.check(key)` interface accepts ONLY a `key: string` — `maxRequests` and `windowMs` are set in the **constructor**. The existing execution rate limiter in `app.ts` is configured at 10 req/min. The tutor needs a **separate** `RateLimiter` instance with 30 req/min.

```typescript
// In app.ts — create a SEPARATE rate limiter for tutor (30 req/min)
const tutorRateLimiter = new RateLimiter({ redis, windowMs: 60_000, maxRequests: 30 })

// Pass to tutor plugin
await fastify.register(tutorPlugin, {
  prefix: '/api/tutor',
  db,
  redis,
  rateLimiter: tutorRateLimiter,  // NOT the execution rateLimiter (10 req/min)
  contentRoot,
})
```

```typescript
// In message route handler — check() takes only the key string:
const rateResult = await rateLimiter.check(`rate:tutor:${request.uid}`)
if (!rateResult.allowed) {
  return reply.status(429).send({
    error: { code: 'RATE_LIMITED', message: 'Too many tutor messages', retryAfter: Math.ceil(rateResult.retryAfterMs / 1000) }
  })
}
```

### Route Handler Pattern (follow existing execution/progress patterns)

```typescript
// POST /api/tutor/:sessionId/message
export async function messageRoutes(
  fastify: FastifyInstance,
  opts: MessageRoutesOptions
): Promise<void> {
  const { db, anthropicService, contextAssembler, rateLimiter } = opts

  fastify.post<{ Params: { sessionId: string }; Body: { message: string } }>(
    '/:sessionId/message',
    { schema: messageSchema },
    async (request, reply) => {
      const uid = request.uid
      const { sessionId } = request.params

      // 1. Rate limit check
      // 2. Validate session ownership
      // 3. Validate message length (<=2000 chars, enforced by schema)
      // 4. Assemble context
      // 5. Select model (tiered routing)
      // 6. Call Anthropic API
      // 7. Persist both user message and assistant response to tutor_messages
      // 8. Return response
    }
  )
}
```

### Error Handling

- **Anthropic API errors:** Return 503 with `{ error: { code: 'TUTOR_UNAVAILABLE', message: '...' } }`. Report to Sentry using the codebase pattern:
  ```typescript
  import * as Sentry from '@sentry/node'
  Sentry.captureException(error, {
    extra: { model: selectedModel, messageLength: message.length, errorType: error.constructor.name },
  })
  ```
  Note: Sentry is only enabled when `NODE_ENV === 'production' || 'staging'` — tests won't trigger it.
- **Rate limit exceeded:** Return 429 with `retryAfter` field.
- **Invalid session:** Return 404 with `{ error: { code: 'SESSION_NOT_FOUND', message: '...' } }`.
- **Session not owned by user:** Return 404 (same as not found — don't leak existence).
- **Message too long:** Return 400 with `{ error: { code: 'MESSAGE_TOO_LONG', message: '...' } }`.
- **NEVER log user code content or AI conversation content at `info` level or above** (privacy rule).

### Existing Codebase Patterns to Follow

**Plugin structure (from execution plugin):**
```
tutor/
├── index.ts                    # Public API, TutorPluginOptions interface
├── routes/
│   ├── message.ts              # POST /:sessionId/message
│   ├── message.test.ts         # Integration tests
│   ├── history.ts              # GET /:sessionId/messages
│   └── history.test.ts         # Integration tests
└── services/
    ├── anthropic.ts            # Anthropic client wrapper, model routing
    ├── anthropic.test.ts       # Unit tests with mock streaming
    ├── context-assembler.ts    # System prompt assembly
    └── context-assembler.test.ts
```

**Plugin options pattern (from execution plugin):**
```typescript
export interface TutorPluginOptions {
  readonly db?: Kysely<DB>
  readonly redis: Redis
  readonly rateLimiter: RateLimitChecker
  readonly anthropicClient?: Anthropic  // Injectable for testing
  readonly contentRoot?: string          // Injectable for testing, defaults to resolve(cwd, '../../content/milestones')
}
```

**App.ts registration (existing line ~65):**

The current scaffold has `// eslint-disable-next-line @typescript-eslint/no-unused-vars` above the function — **remove this comment** when adding the options parameter, or ESLint will complain about an unnecessary disable directive.

```typescript
// Current: await fastify.register(tutorPlugin, { prefix: '/api/tutor' })
// Update to:
const tutorRateLimiter = new RateLimiter({ redis, windowMs: 60_000, maxRequests: 30 })
await fastify.register(tutorPlugin, {
  prefix: '/api/tutor',
  redis,
  rateLimiter: tutorRateLimiter,
})
```

### Content Loading for Milestone Brief

Do NOT create a new content loader. The curriculum plugin's content loader is isolated. Instead, read milestone brief directly from filesystem in the context assembler.

**IMPORTANT:** There is NO `MCC_CONTENT_ROOT` env var in the codebase. The actual pattern in `content-loader.ts` resolves content root as `resolve(process.cwd(), '..', '..', 'content', 'milestones')`. Accept `contentRoot` as a plugin option for testability (same pattern as `ContentLoader`).

```typescript
import { readFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'

// Default content root — matches curriculum content-loader.ts pattern
const DEFAULT_CONTENT_ROOT = resolve(process.cwd(), '..', '..', 'content', 'milestones')

// Cache in Redis with same TTL as curriculum plugin (3600s)
async function loadMilestoneBrief(
  milestoneSlug: string,
  redis: Redis,
  contentRoot: string = DEFAULT_CONTENT_ROOT,
): Promise<string> {
  const cacheKey = `tutor:brief:${milestoneSlug}`
  const cached = await redis.get(cacheKey)
  if (cached) return cached

  const brief = await readFile(join(contentRoot, milestoneSlug, 'brief.md'), 'utf-8')
  await redis.set(cacheKey, brief, 'EX', 3600)
  return brief
}
```

Also load the prompt template similarly:
```typescript
// Load tutor-base.md from content/prompts/ (one level up from milestones/)
const PROMPTS_ROOT = resolve(process.cwd(), '..', '..', 'content', 'prompts')
const basePrompt = await readFile(join(PROMPTS_ROOT, 'tutor-base.md'), 'utf-8')
// Cache in memory — this never changes at runtime
```

### Previous Story (5.5) Learnings Applied

- Use `toBeInTheDocument()` not `toBeDefined()` in tests (code review fix from 5.4/5.5)
- Don't assert Tailwind classNames — assert behavior and DOM structure
- Inline stat row layouts work well for displaying data
- `endSession` pattern: plain function utilities (not hooks) for simple operations — follow same for tutor utilities

### Anti-Patterns to Avoid

- Do NOT import from other plugins (curriculum, progress, execution) — query DB directly
- Do NOT use LangChain, AI SDK, or any wrapper around Anthropic SDK — use direct SDK
- Do NOT use `any` type — use `Partial<T>` or mock factories in tests
- Do NOT use `test()` — use `it()`
- Do NOT use `toMatchSnapshot()` — explicit behavioral assertions
- Do NOT use `supertest` — use `fastify.inject()`
- Do NOT log user code content or conversation content at `info` level or above
- Do NOT hardcode Anthropic client — accept via dependency injection
- Do NOT use `as` casting — use `satisfies` or type narrowing
- Do NOT create new Zustand stores (frontend concern, but noted for context)
- Do NOT use wrapper response `{ data: result, success: true }` — direct object
- Do NOT use `console.log` — use Fastify's pino logger
- Do NOT use `jest.fn()` — use `vi.fn()`, `vi.mock()`
- Do NOT use `redis` npm package — use `ioredis` (already configured)
- Do NOT use offset pagination — cursor-based with `afterCursor`
- Do NOT use TS `enum` — use union types
- Do NOT use default exports — named exports only

### Project Structure Notes

```
# Shared types (modified)
packages/shared/src/types/api.ts                                    # Add TutorMessageRequest, TutorMessageResponse, TutorConversationMessage

# Backend migration (new)
apps/backend/migrations/008_add_tutor_messages.ts                   # NEW: tutor_messages table

# Backend tutor plugin (new + modified)
apps/backend/src/plugins/tutor/index.ts                             # MODIFIED: add TutorPluginOptions, register routes
apps/backend/src/plugins/tutor/routes/message.ts                    # NEW: POST /:sessionId/message
apps/backend/src/plugins/tutor/routes/message.test.ts               # NEW: integration tests
apps/backend/src/plugins/tutor/routes/history.ts                    # NEW: GET /:sessionId/messages
apps/backend/src/plugins/tutor/routes/history.test.ts               # NEW: integration tests
apps/backend/src/plugins/tutor/services/anthropic.ts                # NEW: Anthropic client wrapper, model routing
apps/backend/src/plugins/tutor/services/anthropic.test.ts           # NEW: unit tests
apps/backend/src/plugins/tutor/services/context-assembler.ts        # NEW: system prompt assembly
apps/backend/src/plugins/tutor/services/context-assembler.test.ts   # NEW: unit tests

# Backend app registration (modified)
apps/backend/src/app.ts                                             # MODIFIED: pass options to tutorPlugin

# Package dependency (modified)
apps/backend/package.json                                           # MODIFIED: add @anthropic-ai/sdk
```

### Testing Requirements

- **Test syntax:** `describe()` + `it()`, never `test()`. `vi.restoreAllMocks()` in `afterEach`
- **No snapshot tests** — explicit behavioral assertions only
- **No `any` type** — use `Partial<T>` or mock factories
- **Backend:** Real PostgreSQL, Kysely test transactions rolled back in `afterEach`
- **Anthropic SDK:** Mock with scripted response object (not streaming for this story)
- **Firebase Auth:** Mock `verifyIdToken()` → test uid (existing pattern in auth tests)
- **Rate Limiter:** Injectable — pass mock or test instance
- **Test file co-location:** `*.test.ts` next to source, never `__tests__/`
- **No `toMatchSnapshot()`** — behavioral assertions only
- **Import from `@mycscompanion/config/test-utils/`** for canonical mock patterns
- **`fastify.inject()` only** — never supertest, never real HTTP

**Key test scenarios for message route:**
1. Sends message and receives Socratic response (no direct answers)
2. Returns 401 without auth token
3. Returns 404 for non-existent session
4. Returns 404 for session owned by different user (doesn't leak existence)
5. Returns 429 when rate limit exceeded (with retryAfter)
6. Returns 400 for message exceeding 2000 characters
7. Returns 503 when Anthropic API is unavailable (with Sentry report)
8. Includes user background in context assembly
9. Includes current code snapshot in context assembly
10. Includes acceptance criteria status in context assembly
11. Routes to Sonnet when compile errors present
12. Routes to Sonnet for explanation patterns
13. Routes to Haiku for default Socratic dialogue
14. Persists both user and assistant messages to tutor_messages table

**Key test scenarios for history route:**
1. Returns messages for session in chronological order
2. Returns 401 without auth token
3. Returns 404 for non-existent session
4. Returns 404 for session owned by different user
5. Supports cursor-based pagination
6. Returns empty array for session with no messages

**Key test scenarios for context assembler:**
1. Includes milestone brief when session is active
2. Includes current code from latest snapshot
3. Includes criteria status from latest submission
4. Includes user background (role, experience, language)
5. Includes session summary for returning users
6. Handles missing optional context gracefully (no code yet, no submissions yet)
7. Template variables are replaced correctly

**Key test scenarios for anthropic service:**
1. Returns Haiku model for default dialogue
2. Returns Sonnet model when compile errors present
3. Returns Sonnet model for explanation patterns
4. Handles API errors gracefully (throws typed error)

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Epic-6-Story-6.1]
- [Source: _bmad-output/planning-artifacts/architecture.md#AI-Tutor-Architecture]
- [Source: _bmad-output/planning-artifacts/architecture.md#Tiered-Model-Routing]
- [Source: _bmad-output/planning-artifacts/architecture.md#Context-Assembly]
- [Source: _bmad-output/planning-artifacts/architecture.md#Tutor-Plugin-File-Structure]
- [Source: _bmad-output/planning-artifacts/architecture.md#Rate-Limiting]
- [Source: _bmad-output/planning-artifacts/architecture.md#Database-Schema]
- [Source: _bmad-output/planning-artifacts/prd.md#FR14-FR19]
- [Source: _bmad-output/planning-artifacts/prd.md#NFR-P3-TTFT]
- [Source: _bmad-output/planning-artifacts/prd.md#NFR-R7-Availability]
- [Source: _bmad-output/planning-artifacts/prd.md#NFR-SC7-Prompt-Caching]
- [Source: _bmad-output/project-context.md]
- [Source: content/prompts/tutor-base.md]
- [Source: content/prompts/stuck-intervention.md]
- [Source: apps/backend/src/plugins/tutor/index.ts — existing scaffold]
- [Source: apps/backend/src/plugins/execution/routes/stream.ts — SSE pattern reference]
- [Source: apps/backend/src/shared/rate-limiter.ts — rate limiting pattern]
- [Source: apps/backend/src/app.ts — plugin registration order]
- [Source: _bmad-output/implementation-artifacts/5-5-overall-progress-view.md — previous story learnings]
- [Source: @anthropic-ai/sdk v0.78.0 — https://www.npmjs.com/package/@anthropic-ai/sdk]
- [Source: Anthropic Prompt Caching — https://platform.claude.com/docs/en/build-with-claude/prompt-caching]

## Dev Agent Record

### Agent Model Used
Claude Opus 4.6

### Debug Log References
- No debug issues encountered

### Completion Notes List
- Task 1: Installed `@anthropic-ai/sdk`, created migration `008_add_tutor_messages.ts` with `tutor_messages` table, indexes on `(session_id, created_at)` and `user_id`. Ran migration and regenerated Kysely types. `ANTHROPIC_API_KEY` already existed in `.env` and `.env.example`.
- Task 2: Created `AnthropicService` with tiered model routing — Haiku for default Socratic dialogue, Sonnet for compile errors and explanation patterns. Dependency injection via constructor parameter. 8 unit tests covering model selection and API interaction.
- Task 3: Created `ContextAssembler` that builds system prompt from tutor-base.md template + milestone brief (Redis-cached, 1h TTL) + current code snapshot + criteria status + user background + session summary. 8 unit tests with filesystem fixtures.
- Task 4: Created `POST /:sessionId/message` route with rate limiting (30 req/min), session ownership validation, context assembly, Anthropic API call, message persistence. Returns 401/404/429/400/503 for error cases. 13 integration tests.
- Task 5: Created `GET /:sessionId/messages` route with cursor-based pagination, session ownership validation, camelCase response conversion. 6 integration tests.
- Task 6: Wired tutor plugin with `TutorPluginOptions` interface. Created separate `RateLimiter` instance (30 req/min) in `app.ts`. Removed ESLint disable comment from scaffold. Graceful degradation when `ANTHROPIC_API_KEY` not configured.
- Task 7: Added `TutorMessageRequest`, `TutorMessageResponse`, `TutorConversationMessage` types to `packages/shared/src/types/api.ts`.

### Change Log
- 2026-03-08: Implemented Story 6.1 — Tutor Backend & Anthropic SDK Integration (all 7 tasks)
- 2026-03-08: Code review fixes — capped conversation history at 50 messages (H1), added minLength:1 to message schema (H2), added model to Sentry extras (M1), typed selectModel return as union type (M2), added satisfies TutorMessageResponse to route response (M3)
- 2026-03-09: Code review fixes round 2 — eliminated `as` casts: introduced AnthropicClient/RedisCache minimal interfaces for testable DI (H1/H2), fixed composite cursor pagination in history route (H3), removed redundant selectModel call (M1), added querystring schema to history route (M2), added secondary id sort for stable ordering (M3), added whitespace-only message rejection (L1)

### File List
- `apps/backend/package.json` — MODIFIED (added @anthropic-ai/sdk dependency)
- `apps/backend/migrations/008_add_tutor_messages.ts` — NEW
- `apps/backend/src/plugins/tutor/index.ts` — MODIFIED (TutorPluginOptions, route registration, DI)
- `apps/backend/src/plugins/tutor/services/anthropic.ts` — NEW
- `apps/backend/src/plugins/tutor/services/anthropic.test.ts` — NEW
- `apps/backend/src/plugins/tutor/services/context-assembler.ts` — NEW
- `apps/backend/src/plugins/tutor/services/context-assembler.test.ts` — NEW
- `apps/backend/src/plugins/tutor/services/__fixtures__/prompts/tutor-base.md` — NEW (test fixture)
- `apps/backend/src/plugins/tutor/services/__fixtures__/milestones/test-milestone/brief.md` — NEW (test fixture)
- `apps/backend/src/plugins/tutor/routes/message.ts` — NEW
- `apps/backend/src/plugins/tutor/routes/message.test.ts` — NEW
- `apps/backend/src/plugins/tutor/routes/history.ts` — NEW
- `apps/backend/src/plugins/tutor/routes/history.test.ts` — NEW
- `apps/backend/src/app.ts` — MODIFIED (tutor rate limiter, Anthropic client creation)
- `packages/shared/src/types/api.ts` — MODIFIED (tutor API types)
- `packages/shared/src/types/db.ts` — MODIFIED (regenerated with tutor_messages table)
- `pnpm-lock.yaml` — MODIFIED (new dependency)
