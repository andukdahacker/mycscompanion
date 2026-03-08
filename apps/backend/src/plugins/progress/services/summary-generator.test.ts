import { describe, it, expect, afterEach, vi } from 'vitest'
import { db } from '../../../shared/db.js'
import { generateId } from '../../../shared/id.js'
import {
  generateSummaryText,
  generateSessionSummary,
  gatherSessionActivity,
  getSnapshotStats,
} from './summary-generator.js'
import type { SessionActivityData } from './summary-generator.js'

// --- Pure function tests for generateSummaryText ---

function makeActivity(overrides: Partial<SessionActivityData> = {}): SessionActivityData {
  return {
    sessionId: 'sess-1',
    userId: 'user-1',
    milestoneId: 'ms-1',
    milestoneName: 'Milestone 3: B-Tree Implementation',
    snapshotCount: 1,
    submissionCount: 0,
    criteriaResults: null,
    totalCriteriaCount: 0,
    firstSnapshotLineCount: null,
    lastSnapshotLineCount: null,
    ...overrides,
  }
}

describe('generateSummaryText', () => {
  it('should return null when zero activity (no snapshots, no submissions)', () => {
    const result = generateSummaryText(makeActivity({ snapshotCount: 0, submissionCount: 0 }))
    expect(result).toBeNull()
  })

  it('should include milestone name', () => {
    const result = generateSummaryText(makeActivity())
    expect(result).toContain('Working on Milestone 3: B-Tree Implementation.')
  })

  it('should include "All X criteria met" when all criteria are met', () => {
    const result = generateSummaryText(makeActivity({
      criteriaResults: [
        { name: 'put-and-get', order: 1, status: 'met', expected: 'PASS', actual: 'PASS' },
        { name: 'delete-key', order: 2, status: 'met', expected: 'PASS', actual: 'PASS' },
        { name: 'range-scan', order: 3, status: 'met', expected: 'PASS', actual: 'PASS' },
      ],
      totalCriteriaCount: 3,
    }))
    expect(result).toContain('All 3 criteria met.')
  })

  it('should include "X of Y criteria met" and next unmet criterion name for partial criteria', () => {
    const result = generateSummaryText(makeActivity({
      criteriaResults: [
        { name: 'put-and-get', order: 1, status: 'met', expected: 'PASS', actual: 'PASS' },
        { name: 'delete-key', order: 2, status: 'not-met', expected: 'PASS', actual: 'FAIL' },
        { name: 'range-scan', order: 3, status: 'not-met', expected: 'PASS', actual: 'FAIL' },
      ],
      totalCriteriaCount: 3,
    }))
    expect(result).toContain('1 of 3 criteria met.')
    expect(result).toContain('Next: delete-key.')
  })

  it('should include "X criteria to tackle" when no criteria results but total count known', () => {
    const result = generateSummaryText(makeActivity({
      criteriaResults: null,
      totalCriteriaCount: 5,
    }))
    expect(result).toContain('5 criteria to tackle.')
  })

  it('should include "Code grew by N lines" when code grew', () => {
    const result = generateSummaryText(makeActivity({
      snapshotCount: 3,
      firstSnapshotLineCount: 10,
      lastSnapshotLineCount: 25,
    }))
    expect(result).toContain('Code grew by 15 lines.')
  })

  it('should include "Code refined by N lines" when code shrank', () => {
    const result = generateSummaryText(makeActivity({
      snapshotCount: 3,
      firstSnapshotLineCount: 30,
      lastSnapshotLineCount: 20,
    }))
    expect(result).toContain('Code refined by 10 lines.')
  })

  it('should not include line change info with single snapshot', () => {
    const result = generateSummaryText(makeActivity({
      snapshotCount: 1,
      firstSnapshotLineCount: 10,
      lastSnapshotLineCount: 10,
    }))
    expect(result).not.toContain('Code grew')
    expect(result).not.toContain('Code refined')
  })

  it('should include singular "submission" for 1 submission', () => {
    const result = generateSummaryText(makeActivity({ submissionCount: 1 }))
    expect(result).toContain('1 submission made.')
    expect(result).not.toContain('submissions')
  })

  it('should include plural "submissions" for multiple submissions', () => {
    const result = generateSummaryText(makeActivity({ submissionCount: 3 }))
    expect(result).toContain('3 submissions made.')
  })

  it('should contain zero temporal framing', () => {
    const result = generateSummaryText(makeActivity({
      submissionCount: 2,
      snapshotCount: 3,
      firstSnapshotLineCount: 10,
      lastSnapshotLineCount: 25,
      criteriaResults: [
        { name: 'put-and-get', order: 1, status: 'met', expected: 'PASS', actual: 'PASS' },
        { name: 'delete-key', order: 2, status: 'not-met', expected: 'PASS', actual: 'FAIL' },
      ],
      totalCriteriaCount: 2,
    }))
    expect(result).toBeDefined()
    const text = result as string
    // Strip the milestone name (user-controlled content) before checking forbidden words
    const textWithoutMilestone = text.replace('Milestone 3: B-Tree Implementation', '')
    const forbidden = ['welcome back', 'last session', 'last time', 'ago', 'yesterday', 'today', 'days ago', 'hours ago', 'welcome']
    for (const phrase of forbidden) {
      expect(textWithoutMilestone.toLowerCase()).not.toContain(phrase)
    }
  })
})

// --- Integration tests with real PostgreSQL ---

const TEST_UID = 'test-summary-gen-uid'
let trackId: string
let milestoneId: string
let sessionId: string

async function setupTestData(): Promise<void> {
  trackId = generateId()
  milestoneId = generateId()
  sessionId = generateId()

  await db
    .insertInto('users')
    .values({ id: TEST_UID, email: 'summary-test@example.com' })
    .execute()

  await db
    .insertInto('tracks')
    .values({ id: trackId, name: 'Test Track', slug: 'test-track' })
    .execute()

  await db
    .insertInto('milestones')
    .values({ id: milestoneId, track_id: trackId, title: 'Simple Key-Value Store', slug: '01-kv-store', position: 1 })
    .execute()

  await db
    .insertInto('sessions')
    .values({
      id: sessionId,
      user_id: TEST_UID,
      milestone_id: milestoneId,
      is_active: true,
      started_at: new Date('2026-03-01T10:00:00Z'),
    })
    .execute()
}

async function cleanupTestData(): Promise<void> {
  await db.deleteFrom('session_summaries').execute()
  await db.deleteFrom('code_snapshots').execute()
  await db.deleteFrom('submissions').execute()
  await db.deleteFrom('sessions').execute()
  await db.deleteFrom('milestones').execute()
  await db.deleteFrom('tracks').execute()
  await db.deleteFrom('users').execute()
}

describe('getSnapshotStats', () => {
  afterEach(async () => {
    vi.restoreAllMocks()
    await cleanupTestData()
  })

  it('should return count=0 with null line counts when no snapshots', async () => {
    await setupTestData()
    const stats = await getSnapshotStats(db, sessionId)
    expect(stats).toEqual({ count: 0, firstLines: null, lastLines: null })
  })

  it('should return correct count and line counts', async () => {
    await setupTestData()

    await db
      .insertInto('code_snapshots')
      .values([
        { id: generateId(), user_id: TEST_UID, milestone_id: milestoneId, session_id: sessionId, code: 'line1\nline2\nline3', created_at: new Date('2026-03-01T10:05:00Z') },
        { id: generateId(), user_id: TEST_UID, milestone_id: milestoneId, session_id: sessionId, code: 'line1\nline2\nline3\nline4\nline5', created_at: new Date('2026-03-01T10:10:00Z') },
      ])
      .execute()

    const stats = await getSnapshotStats(db, sessionId)
    expect(stats.count).toBe(2)
    expect(stats.firstLines).toBe(3)
    expect(stats.lastLines).toBe(5)
  })
})

describe('gatherSessionActivity', () => {
  afterEach(async () => {
    vi.restoreAllMocks()
    await cleanupTestData()
  })

  it('should return null for nonexistent session', async () => {
    const result = await gatherSessionActivity(db, 'nonexistent')
    expect(result).toBeNull()
  })

  it('should return correct snapshot count and line counts', async () => {
    await setupTestData()

    await db
      .insertInto('code_snapshots')
      .values([
        { id: generateId(), user_id: TEST_UID, milestone_id: milestoneId, session_id: sessionId, code: 'abc', created_at: new Date('2026-03-01T10:05:00Z') },
        { id: generateId(), user_id: TEST_UID, milestone_id: milestoneId, session_id: sessionId, code: 'abc\ndef\nghi', created_at: new Date('2026-03-01T10:10:00Z') },
      ])
      .execute()

    const result = await gatherSessionActivity(db, sessionId)
    expect(result).not.toBeNull()
    expect(result!.snapshotCount).toBe(2)
    expect(result!.firstSnapshotLineCount).toBe(1)
    expect(result!.lastSnapshotLineCount).toBe(3)
  })

  it('should return correct submission count within session timeframe only', async () => {
    await setupTestData()

    // Submission within session timeframe
    await db
      .insertInto('submissions')
      .values([
        { id: generateId(), user_id: TEST_UID, milestone_id: milestoneId, code: 'pkg', status: 'completed', created_at: new Date('2026-03-01T10:30:00Z') },
        // Submission before session started — should NOT be counted
        { id: generateId(), user_id: TEST_UID, milestone_id: milestoneId, code: 'pkg', status: 'completed', created_at: new Date('2026-02-28T10:00:00Z') },
      ])
      .execute()

    const result = await gatherSessionActivity(db, sessionId)
    expect(result).not.toBeNull()
    expect(result!.submissionCount).toBe(1)
  })

  it('should exclude submissions after ended_at for ended sessions', async () => {
    await setupTestData()

    // End the session at a specific time
    await db
      .updateTable('sessions')
      .set({ is_active: false, ended_at: new Date('2026-03-01T11:00:00Z') })
      .where('id', '=', sessionId)
      .execute()

    await db
      .insertInto('submissions')
      .values([
        // During session — should count
        { id: generateId(), user_id: TEST_UID, milestone_id: milestoneId, code: 'pkg', status: 'completed', created_at: new Date('2026-03-01T10:30:00Z') },
        // After session ended — should NOT count
        { id: generateId(), user_id: TEST_UID, milestone_id: milestoneId, code: 'pkg', status: 'completed', created_at: new Date('2026-03-01T12:00:00Z') },
      ])
      .execute()

    const result = await gatherSessionActivity(db, sessionId)
    expect(result).not.toBeNull()
    expect(result!.submissionCount).toBe(1)
  })
})

describe('generateSessionSummary', () => {
  afterEach(async () => {
    vi.restoreAllMocks()
    await cleanupTestData()
  })

  it('should return null for nonexistent session', async () => {
    const result = await generateSessionSummary(db, 'nonexistent')
    expect(result).toBeNull()
  })

  it('should create DB record with correct fields', async () => {
    await setupTestData()

    // Add some activity
    await db
      .insertInto('code_snapshots')
      .values({ id: generateId(), user_id: TEST_UID, milestone_id: milestoneId, session_id: sessionId, code: 'hello', created_at: new Date('2026-03-01T10:05:00Z') })
      .execute()

    const result = await generateSessionSummary(db, sessionId)
    expect(result).not.toBeNull()
    expect(result!.summaryId).toBeTruthy()
    expect(result!.summaryText).toContain('Working on Simple Key-Value Store.')

    // Verify DB record
    const dbRecord = await db
      .selectFrom('session_summaries')
      .selectAll()
      .where('id', '=', result!.summaryId)
      .executeTakeFirst()

    expect(dbRecord).toBeDefined()
    expect(dbRecord!.user_id).toBe(TEST_UID)
    expect(dbRecord!.session_id).toBe(sessionId)
    expect(dbRecord!.milestone_id).toBe(milestoneId)
    expect(dbRecord!.summary_text).toBe(result!.summaryText)
  })

  it('should return null on second call (idempotency)', async () => {
    await setupTestData()

    await db
      .insertInto('code_snapshots')
      .values({ id: generateId(), user_id: TEST_UID, milestone_id: milestoneId, session_id: sessionId, code: 'hello', created_at: new Date('2026-03-01T10:05:00Z') })
      .execute()

    const first = await generateSessionSummary(db, sessionId)
    expect(first).not.toBeNull()

    const second = await generateSessionSummary(db, sessionId)
    expect(second).toBeNull()
  })

  it('should skip when no meaningful activity', async () => {
    await setupTestData()
    // No snapshots, no submissions → no summary
    const result = await generateSessionSummary(db, sessionId)
    expect(result).toBeNull()
  })
})
