import type { Kysely } from 'kysely'
import { sql } from 'kysely'

export async function up(db: Kysely<never>): Promise<void> {
  // sessions table
  await db.schema
    .createTable('sessions')
    .addColumn('id', 'text', (col) => col.primaryKey())
    .addColumn('user_id', 'text', (col) =>
      col.notNull().references('users.id').onDelete('cascade')
    )
    .addColumn('milestone_id', 'text', (col) =>
      col.notNull().references('milestones.id').onDelete('cascade')
    )
    .addColumn('started_at', sql`timestamptz`, (col) =>
      col.notNull().defaultTo(sql`now()`)
    )
    .addColumn('ended_at', sql`timestamptz`)
    .addColumn('is_active', 'boolean', (col) =>
      col.notNull().defaultTo(true)
    )
    .execute()

  await db.schema
    .createIndex('idx_sessions_user_id_milestone_id')
    .on('sessions')
    .columns(['user_id', 'milestone_id'])
    .execute()

  await db.schema
    .createIndex('idx_sessions_user_id_is_active')
    .on('sessions')
    .columns(['user_id', 'is_active'])
    .execute()

  // code_snapshots table (append-only)
  await db.schema
    .createTable('code_snapshots')
    .addColumn('id', 'text', (col) => col.primaryKey())
    .addColumn('user_id', 'text', (col) =>
      col.notNull().references('users.id').onDelete('cascade')
    )
    .addColumn('milestone_id', 'text', (col) =>
      col.notNull().references('milestones.id').onDelete('cascade')
    )
    .addColumn('session_id', 'text', (col) =>
      col.notNull().references('sessions.id').onDelete('cascade')
    )
    .addColumn('code', 'text', (col) => col.notNull())
    .addColumn('created_at', sql`timestamptz`, (col) =>
      col.notNull().defaultTo(sql`now()`)
    )
    .execute()

  await db.schema
    .createIndex('idx_code_snapshots_user_id_milestone_id')
    .on('code_snapshots')
    .columns(['user_id', 'milestone_id'])
    .execute()

  // Compound index for "latest snapshot" query pattern
  await db.schema
    .createIndex('idx_code_snapshots_user_milestone_created')
    .on('code_snapshots')
    .columns(['user_id', 'milestone_id', 'created_at'])
    .execute()

  // Unique partial index: at most one active session per user+milestone
  await sql`CREATE UNIQUE INDEX idx_sessions_user_milestone_active ON sessions (user_id, milestone_id) WHERE is_active = true`.execute(db)
}

export async function down(db: Kysely<never>): Promise<void> {
  await db.schema.dropTable('code_snapshots').execute()
  await db.schema.dropTable('sessions').execute()
}
