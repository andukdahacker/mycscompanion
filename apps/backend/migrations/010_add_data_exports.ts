import type { Kysely } from 'kysely'
import { sql } from 'kysely'

export async function up(db: Kysely<never>): Promise<void> {
  await db.schema
    .createTable('data_exports')
    .addColumn('id', 'text', (col) => col.primaryKey())
    .addColumn('user_id', 'text', (col) =>
      col.notNull().references('users.id').onDelete('cascade')
    )
    .addColumn('status', 'text', (col) => col.notNull().defaultTo('processing'))
    .addColumn('export_data', 'jsonb')
    .addColumn('error_message', 'text')
    .addColumn('created_at', sql`timestamptz`, (col) =>
      col.notNull().defaultTo(sql`now()`)
    )
    .addColumn('completed_at', sql`timestamptz`)
    .execute()

  await db.schema
    .createIndex('idx_data_exports_user_id')
    .on('data_exports')
    .column('user_id')
    .execute()
}

export async function down(db: Kysely<never>): Promise<void> {
  await db.schema.dropTable('data_exports').execute()
}
