# Story 10.4: Analytics & Reporting

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As an **admin**,
I want to query key platform metrics,
So that I can understand user behavior and identify improvement opportunities.

**Requirements Traced:** FR55, NFR-SC1, NFR-SC2, ARCH-24, ARCH-13

## Acceptance Criteria

1. **Given** the platform has active users **When** the admin accesses analytics **Then** the following metrics are queryable via direct SQL or Metabase: signup count, milestone completion rates, per-milestone dropout points, retention (returning users), average time-to-completion per milestone, and active user count (FR55)
2. **And** Metabase is connected to the PostgreSQL database with pre-configured dashboard queries for key metrics (ARCH-24)
3. **And** queries can filter by date range, milestone, and user cohort
4. **And** the system supports 100 concurrent users at MVP scale without analytics queries impacting platform performance (NFR-SC1)
5. **And** a cost tracking query is available that calculates per-user infrastructure cost based on Railway and Fly.io usage data (NFR-SC2)
6. **And** the cost query is documented with the formula and data sources, enabling monthly cost-per-user monitoring
7. **And** no custom analytics UI is built — Metabase and direct SQL are sufficient at MVP

## Critical Context: This Story Is Database Views + Documentation + Verification

This story follows the exact same pattern as Story 10.3: create PostgreSQL views via Kysely migration to make analytics queries trivial for Metabase, document recommended dashboards and queries in `docs/monitoring-setup.md`, and add integration tests for the views.

**No application code, no new routes, no UI changes.** All analytics are consumed via Metabase or direct SQL per ARCH-24.

### What Already Exists (DO NOT recreate)

| Component | File | Status |
|---|---|---|
| `users` table | `apps/backend/migrations/001_initial_schema.ts` + `002` + `003` | DONE — id, email, display_name, role, experience_level, primary_language, created_at, onboarding_completed_at, skill_floor_passed, skill_floor_completed_at |
| `milestones` table | `apps/backend/migrations/001_initial_schema.ts` | DONE — id, track_id, title, slug, position |
| `user_milestones` table | `apps/backend/migrations/005_add_user_milestones.ts` | DONE — id, user_id, milestone_id, completed_at, completing_submission_id |
| `submissions` table | `apps/backend/migrations/004_add_submissions.ts` | DONE — id, user_id, milestone_id, code, status, execution_result, criteria_results, created_at |
| `sessions` table | `apps/backend/migrations/006_add_sessions_and_code_snapshots.ts` | DONE — id, user_id, milestone_id, started_at, ended_at, is_active |
| `benchmark_results` table | `apps/backend/migrations/009_add_benchmark_results.ts` | DONE — id, submission_id, user_id, milestone_id, benchmark_name, normalized_ratio, created_at |
| Tutor analytics views | `apps/backend/migrations/011_add_tutor_analytics_views.ts` | DONE — tutor_conversation_log, tutor_session_summary |
| Monitoring docs | `docs/monitoring-setup.md` | DONE — health monitoring (10.1), queue management (10.2), tutor conversation review (10.3) |
| Admin auth (Basic Auth) | `apps/backend/src/plugins/admin/index.ts` | DONE — timing-safe comparison |
| Metabase docker config | `docker-compose.yml` | DONE — `--profile metabase` for local use |

### Data Model for Analytics Views

All data needed for the six core metrics already exists in the database:

| Metric | Source Table(s) | Key Columns |
|---|---|---|
| Signup count | `users` | `created_at` |
| Milestone completion rates | `user_milestones` + `milestones` + `users` | `completed_at`, `milestone_id` |
| Per-milestone dropout | `submissions` + `user_milestones` | Users with submissions but no completion record |
| Retention (returning users) | `sessions` | `user_id`, `started_at` (users with 2+ sessions across different days) |
| Time-to-completion | `sessions` + `user_milestones` | First session `started_at` → `user_milestones.completed_at` |
| Active user count | `sessions` | `user_id`, `started_at` within date range |

### Cost Tracking (NFR-SC2)

Cost tracking cannot be fully automated via database views because Railway and Fly.io costs live in external billing systems. The story should:
1. Document the cost formula with data sources
2. Provide a SQL query that computes per-user resource consumption metrics from internal data (submissions count, execution time, session count, tutor messages)
3. Document how to combine internal metrics with Railway/Fly.io billing dashboard numbers to calculate per-user cost
4. Target: ≤$0.65/month per user at 100 concurrent users

## Tasks / Subtasks

- [x] Task 1: Create database views for platform analytics (AC: #1, #3, #4)
  - [x] 1.1 Create Kysely migration `012_add_platform_analytics_views.ts` with the following views:
    - **`platform_signup_metrics`** — Daily signup aggregation:
      ```sql
      CREATE VIEW platform_signup_metrics AS
      SELECT
        DATE_TRUNC('day', u.created_at) AS signup_date,
        COUNT(*) AS signup_count,
        COUNT(*) FILTER (WHERE u.onboarding_completed_at IS NOT NULL) AS onboarding_completed_count,
        COUNT(*) FILTER (WHERE u.skill_floor_passed = true) AS skill_floor_passed_count,
        COUNT(*) FILTER (WHERE u.role = 'learner') AS learner_count
      FROM users u
      GROUP BY DATE_TRUNC('day', u.created_at);
      ```
    - **`milestone_completion_metrics`** — Completion rates per milestone with user context:
      ```sql
      CREATE VIEW milestone_completion_metrics AS
      SELECT
        m.id AS milestone_id,
        m.title AS milestone_title,
        m.slug AS milestone_slug,
        m.position AS milestone_position,
        t.name AS track_name,
        t.slug AS track_slug,
        COUNT(DISTINCT um.user_id) AS completed_users,
        MIN(um.completed_at) AS first_completion_at,
        MAX(um.completed_at) AS latest_completion_at
      FROM milestones m
      JOIN tracks t ON m.track_id = t.id
      LEFT JOIN user_milestones um ON m.id = um.milestone_id
      GROUP BY m.id, m.title, m.slug, m.position, t.name, t.slug;
      ```
      **Note:** `completed_users` = 0 for milestones nobody has completed yet (LEFT JOIN). Total user count for rate calculation comes from `platform_signup_metrics` or `SELECT COUNT(*) FROM users`.
    - **`milestone_dropout_analysis`** — Users who attempted but didn't complete each milestone:
      ```sql
      CREATE VIEW milestone_dropout_analysis AS
      SELECT
        m.id AS milestone_id,
        m.title AS milestone_title,
        m.slug AS milestone_slug,
        m.position AS milestone_position,
        s.user_id,
        u.role AS user_role,
        u.experience_level,
        COUNT(DISTINCT sub.id) AS submission_count,
        COUNT(DISTINCT s.id) AS session_count,
        MIN(s.started_at) AS first_session_at,
        MAX(COALESCE(s.ended_at, s.started_at)) AS last_activity_at,
        BOOL_OR(um.id IS NOT NULL) AS completed
      FROM milestones m
      JOIN sessions s ON s.milestone_id = m.id
      JOIN users u ON s.user_id = u.id
      LEFT JOIN submissions sub ON sub.user_id = s.user_id AND sub.milestone_id = m.id
      LEFT JOIN user_milestones um ON um.user_id = s.user_id AND um.milestone_id = m.id
      GROUP BY m.id, m.title, m.slug, m.position, s.user_id, u.role, u.experience_level;
      ```
      **Usage:** Filter `WHERE completed = false` to find dropout users. Compare `submission_count` and `session_count` to understand engagement before dropout. Group by `milestone_slug` and `experience_level` to identify where different skill levels struggle.
    - **`user_retention_daily`** — Daily active users for retention analysis:
      ```sql
      CREATE VIEW user_retention_daily AS
      SELECT
        DATE_TRUNC('day', s.started_at) AS activity_date,
        s.user_id,
        u.role AS user_role,
        u.experience_level,
        DATE_TRUNC('day', u.created_at) AS signup_date,
        COUNT(DISTINCT s.id) AS session_count,
        COUNT(DISTINCT s.milestone_id) AS milestones_touched
      FROM sessions s
      JOIN users u ON s.user_id = u.id
      GROUP BY DATE_TRUNC('day', s.started_at), s.user_id, u.role, u.experience_level, DATE_TRUNC('day', u.created_at);
      ```
      **Usage:** Cohort retention = group by `signup_date`, then count distinct `user_id` per `activity_date`. Day-N retention = users where `activity_date - signup_date = N days`.
    - **`milestone_time_to_completion`** — Time from first session to milestone completion:
      ```sql
      CREATE VIEW milestone_time_to_completion AS
      SELECT
        um.user_id,
        um.milestone_id,
        m.title AS milestone_title,
        m.slug AS milestone_slug,
        m.position AS milestone_position,
        u.role AS user_role,
        u.experience_level,
        MIN(s.started_at) AS first_session_at,
        um.completed_at,
        EXTRACT(EPOCH FROM um.completed_at - MIN(s.started_at)) AS time_to_completion_seconds,
        COUNT(DISTINCT s.id) AS total_sessions,
        COUNT(DISTINCT sub.id) AS total_submissions
      FROM user_milestones um
      JOIN milestones m ON um.milestone_id = m.id
      JOIN users u ON um.user_id = u.id
      JOIN sessions s ON s.user_id = um.user_id AND s.milestone_id = um.milestone_id
      LEFT JOIN submissions sub ON sub.user_id = um.user_id AND sub.milestone_id = um.milestone_id
      GROUP BY um.user_id, um.milestone_id, m.title, m.slug, m.position, u.role, u.experience_level, um.completed_at;
      ```
      **Usage:** `SELECT milestone_slug, AVG(time_to_completion_seconds) / 3600 AS avg_hours FROM milestone_time_to_completion GROUP BY milestone_slug ORDER BY milestone_position` for per-milestone average.
    - **`user_resource_consumption`** — Per-user resource usage for cost estimation (NFR-SC2):
      ```sql
      CREATE VIEW user_resource_consumption AS
      SELECT
        u.id AS user_id,
        u.email,
        u.role AS user_role,
        u.created_at AS signup_date,
        COUNT(DISTINCT s.id) AS total_sessions,
        COUNT(DISTINCT sub.id) AS total_submissions,
        COUNT(DISTINCT sub.id) FILTER (WHERE sub.status = 'completed') AS successful_submissions,
        COUNT(DISTINCT sub.id) FILTER (WHERE sub.status = 'failed') AS failed_submissions,
        COUNT(DISTINCT tm.id) AS total_tutor_messages,
        COUNT(DISTINCT tm.id) FILTER (WHERE tm.model LIKE 'claude-sonnet%') AS sonnet_messages,
        COUNT(DISTINCT tm.id) FILTER (WHERE tm.model LIKE 'claude-haiku%') AS haiku_messages,
        COUNT(DISTINCT br.id) AS total_benchmark_runs,
        COUNT(DISTINCT cs.id) AS total_code_snapshots,
        COUNT(DISTINCT um.id) AS milestones_completed
      FROM users u
      LEFT JOIN sessions s ON s.user_id = u.id
      LEFT JOIN submissions sub ON sub.user_id = u.id
      LEFT JOIN tutor_messages tm ON tm.user_id = u.id
      LEFT JOIN benchmark_results br ON br.user_id = u.id
      LEFT JOIN code_snapshots cs ON cs.user_id = u.id
      LEFT JOIN user_milestones um ON um.user_id = u.id
      GROUP BY u.id, u.email, u.role, u.created_at;
      ```
      **Usage:** Combined with Railway/Fly.io billing data for per-user cost calculation. See cost formula in docs.
  - [x] 1.2 **Migration down:** Drop all 6 views in reverse order:
    ```sql
    DROP VIEW IF EXISTS user_resource_consumption;
    DROP VIEW IF EXISTS milestone_time_to_completion;
    DROP VIEW IF EXISTS user_retention_daily;
    DROP VIEW IF EXISTS milestone_dropout_analysis;
    DROP VIEW IF EXISTS milestone_completion_metrics;
    DROP VIEW IF EXISTS platform_signup_metrics;
    ```
  - [x] 1.3 Run migration: `pnpm --filter backend db:migrate`
  - [x] 1.4 Regenerate types: `pnpm --filter shared db:types`

- [x] Task 2: Add analytics documentation to monitoring-setup.md (AC: #1, #2, #3, #5, #6, #7)
  - [x] 2.1 Add an "Analytics & Reporting" section to `docs/monitoring-setup.md` covering:
    - **Purpose:** Understand user behavior, identify improvement opportunities, monitor platform health metrics
    - **Data source:** 6 PostgreSQL views created in migration 012
    - **Access method:** Metabase dashboards (connected to PostgreSQL `DATABASE_URL`) or direct SQL
    - **Metabase access:** Same as Story 10.3 — `docker compose --profile metabase up metabase`, access at `http://localhost:3000`
    - **Recommended Metabase dashboards** (map to AC #1 metrics):
      1. **Signup Funnel** — Daily signups, onboarding completion rate, skill floor pass rate using `platform_signup_metrics` view. Filter by date range. Key insight: what percentage of signups complete onboarding vs drop off?
      2. **Milestone Completion Rates** — Completed users per milestone using `milestone_completion_metrics` view. Compare across milestones ordered by position to see progression funnel. Calculate rate as `completed_users / total_registered_users`.
      3. **Dropout Analysis** — Users who attempted but didn't complete each milestone using `milestone_dropout_analysis` WHERE `completed = false`. Group by `experience_level` to see if dropouts correlate with skill level. Cross-reference with `submission_count` (low submissions = quick dropout, high submissions = persistent struggle).
      4. **User Retention** — Cohort retention chart using `user_retention_daily` view. Group by `signup_date` as cohort, then pivot on `activity_date` to see day-1, day-7, day-30 retention. Filter by `user_role` for segment analysis.
      5. **Time to Completion** — Average hours to complete each milestone using `milestone_time_to_completion` view. Group by `milestone_slug`, segment by `experience_level`. Identifies milestones that take unexpectedly long.
      6. **Active Users** — Daily/weekly/monthly active users from `user_retention_daily`. `COUNT(DISTINCT user_id)` grouped by `activity_date` for DAU, or `DATE_TRUNC('week', activity_date)` for WAU.
      7. **Cost Analysis** — Per-user resource consumption using `user_resource_consumption` view. Identifies heavy users (many submissions, many tutor messages). Combined with billing data for cost-per-user.
    - **Example SQL queries** for each dashboard (using the views):
      - Signup funnel: `SELECT * FROM platform_signup_metrics WHERE signup_date >= NOW() - INTERVAL '30 days' ORDER BY signup_date DESC`
      - Milestone completion rates: `SELECT milestone_title, milestone_position, completed_users, ROUND(completed_users * 100.0 / NULLIF((SELECT COUNT(*) FROM users), 0), 1) AS completion_rate_pct FROM milestone_completion_metrics ORDER BY milestone_position`
      - Dropout users per milestone: `SELECT milestone_title, experience_level, COUNT(*) AS dropout_count, AVG(submission_count) AS avg_submissions FROM milestone_dropout_analysis WHERE completed = false GROUP BY milestone_title, experience_level ORDER BY dropout_count DESC`
      - Day-7 retention by cohort: `SELECT signup_date, COUNT(DISTINCT user_id) FILTER (WHERE activity_date = signup_date) AS day_0, COUNT(DISTINCT user_id) FILTER (WHERE activity_date = signup_date + INTERVAL '7 days') AS day_7 FROM user_retention_daily GROUP BY signup_date ORDER BY signup_date DESC`
      - Average time-to-completion: `SELECT milestone_slug, milestone_position, ROUND(AVG(time_to_completion_seconds) / 3600, 1) AS avg_hours, ROUND(AVG(total_submissions), 1) AS avg_submissions FROM milestone_time_to_completion GROUP BY milestone_slug, milestone_position ORDER BY milestone_position`
      - DAU/WAU/MAU: `SELECT DATE_TRUNC('day', activity_date) AS day, COUNT(DISTINCT user_id) AS dau FROM user_retention_daily WHERE activity_date >= NOW() - INTERVAL '30 days' GROUP BY day ORDER BY day DESC`
      - Top resource consumers: `SELECT email, total_sessions, total_submissions, total_tutor_messages, sonnet_messages, milestones_completed FROM user_resource_consumption ORDER BY total_submissions DESC LIMIT 20`
    - **Cost tracking formula (NFR-SC2):**
      - Document the per-user cost formula:
        ```
        Monthly cost per user = (Railway monthly bill + Fly.io monthly bill) / active_user_count

        Where:
        - Railway monthly bill: Sum of api, worker, postgres, redis service costs from Railway dashboard → Billing
        - Fly.io monthly bill: Execution machine costs from Fly.io dashboard → Billing
        - active_user_count: SELECT COUNT(DISTINCT user_id) FROM user_retention_daily WHERE activity_date >= NOW() - INTERVAL '30 days'

        Target: ≤ $0.65/month per user at 100 concurrent users
        ```
      - Resource consumption breakdown query for identifying cost drivers:
        ```sql
        SELECT
          'submissions' AS resource, COUNT(*) AS count FROM submissions WHERE created_at >= NOW() - INTERVAL '30 days'
        UNION ALL
        SELECT
          'tutor_messages', COUNT(*) FROM tutor_messages WHERE created_at >= NOW() - INTERVAL '30 days'
        UNION ALL
        SELECT
          'sessions', COUNT(*) FROM sessions WHERE started_at >= NOW() - INTERVAL '30 days'
        UNION ALL
        SELECT
          'benchmark_runs', COUNT(*) FROM benchmark_results WHERE created_at >= NOW() - INTERVAL '30 days';
        ```
      - Note: Railway and Fly.io costs are external — pull from their respective billing dashboards monthly. No API integration needed at MVP.
    - **Cursor-based pagination for direct SQL (ARCH-13):** For views returning many rows, use cursor-based pagination:
      ```sql
      -- Dropout analysis (recent activity first)
      SELECT * FROM milestone_dropout_analysis
      WHERE last_activity_at < $cursor_timestamp
      ORDER BY last_activity_at DESC LIMIT 50;

      -- Retention daily (most recent first)
      SELECT * FROM user_retention_daily
      WHERE (activity_date, user_id) < ($cursor_date, $cursor_user_id)
      ORDER BY activity_date DESC, user_id DESC LIMIT 50;
      ```
      Note: Metabase handles its own pagination — cursor queries are for direct SQL use only.
    - **Performance considerations (NFR-SC1):**
      - All views are non-materialized (execute JOINs on query). This is fine for admin analytics (low query volume, not user-facing).
      - Existing indexes support efficient querying: `idx_submissions_user_id_milestone_id`, `idx_sessions_user_id_milestone_id`, `idx_user_milestones_user_id_milestone_id`.
      - Always filter by date range in Metabase to avoid full table scans.
      - If analytics queries cause performance issues at scale (unlikely at 100 users), convert to materialized views with periodic refresh — NOT needed at MVP.
      - Analytics views are read-only — they cannot affect write performance or user-facing routes.

- [x] Task 3: Add integration tests for analytics views (AC: #1, #3, #4)
  - [x] 3.1 Create test file `apps/backend/src/plugins/admin/platform-analytics.test.ts` with:
    - **Rationale for location:** Tests live in the admin plugin directory because these are admin-facing analytics views (unlike tutor-specific views which live in the tutor plugin). They test platform-wide metrics, not domain-specific tutor data.
    - Set up test data: insert users (with varying `created_at`, `role`, `experience_level`), tracks, milestones, sessions, submissions, user_milestones, tutor_messages, benchmark_results, code_snapshots
    - Cleanup in `afterEach`: delete in reverse dependency order (benchmark_results → code_snapshots → tutor_messages → session_summaries → submissions → user_milestones → sessions → milestones → tracks → users), plus `vi.restoreAllMocks()`
    - **Exact import pattern** (from reference `tutor-analytics.test.ts`):
      ```typescript
      import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
      import { sql } from 'kysely'
      import { db } from '../../shared/db.js'
      import { generateId } from '../../shared/id.js'
      import { up, down } from '../../../migrations/012_add_platform_analytics_views.js'
      ```
    - Use `generateId()` from `../../shared/id.js` for all test entity IDs (generates cuid2). Never use hardcoded strings or `crypto.randomUUID()`.
    - Query views using Kysely `sql` template tag (views aren't in generated types):
      ```typescript
      const rows = await sql<PlatformSignupMetricsRow>`SELECT * FROM platform_signup_metrics WHERE signup_date >= ${startDate}`.execute(db)
      ```
    - `describe('platform_signup_metrics view')`:
      - `it('should aggregate signups by day')` — insert 3 users with same created_at day, 1 with different day; verify correct counts per day
      - `it('should count onboarding and skill floor completion separately')` — insert users with varying onboarding_completed_at and skill_floor_passed; verify filtered counts
    - `describe('milestone_completion_metrics view')`:
      - `it('should count completed users per milestone')` — insert user_milestones for 2 users completing milestone A, 1 completing milestone B; verify counts
      - `it('should return 0 completed_users for milestones with no completions')` — verify LEFT JOIN works correctly
    - `describe('milestone_dropout_analysis view')`:
      - `it('should identify users who attempted but did not complete a milestone')` — insert sessions + submissions for user without user_milestones entry; verify `completed = false`
      - `it('should mark completed users correctly')` — insert user_milestones entry; verify `completed = true`
      - `it('should include submission and session counts')` — insert multiple sessions/submissions; verify aggregated counts
    - `describe('user_retention_daily view')`:
      - `it('should group user activity by day')` — insert sessions on different days; verify distinct rows per day
      - `it('should count distinct milestones touched per day')` — insert sessions for different milestones on same day; verify milestones_touched count
      - `it('should include signup_date for cohort analysis')` — verify signup_date matches user created_at truncated to day
    - `describe('milestone_time_to_completion view')`:
      - `it('should calculate time from first session to completion')` — insert session with known started_at, user_milestone with known completed_at; verify time_to_completion_seconds
      - `it('should count total sessions and submissions')` — insert multiple sessions/submissions for the same user+milestone; verify counts
    - `describe('user_resource_consumption view')`:
      - `it('should aggregate all user resource usage')` — insert sessions, submissions, tutor_messages, benchmark_results, code_snapshots for a user; verify all counts
      - `it('should count model-specific tutor messages')` — insert haiku and sonnet messages; verify haiku_messages and sonnet_messages counts
      - `it('should return zero counts for inactive users')` — insert user with no activity; verify all counts are 0
    - `describe('migration up/down')`:
      - `it('should create all 6 views on migration up')` — query `pg_views` to verify all 6 views exist
      - `it('should drop all 6 views on migration down')` — run down migration; query `pg_views` to verify views are gone; re-run up to restore state
    - Follow existing test patterns from Story 10.3: `it()` not `test()`, `vi.restoreAllMocks()` in afterEach, real PostgreSQL, `vi.useFakeTimers()` for date-dependent tests

- [x] Task 4: Validate complete implementation (AC: #1-#7)
  - [x] 4.1 Run `pnpm lint` — zero new errors (pre-existing errors in other packages only)
  - [x] 4.2 Run `pnpm typecheck` — zero new type errors (pre-existing errors in @mycscompanion/config and test rootDir issues from Story 10.3 pattern)
  - [x] 4.3 Run `pnpm test` — all 505 tests pass including 17 new analytics view tests, zero regressions
  - [x] 4.4 Run `pnpm build` — same pre-existing type issues as Story 10.3 (test files importing from migrations outside rootDir)
  - [x] 4.5 Verify views queryable: all 6 views created and tested via integration tests against real PostgreSQL

## Dev Notes

### Architecture Compliance

- **No custom admin UI** — Metabase dashboards only (ARCH-24, AC #7)
- **Database views** are the appropriate abstraction — they provide the denormalized shape Metabase needs without adding API endpoints or application code
- **Views are read-only** — they cannot accidentally modify platform data
- **Migration pattern** follows existing Kysely migration conventions (see `apps/backend/migrations/` for numbering)
- **No materialized views** — unnecessary at MVP scale (100 users). Convert later if needed.

### Why Database Views (Not API Endpoints)

Same rationale as Story 10.3: architecture mandates no custom admin UI, external tooling only. Database views:
1. Make Metabase query authoring trivial (pre-joined, pre-aggregated)
2. Enforce consistent JOIN logic (admins can't accidentally miss a JOIN)
3. Are invisible to the application — no new routes, no auth changes, no plugin modifications
4. Can be queried by any SQL tool (Metabase, psql, DBeaver, etc.)

### Migration Numbering

Current highest migration: `011_add_tutor_analytics_views.ts`. This story's migration is **`012_add_platform_analytics_views.ts`**.

### Migration Implementation Pattern

The migration MUST use Kysely's `sql` template literal for raw SQL (Kysely's query builder does not support `CREATE VIEW`). Follow the exact pattern from migration 011:

```typescript
import { type Kysely, sql } from 'kysely'

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`CREATE VIEW view_name AS SELECT ...`.execute(db)
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`DROP VIEW IF EXISTS view_name`.execute(db)
}
```

Do NOT attempt to use `db.schema.createView()` — it does not exist in Kysely.

### View Design Decisions

1. **`platform_signup_metrics`** — Aggregated by day because that's the natural granularity for signup funnels. Weekly/monthly can be derived via `DATE_TRUNC` on `signup_date`.
2. **`milestone_completion_metrics`** — LEFT JOIN on `user_milestones` ensures milestones with zero completions still appear (important for seeing the full funnel).
3. **`milestone_dropout_analysis`** — Per-user per-milestone grain with a `completed` boolean. The admin filters `WHERE completed = false` to find dropouts. Including `submission_count` and `session_count` helps distinguish "quick dropouts" from "persistent strugglers."
4. **`user_retention_daily`** — Per-user per-day grain for maximum flexibility. Cohort analysis, DAU/WAU/MAU, and retention curves can all be derived from this single view.
5. **`milestone_time_to_completion`** — Only includes users who have completed the milestone (INNER JOIN on `user_milestones`). Users still in progress are not in this view — they appear in `milestone_dropout_analysis` instead.
6. **`user_resource_consumption`** — Aggregates across ALL tables for per-user resource usage. Uses `COUNT(DISTINCT)` to avoid double-counting from multiple LEFT JOINs. Uses `LIKE 'claude-haiku%'` / `LIKE 'claude-sonnet%'` prefix matching (same pattern as Story 10.3) so views survive model version bumps.

### Performance Considerations

- All 6 views are non-materialized — they execute JOINs on every query. This is fine for admin analytics at MVP scale.
- Existing indexes support all JOINs efficiently:
  - `idx_submissions_user_id_milestone_id` — submissions by user+milestone
  - `idx_sessions_user_id_milestone_id` — sessions by user+milestone
  - `idx_user_milestones_user_id_milestone_id` (UNIQUE) — completion records
  - `idx_tutor_messages_user_id` — tutor messages by user
  - `idx_benchmark_results_user_id_milestone_id` — benchmark results by user+milestone
  - `idx_code_snapshots_user_id_milestone_id` — code snapshots by user+milestone
- `user_resource_consumption` view has the most JOINs (7 LEFT JOINs). **Cartesian product warning:** intermediate results can explode (e.g., 10 sessions × 10 submissions × 10 messages = 1000 intermediate rows per user before aggregation). `COUNT(DISTINCT)` ensures correct results despite this, but wastes I/O. At 100 users this is trivial. If it becomes slow at scale, it's the first candidate for materialization or refactoring into subquery CTEs.

### Testing Strategy

- Tests query the views directly using Kysely's `sql` template tag (views aren't in generated types)
- Test data inserted into base tables, then views queried to verify denormalization and aggregation
- Cleanup in afterEach: delete in reverse dependency order, plus `vi.restoreAllMocks()`
- Use `vi.useFakeTimers()` + `vi.setSystemTime()` for date-dependent tests (project-context.md rule: no `Date.now()` in test assertions)
- Follow existing tutor analytics test patterns from Story 10.3: see `apps/backend/src/plugins/tutor/tutor-analytics.test.ts`

### Cost Tracking Notes (NFR-SC2)

The cost tracking query (`user_resource_consumption` view) provides **internal resource consumption metrics only**. Actual dollar costs come from external billing systems (Railway dashboard, Fly.io dashboard) that cannot be queried via SQL.

The documented formula combines:
- Internal data: active user count, submissions, tutor messages (from views)
- External data: monthly Railway + Fly.io bills (manually checked)

This is sufficient at MVP — automated cost API integration is not required.

### Constraints & Anti-Patterns

**Do NOT:**
- Create API endpoints for analytics — use database views + Metabase
- Build a custom admin dashboard page in the webapp — architecture says external tools only
- Create materialized views — unnecessary at MVP scale
- Use offset-based pagination in SQL examples — document cursor-based per ARCH-13
- Create new admin plugin routes — no routes needed for this story
- Add `any` types in test files — use proper row type definitions with `sql` template tag

**Do:**
- Create views via Kysely migration (proper up/down with `CREATE VIEW` / `DROP VIEW`)
- Document all recommended queries in `docs/monitoring-setup.md`
- Test views against real PostgreSQL (never SQLite)
- Follow existing test file patterns from Story 10.3
- Use `COUNT(DISTINCT)` in `user_resource_consumption` to avoid inflated counts from multiple LEFT JOINs

### Previous Story (10.3) Intelligence

Key learnings from Story 10.3 (directly applicable):
- Created database views via Kysely migration — exact same pattern to follow
- Documented dashboards in `docs/monitoring-setup.md` — add new section below existing tutor section
- Tests used Kysely `sql` template tag for view queries — reuse this pattern
- Used `LIKE 'claude-haiku%'` prefix matching for model filtering — reuse for `user_resource_consumption`
- Migration down drops views in reverse creation order — follow same pattern
- Tests clean up in reverse dependency order — follow same pattern
- Code review found: always add type guards before `.map()`, add `toBeDefined()` before property assertions

### Git Intelligence

Recent commits follow the pattern: `Implement Story X.Y: Brief description with code review fixes`

Files modified in Story 10.3 relevant to this story:
- `apps/backend/migrations/011_add_tutor_analytics_views.ts` — reference for migration structure
- `apps/backend/src/plugins/tutor/tutor-analytics.test.ts` — reference for test structure with Kysely `sql` tag
- `docs/monitoring-setup.md` — add analytics section here (already has health monitoring + queue management + tutor sections)

### Project Structure Notes

**Files to CREATE:**
```
apps/backend/migrations/012_add_platform_analytics_views.ts    # New migration for 6 analytics views
apps/backend/src/plugins/admin/platform-analytics.test.ts      # View integration tests (admin-facing analytics)
```

**Files to MODIFY:**
```
docs/monitoring-setup.md    # ADD analytics & reporting section
```

**Files NOT to touch:**
- `apps/backend/src/plugins/*/routes/*` — no route changes
- `apps/backend/src/plugins/*/services/*` — no service changes
- `apps/backend/src/app.ts` — no registration changes
- Any webapp files — no UI changes
- Any website files — no landing page changes

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Epic-10, Story 10.4 — Acceptance criteria and story definition]
- [Source: _bmad-output/planning-artifacts/architecture.md#Monitoring-Observability — Metabase for dashboards, external tools only (ARCH-24)]
- [Source: _bmad-output/planning-artifacts/architecture.md#Cursor-Pagination — ARCH-13 cursor-based pagination pattern]
- [Source: _bmad-output/planning-artifacts/prd.md#FR55 — Admin can query key platform metrics]
- [Source: _bmad-output/planning-artifacts/prd.md#NFR-SC1 — 100 concurrent users at MVP scale]
- [Source: _bmad-output/planning-artifacts/prd.md#NFR-SC2 — Per-user cost tracking ≤$0.65/month]
- [Source: _bmad-output/project-context.md#Testing-Rules — Co-located tests, it() not test(), real PostgreSQL]
- [Source: _bmad-output/project-context.md#Anti-Patterns — No custom admin UI, no offset pagination]
- [Source: apps/backend/migrations/001_initial_schema.ts — users, tracks, milestones tables]
- [Source: apps/backend/migrations/004_add_submissions.ts — submissions table]
- [Source: apps/backend/migrations/005_add_user_milestones.ts — user_milestones table]
- [Source: apps/backend/migrations/006_add_sessions_and_code_snapshots.ts — sessions, code_snapshots tables]
- [Source: apps/backend/migrations/008_add_tutor_messages.ts — tutor_messages table]
- [Source: apps/backend/migrations/009_add_benchmark_results.ts — benchmark_results table]
- [Source: apps/backend/migrations/011_add_tutor_analytics_views.ts — Reference implementation for view migrations]
- [Source: apps/backend/src/plugins/tutor/tutor-analytics.test.ts — Reference implementation for view tests]
- [Source: _bmad-output/implementation-artifacts/10-3-ai-tutor-conversation-log-review.md — Previous story context, patterns, and learnings]
- [Source: docs/monitoring-setup.md — Existing monitoring documentation structure]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6 (1M context)

### Debug Log References

### Completion Notes List

- Created migration `012_add_platform_analytics_views.ts` with 6 PostgreSQL views: `platform_signup_metrics`, `milestone_completion_metrics`, `milestone_dropout_analysis`, `user_retention_daily`, `milestone_time_to_completion`, `user_resource_consumption`
- All views follow the exact pattern from Story 10.3 (migration 011) — raw SQL via Kysely `sql` template tag
- Added comprehensive "Analytics & Reporting" section to `docs/monitoring-setup.md` with 7 recommended dashboards, example SQL queries, cost tracking formula (NFR-SC2), cursor-based pagination (ARCH-13), and performance considerations (NFR-SC1)
- Created 17 integration tests covering all 6 views plus migration up/down, following tutor-analytics.test.ts patterns
- All 505 tests pass with zero regressions
- No application code, routes, or UI changes — database views + documentation only per ARCH-24

### File List

- `apps/backend/migrations/012_add_platform_analytics_views.ts` — NEW: Migration creating 6 analytics views
- `apps/backend/src/plugins/admin/platform-analytics.test.ts` — NEW: 17 integration tests for analytics views
- `docs/monitoring-setup.md` — MODIFIED: Added "Analytics & Reporting" section with dashboards, queries, cost formula
- `.gitignore` — MODIFIED: Added migration build artifact exclusions
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — MODIFIED: Story status updated
- `_bmad-output/implementation-artifacts/10-4-analytics-and-reporting.md` — MODIFIED: Tasks marked complete, dev agent record

### Change Log

- 2026-03-15: Implemented Story 10.4 — Created 6 platform analytics database views, documented dashboards and cost tracking in monitoring-setup.md, added 17 integration tests
- 2026-03-15: Code review fixes — Added PII guardrails to analytics docs, expanded test for multi-day signup aggregation, added WAU/MAU queries and experience_level segmentation to docs, added Cartesian product warning comment to migration, added migration build artifacts to .gitignore
