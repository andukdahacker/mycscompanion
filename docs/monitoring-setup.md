# Monitoring Setup

All monitoring for mycscompanion uses external tooling — no custom admin UI.

## Sentry Alert Configuration

Alert rules are configured in the **Sentry dashboard** (not in code).

Navigate to: **Settings → Alerts → Create Rule**

### Required Alert Rules

| Alert Rule | Trigger | Window | Action |
|---|---|---|---|
| High Error Rate | Error count > 10 | 1 hour | Email admin |
| New Issue | First occurrence of new error type | Immediate | Email admin |
| Unhandled Exception | Any unhandled exception | Immediate | Email admin |

### Setup Steps

1. Go to your Sentry project → **Alerts** → **Create Alert Rule**
2. For **High Error Rate:**
   - Select "Issue" alert type
   - Condition: "An event is seen more than 10 times in 1 hour"
   - Action: Send notification to admin email
3. For **New Issue:**
   - Select "Issue" alert type
   - Condition: "A new issue is created"
   - Action: Send notification to admin email
4. For **Unhandled Exception:**
   - Select "Issue" alert type
   - Filter: `error.unhandled:true`
   - Action: Send notification to admin email

### Sentry Features Enabled

- **Error tracking:** Automatic via `@sentry/node` (backend) and `@sentry/react` (webapp)
- **Release tracking:** Uses `RAILWAY_GIT_COMMIT_SHA` for deployment association
- **Environment tagging:** `production` / `staging` / `development`
- **Performance monitoring:** Disabled for MVP (`tracesSampleRate: 0`)

## Railway Monitoring

### Service Health

Railway provides built-in monitoring for all services via the Railway dashboard.

| Service | Type | Health Check | Monitoring |
|---|---|---|---|
| api | Web service | `GET /health` (configured in `railway.toml`) | Dashboard metrics, logs |
| worker | Worker service | BullMQ worker activity | Dashboard metrics, logs |
| postgres | Managed database | Railway built-in | Connection metrics, storage |
| redis | Managed service | Railway built-in | Memory usage, connections |
| webapp | Static site | Railway CDN built-in | CDN metrics |
| website | Static site | Railway CDN built-in | CDN metrics |

### Viewing Service Status

1. Open Railway dashboard → select project
2. Each service card shows: deploy status, uptime, resource usage
3. Click a service for detailed metrics: CPU, memory, network, deployment history

### Log Viewer

Railway aggregates logs from all services. Fastify outputs structured JSON via pino.

**Log format:**
```json
{"level":30,"time":1709049600001,"msg":"request completed","reqId":"clx7abc12def","uid":"firebase-uid-123","method":"GET","url":"/api/milestones"}
```

**Key fields:**
- `reqId` — Globally unique request ID (cuid2 format, 25 chars)
- `uid` — Firebase user ID (present only for authenticated requests)
- `level` — pino log level (30=info, 40=warn, 50=error)
- `time` — Unix epoch milliseconds

**Example log queries in Railway:**
- Filter by level: search for `"level":50` (errors only)
- Filter by request ID: search for `"reqId":"clx7abc12def"`
- Filter by user: search for `"uid":"firebase-uid-123"`
- Filter by route: search for `"url":"/api/execution"`

## Queue Management (Bull Board)

Bull Board (`@bull-board/api@^6.20.3`) provides a web UI for monitoring and managing BullMQ job queues.

### Access

- **URL:** `https://<api-host>/admin/queues`
- **Authentication:** HTTP Basic Auth
  - Username: `MCC_ADMIN_USER` env var (default: `admin`)
  - Password: `MCC_ADMIN_PASSWORD` env var (required — Bull Board is disabled if not set)

### Queues

| Queue | Purpose | Retry Config | Worker Concurrency |
|---|---|---|---|
| `execution-run` | Code execution submissions (compile + test + benchmark) | 2 attempts, exponential backoff starting at 5s | 10 |
| `account-export` | User data export requests | 3 attempts, exponential backoff starting at 5s | 2 |

### Job Retention

- **Completed jobs:** Removed after 1 hour (`removeOnComplete.age: 3600`)
- **Failed jobs:** Retained for 24 hours (`removeOnFail.age: 86400`)

### Common Admin Actions

- **Inspect failed jobs:** Click a failed job in Bull Board to see error messages, stack traces, and attempt history
- **Retry a failed job:** Click the retry button on any failed job in the Bull Board UI
- **Remove stuck jobs:** Use the clean waiting/delayed actions in the Bull Board UI
- **Monitor queue depth:** Check waiting + active counts during peak load periods

### Troubleshooting

| Symptom | Likely Cause | Action |
|---|---|---|
| Queue shows many failed jobs | Worker errors or Fly.io machine unavailability | Check worker logs in Railway, check Fly.io machine availability |
| Jobs stuck in waiting | Worker service not running or Redis connectivity issues | Verify worker service is running in Railway, check Redis connectivity |
| Jobs stuck in active | Possible worker crash; jobs will be moved to failed after stall timeout (default: 30s) | Check worker logs for crashes, jobs will auto-recover via stall timeout |

## Tutor Conversation Log Review

Assess AI tutor prompt quality, identify areas where the Socratic approach breaks down, and find topics where learners consistently struggle.

### Data Source

Two PostgreSQL views provide denormalized tutor data for easy querying:

| View | Purpose |
|---|---|
| `tutor_conversation_log` | Denormalized message-level view joining `tutor_messages` + `sessions` + `users` + `milestones` — browse individual conversations |
| `tutor_session_summary` | Aggregated session-level view — message counts, model usage breakdown, session duration |

Views are created by migration `011_add_tutor_analytics_views.ts`. They are read-only and do not affect application performance.

### Access Method

**Metabase dashboards** (recommended) or direct SQL. No custom admin UI — external tools only.

**Metabase local setup:**
```bash
docker compose --profile metabase up metabase
# Access at http://localhost:3000
# Connects to local PostgreSQL automatically via DATABASE_URL
```

Metabase is a local/staging admin tool only — not deployed to Railway.

### Recommended Dashboards

#### 1. Conversation Explorer (AC #1, #2, #3)

Browse individual conversations filtered by milestone, model, and date range.

```sql
-- Browse conversations for a specific milestone (last 7 days)
SELECT * FROM tutor_conversation_log
WHERE milestone_slug = 'kv-store'
  AND created_at >= NOW() - INTERVAL '7 days'
ORDER BY created_at DESC;

-- Filter by model tier (Sonnet only — escalated responses)
SELECT * FROM tutor_conversation_log
WHERE model LIKE 'claude-sonnet%'
ORDER BY created_at DESC;
```

#### 2. Session Summary (AC #2, #3)

Aggregate stats per session: message counts, model usage, duration.

```sql
SELECT * FROM tutor_session_summary
ORDER BY last_message_at DESC;
```

#### 3. Model Usage Analysis (AC #3)

Haiku vs Sonnet breakdown by milestone and user experience level.

```sql
SELECT
  milestone_title,
  experience_level,
  COUNT(*) AS sessions,
  AVG(haiku_messages) AS avg_haiku,
  AVG(sonnet_messages) AS avg_sonnet
FROM tutor_session_summary
GROUP BY milestone_title, experience_level
ORDER BY milestone_title, experience_level;
```

#### 4. Socratic Approach Breakdown Detection (AC #4)

Sessions where `sonnet_messages > haiku_messages` indicate the Socratic approach failed and the tutor escalated to deeper explanations. High Sonnet ratio per milestone reveals topics where guided questioning doesn't work.

```sql
SELECT * FROM tutor_session_summary
WHERE sonnet_messages > haiku_messages
ORDER BY total_messages DESC;
```

#### 5. Recurring Struggle Topics (AC #4)

Sessions with high message counts (>10) suggest learners are struggling. Cross-reference with experience level to determine if struggles are universal or experience-dependent.

```sql
SELECT
  milestone_title,
  user_role,
  experience_level,
  AVG(total_messages) AS avg_messages,
  AVG(sonnet_messages::float / NULLIF(total_messages, 0)) AS sonnet_ratio
FROM tutor_session_summary
GROUP BY milestone_title, user_role, experience_level
ORDER BY avg_messages DESC;
```

#### 6. Common Questions Pattern (AC #4)

Find recurring question patterns by milestone. The query below matches **exact duplicate messages only** — for semantic pattern detection, use Metabase's text search (`ILIKE '%keyword%'`) or browse conversations manually by milestone to identify themes.

```sql
-- Exact duplicates (e.g., copy-pasted error messages)
SELECT milestone_slug, content, COUNT(*) AS frequency
FROM tutor_conversation_log
WHERE message_role = 'user'
GROUP BY milestone_slug, content
HAVING COUNT(*) > 2
ORDER BY frequency DESC;

-- Keyword search for topic patterns (more useful in practice)
SELECT milestone_slug, content, created_at
FROM tutor_conversation_log
WHERE message_role = 'user'
  AND content ILIKE '%how do I%'
ORDER BY created_at DESC;
```

### Date Range Filtering

```sql
SELECT * FROM tutor_session_summary
WHERE first_message_at >= '2026-03-01'
  AND first_message_at < '2026-04-01';
```

### Cursor-Based Pagination (ARCH-13)

Metabase handles pagination internally. For direct SQL browsing (most recent first):

```sql
-- Simple cursor (most recent first)
SELECT * FROM tutor_conversation_log
WHERE created_at < $last_seen_timestamp
ORDER BY created_at DESC, message_id DESC
LIMIT 50;

-- Composite cursor for precision
SELECT * FROM tutor_conversation_log
WHERE (created_at, message_id) < ($cursor_created_at, $cursor_id)
ORDER BY created_at DESC, message_id DESC
LIMIT 50;
```

**Note:** The existing tutor history API route (`GET /api/tutor/:sessionId/messages`) uses ASC ordering for chronological chat display. These admin queries use DESC for log review (most recent first). Both are valid for their respective use cases.

### Privacy & PII Guardrails

- Conversation content contains user code and AI responses — this is **PII**
- Restrict Metabase access to admin users only (Metabase has its own user management)
- Never expose tutor conversation content in application logs at `info` level or above
- Do NOT create API endpoints that expose conversation content — Metabase/direct SQL only
- **Data retention:** `tutor_messages` cascade-delete when user account is deleted (GDPR compliance via Story 8.3)

## Analytics & Reporting

Understand user behavior, identify improvement opportunities, and monitor platform health metrics.

### Data Source

Six PostgreSQL views provide denormalized analytics data for easy querying:

| View | Purpose |
|---|---|
| `platform_signup_metrics` | Daily signup aggregation — signup count, onboarding completion rate, skill floor pass rate |
| `milestone_completion_metrics` | Completed users per milestone with track context |
| `milestone_dropout_analysis` | Per-user per-milestone dropout detection — users who attempted but didn't complete |
| `user_retention_daily` | Daily active users for cohort retention analysis (DAU/WAU/MAU) |
| `milestone_time_to_completion` | Time from first session to milestone completion per user |
| `user_resource_consumption` | Per-user resource usage for cost estimation (sessions, submissions, tutor messages, benchmarks) |

Views are created by migration `012_add_platform_analytics_views.ts`. They are read-only and do not affect application performance.

### Access Method

**Metabase dashboards** (recommended) or direct SQL. No custom admin UI — external tools only (ARCH-24).

**Metabase local setup:**
```bash
docker compose --profile metabase up metabase
# Access at http://localhost:3000
# Connects to local PostgreSQL automatically via DATABASE_URL
```

Metabase is a local/staging admin tool only — not deployed to Railway.

### Recommended Dashboards

#### 1. Signup Funnel

Daily signups, onboarding completion rate, skill floor pass rate.

```sql
-- Last 30 days signup funnel
SELECT * FROM platform_signup_metrics
WHERE signup_date >= NOW() - INTERVAL '30 days'
ORDER BY signup_date DESC;
```

#### 2. Milestone Completion Rates

Completed users per milestone ordered by position to see the progression funnel.

```sql
SELECT
  milestone_title,
  milestone_position,
  completed_users,
  ROUND(completed_users * 100.0 / NULLIF((SELECT COUNT(*) FROM users), 0), 1) AS completion_rate_pct
FROM milestone_completion_metrics
ORDER BY milestone_position;
```

#### 3. Dropout Analysis

Users who attempted but didn't complete each milestone, segmented by experience level.

```sql
SELECT
  milestone_title,
  experience_level,
  COUNT(*) AS dropout_count,
  AVG(submission_count) AS avg_submissions
FROM milestone_dropout_analysis
WHERE completed = false
GROUP BY milestone_title, experience_level
ORDER BY dropout_count DESC;
```

#### 4. User Retention

Cohort retention chart — group by signup date, then pivot on activity date.

```sql
-- Day-7 retention by cohort
SELECT
  signup_date,
  COUNT(DISTINCT user_id) FILTER (WHERE activity_date = signup_date) AS day_0,
  COUNT(DISTINCT user_id) FILTER (WHERE activity_date = signup_date + INTERVAL '7 days') AS day_7
FROM user_retention_daily
GROUP BY signup_date
ORDER BY signup_date DESC;
```

#### 5. Time to Completion

Average hours to complete each milestone, segmented by experience level.

```sql
SELECT
  milestone_slug,
  milestone_position,
  ROUND(AVG(time_to_completion_seconds) / 3600, 1) AS avg_hours,
  ROUND(AVG(total_submissions), 1) AS avg_submissions
FROM milestone_time_to_completion
GROUP BY milestone_slug, milestone_position
ORDER BY milestone_position;

-- Segmented by experience level (user cohort filtering)
SELECT
  milestone_slug,
  experience_level,
  ROUND(AVG(time_to_completion_seconds) / 3600, 1) AS avg_hours,
  COUNT(*) AS user_count
FROM milestone_time_to_completion
GROUP BY milestone_slug, experience_level
ORDER BY milestone_slug, experience_level;
```

#### 6. Active Users (DAU/WAU/MAU)

Daily, weekly, and monthly active user counts.

```sql
-- DAU (last 30 days)
SELECT
  DATE_TRUNC('day', activity_date) AS day,
  COUNT(DISTINCT user_id) AS dau
FROM user_retention_daily
WHERE activity_date >= NOW() - INTERVAL '30 days'
GROUP BY day
ORDER BY day DESC;

-- WAU (last 12 weeks)
SELECT
  DATE_TRUNC('week', activity_date) AS week,
  COUNT(DISTINCT user_id) AS wau
FROM user_retention_daily
WHERE activity_date >= NOW() - INTERVAL '12 weeks'
GROUP BY week
ORDER BY week DESC;

-- MAU (last 12 months)
SELECT
  DATE_TRUNC('month', activity_date) AS month,
  COUNT(DISTINCT user_id) AS mau
FROM user_retention_daily
WHERE activity_date >= NOW() - INTERVAL '12 months'
GROUP BY month
ORDER BY month DESC;
```

#### 7. Cost Analysis

Per-user resource consumption for cost estimation. Identifies heavy users.

```sql
-- Top resource consumers
SELECT
  email,
  total_sessions,
  total_submissions,
  total_tutor_messages,
  sonnet_messages,
  milestones_completed
FROM user_resource_consumption
ORDER BY total_submissions DESC
LIMIT 20;
```

### Cost Tracking Formula (NFR-SC2)

```
Monthly cost per user = (Railway monthly bill + Fly.io monthly bill) / active_user_count

Where:
- Railway monthly bill: Sum of api, worker, postgres, redis service costs from Railway dashboard → Billing
- Fly.io monthly bill: Execution machine costs from Fly.io dashboard → Billing
- active_user_count: SELECT COUNT(DISTINCT user_id) FROM user_retention_daily WHERE activity_date >= NOW() - INTERVAL '30 days'

Target: ≤ $0.65/month per user at 100 concurrent users
```

Resource consumption breakdown for identifying cost drivers:

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

Railway and Fly.io costs are external — pull from their respective billing dashboards monthly. No API integration needed at MVP.

### Date Range Filtering

All views support date range filtering. Always filter by date range in Metabase to avoid full table scans:

```sql
-- Signup metrics for a specific month
SELECT * FROM platform_signup_metrics
WHERE signup_date >= '2026-03-01' AND signup_date < '2026-04-01';

-- Retention for a specific period
SELECT * FROM user_retention_daily
WHERE activity_date >= '2026-03-01' AND activity_date < '2026-04-01';
```

### Cursor-Based Pagination (ARCH-13)

Metabase handles pagination internally. For direct SQL browsing with large result sets:

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

### Privacy & PII Guardrails

- `user_resource_consumption` view exposes `email` — this is **PII**
- Restrict Metabase access to admin users only (Metabase has its own user management)
- Do NOT create API endpoints that expose analytics data — Metabase/direct SQL only
- When sharing dashboard screenshots, redact email addresses
- **Data retention:** All analytics views derive from base tables that cascade-delete when user account is deleted (GDPR compliance via Story 8.3)

### Performance Considerations (NFR-SC1)

- All 6 views are non-materialized — they execute JOINs on every query. This is fine for admin analytics at MVP scale (100 users).
- Existing indexes support efficient querying: `idx_submissions_user_id_milestone_id`, `idx_sessions_user_id_milestone_id`, `idx_user_milestones_user_id_milestone_id`.
- Always filter by date range in Metabase to avoid full table scans.
- If analytics queries cause performance issues at scale (unlikely at 100 users), convert to materialized views with periodic refresh — NOT needed at MVP.
- Analytics views are read-only — they cannot affect write performance or user-facing routes.

## External Configuration

AI tutor prompts, model routing rules, and stuck detection thresholds are loaded from external files — no code deployment required to change them.

### Configuration Files

| Config Type | File Location | Format | Purpose |
|---|---|---|---|
| Tutor base prompt | `content/prompts/tutor-base.md` | Markdown with `{{template_vars}}` | System prompt for Socratic tutoring |
| Stuck intervention prompt | `content/prompts/stuck-intervention.md` | Markdown with `{{template_vars}}` | System prompt for stuck detection interventions |
| Model routing rules | `content/prompts/model-routing.yaml` | YAML | When to use Haiku vs Sonnet |
| Stuck detection thresholds | `content/milestones/{slug}/metadata.yaml` | YAML (per-milestone) | Inactivity thresholds per milestone |

### Admin Reload Endpoints

Configuration changes are applied via admin endpoints — no server restart needed.

**Authentication:** HTTP Basic Auth (same credentials as Bull Board)
- Username: `MCC_ADMIN_USER` env var (default: `admin`)
- Password: `MCC_ADMIN_PASSWORD` env var (required)

```bash
# Reload prompt templates only (tutor-base.md + stuck-intervention.md)
curl -X POST -u admin:$MCC_ADMIN_PASSWORD http://localhost:3001/admin/reload-prompts

# Reload all configuration (prompts + model routing + stuck detection cache)
curl -X POST -u admin:$MCC_ADMIN_PASSWORD http://localhost:3001/admin/reload-config
```

**Response format:**
```json
{
  "reloaded": ["model-routing", "prompts", "content-cache"],
  "errors": [],
  "timestamp": "2026-03-15T10:30:00.000Z"
}
```

### Model Routing Configuration

`content/prompts/model-routing.yaml` controls which Claude model handles each request:

```yaml
models:
  haiku: "claude-haiku-4-5-20251001"
  sonnet: "claude-sonnet-4-6-20250514"

default_model: haiku

# Rules evaluated in order — first match wins
routing_rules:
  - condition: stuck_intervention
    model: sonnet
    description: "Use Sonnet for stuck interventions"
  - condition: compile_errors
    model: sonnet
    description: "Use Sonnet when submission has compile errors"
  - condition: explain_pattern
    model: sonnet
    description: "Use Sonnet for conceptual explanation requests"
    patterns:
      - "explain"
      - "what is"
      - "how does"
```

**Adding new rules:** Add entries to `routing_rules`. Supported conditions: `stuck_intervention`, `compile_errors`, `explain_pattern`. Then call `POST /admin/reload-config`.

### Stuck Detection Thresholds

Per-milestone thresholds in `content/milestones/{slug}/metadata.yaml`:

```yaml
stuckDetection:
  thresholdMinutes: 10      # Minutes of inactivity before stage 1
  stage2OffsetSeconds: 60   # Seconds after stage 1 before stage 2
```

Changes are cached in Redis (3600s TTL). Call `POST /admin/reload-config` to invalidate cache immediately.

### Validation & Fallback

- **Model routing:** Invalid config logs error to Sentry, falls back to bundled defaults
- **Prompt templates:** Missing files throw on first load; subsequent reload failures fall back to last-known-good cached version
- **Stuck detection:** Invalid metadata returns `null` (frontend uses hardcoded fallback: 10min / 60s)

## Railway Service Configuration Files

| Service | Config File |
|---|---|
| api | `apps/backend/railway.toml` |
| worker | `apps/backend/railway.worker.toml` |
| postgres | Managed by Railway (no config file) |
| redis | Managed by Railway (no config file) |
| webapp | `apps/webapp/railway.toml` |
| website | `apps/website/railway.toml` |
