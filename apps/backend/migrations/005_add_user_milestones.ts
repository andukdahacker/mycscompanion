import type { Kysely } from 'kysely'
import { sql } from 'kysely'

export async function up(db: Kysely<never>): Promise<void> {
  await db.schema
    .createTable('user_milestones')
    .addColumn('id', 'text', (col) => col.primaryKey())
    .addColumn('user_id', 'text', (col) =>
      col.notNull().references('users.id').onDelete('cascade')
    )
    .addColumn('milestone_id', 'text', (col) =>
      col.notNull().references('milestones.id').onDelete('cascade')
    )
    .addColumn('completed_at', sql`timestamptz`, (col) =>
      col.notNull().defaultTo(sql`now()`)
    )
    .addColumn('completing_submission_id', 'text', (col) =>
      col.references('submissions.id')
    )
    .addColumn('created_at', sql`timestamptz`, (col) =>
      col.notNull().defaultTo(sql`now()`)
    )
    .execute()

  await db.schema
    .createIndex('idx_user_milestones_user_id_milestone_id')
    .on('user_milestones')
    .columns(['user_id', 'milestone_id'])
    .unique()
    .execute()

  await db.schema
    .createIndex('idx_user_milestones_user_id')
    .on('user_milestones')
    .column('user_id')
    .execute()
}

export async function down(db: Kysely<never>): Promise<void> {
  await db.schema.dropTable('user_milestones').execute()
}
