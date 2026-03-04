import type { Kysely } from 'kysely'
import { sql } from 'kysely'

export async function up(db: Kysely<never>): Promise<void> {
  await db.schema
    .createTable('submissions')
    .addColumn('id', 'text', (col) => col.primaryKey())
    .addColumn('user_id', 'text', (col) =>
      col.notNull().references('users.id').onDelete('cascade')
    )
    .addColumn('milestone_id', 'text', (col) => col.notNull())
    .addColumn('code', 'text', (col) => col.notNull())
    .addColumn('status', 'text', (col) =>
      col
        .notNull()
        .defaultTo('queued')
        .check(
          sql`status IN ('queued', 'running', 'completed', 'failed')`
        )
    )
    .addColumn('execution_result', 'jsonb')
    .addColumn('criteria_results', 'jsonb')
    .addColumn('error_message', 'text')
    .addColumn('created_at', sql`timestamptz`, (col) =>
      col.notNull().defaultTo(sql`now()`)
    )
    .addColumn('updated_at', sql`timestamptz`, (col) =>
      col.notNull().defaultTo(sql`now()`)
    )
    .execute()

  await db.schema
    .createIndex('idx_submissions_user_id')
    .on('submissions')
    .column('user_id')
    .execute()

  await db.schema
    .createIndex('idx_submissions_user_id_milestone_id')
    .on('submissions')
    .columns(['user_id', 'milestone_id'])
    .execute()

  await db.schema
    .createIndex('idx_submissions_status')
    .on('submissions')
    .column('status')
    .execute()
}

export async function down(db: Kysely<never>): Promise<void> {
  await db.schema.dropTable('submissions').execute()
}
