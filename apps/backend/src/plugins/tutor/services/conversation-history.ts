import type { Kysely } from 'kysely'
import type { DB } from '@mycscompanion/shared'

const DEFAULT_MAX_MESSAGES = 50

export type ConversationMessage = {
  readonly role: 'user' | 'assistant'
  readonly content: string
}

export async function loadConversationHistory(
  db: Kysely<DB>,
  sessionId: string,
  limit: number = DEFAULT_MAX_MESSAGES
): Promise<readonly ConversationMessage[]> {
  const recentMessages = await db
    .selectFrom('tutor_messages')
    .select(['role', 'content'])
    .where('session_id', '=', sessionId)
    .orderBy('created_at', 'desc')
    .orderBy('id', 'desc')
    .limit(limit)
    .execute()

  return recentMessages.reverse().map((m): ConversationMessage => {
    if (m.role !== 'user' && m.role !== 'assistant') {
      throw new Error(`Unexpected tutor_messages role: ${m.role}`)
    }
    return { role: m.role, content: m.content }
  })
}
