import type { Kysely } from 'kysely'
import { sql } from 'kysely'

export async function up(db: Kysely<never>): Promise<void> {
  await db.schema
    .createTable('session_summaries')
    .addColumn('id', 'text', (col) => col.primaryKey())
    .addColumn('user_id', 'text', (col) =>
      col.notNull().references('users.id').onDelete('cascade')
    )
    .addColumn('session_id', 'text', (col) =>
      col.notNull().references('sessions.id').onDelete('cascade')
    )
    .addColumn('milestone_id', 'text', (col) =>
      col.notNull().references('milestones.id').onDelete('cascade')
    )
    .addColumn('summary_text', 'text', (col) => col.notNull())
    .addColumn('created_at', sql`timestamptz`, (col) =>
      col.notNull().defaultTo(sql`now()`)
    )
    .execute()

  // One summary per session — enforces idempotency at DB level
  await db.schema
    .createIndex('idx_session_summaries_session_id')
    .on('session_summaries')
    .columns(['session_id'])
    .unique()
    .execute()

  // Fast lookup: latest summary for a user+milestone
  await db.schema
    .createIndex('idx_session_summaries_user_milestone')
    .on('session_summaries')
    .columns(['user_id', 'milestone_id'])
    .execute()
}

export async function down(db: Kysely<never>): Promise<void> {
  await db.schema.dropTable('session_summaries').execute()
}
