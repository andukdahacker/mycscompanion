import { describe, it, expect, afterEach, beforeEach } from 'vitest'
import { db } from '../../../shared/db.js'
import { generateId } from '../../../shared/id.js'
import { loadConversationHistory } from './conversation-history.js'

const TEST_UID = 'test-conv-history-uid'

let trackId: string
let milestoneId: string
let sessionId: string

beforeEach(async () => {
  trackId = generateId()
  milestoneId = generateId()
  sessionId = generateId()

  await db.insertInto('users').values({ id: TEST_UID, email: 'history-test@example.com' }).execute()
  await db.insertInto('tracks').values({ id: trackId, name: 'Test Track', slug: 'test-track' }).execute()
  await db.insertInto('milestones').values({ id: milestoneId, track_id: trackId, title: 'Test Milestone', slug: 'test-milestone', position: 1 }).execute()
  await db.insertInto('sessions').values({ id: sessionId, user_id: TEST_UID, milestone_id: milestoneId, is_active: true }).execute()
})

afterEach(async () => {
  await db.deleteFrom('tutor_messages').execute()
  await db.deleteFrom('sessions').execute()
  await db.deleteFrom('user_milestones').execute()
  await db.deleteFrom('milestones').execute()
  await db.deleteFrom('tracks').execute()
  await db.deleteFrom('users').execute()
})

describe('loadConversationHistory', () => {
  it('should return empty array when no messages exist', async () => {
    const result = await loadConversationHistory(db, sessionId)
    expect(result).toEqual([])
  })

  it('should return messages in chronological order', async () => {
    const now = new Date()
    await db.insertInto('tutor_messages').values([
      { id: generateId(), session_id: sessionId, user_id: TEST_UID, role: 'user', content: 'First message', model: null, created_at: new Date(now.getTime()) },
      { id: generateId(), session_id: sessionId, user_id: TEST_UID, role: 'assistant', content: 'First reply', model: 'claude-haiku-4-5-20251001', created_at: new Date(now.getTime() + 1) },
      { id: generateId(), session_id: sessionId, user_id: TEST_UID, role: 'user', content: 'Second message', model: null, created_at: new Date(now.getTime() + 2) },
    ]).execute()

    const result = await loadConversationHistory(db, sessionId)

    expect(result).toEqual([
      { role: 'user', content: 'First message' },
      { role: 'assistant', content: 'First reply' },
      { role: 'user', content: 'Second message' },
    ])
  })

  it('should respect the limit parameter and return most recent messages', async () => {
    const now = new Date()
    const messages = Array.from({ length: 5 }, (_, i) => ({
      id: generateId(),
      session_id: sessionId,
      user_id: TEST_UID,
      role: i % 2 === 0 ? 'user' as const : 'assistant' as const,
      content: `Message ${i + 1}`,
      model: i % 2 === 0 ? null : 'claude-haiku-4-5-20251001',
      created_at: new Date(now.getTime() + i),
    }))

    await db.insertInto('tutor_messages').values(messages).execute()

    const result = await loadConversationHistory(db, sessionId, 3)

    expect(result).toHaveLength(3)
    expect(result.at(0)?.content).toBe('Message 3')
    expect(result.at(1)?.content).toBe('Message 4')
    expect(result.at(2)?.content).toBe('Message 5')
  })

  it('should only return messages for the specified session', async () => {
    const otherMilestoneId = generateId()
    await db.insertInto('milestones').values({ id: otherMilestoneId, track_id: trackId, title: 'Other Milestone', slug: 'other-milestone', position: 2 }).execute()
    const otherSessionId = generateId()
    await db.insertInto('sessions').values({ id: otherSessionId, user_id: TEST_UID, milestone_id: otherMilestoneId, is_active: true }).execute()

    const now = new Date()
    await db.insertInto('tutor_messages').values([
      { id: generateId(), session_id: sessionId, user_id: TEST_UID, role: 'user', content: 'My session', model: null, created_at: now },
      { id: generateId(), session_id: otherSessionId, user_id: TEST_UID, role: 'user', content: 'Other session', model: null, created_at: now },
    ]).execute()

    const result = await loadConversationHistory(db, sessionId)

    expect(result).toHaveLength(1)
    expect(result.at(0)?.content).toBe('My session')
  })

  it('should default to 50 message limit', async () => {
    const now = new Date()
    const messages = Array.from({ length: 55 }, (_, i) => ({
      id: generateId(),
      session_id: sessionId,
      user_id: TEST_UID,
      role: 'user' as const,
      content: `Message ${i + 1}`,
      model: null,
      created_at: new Date(now.getTime() + i),
    }))

    await db.insertInto('tutor_messages').values(messages).execute()

    const result = await loadConversationHistory(db, sessionId)

    expect(result).toHaveLength(50)
    // Should have the last 50 messages (6 through 55)
    expect(result.at(0)?.content).toBe('Message 6')
    expect(result.at(49)?.content).toBe('Message 55')
  })
})
