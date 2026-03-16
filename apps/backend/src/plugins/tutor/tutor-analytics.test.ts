import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { sql } from 'kysely'
import { db } from '../../shared/db.js'
import { generateId } from '../../shared/id.js'
import { up, down } from '../../../migrations/011_add_tutor_analytics_views.js'

interface TutorConversationLogRow {
  message_id: string
  session_id: string
  user_id: string
  user_email: string
  user_display_name: string | null
  user_role: string | null
  user_experience_level: string | null
  user_primary_language: string | null
  milestone_id: string | null
  milestone_title: string | null
  milestone_slug: string | null
  milestone_position: number | null
  message_role: string
  content: string
  model: string | null
  created_at: Date
}

interface TutorSessionSummaryRow {
  session_id: string
  user_id: string
  user_role: string | null
  experience_level: string | null
  primary_language: string | null
  milestone_id: string | null
  milestone_title: string | null
  milestone_slug: string | null
  total_messages: string
  user_messages: string
  assistant_messages: string
  haiku_messages: string
  sonnet_messages: string
  first_message_at: Date
  last_message_at: Date
  duration_seconds: string
}

const TEST_UID = 'test-analytics-uid'
let trackId: string
let milestoneId: string
let milestone2Id: string
let sessionId: string

beforeEach(async () => {
  trackId = generateId()
  milestoneId = generateId()
  milestone2Id = generateId()
  sessionId = generateId()

  await db
    .insertInto('users')
    .values({
      id: TEST_UID,
      email: 'analytics-test@example.com',
      display_name: 'Test User',
      role: 'learner',
      experience_level: 'beginner',
      primary_language: 'Go',
    })
    .execute()

  await db
    .insertInto('tracks')
    .values({ id: trackId, name: 'Systems Track', slug: 'systems-track' })
    .execute()

  await db
    .insertInto('milestones')
    .values([
      { id: milestoneId, track_id: trackId, title: 'KV Store', slug: 'kv-store', position: 1 },
      { id: milestone2Id, track_id: trackId, title: 'HTTP Server', slug: 'http-server', position: 2 },
    ])
    .execute()

  await db
    .insertInto('sessions')
    .values({ id: sessionId, user_id: TEST_UID, milestone_id: milestoneId, is_active: true })
    .execute()
})

afterEach(async () => {
  vi.restoreAllMocks()
  await db.deleteFrom('tutor_messages').execute()
  await db.deleteFrom('sessions').execute()
  await db.deleteFrom('milestones').execute()
  await db.deleteFrom('tracks').execute()
  await db.deleteFrom('users').execute()
})

describe('tutor_conversation_log view', () => {
  it('should join tutor messages with user profile and milestone context', async () => {
    const msgId = generateId()
    await db
      .insertInto('tutor_messages')
      .values({
        id: msgId,
        session_id: sessionId,
        user_id: TEST_UID,
        role: 'assistant',
        content: 'What have you tried so far?',
        model: 'claude-haiku-4-5-20251001',
        created_at: new Date('2026-03-10T10:00:00Z'),
      })
      .execute()

    const result = await sql<TutorConversationLogRow>`
      SELECT * FROM tutor_conversation_log WHERE session_id = ${sessionId}
    `.execute(db)

    expect(result.rows).toHaveLength(1)
    const row = result.rows[0]
    expect(row).toBeDefined()
    expect(row!.message_id).toBe(msgId)
    expect(row!.user_email).toBe('analytics-test@example.com')
    expect(row!.user_display_name).toBe('Test User')
    expect(row!.user_role).toBe('learner')
    expect(row!.user_experience_level).toBe('beginner')
    expect(row!.user_primary_language).toBe('Go')
    expect(row!.milestone_title).toBe('KV Store')
    expect(row!.milestone_slug).toBe('kv-store')
    expect(row!.milestone_position).toBe(1)
    expect(row!.message_role).toBe('assistant')
    expect(row!.content).toBe('What have you tried so far?')
    expect(row!.model).toBe('claude-haiku-4-5-20251001')
  })

  it('should support filtering by milestone_slug', async () => {
    const session2Id = generateId()
    await db
      .insertInto('sessions')
      .values({ id: session2Id, user_id: TEST_UID, milestone_id: milestone2Id, is_active: false })
      .execute()

    await db
      .insertInto('tutor_messages')
      .values([
        { id: generateId(), session_id: sessionId, user_id: TEST_UID, role: 'user', content: 'KV question', model: null },
        { id: generateId(), session_id: session2Id, user_id: TEST_UID, role: 'user', content: 'HTTP question', model: null },
      ])
      .execute()

    const result = await sql<TutorConversationLogRow>`
      SELECT * FROM tutor_conversation_log WHERE milestone_slug = 'kv-store'
    `.execute(db)

    expect(result.rows).toHaveLength(1)
    expect(result.rows[0]!.content).toBe('KV question')
  })

  it('should support filtering by model', async () => {
    await db
      .insertInto('tutor_messages')
      .values([
        { id: generateId(), session_id: sessionId, user_id: TEST_UID, role: 'assistant', content: 'Haiku response', model: 'claude-haiku-4-5-20251001' },
        { id: generateId(), session_id: sessionId, user_id: TEST_UID, role: 'assistant', content: 'Sonnet response', model: 'claude-sonnet-4-5-20241022' },
        { id: generateId(), session_id: sessionId, user_id: TEST_UID, role: 'user', content: 'User msg', model: null },
      ])
      .execute()

    const result = await sql<TutorConversationLogRow>`
      SELECT * FROM tutor_conversation_log WHERE model LIKE 'claude-sonnet%'
    `.execute(db)

    expect(result.rows).toHaveLength(1)
    expect(result.rows[0]!.content).toBe('Sonnet response')
  })

  it('should support filtering by date range', async () => {
    await db
      .insertInto('tutor_messages')
      .values([
        { id: generateId(), session_id: sessionId, user_id: TEST_UID, role: 'user', content: 'Old message', model: null, created_at: new Date('2026-02-01T10:00:00Z') },
        { id: generateId(), session_id: sessionId, user_id: TEST_UID, role: 'user', content: 'Recent message', model: null, created_at: new Date('2026-03-10T10:00:00Z') },
      ])
      .execute()

    const result = await sql<TutorConversationLogRow>`
      SELECT * FROM tutor_conversation_log
      WHERE created_at >= '2026-03-01'::timestamptz
        AND created_at < '2026-04-01'::timestamptz
    `.execute(db)

    expect(result.rows).toHaveLength(1)
    expect(result.rows[0]!.content).toBe('Recent message')
  })

  it('should return milestone data for sessions with valid milestone', async () => {
    const msgId = generateId()
    await db
      .insertInto('tutor_messages')
      .values({
        id: msgId,
        session_id: sessionId,
        user_id: TEST_UID,
        role: 'user',
        content: 'How do I start?',
        model: null,
      })
      .execute()

    const result = await sql<TutorConversationLogRow>`
      SELECT * FROM tutor_conversation_log WHERE message_id = ${msgId}
    `.execute(db)

    expect(result.rows).toHaveLength(1)
    const row = result.rows[0]
    expect(row).toBeDefined()
    expect(row!.milestone_id).toBe(milestoneId)
    expect(row!.milestone_title).toBe('KV Store')
    expect(row!.milestone_slug).toBe('kv-store')
    expect(row!.milestone_position).toBe(1)
  })
})

describe('tutor_session_summary view', () => {
  it('should aggregate message counts per session', async () => {
    const now = new Date('2026-03-10T10:00:00Z')
    const messages = []
    for (let i = 0; i < 6; i++) {
      messages.push({
        id: generateId(),
        session_id: sessionId,
        user_id: TEST_UID,
        role: i < 3 ? 'user' : 'assistant',
        content: `Message ${i}`,
        model: i < 3 ? null : 'claude-haiku-4-5-20251001',
        created_at: new Date(now.getTime() + i * 1000),
      })
    }
    await db.insertInto('tutor_messages').values(messages).execute()

    const result = await sql<TutorSessionSummaryRow>`
      SELECT * FROM tutor_session_summary WHERE session_id = ${sessionId}
    `.execute(db)

    expect(result.rows).toHaveLength(1)
    const row = result.rows[0]
    expect(row).toBeDefined()
    expect(Number(row!.total_messages)).toBe(6)
    expect(Number(row!.user_messages)).toBe(3)
    expect(Number(row!.assistant_messages)).toBe(3)
  })

  it('should count model usage correctly', async () => {
    await db
      .insertInto('tutor_messages')
      .values([
        { id: generateId(), session_id: sessionId, user_id: TEST_UID, role: 'user', content: 'Q1', model: null },
        { id: generateId(), session_id: sessionId, user_id: TEST_UID, role: 'assistant', content: 'A1', model: 'claude-haiku-4-5-20251001' },
        { id: generateId(), session_id: sessionId, user_id: TEST_UID, role: 'user', content: 'Q2', model: null },
        { id: generateId(), session_id: sessionId, user_id: TEST_UID, role: 'assistant', content: 'A2', model: 'claude-sonnet-4-5-20241022' },
        { id: generateId(), session_id: sessionId, user_id: TEST_UID, role: 'assistant', content: 'A3', model: 'claude-haiku-4-5-20251001' },
      ])
      .execute()

    const result = await sql<TutorSessionSummaryRow>`
      SELECT * FROM tutor_session_summary WHERE session_id = ${sessionId}
    `.execute(db)

    expect(result.rows).toHaveLength(1)
    const row = result.rows[0]
    expect(row).toBeDefined()
    expect(Number(row!.haiku_messages)).toBe(2)
    expect(Number(row!.sonnet_messages)).toBe(1)
  })

  it('should include user background for pattern analysis', async () => {
    await db
      .insertInto('tutor_messages')
      .values({ id: generateId(), session_id: sessionId, user_id: TEST_UID, role: 'user', content: 'Hello', model: null })
      .execute()

    const result = await sql<TutorSessionSummaryRow>`
      SELECT * FROM tutor_session_summary WHERE session_id = ${sessionId}
    `.execute(db)

    expect(result.rows).toHaveLength(1)
    const row = result.rows[0]
    expect(row).toBeDefined()
    expect(row!.user_role).toBe('learner')
    expect(row!.experience_level).toBe('beginner')
    expect(row!.primary_language).toBe('Go')
  })

  it('should return 0 duration_seconds for single-message sessions', async () => {
    await db
      .insertInto('tutor_messages')
      .values({ id: generateId(), session_id: sessionId, user_id: TEST_UID, role: 'user', content: 'Only message', model: null })
      .execute()

    const result = await sql<TutorSessionSummaryRow>`
      SELECT * FROM tutor_session_summary WHERE session_id = ${sessionId}
    `.execute(db)

    expect(result.rows).toHaveLength(1)
    expect(Number(result.rows[0]!.duration_seconds)).toBe(0)
  })
})

describe('migration up/down', () => {
  it('should create both views on migration up', async () => {
    const result = await sql<{ viewname: string }>`
      SELECT viewname FROM pg_views
      WHERE schemaname = 'public'
        AND viewname IN ('tutor_conversation_log', 'tutor_session_summary')
      ORDER BY viewname
    `.execute(db)

    expect(result.rows).toHaveLength(2)
    expect(result.rows[0]!.viewname).toBe('tutor_conversation_log')
    expect(result.rows[1]!.viewname).toBe('tutor_session_summary')
  })

  it('should drop both views on migration down and recreate on up', async () => {
    await down(db)

    const afterDown = await sql<{ viewname: string }>`
      SELECT viewname FROM pg_views
      WHERE schemaname = 'public'
        AND viewname IN ('tutor_conversation_log', 'tutor_session_summary')
    `.execute(db)
    expect(afterDown.rows).toHaveLength(0)

    await up(db)

    const afterUp = await sql<{ viewname: string }>`
      SELECT viewname FROM pg_views
      WHERE schemaname = 'public'
        AND viewname IN ('tutor_conversation_log', 'tutor_session_summary')
      ORDER BY viewname
    `.execute(db)
    expect(afterUp.rows).toHaveLength(2)
  })
})
