import type { Kysely } from 'kysely'
import { sql } from 'kysely'

export async function up(db: Kysely<never>): Promise<void> {
  await db.schema
    .createTable('tutor_messages')
    .addColumn('id', 'text', (col) => col.primaryKey())
    .addColumn('session_id', 'text', (col) =>
      col.notNull().references('sessions.id').onDelete('cascade')
    )
    .addColumn('user_id', 'text', (col) =>
      col.notNull().references('users.id').onDelete('cascade')
    )
    .addColumn('role', 'text', (col) => col.notNull()) // 'user' | 'assistant'
    .addColumn('content', 'text', (col) => col.notNull())
    .addColumn('model', 'text') // null for user messages
    .addColumn('created_at', sql`timestamptz`, (col) =>
      col.notNull().defaultTo(sql`now()`)
    )
    .execute()

  // Fast lookup: messages for a session ordered by time
  await db.schema
    .createIndex('idx_tutor_messages_session_id_created_at')
    .on('tutor_messages')
    .columns(['session_id', 'created_at'])
    .execute()

  // Fast lookup: all messages by a user
  await db.schema
    .createIndex('idx_tutor_messages_user_id')
    .on('tutor_messages')
    .column('user_id')
    .execute()
}

export async function down(db: Kysely<never>): Promise<void> {
  await db.schema.dropTable('tutor_messages').execute()
}
