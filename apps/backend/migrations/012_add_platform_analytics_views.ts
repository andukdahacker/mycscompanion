import type { Kysely } from 'kysely'
import { sql } from 'kysely'

export async function up(db: Kysely<never>): Promise<void> {
  // Daily signup aggregation for funnel analysis
  await sql`
    CREATE VIEW platform_signup_metrics AS
    SELECT
      DATE_TRUNC('day', u.created_at) AS signup_date,
      COUNT(*) AS signup_count,
      COUNT(*) FILTER (WHERE u.onboarding_completed_at IS NOT NULL) AS onboarding_completed_count,
      COUNT(*) FILTER (WHERE u.skill_floor_passed = true) AS skill_floor_passed_count,
      COUNT(*) FILTER (WHERE u.role = 'learner') AS learner_count
    FROM users u
    GROUP BY DATE_TRUNC('day', u.created_at)
  `.execute(db)

  // Completion rates per milestone with track context
  await sql`
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
    GROUP BY m.id, m.title, m.slug, m.position, t.name, t.slug
  `.execute(db)

  // Per-user per-milestone dropout analysis
  await sql`
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
    GROUP BY m.id, m.title, m.slug, m.position, s.user_id, u.role, u.experience_level
  `.execute(db)

  // Daily active users for retention and cohort analysis
  await sql`
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
    GROUP BY DATE_TRUNC('day', s.started_at), s.user_id, u.role, u.experience_level, DATE_TRUNC('day', u.created_at)
  `.execute(db)

  // Time from first session to milestone completion
  await sql`
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
    GROUP BY um.user_id, um.milestone_id, m.title, m.slug, m.position, u.role, u.experience_level, um.completed_at
  `.execute(db)

  // Per-user resource consumption for cost estimation (NFR-SC2)
  // NOTE: 7 LEFT JOINs produce a Cartesian product of all user activity before
  // COUNT(DISTINCT) deduplicates. Correct but wasteful at scale. Fine at MVP (100 users).
  // If slow at scale, refactor into subquery CTEs or a materialized view with periodic refresh.
  await sql`
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
    GROUP BY u.id, u.email, u.role, u.created_at
  `.execute(db)
}

export async function down(db: Kysely<never>): Promise<void> {
  await sql`DROP VIEW IF EXISTS user_resource_consumption`.execute(db)
  await sql`DROP VIEW IF EXISTS milestone_time_to_completion`.execute(db)
  await sql`DROP VIEW IF EXISTS user_retention_daily`.execute(db)
  await sql`DROP VIEW IF EXISTS milestone_dropout_analysis`.execute(db)
  await sql`DROP VIEW IF EXISTS milestone_completion_metrics`.execute(db)
  await sql`DROP VIEW IF EXISTS platform_signup_metrics`.execute(db)
}
