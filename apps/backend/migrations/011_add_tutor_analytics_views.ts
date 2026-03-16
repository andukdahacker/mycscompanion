import type { Kysely } from 'kysely'
import { sql } from 'kysely'

export async function up(db: Kysely<any>): Promise<void> {
  // Denormalized view for browsing individual tutor conversations
  await sql`
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
    LEFT JOIN milestones m ON s.milestone_id = m.id
  `.execute(db)

  // Aggregated view for session-level pattern analysis
  await sql`
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
    GROUP BY tm.session_id, tm.user_id, u.role, u.experience_level, u.primary_language, s.milestone_id, m.title, m.slug
  `.execute(db)
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`DROP VIEW IF EXISTS tutor_session_summary`.execute(db)
  await sql`DROP VIEW IF EXISTS tutor_conversation_log`.execute(db)
}
