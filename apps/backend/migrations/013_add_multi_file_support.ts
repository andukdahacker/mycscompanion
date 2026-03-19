import type { Kysely } from 'kysely'
import { sql } from 'kysely'

export async function up(db: Kysely<never>): Promise<void> {
  // Add files JSONB column to submissions (nullable — M1 rows untouched)
  await db.schema
    .alterTable('submissions')
    .addColumn('files', 'jsonb')
    .execute()

  // Relax code NOT NULL on submissions (multi-file submissions set code to null)
  await sql`ALTER TABLE submissions ALTER COLUMN code DROP NOT NULL`.execute(db)

  // Add files JSONB column to code_snapshots (nullable — M1 rows untouched)
  await db.schema
    .alterTable('code_snapshots')
    .addColumn('files', 'jsonb')
    .execute()

  // Relax code NOT NULL on code_snapshots (multi-file snapshots set code to null)
  await sql`ALTER TABLE code_snapshots ALTER COLUMN code DROP NOT NULL`.execute(db)
}

export async function down(db: Kysely<never>): Promise<void> {
  // Restore NOT NULL constraints (set null values to empty string first)
  await sql`UPDATE code_snapshots SET code = '' WHERE code IS NULL`.execute(db)
  await sql`ALTER TABLE code_snapshots ALTER COLUMN code SET NOT NULL`.execute(db)
  await sql`UPDATE submissions SET code = '' WHERE code IS NULL`.execute(db)
  await sql`ALTER TABLE submissions ALTER COLUMN code SET NOT NULL`.execute(db)

  await db.schema.alterTable('code_snapshots').dropColumn('files').execute()
  await db.schema.alterTable('submissions').dropColumn('files').execute()
}
