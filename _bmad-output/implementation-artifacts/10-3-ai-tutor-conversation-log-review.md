# Story 10.3: AI Tutor Conversation Log Review

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As an **admin**,
I want to review AI tutor conversations to assess prompt quality,
So that I can identify tuning opportunities and improve the tutoring experience.

**Requirements Traced:** FR54, ARCH-24, ARCH-13

## Acceptance Criteria

1. **Given** tutor conversations are stored in the `tutor_messages` table (from Story 6.2) **When** the admin queries conversation logs **Then** logs are queryable via direct database SQL queries or Metabase dashboards (FR54)
2. **And** each conversation log includes: user ID, milestone context, user background summary, conversation messages (learner + tutor), model used (Haiku/Sonnet), and timestamps
3. **And** logs support filtering by milestone, model tier, and date range
4. **And** the admin can identify patterns: common questions, areas where the Socratic approach breaks down, and topics where learners consistently struggle
5. **And** conversation log queries support cursor-based pagination per ARCH-13
6. **And** no custom admin UI is built — Metabase dashboards or direct SQL are sufficient at MVP

## Critical Context: This Story Is Documentation + Database Views + Verification

The `tutor_messages` table already exists (Story 6.2, migration 008). Cursor-based pagination is already implemented in the tutor history route (`GET /api/tutor/:sessionId/messages`). Metabase is an external tool that connects to PostgreSQL — no application code creates Metabase dashboards.

**This story's job is to:**
1. Create SQL views in the database (via Kysely migration) that make tutor conversation analysis easy and efficient for Metabase
2. Document recommended Metabase queries/dashboards in `docs/monitoring-setup.md`
3. Add integration tests verifying the views return correct data
4. Verify data integrity and accessibility

### What Already Exists (DO NOT recreate)

| Component | File | Status |
|---|---|---|
| `tutor_messages` table | `apps/backend/migrations/008_add_tutor_messages.ts` | DONE — id, session_id, user_id, role, content, model, created_at |
| Index: (session_id, created_at) | migration 008 | DONE |
| Index: (user_id) | migration 008 | DONE |
| Message insertion (user + assistant) | `apps/backend/src/plugins/tutor/routes/message.ts` | DONE — atomic insert with model tracking |
| Cursor-based message history | `apps/backend/src/plugins/tutor/routes/history.ts` | DONE — composite cursor (created_at, id) |
| Model routing (Haiku vs Sonnet) | `apps/backend/src/plugins/tutor/services/anthropic.ts` | DONE — selectModel() with pattern matching |
| Admin auth (Basic Auth) | `apps/backend/src/plugins/admin/index.ts` | DONE — timing-safe comparison |
| Monitoring docs | `docs/monitoring-setup.md` | DONE — created in 10.1, queue section added in 10.2 |

### Data Model for Conversation Logs

**tutor_messages table:**
```
id          TEXT PRIMARY KEY (cuid2)
session_id  TEXT NOT NULL → sessions(id) ON DELETE CASCADE
user_id     TEXT NOT NULL → users(id) ON DELETE CASCADE
role        TEXT NOT NULL ('user' | 'assistant')
content     TEXT NOT NULL
model       TEXT (null for user msgs; see TutorModel type in anthropic.ts for current values)
created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
```

**Joinable tables for context:**
- `sessions` — milestone_id, started_at, ended_at
- `users` — email, display_name, role, experience_level, primary_language
- `milestones` — title, slug, position, track_id

### Model Routing Reference

| Scenario | Model | Stored Value |
|---|---|---|
| Normal Socratic dialogue | Haiku 4.5 | `claude-haiku-4-5-20251001` |
| Compile errors | Sonnet 4.6 | `claude-sonnet-4-6-20250514` |
| Explanation requests | Sonnet 4.6 | `claude-sonnet-4-6-20250514` |
| Stuck intervention | Sonnet 4.6 | `claude-sonnet-4-6-20250514` |

**Note:** These model strings are the current values from `TutorModel` type in `apps/backend/src/plugins/tutor/services/anthropic.ts`. If models are updated in that file, the SQL filter examples and view queries should use the updated strings. Always check `anthropic.ts` for the source of truth.

## Tasks / Subtasks

- [x] Task 1: Create database views for tutor analytics (AC: #1, #2, #3, #4)
  - [x] 1.1 Create Kysely migration `011_add_tutor_analytics_views.ts` with two views:
    - **`tutor_conversation_log`** — Denormalized view joining `tutor_messages` + `sessions` + `users` + `milestones` for easy querying:
      ```sql
      CREATE VIEW tutor_conversation_log AS
      SELECT
        tm.id AS message_id,
        tm.session_id,
        tm.user_id,
        u.email AS user_email,
        u.display_name AS user_display_name,
        u.role AS user_role,
        u.experience_level AS user_experience_level,
        u.primary_language AS user_primary_language,
        s.milestone_id,
        m.title AS milestone_title,
        m.slug AS milestone_slug,
        m.position AS milestone_position,
        tm.role AS message_role,
        tm.content,
        tm.model,
        tm.created_at
      FROM tutor_messages tm
      JOIN sessions s ON tm.session_id = s.id
      JOIN users u ON tm.user_id = u.id
      LEFT JOIN milestones m ON s.milestone_id = m.id;
      ```
      **No ORDER BY in the view** — callers (Metabase, direct SQL) control their own sort order. Typical: `ORDER BY created_at DESC` for recent-first browsing, `ORDER BY created_at ASC` for chronological reading.
    - **`tutor_session_summary`** — Aggregated view for pattern analysis:
      ```sql
      CREATE VIEW tutor_session_summary AS
      SELECT
        tm.session_id,
        tm.user_id,
        u.role AS user_role,
        u.experience_level,
        u.primary_language,
        s.milestone_id,
        m.title AS milestone_title,
        m.slug AS milestone_slug,
        COUNT(*) AS total_messages,
        COUNT(*) FILTER (WHERE tm.role = 'user') AS user_messages,
        COUNT(*) FILTER (WHERE tm.role = 'assistant') AS assistant_messages,
        COUNT(*) FILTER (WHERE tm.model LIKE 'claude-haiku%') AS haiku_messages,
        COUNT(*) FILTER (WHERE tm.model LIKE 'claude-sonnet%') AS sonnet_messages,
        MIN(tm.created_at) AS first_message_at,
        MAX(tm.created_at) AS last_message_at,
        COALESCE(EXTRACT(EPOCH FROM MAX(tm.created_at) - MIN(tm.created_at)), 0) AS duration_seconds
      FROM tutor_messages tm
      JOIN sessions s ON tm.session_id = s.id
      JOIN users u ON tm.user_id = u.id
      LEFT JOIN milestones m ON s.milestone_id = m.id
      GROUP BY tm.session_id, tm.user_id, u.role, u.experience_level, u.primary_language, s.milestone_id, m.title, m.slug;
      ```
      **Note on GROUP BY:** PostgreSQL 16 allows non-aggregated columns that are functionally dependent on grouped columns (via FK constraints). `m.title` and `m.slug` are determined by `s.milestone_id`. This is valid PostgreSQL behavior.
    - **Migration down:** `DROP VIEW IF EXISTS tutor_session_summary; DROP VIEW IF EXISTS tutor_conversation_log;`
  - [x] 1.2 Run migration: `pnpm --filter backend db:migrate`
  - [x] 1.3 Regenerate types: `pnpm --filter shared db:types`

- [x] Task 2: Add tutor analytics documentation to monitoring-setup.md (AC: #1, #2, #3, #4, #6)
  - [x] 2.1 Add a "Tutor Conversation Log Review" section to `docs/monitoring-setup.md` covering:
    - **Purpose:** Assess AI tutor prompt quality, identify tutoring improvement opportunities
    - **Data source:** `tutor_conversation_log` and `tutor_session_summary` views in PostgreSQL
    - **Access method:** Metabase dashboards (connected to PostgreSQL `DATABASE_URL`) or direct SQL
    - **Metabase access:** Start locally with `docker compose --profile metabase up metabase`, access at `http://localhost:3000`. Connects to local PostgreSQL automatically. Not deployed to Railway — local/staging admin tool only.
    - **Recommended Metabase dashboards** (map to AC #4 pattern types):
      1. **Conversation Explorer** — Browse individual conversations filtered by milestone, model, date range using `tutor_conversation_log` view (AC #1, #2, #3)
      2. **Session Summary** — Aggregate stats per session (message counts, model usage, duration) using `tutor_session_summary` view (AC #2, #3)
      3. **Model Usage Analysis** — Haiku vs Sonnet breakdown by milestone and user experience level (AC #3)
      4. **Socratic Approach Breakdown Detection** — Sessions where `sonnet_messages > haiku_messages` indicate the Socratic approach is failing and the tutor had to escalate to deeper explanations. High Sonnet ratio per milestone reveals topics where guided questioning doesn't work (AC #4)
      5. **Recurring Struggle Topics** — Group sessions by milestone, filter by high `total_messages` count (>10 messages = struggling). Cross-reference with `user_experience_level` to identify whether struggles are universal or experience-dependent (AC #4)
      6. **Common Questions Pattern** — Query `tutor_conversation_log` WHERE `message_role = 'user'` grouped by `milestone_slug` to find recurring question patterns and themes (AC #4)
    - **Example SQL queries** for each dashboard (using the views):
      - Browse conversations by milestone: `SELECT * FROM tutor_conversation_log WHERE milestone_slug = 'kv-store' AND created_at >= NOW() - INTERVAL '7 days' ORDER BY created_at DESC`
      - Filter by model tier: `SELECT * FROM tutor_conversation_log WHERE model LIKE 'claude-sonnet%' ORDER BY created_at DESC`
      - Socratic breakdown detection (high Sonnet ratio): `SELECT * FROM tutor_session_summary WHERE sonnet_messages > haiku_messages ORDER BY total_messages DESC`
      - Struggle patterns by milestone and experience: `SELECT milestone_title, user_role, experience_level, AVG(total_messages) as avg_messages, AVG(sonnet_messages::float / NULLIF(total_messages, 0)) as sonnet_ratio FROM tutor_session_summary GROUP BY milestone_title, user_role, experience_level ORDER BY avg_messages DESC`
      - Date range filtering: `SELECT * FROM tutor_session_summary WHERE first_message_at >= '2026-03-01' AND first_message_at < '2026-04-01'`
      - Recurring user questions by milestone: `SELECT milestone_slug, content, COUNT(*) as frequency FROM tutor_conversation_log WHERE message_role = 'user' GROUP BY milestone_slug, content HAVING COUNT(*) > 2 ORDER BY frequency DESC`
    - **Cursor-based pagination for direct SQL (ARCH-13):** Metabase handles pagination internally. For direct SQL browsing (most recent first), use: `SELECT * FROM tutor_conversation_log WHERE created_at < $last_seen_timestamp ORDER BY created_at DESC, message_id DESC LIMIT 50`. For composite cursor precision: `WHERE (created_at, message_id) < ($cursor_created_at, $cursor_id)`. Note: the existing tutor history API route (`GET /api/tutor/:sessionId/messages`) uses ASC ordering for chronological chat display — these admin queries use DESC for log review (most recent first). Both are valid; they serve different purposes.
    - **Privacy & PII guardrails:**
      - Conversation content contains user code and AI responses — this is PII
      - Restrict Metabase access to admin users only (Metabase has its own user management)
      - Never expose tutor conversation content in application logs at `info` level or above (project-context.md rule)
      - Do NOT create API endpoints that expose conversation content — Metabase/direct SQL only
      - Consider data retention: tutor_messages cascade-delete when user account is deleted (GDPR compliance via Story 8.3)

- [x] Task 3: Add integration tests for analytics views (AC: #1, #2, #3)
  - [x] 3.1 Create test file `apps/backend/src/plugins/tutor/tutor-analytics.test.ts` with:
    - **Rationale for location:** Tests live in the tutor plugin directory because the views are tutor-domain data. They don't test routes or services, but they test tutor data correctness — co-locating with the tutor plugin keeps related concerns together. The migration file lives in `migrations/` but tests for view behavior belong with the domain.
    - Set up test data: insert users, tracks, milestones, sessions, and tutor_messages using real DB (Kysely, cleanup in afterEach — delete in reverse dependency order: messages → sessions → milestones → tracks → users)
    - Query views using Kysely `sql` template tag since views aren't in generated types:
      ```typescript
      const rows = await sql<TutorConversationLogRow>`SELECT * FROM tutor_conversation_log WHERE session_id = ${sessionId}`.execute(db)
      ```
    - `describe('tutor_conversation_log view')`:
      - `it('should join tutor messages with user profile and milestone context')` — insert a user, track, milestone, session, and messages; query `tutor_conversation_log`; verify all joined fields present (user_email, milestone_title, message_role, model, etc.)
      - `it('should support filtering by milestone_slug')` — insert messages across 2 milestones; query with WHERE milestone_slug filter; verify only matching messages returned
      - `it('should support filtering by model')` — insert Haiku and Sonnet messages; query with WHERE model filter; verify only matching model returned
      - `it('should support filtering by date range')` — insert messages with different created_at timestamps using `vi.useFakeTimers()` + `vi.setSystemTime()`; query with date range; verify correct subset returned
      - `it('should include sessions with NULL milestone via LEFT JOIN')` — insert a session with no milestone_id (if schema allows) or verify LEFT JOIN doesn't exclude valid rows
    - `describe('tutor_session_summary view')`:
      - `it('should aggregate message counts per session')` — insert 3 user + 3 assistant messages in one session; query `tutor_session_summary`; verify total_messages=6, user_messages=3, assistant_messages=3
      - `it('should count model usage correctly')` — insert messages with mixed Haiku/Sonnet models; verify haiku_messages and sonnet_messages counts
      - `it('should include user background for pattern analysis')` — verify user_role, experience_level, primary_language populated from users table
      - `it('should return 0 duration_seconds for single-message sessions')` — insert one message; verify duration_seconds = 0 (COALESCE handling)
    - `describe('migration up/down')`:
      - `it('should create both views on migration up')` — query `pg_views` to verify `tutor_conversation_log` and `tutor_session_summary` exist
      - `it('should drop both views on migration down')` — run down migration; query `pg_views` to verify views are gone; re-run up to restore state
    - Follow existing test patterns: `it()` not `test()`, `vi.restoreAllMocks()` in afterEach, real PostgreSQL (never SQLite)
    - Use `@mycscompanion/config/test-utils/` for test utilities and mock factories where available

- [x] Task 4: Validate complete implementation (AC: #1-#6)
  - [x] 4.1 Run `pnpm lint` — zero new errors (pre-existing errors in website/execution/config packages unrelated to this story)
  - [x] 4.2 Run `pnpm typecheck` — zero type errors in backend (pre-existing MSW type issue in config package)
  - [x] 4.3 Run `pnpm test` — all 488 tests pass including 11 new analytics view tests
  - [x] 4.4 Run `pnpm build` — backend builds successfully
  - [x] 4.5 Verify views queryable: both views return correct columns via `docker exec psql`

## Dev Notes

### Architecture Compliance

- **No custom admin UI** — Metabase dashboards only (ARCH-24, AC #6)
- **Database views** are the appropriate abstraction — they provide the denormalized shape Metabase needs without adding API endpoints or application code
- **Views are read-only** — they cannot accidentally modify tutor data
- **Migration pattern** follows existing Kysely migration conventions (see `apps/backend/migrations/` for numbering)

### Why Database Views (Not API Endpoints)

The architecture mandates "no custom admin UI" and "external tooling only" for monitoring. Database views:
1. Make Metabase query authoring trivial (single table instead of 4-way JOINs)
2. Enforce consistent JOIN logic (admins can't accidentally miss a JOIN)
3. Are invisible to the application — no new routes, no auth changes, no plugin modifications
4. Can be queried by any SQL tool (Metabase, psql, DBeaver, etc.)

### Migration Numbering

Current highest migration: `010_add_data_exports.ts`. This story's migration is **`011_add_tutor_analytics_views.ts`**. This will be the first database view in the project — no existing views to conflict with.

### View Performance Considerations

- Views are **not materialized** — they execute the JOIN on every query. This is fine for admin/analytics use (low query volume, not user-facing)
- The existing indexes (`idx_tutor_messages_session_id_created_at`, `idx_tutor_messages_user_id`) support the JOINs efficiently
- For sessions/users/milestones, primary key lookups are fast
- If query performance becomes an issue at scale, convert to materialized views with periodic refresh — but this is NOT needed at MVP (100 users)

### Testing Strategy

- Tests query the views directly using Kysely's `sql` template tag (views aren't in generated types)
- Test data inserted into base tables, then views queried to verify denormalization
- Cleanup in afterEach: delete in reverse dependency order (messages → sessions → milestones → tracks → users), plus `vi.restoreAllMocks()`
- Tests verify: JOIN correctness, filter behavior, NULL edge cases, aggregation accuracy, AND migration up/down
- Use `vi.useFakeTimers()` + `vi.setSystemTime()` for date range tests (project-context.md rule: no `Date.now()` in test assertions)
- Follow existing tutor test patterns: see `apps/backend/src/plugins/tutor/routes/message.test.ts` for DB setup/teardown conventions

### Constraints & Anti-Patterns

**Do NOT:**
- Create API endpoints for tutor analytics — use database views + Metabase
- Build a custom admin dashboard page in the webapp — architecture says external tools only
- Create a separate tutor admin plugin — no new plugins needed
- Add materialized views — unnecessary at MVP scale
- Hardcode exact model version strings in view SQL — use `LIKE 'claude-haiku%'` / `LIKE 'claude-sonnet%'` prefix matching so views survive model version bumps
- Expose tutor conversation content in application logs — privacy requirement
- Use offset-based pagination in SQL examples — document cursor-based per ARCH-13

**Do:**
- Create views via Kysely migration (proper up/down with `CREATE VIEW` / `DROP VIEW`)
- Document all recommended queries in `docs/monitoring-setup.md`
- Test views against real PostgreSQL (never SQLite)
- Follow existing test file patterns from Story 10.2

### Previous Story (10.2) Intelligence

Key learnings from Story 10.2:
- Added documentation to `docs/monitoring-setup.md` — follow the same section structure
- Tests used `fastify.inject()` pattern — but for views, direct Kysely queries are more appropriate
- Story was largely verification of pre-existing work — similar pattern here (views + docs + tests)
- Code review found: always add type guards before `.map()`, add `toBeDefined()` before property assertions

### Git Intelligence

Recent commits follow the pattern: `Implement Story X.Y: Brief description with code review fixes`

Files modified in Story 10.2 relevant to this story:
- `docs/monitoring-setup.md` — add tutor section here (already has health monitoring + queue management sections)
- Test files follow co-located pattern — but analytics tests are cross-cutting, place in tutor plugin directory

### Project Structure Notes

**Files to CREATE:**
```
apps/backend/migrations/011_add_tutor_analytics_views.ts    # New migration for CREATE VIEW (first views in project)
apps/backend/src/plugins/tutor/tutor-analytics.test.ts      # View integration tests (tutor-domain data)
```

**Files to MODIFY:**
```
docs/monitoring-setup.md    # ADD tutor conversation log review section
```

**Files NOT to touch:**
- `apps/backend/src/plugins/tutor/routes/*` — no route changes
- `apps/backend/src/plugins/tutor/services/*` — no service changes
- `apps/backend/src/plugins/admin/*` — no admin plugin changes
- `apps/backend/src/app.ts` — no registration changes
- Any webapp files — no UI changes

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Epic-10, Story 10.3 — Acceptance criteria and story definition]
- [Source: _bmad-output/planning-artifacts/architecture.md#Monitoring-Observability — Metabase for dashboards, external tools only (ARCH-24)]
- [Source: _bmad-output/planning-artifacts/architecture.md#Cursor-Pagination — ARCH-13 cursor-based pagination pattern]
- [Source: _bmad-output/planning-artifacts/prd.md#FR54 — Admin can review AI tutor conversation logs]
- [Source: _bmad-output/project-context.md#Testing-Rules — Co-located tests, it() not test(), real PostgreSQL]
- [Source: _bmad-output/project-context.md#Anti-Patterns — No custom admin UI, no offset pagination]
- [Source: apps/backend/migrations/008_add_tutor_messages.ts — tutor_messages table schema]
- [Source: apps/backend/src/plugins/tutor/routes/history.ts — Cursor-based pagination implementation]
- [Source: apps/backend/src/plugins/tutor/services/anthropic.ts — Model routing (Haiku vs Sonnet selection)]
- [Source: apps/backend/src/plugins/tutor/routes/message.ts — Message insertion pattern with model tracking]
- [Source: _bmad-output/implementation-artifacts/10-2-execution-queue-management-via-bull-board.md — Previous story context, monitoring-setup.md pattern]
- [Source: _bmad-output/implementation-artifacts/10-1-infrastructure-health-monitoring.md — monitoring-setup.md creation]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6 (1M context)

### Debug Log References

None — clean implementation with no issues encountered.

### Completion Notes List

- Created migration `011_add_tutor_analytics_views.ts` with two PostgreSQL views: `tutor_conversation_log` (denormalized message-level) and `tutor_session_summary` (aggregated session-level with model usage breakdown)
- Views use `LIKE 'claude-haiku%'` / `LIKE 'claude-sonnet%'` prefix matching for model filtering (survives version bumps)
- Added comprehensive "Tutor Conversation Log Review" section to `docs/monitoring-setup.md` with 6 recommended dashboards, example SQL queries, cursor-based pagination guidance, and privacy guardrails
- Created 11 integration tests covering: JOIN correctness, milestone/model/date filtering, aggregation counts, model usage breakdown, user background inclusion, duration calculation, and migration up/down verification
- All tests use real PostgreSQL (never SQLite), follow `it()` convention, cleanup in `afterEach`
- No API endpoints created — Metabase/direct SQL only per ARCH-24
- Regenerated `kysely-codegen` types after migration

### Change Log

- 2026-03-15: Implemented Story 10.3 — Created tutor analytics database views, documentation, and integration tests

### File List

**Created:**
- `apps/backend/migrations/011_add_tutor_analytics_views.ts` — Kysely migration creating `tutor_conversation_log` and `tutor_session_summary` views
- `apps/backend/src/plugins/tutor/tutor-analytics.test.ts` — 11 integration tests for both views + migration up/down

**Modified:**
- `docs/monitoring-setup.md` — Added "Tutor Conversation Log Review" section with dashboards, queries, pagination, and privacy guidance
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — Updated 10-3 status to "review"
- `packages/shared/src/types/db.ts` — Regenerated by `kysely-codegen` (auto-generated, gitignored)
