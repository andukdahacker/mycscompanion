import type { Kysely } from 'kysely'
import { sql } from 'kysely'

export async function up(db: Kysely<never>): Promise<void> {
  await db.schema
    .createTable('benchmark_results')
    .addColumn('id', 'text', (col) => col.primaryKey())
    .addColumn('submission_id', 'text', (col) =>
      col.notNull().references('submissions.id')
    )
    .addColumn('user_id', 'text', (col) =>
      col.notNull().references('users.id')
    )
    .addColumn('milestone_id', 'text', (col) =>
      col.notNull().references('milestones.id')
    )
    .addColumn('benchmark_name', 'text', (col) => col.notNull())
    .addColumn('raw_metrics', 'jsonb', (col) => col.notNull())
    .addColumn('normalized_ratio', sql`numeric(8,4)`, (col) => col.notNull())
    .addColumn('reference_version', 'text', (col) => col.notNull())
    .addColumn('created_at', sql`timestamptz`, (col) =>
      col.notNull().defaultTo(sql`now()`)
    )
    .execute()

  // Fast lookup by submission
  await db.schema
    .createIndex('idx_benchmark_results_submission_id')
    .on('benchmark_results')
    .column('submission_id')
    .execute()

  // Fast lookup for historical queries (Story 7.3)
  await db.schema
    .createIndex('idx_benchmark_results_user_id_milestone_id')
    .on('benchmark_results')
    .columns(['user_id', 'milestone_id'])
    .execute()
}

export async function down(db: Kysely<never>): Promise<void> {
  await db.schema.dropTable('benchmark_results').execute()
}
