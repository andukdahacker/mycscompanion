import { describe, it, expect, afterEach, vi, beforeEach } from 'vitest'
import { db } from '../../../shared/db.js'
import { generateId } from '../../../shared/id.js'
import {
  processStaleSessionsForUser,
  backfillLatestSessionSummary,
} from './stale-session-handler.js'

const TEST_UID = 'test-stale-handler-uid'
let trackId: string
let milestoneId: string

beforeEach(async () => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-03-01T12:00:00Z'))

  trackId = generateId()
  milestoneId = generateId()

  await db
    .insertInto('users')
    .values({ id: TEST_UID, email: 'stale-handler-test@example.com' })
    .execute()

  await db
    .insertInto('tracks')
    .values({ id: trackId, name: 'Test Track', slug: 'test-track' })
    .execute()

  await db
    .insertInto('milestones')
    .values({ id: milestoneId, track_id: trackId, title: 'Test Milestone', slug: 'test-milestone', position: 1 })
    .execute()
})

afterEach(async () => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  await db.deleteFrom('session_summaries').execute()
  await db.deleteFrom('code_snapshots').execute()
  await db.deleteFrom('submissions').execute()
  await db.deleteFrom('sessions').execute()
  await db.deleteFrom('milestones').execute()
  await db.deleteFrom('tracks').execute()
  await db.deleteFrom('users').execute()
})

describe('processStaleSessionsForUser', () => {
  it('should deactivate session with no activity for > 15 minutes', async () => {
    // Session started 20 minutes ago, no snapshots
    const sessionId = generateId()
    const startedAt = new Date(Date.now() - 20 * 60 * 1000)
    await db
      .insertInto('sessions')
      .values({ id: sessionId, user_id: TEST_UID, milestone_id: milestoneId, is_active: true, started_at: startedAt })
      .execute()

    await processStaleSessionsForUser(db, TEST_UID)

    const session = await db
      .selectFrom('sessions')
      .select(['is_active', 'ended_at'])
      .where('id', '=', sessionId)
      .executeTakeFirstOrThrow()

    expect(session.is_active).toBe(false)
    expect(session.ended_at).toBeDefined()
  })

  it('should leave active session with recent activity untouched', async () => {
    // Session started 30 minutes ago but has a recent snapshot (5 min ago)
    const sessionId = generateId()
    const startedAt = new Date(Date.now() - 30 * 60 * 1000)
    await db
      .insertInto('sessions')
      .values({ id: sessionId, user_id: TEST_UID, milestone_id: milestoneId, is_active: true, started_at: startedAt })
      .execute()

    await db
      .insertInto('code_snapshots')
      .values({ id: generateId(), user_id: TEST_UID, milestone_id: milestoneId, session_id: sessionId, code: 'hello', created_at: new Date(Date.now() - 5 * 60 * 1000) })
      .execute()

    await processStaleSessionsForUser(db, TEST_UID)

    const session = await db
      .selectFrom('sessions')
      .select(['is_active'])
      .where('id', '=', sessionId)
      .executeTakeFirstOrThrow()

    expect(session.is_active).toBe(true)
  })

  it('should generate summary for stale session', async () => {
    const sessionId = generateId()
    const startedAt = new Date(Date.now() - 20 * 60 * 1000)
    await db
      .insertInto('sessions')
      .values({ id: sessionId, user_id: TEST_UID, milestone_id: milestoneId, is_active: true, started_at: startedAt })
      .execute()

    // Add a snapshot so summary has content
    await db
      .insertInto('code_snapshots')
      .values({ id: generateId(), user_id: TEST_UID, milestone_id: milestoneId, session_id: sessionId, code: 'hello', created_at: new Date(Date.now() - 18 * 60 * 1000) })
      .execute()

    await processStaleSessionsForUser(db, TEST_UID)

    const summary = await db
      .selectFrom('session_summaries')
      .selectAll()
      .where('session_id', '=', sessionId)
      .executeTakeFirst()

    expect(summary).toBeDefined()
    expect(summary!.summary_text).toContain('Working on Test Milestone.')
  })

  it('should use latest snapshot time as last activity', async () => {
    const sessionId = generateId()
    // Session started 30 minutes ago
    const startedAt = new Date(Date.now() - 30 * 60 * 1000)
    await db
      .insertInto('sessions')
      .values({ id: sessionId, user_id: TEST_UID, milestone_id: milestoneId, is_active: true, started_at: startedAt })
      .execute()

    // Latest snapshot was 20 minutes ago (stale)
    const snapshotTime = new Date(Date.now() - 20 * 60 * 1000)
    await db
      .insertInto('code_snapshots')
      .values([
        { id: generateId(), user_id: TEST_UID, milestone_id: milestoneId, session_id: sessionId, code: 'first', created_at: new Date(Date.now() - 25 * 60 * 1000) },
        { id: generateId(), user_id: TEST_UID, milestone_id: milestoneId, session_id: sessionId, code: 'second', created_at: snapshotTime },
      ])
      .execute()

    await processStaleSessionsForUser(db, TEST_UID)

    const session = await db
      .selectFrom('sessions')
      .select(['ended_at'])
      .where('id', '=', sessionId)
      .executeTakeFirstOrThrow()

    // ended_at should be set to the latest snapshot time, not current time
    expect(session.ended_at).toBeDefined()
    expect(new Date(session.ended_at!).getTime()).toBe(snapshotTime.getTime())
  })

  it('should use session start time when no snapshots exist', async () => {
    const sessionId = generateId()
    const startedAt = new Date(Date.now() - 20 * 60 * 1000)
    await db
      .insertInto('sessions')
      .values({ id: sessionId, user_id: TEST_UID, milestone_id: milestoneId, is_active: true, started_at: startedAt })
      .execute()

    await processStaleSessionsForUser(db, TEST_UID)

    const session = await db
      .selectFrom('sessions')
      .select(['ended_at'])
      .where('id', '=', sessionId)
      .executeTakeFirstOrThrow()

    expect(session.ended_at).toBeDefined()
    expect(new Date(session.ended_at!).getTime()).toBe(startedAt.getTime())
  })

  it('should handle multiple active sessions on different milestones', async () => {
    const staleSessionId = generateId()
    const recentSessionId = generateId()
    const otherMilestoneId = generateId()

    await db
      .insertInto('milestones')
      .values({ id: otherMilestoneId, track_id: trackId, title: 'Other Milestone', slug: 'other-milestone', position: 2 })
      .execute()

    // Stale session — started 20 min ago, no snapshots
    await db
      .insertInto('sessions')
      .values({ id: staleSessionId, user_id: TEST_UID, milestone_id: milestoneId, is_active: true, started_at: new Date(Date.now() - 20 * 60 * 1000) })
      .execute()

    // Recent session on different milestone — started 5 min ago
    await db
      .insertInto('sessions')
      .values({ id: recentSessionId, user_id: TEST_UID, milestone_id: otherMilestoneId, is_active: true, started_at: new Date(Date.now() - 5 * 60 * 1000) })
      .execute()

    await processStaleSessionsForUser(db, TEST_UID)

    const stale = await db.selectFrom('sessions').select(['is_active']).where('id', '=', staleSessionId).executeTakeFirstOrThrow()
    const recent = await db.selectFrom('sessions').select(['is_active']).where('id', '=', recentSessionId).executeTakeFirstOrThrow()

    expect(stale.is_active).toBe(false)
    expect(recent.is_active).toBe(true)
  })
})

describe('backfillLatestSessionSummary', () => {
  it('should generate summary for ended session without one', async () => {
    const sessionId = generateId()
    await db
      .insertInto('sessions')
      .values({
        id: sessionId,
        user_id: TEST_UID,
        milestone_id: milestoneId,
        is_active: false,
        started_at: new Date('2026-03-01T10:00:00Z'),
        ended_at: new Date('2026-03-01T11:00:00Z'),
      })
      .execute()

    // Add activity
    await db
      .insertInto('code_snapshots')
      .values({ id: generateId(), user_id: TEST_UID, milestone_id: milestoneId, session_id: sessionId, code: 'hello', created_at: new Date('2026-03-01T10:30:00Z') })
      .execute()

    await backfillLatestSessionSummary(db, TEST_UID, milestoneId)

    const summary = await db
      .selectFrom('session_summaries')
      .selectAll()
      .where('session_id', '=', sessionId)
      .executeTakeFirst()

    expect(summary).toBeDefined()
    expect(summary!.summary_text).toContain('Working on Test Milestone.')
  })

  it('should skip when summary already exists', async () => {
    const sessionId = generateId()
    await db
      .insertInto('sessions')
      .values({
        id: sessionId,
        user_id: TEST_UID,
        milestone_id: milestoneId,
        is_active: false,
        started_at: new Date('2026-03-01T10:00:00Z'),
        ended_at: new Date('2026-03-01T11:00:00Z'),
      })
      .execute()

    // Manually insert summary
    await db
      .insertInto('session_summaries')
      .values({ id: generateId(), user_id: TEST_UID, session_id: sessionId, milestone_id: milestoneId, summary_text: 'Existing summary.' })
      .execute()

    await backfillLatestSessionSummary(db, TEST_UID, milestoneId)

    // Should still have exactly one summary
    const count = await db
      .selectFrom('session_summaries')
      .select(db.fn.countAll<string>().as('count'))
      .where('session_id', '=', sessionId)
      .executeTakeFirstOrThrow()

    expect(Number(count.count)).toBe(1)
  })

  it('should skip when no ended sessions exist', async () => {
    // Only active session exists
    const sessionId = generateId()
    await db
      .insertInto('sessions')
      .values({ id: sessionId, user_id: TEST_UID, milestone_id: milestoneId, is_active: true, started_at: new Date('2026-03-01T10:00:00Z') })
      .execute()

    await backfillLatestSessionSummary(db, TEST_UID, milestoneId)

    const count = await db
      .selectFrom('session_summaries')
      .select(db.fn.countAll<string>().as('count'))
      .executeTakeFirstOrThrow()

    expect(Number(count.count)).toBe(0)
  })
})
