# Data Models — mycscompanion

**Generated:** 2026-03-20 | **Scan Level:** Exhaustive
**Database:** PostgreSQL 16 | **ORM:** Kysely ^0.28.11 | **Migrations:** 001-013

## Schema Overview

12 core tables + 8 analytics views. All entity IDs use `cuid2` (24-char, URL-safe, sortable) except `users.id` which is a Firebase UID string.

## Core Tables

### `users`
Primary user table. PK is Firebase UID (string, not auto-increment).

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | TEXT | PK | Firebase UID |
| `email` | TEXT | NOT NULL, UNIQUE | User email |
| `display_name` | TEXT | nullable | Display name |
| `role` | TEXT | nullable | backend-engineer, frontend-engineer, fullstack-engineer, devops-sre, student, other |
| `experience_level` | TEXT | nullable | less-than-1, 1-to-3, 3-to-5, 5-plus |
| `primary_language` | TEXT | nullable | go, python, javascript-typescript, rust, java, c-cpp, other |
| `onboarding_completed_at` | TIMESTAMPTZ | nullable | When onboarding was finished |
| `skill_floor_passed` | BOOLEAN | nullable | Passed 2/3 Go assessment |
| `skill_floor_completed_at` | TIMESTAMPTZ | nullable | Assessment completion time |
| `created_at` | TIMESTAMPTZ | DEFAULT now() | |
| `updated_at` | TIMESTAMPTZ | DEFAULT now() | |

### `tracks`
Learning tracks (currently: "Build Your Own Database").

| Column | Type | Constraints |
|---|---|---|
| `id` | TEXT | PK (cuid2) |
| `name` | TEXT | NOT NULL |
| `slug` | TEXT | NOT NULL, UNIQUE |
| `description` | TEXT | nullable |
| `created_at` | TIMESTAMPTZ | DEFAULT now() |
| `updated_at` | TIMESTAMPTZ | DEFAULT now() |

### `milestones`
Ordered curriculum milestones within tracks (5 for MVP).

| Column | Type | Constraints |
|---|---|---|
| `id` | TEXT | PK (cuid2) |
| `track_id` | TEXT | NOT NULL, FK → tracks(id) CASCADE |
| `title` | TEXT | NOT NULL |
| `slug` | TEXT | NOT NULL |
| `position` | INTEGER | NOT NULL |
| `description` | TEXT | nullable |
| `created_at` | TIMESTAMPTZ | DEFAULT now() |
| `updated_at` | TIMESTAMPTZ | DEFAULT now() |

**Indexes:** UNIQUE(track_id, position), UNIQUE(track_id, slug), INDEX(track_id)

### `sessions`
User work sessions (one active per user+milestone).

| Column | Type | Constraints |
|---|---|---|
| `id` | TEXT | PK (cuid2) |
| `user_id` | TEXT | NOT NULL, FK → users(id) CASCADE |
| `milestone_id` | TEXT | NOT NULL, FK → milestones(id) CASCADE |
| `started_at` | TIMESTAMPTZ | NOT NULL, DEFAULT now() |
| `ended_at` | TIMESTAMPTZ | nullable |
| `is_active` | BOOLEAN | NOT NULL, DEFAULT true |

**Indexes:** INDEX(user_id, milestone_id), INDEX(user_id, is_active), UNIQUE(user_id, milestone_id) WHERE is_active = true (partial)

### `code_snapshots`
Auto-saved code state (append-only, 30-60s interval).

| Column | Type | Constraints |
|---|---|---|
| `id` | TEXT | PK (cuid2) |
| `user_id` | TEXT | NOT NULL, FK → users(id) CASCADE |
| `milestone_id` | TEXT | NOT NULL, FK → milestones(id) CASCADE |
| `session_id` | TEXT | NOT NULL, FK → sessions(id) CASCADE |
| `code` | TEXT | nullable (single-file M1) |
| `files` | JSONB | nullable (multi-file M2+, Record\<string, string\>) |
| `created_at` | TIMESTAMPTZ | DEFAULT now() |

**Indexes:** INDEX(user_id, milestone_id), INDEX(user_id, milestone_id, created_at) — latest snapshot pattern

### `submissions`
Code submissions with execution results.

| Column | Type | Constraints |
|---|---|---|
| `id` | TEXT | PK (cuid2) |
| `user_id` | TEXT | NOT NULL, FK → users(id) CASCADE |
| `milestone_id` | TEXT | NOT NULL |
| `code` | TEXT | nullable (single-file) |
| `files` | JSONB | nullable (multi-file, Record\<string, string\>) |
| `status` | TEXT | CHECK IN ('queued', 'running', 'completed', 'failed'), DEFAULT 'queued' |
| `execution_result` | JSONB | nullable (stdout, stderr, exitCode, timing) |
| `criteria_results` | JSONB | nullable (CriterionResult[]) |
| `error_message` | TEXT | nullable |
| `created_at` | TIMESTAMPTZ | DEFAULT now() |
| `updated_at` | TIMESTAMPTZ | DEFAULT now() |

**Indexes:** INDEX(user_id), INDEX(user_id, milestone_id), INDEX(status)

### `user_milestones`
Milestone completion records (idempotent via unique constraint).

| Column | Type | Constraints |
|---|---|---|
| `id` | TEXT | PK (cuid2) |
| `user_id` | TEXT | NOT NULL, FK → users(id) CASCADE |
| `milestone_id` | TEXT | NOT NULL, FK → milestones(id) CASCADE |
| `completed_at` | TIMESTAMPTZ | NOT NULL, DEFAULT now() |
| `completing_submission_id` | TEXT | FK → submissions(id) |
| `created_at` | TIMESTAMPTZ | DEFAULT now() |

**Indexes:** UNIQUE(user_id, milestone_id), INDEX(user_id)

### `session_summaries`
AI-generated plain text summaries at session end.

| Column | Type | Constraints |
|---|---|---|
| `id` | TEXT | PK (cuid2) |
| `user_id` | TEXT | NOT NULL, FK → users(id) CASCADE |
| `session_id` | TEXT | NOT NULL, FK → sessions(id) CASCADE |
| `milestone_id` | TEXT | NOT NULL, FK → milestones(id) CASCADE |
| `summary_text` | TEXT | NOT NULL |
| `created_at` | TIMESTAMPTZ | DEFAULT now() |

**Indexes:** UNIQUE(session_id), INDEX(user_id, milestone_id)

### `tutor_messages`
AI conversation history per session.

| Column | Type | Constraints |
|---|---|---|
| `id` | TEXT | PK (cuid2) |
| `session_id` | TEXT | NOT NULL, FK → sessions(id) CASCADE |
| `user_id` | TEXT | NOT NULL, FK → users(id) CASCADE |
| `role` | TEXT | NOT NULL ('user' or 'assistant') |
| `content` | TEXT | NOT NULL |
| `model` | TEXT | nullable (null for user messages) |
| `created_at` | TIMESTAMPTZ | DEFAULT now() |

**Indexes:** INDEX(session_id, created_at), INDEX(user_id)

### `benchmark_results`
Performance benchmark results per submission.

| Column | Type | Constraints |
|---|---|---|
| `id` | TEXT | PK (cuid2) |
| `submission_id` | TEXT | NOT NULL, FK → submissions(id) |
| `user_id` | TEXT | NOT NULL, FK → users(id) |
| `milestone_id` | TEXT | NOT NULL, FK → milestones(id) |
| `benchmark_name` | TEXT | NOT NULL |
| `raw_metrics` | JSONB | NOT NULL (opsPerSec, userMedian, referenceMedian, p50/p99) |
| `normalized_ratio` | NUMERIC(8,4) | NOT NULL (user_median / reference_median) |
| `reference_version` | TEXT | NOT NULL |
| `created_at` | TIMESTAMPTZ | DEFAULT now() |

**Indexes:** INDEX(submission_id), INDEX(user_id, milestone_id)

### `data_exports`
GDPR data export requests (async processing via BullMQ).

| Column | Type | Constraints |
|---|---|---|
| `id` | TEXT | PK (cuid2) |
| `user_id` | TEXT | NOT NULL, FK → users(id) CASCADE |
| `status` | TEXT | NOT NULL, DEFAULT 'processing' |
| `export_data` | JSONB | nullable |
| `error_message` | TEXT | nullable |
| `created_at` | TIMESTAMPTZ | DEFAULT now() |
| `completed_at` | TIMESTAMPTZ | nullable |

**Indexes:** INDEX(user_id)

## Analytics Views

| View | Purpose |
|---|---|
| `tutor_conversation_log` | Denormalized tutor messages with user/milestone context |
| `tutor_session_summary` | Per-session message counts, model distribution, duration |
| `platform_signup_metrics` | Daily signups with onboarding completion funnel |
| `milestone_completion_metrics` | Per-milestone completion counts and timing |
| `milestone_dropout_analysis` | Per-user-per-milestone submission/session counts vs completion |
| `user_retention_daily` | Daily active users with signup cohort |
| `milestone_time_to_completion` | Time from first session to completion |
| `user_resource_consumption` | Per-user totals: sessions, submissions, tutor messages, benchmarks |

## Entity Relationships

```
users (Firebase UID PK)
├── sessions (user_id FK)
│   ├── code_snapshots (session_id FK)
│   ├── tutor_messages (session_id FK)
│   └── session_summaries (session_id FK)
├── submissions (user_id FK)
│   └── benchmark_results (submission_id FK)
├── user_milestones (user_id FK)
└── data_exports (user_id FK)

tracks
└── milestones (track_id FK)
    ├── sessions (milestone_id FK)
    ├── code_snapshots (milestone_id FK)
    ├── user_milestones (milestone_id FK)
    └── benchmark_results (milestone_id FK)
```

## Migration Strategy

- **Development:** `kysely-ctl` CLI — `db:migrate`, `db:migrate:down`, `db:migrate:make`
- **Production:** Railway release command runs `pnpm --filter backend db:migrate` before API starts. Migration failure aborts deploy.
- **Type Generation:** `kysely-codegen` introspects DB and generates TypeScript interfaces in `packages/shared/src/types/db.ts`
- **CI:** Migrations tested against throwaway PostgreSQL container in GitHub Actions
- **Down migrations:** Manual only — never auto-rollback in production

## Key Conventions

- Table names: `snake_case`, plural (`users`, `code_snapshots`)
- Column names: `snake_case` (`user_id`, `created_at`)
- Foreign keys: `{referenced_table_singular}_id`
- Timestamps: `_at` suffix, always `timestamptz`
- Entity IDs: `cuid2` (exception: `users.id` = Firebase UID)
- Enums: `snake_case` values in CHECK constraints
- DB→API conversion: `toCamelCase()` from `@mycscompanion/shared` on all Kysely results
