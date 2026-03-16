import { Kysely, Migrator, FileMigrationProvider, PostgresDialect } from 'kysely'
import pg from 'pg'
import path from 'node:path'
import { promises as fs } from 'node:fs'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const isCI = process.env['CI'] === 'true'
const PG_PORT = isCI ? '5432' : '5433'
const DEV_DB_URL = `postgresql://mycscompanion:mycscompanion@localhost:${PG_PORT}/mycscompanion`
const TEST_DB_URL = `postgresql://mycscompanion:mycscompanion@localhost:${PG_PORT}/mycscompanion_test`

export async function setup(): Promise<void> {
  // 1. Ensure mycscompanion_test database exists (connect to dev DB to issue CREATE DATABASE)
  const adminPool = new pg.Pool({ connectionString: DEV_DB_URL })
  try {
    const result = await adminPool.query(
      "SELECT 1 FROM pg_database WHERE datname = 'mycscompanion_test'"
    )
    if (result.rows.length === 0) {
      await adminPool.query('CREATE DATABASE mycscompanion_test')
    }
  } finally {
    await adminPool.end()
  }

  // 2. Run migrations against mycscompanion_test
  const db = new Kysely<Record<string, never>>({
    dialect: new PostgresDialect({
      pool: new pg.Pool({ connectionString: TEST_DB_URL }),
    }),
  })
  const migrator = new Migrator({
    db,
    provider: new FileMigrationProvider({
      fs,
      path,
      migrationFolder: path.resolve(__dirname, '../../migrations'),
    }),
  })
  const { error } = await migrator.migrateToLatest()
  await db.destroy()
  if (error) throw error
}
