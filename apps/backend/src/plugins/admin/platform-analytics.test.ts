import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { sql } from 'kysely'
import { db } from '../../shared/db.js'
import { generateId } from '../../shared/id.js'
import { up, down } from '../../../migrations/012_add_platform_analytics_views.js'

interface PlatformSignupMetricsRow {
  signup_date: Date
  signup_count: string
  onboarding_completed_count: string
  skill_floor_passed_count: string
  learner_count: string
}

interface MilestoneCompletionMetricsRow {
  milestone_id: string
  milestone_title: string
  milestone_slug: string
  milestone_position: number
  track_name: string
  track_slug: string
  completed_users: string
  first_completion_at: Date | null
  latest_completion_at: Date | null
}

interface MilestoneDropoutAnalysisRow {
  milestone_id: string
  milestone_title: string
  milestone_slug: string
  milestone_position: number
  user_id: string
  user_role: string | null
  experience_level: string | null
  submission_count: string
  session_count: string
  first_session_at: Date
  last_activity_at: Date
  completed: boolean
}

interface UserRetentionDailyRow {
  activity_date: Date
  user_id: string
  user_role: string | null
  experience_level: string | null
  signup_date: Date
  session_count: string
  milestones_touched: string
}

interface MilestoneTimeToCompletionRow {
  user_id: string
  milestone_id: string
  milestone_title: string
  milestone_slug: string
  milestone_position: number
  user_role: string | null
  experience_level: string | null
  first_session_at: Date
  completed_at: Date
  time_to_completion_seconds: string
  total_sessions: string
  total_submissions: string
}

interface UserResourceConsumptionRow {
  user_id: string
  email: string
  user_role: string | null
  signup_date: Date
  total_sessions: string
  total_submissions: string
  successful_submissions: string
  failed_submissions: string
  total_tutor_messages: string
  sonnet_messages: string
  haiku_messages: string
  total_benchmark_runs: string
  total_code_snapshots: string
  milestones_completed: string
}

const TEST_UID = 'test-platform-analytics-uid'
const TEST_UID_2 = 'test-platform-analytics-uid-2'
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
    .values([
      {
        id: TEST_UID,
        email: 'platform-test@example.com',
        display_name: 'Test User',
        role: 'learner',
        experience_level: 'beginner',
        primary_language: 'Go',
        onboarding_completed_at: new Date('2026-03-01T10:00:00Z'),
        skill_floor_passed: true,
        created_at: new Date('2026-03-01T08:00:00Z'),
      },
      {
        id: TEST_UID_2,
        email: 'platform-test2@example.com',
        display_name: 'Test User 2',
        role: 'learner',
        experience_level: 'intermediate',
        primary_language: 'Go',
        onboarding_completed_at: null,
        skill_floor_passed: false,
        created_at: new Date('2026-03-01T12:00:00Z'),
      },
    ])
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
    .values({
      id: sessionId,
      user_id: TEST_UID,
      milestone_id: milestoneId,
      is_active: true,
      started_at: new Date('2026-03-01T09:00:00Z'),
    })
    .execute()
})

afterEach(async () => {
  vi.restoreAllMocks()
  await db.deleteFrom('benchmark_results').execute()
  await db.deleteFrom('code_snapshots').execute()
  await db.deleteFrom('tutor_messages').execute()
  await db.deleteFrom('session_summaries').execute()
  await db.deleteFrom('submissions').execute()
  await db.deleteFrom('user_milestones').execute()
  await db.deleteFrom('sessions').execute()
  await db.deleteFrom('milestones').execute()
  await db.deleteFrom('tracks').execute()
  await db.deleteFrom('users').execute()
})

describe('platform_signup_metrics view', () => {
  it('should aggregate signups by day with separate rows per day', async () => {
    // TEST_UID and TEST_UID_2 are on 2026-03-01 (from beforeEach)
    // Add a third user on a different day to verify multi-day aggregation
    const thirdUserId = generateId()
    await db
      .insertInto('users')
      .values({
        id: thirdUserId,
        email: 'platform-test3@example.com',
        display_name: 'Test User 3',
        role: 'learner',
        experience_level: 'advanced',
        primary_language: 'Go',
        onboarding_completed_at: new Date('2026-03-02T10:00:00Z'),
        skill_floor_passed: true,
        created_at: new Date('2026-03-02T08:00:00Z'),
      })
      .execute()

    const result = await sql<PlatformSignupMetricsRow>`
      SELECT * FROM platform_signup_metrics
      WHERE signup_date >= DATE_TRUNC('day', '2026-03-01'::timestamptz)
      ORDER BY signup_date
    `.execute(db)

    expect(result.rows).toHaveLength(2)
    // Day 1: 2 users (TEST_UID + TEST_UID_2)
    const day1 = result.rows[0]
    expect(day1).toBeDefined()
    expect(Number(day1!.signup_count)).toBe(2)
    // Day 2: 1 user (thirdUserId)
    const day2 = result.rows[1]
    expect(day2).toBeDefined()
    expect(Number(day2!.signup_count)).toBe(1)
  })

  it('should count onboarding and skill floor completion separately', async () => {
    const result = await sql<PlatformSignupMetricsRow>`
      SELECT * FROM platform_signup_metrics
      WHERE signup_date = DATE_TRUNC('day', '2026-03-01'::timestamptz)
    `.execute(db)

    expect(result.rows).toHaveLength(1)
    const row = result.rows[0]
    expect(row).toBeDefined()
    // TEST_UID has onboarding_completed_at set, TEST_UID_2 does not
    expect(Number(row!.onboarding_completed_count)).toBe(1)
    // TEST_UID has skill_floor_passed=true, TEST_UID_2 has false
    expect(Number(row!.skill_floor_passed_count)).toBe(1)
    // Both are learners
    expect(Number(row!.learner_count)).toBe(2)
  })
})

describe('milestone_completion_metrics view', () => {
  it('should count completed users per milestone', async () => {
    const umId1 = generateId()
    const umId2 = generateId()
    await db
      .insertInto('user_milestones')
      .values([
        { id: umId1, user_id: TEST_UID, milestone_id: milestoneId, completed_at: new Date('2026-03-02T10:00:00Z') },
        { id: umId2, user_id: TEST_UID_2, milestone_id: milestoneId, completed_at: new Date('2026-03-03T10:00:00Z') },
      ])
      .execute()

    const result = await sql<MilestoneCompletionMetricsRow>`
      SELECT * FROM milestone_completion_metrics WHERE milestone_id = ${milestoneId}
    `.execute(db)

    expect(result.rows).toHaveLength(1)
    const row = result.rows[0]
    expect(row).toBeDefined()
    expect(Number(row!.completed_users)).toBe(2)
    expect(row!.milestone_title).toBe('KV Store')
    expect(row!.track_name).toBe('Systems Track')
  })

  it('should return 0 completed_users for milestones with no completions', async () => {
    const result = await sql<MilestoneCompletionMetricsRow>`
      SELECT * FROM milestone_completion_metrics WHERE milestone_id = ${milestone2Id}
    `.execute(db)

    expect(result.rows).toHaveLength(1)
    const row = result.rows[0]
    expect(row).toBeDefined()
    expect(Number(row!.completed_users)).toBe(0)
    expect(row!.first_completion_at).toBeNull()
    expect(row!.latest_completion_at).toBeNull()
  })
})

describe('milestone_dropout_analysis view', () => {
  it('should identify users who attempted but did not complete a milestone', async () => {
    // TEST_UID has a session for milestoneId but no user_milestones entry
    const result = await sql<MilestoneDropoutAnalysisRow>`
      SELECT * FROM milestone_dropout_analysis
      WHERE milestone_id = ${milestoneId} AND user_id = ${TEST_UID}
    `.execute(db)

    expect(result.rows).toHaveLength(1)
    const row = result.rows[0]
    expect(row).toBeDefined()
    expect(row!.completed).toBe(false)
    expect(row!.user_role).toBe('learner')
    expect(row!.experience_level).toBe('beginner')
  })

  it('should mark completed users correctly', async () => {
    const umId = generateId()
    await db
      .insertInto('user_milestones')
      .values({ id: umId, user_id: TEST_UID, milestone_id: milestoneId, completed_at: new Date('2026-03-02T10:00:00Z') })
      .execute()

    const result = await sql<MilestoneDropoutAnalysisRow>`
      SELECT * FROM milestone_dropout_analysis
      WHERE milestone_id = ${milestoneId} AND user_id = ${TEST_UID}
    `.execute(db)

    expect(result.rows).toHaveLength(1)
    const row = result.rows[0]
    expect(row).toBeDefined()
    expect(row!.completed).toBe(true)
  })

  it('should include submission and session counts', async () => {
    const session2Id = generateId()
    await db
      .insertInto('sessions')
      .values({
        id: session2Id,
        user_id: TEST_UID,
        milestone_id: milestoneId,
        is_active: false,
        started_at: new Date('2026-03-02T09:00:00Z'),
        ended_at: new Date('2026-03-02T10:00:00Z'),
      })
      .execute()

    const subId1 = generateId()
    const subId2 = generateId()
    await db
      .insertInto('submissions')
      .values([
        { id: subId1, user_id: TEST_UID, milestone_id: milestoneId, code: 'func main() {}', status: 'completed' },
        { id: subId2, user_id: TEST_UID, milestone_id: milestoneId, code: 'func main() { fmt.Println() }', status: 'failed' },
      ])
      .execute()

    const result = await sql<MilestoneDropoutAnalysisRow>`
      SELECT * FROM milestone_dropout_analysis
      WHERE milestone_id = ${milestoneId} AND user_id = ${TEST_UID}
    `.execute(db)

    expect(result.rows).toHaveLength(1)
    const row = result.rows[0]
    expect(row).toBeDefined()
    expect(Number(row!.session_count)).toBe(2)
    expect(Number(row!.submission_count)).toBe(2)
  })
})

describe('user_retention_daily view', () => {
  it('should group user activity by day', async () => {
    const session2Id = generateId()
    await db
      .insertInto('sessions')
      .values({
        id: session2Id,
        user_id: TEST_UID,
        milestone_id: milestoneId,
        is_active: false,
        started_at: new Date('2026-03-02T14:00:00Z'),
      })
      .execute()

    const result = await sql<UserRetentionDailyRow>`
      SELECT * FROM user_retention_daily
      WHERE user_id = ${TEST_UID}
      ORDER BY activity_date
    `.execute(db)

    expect(result.rows).toHaveLength(2)
    // Two different days
    const dates = result.rows.map((r) => new Date(r.activity_date).toISOString().slice(0, 10))
    expect(dates).toContain('2026-03-01')
    expect(dates).toContain('2026-03-02')
  })

  it('should count distinct milestones touched per day', async () => {
    const session2Id = generateId()
    await db
      .insertInto('sessions')
      .values({
        id: session2Id,
        user_id: TEST_UID,
        milestone_id: milestone2Id,
        is_active: false,
        started_at: new Date('2026-03-01T14:00:00Z'),
      })
      .execute()

    const result = await sql<UserRetentionDailyRow>`
      SELECT * FROM user_retention_daily
      WHERE user_id = ${TEST_UID}
        AND activity_date = DATE_TRUNC('day', '2026-03-01'::timestamptz)
    `.execute(db)

    expect(result.rows).toHaveLength(1)
    const row = result.rows[0]
    expect(row).toBeDefined()
    expect(Number(row!.milestones_touched)).toBe(2)
  })

  it('should include signup_date for cohort analysis', async () => {
    const result = await sql<UserRetentionDailyRow>`
      SELECT * FROM user_retention_daily
      WHERE user_id = ${TEST_UID}
    `.execute(db)

    expect(result.rows).toHaveLength(1)
    const row = result.rows[0]
    expect(row).toBeDefined()
    // signup_date should be truncated to day of user created_at (2026-03-01)
    expect(new Date(row!.signup_date).toISOString().slice(0, 10)).toBe('2026-03-01')
  })
})

describe('milestone_time_to_completion view', () => {
  it('should calculate time from first session to completion', async () => {
    const umId = generateId()
    await db
      .insertInto('user_milestones')
      .values({
        id: umId,
        user_id: TEST_UID,
        milestone_id: milestoneId,
        completed_at: new Date('2026-03-01T12:00:00Z'), // 3 hours after session started at 09:00
      })
      .execute()

    const result = await sql<MilestoneTimeToCompletionRow>`
      SELECT * FROM milestone_time_to_completion
      WHERE user_id = ${TEST_UID} AND milestone_id = ${milestoneId}
    `.execute(db)

    expect(result.rows).toHaveLength(1)
    const row = result.rows[0]
    expect(row).toBeDefined()
    // 3 hours = 10800 seconds
    expect(Number(row!.time_to_completion_seconds)).toBe(10800)
    expect(row!.milestone_title).toBe('KV Store')
    expect(row!.milestone_slug).toBe('kv-store')
  })

  it('should count total sessions and submissions', async () => {
    const session2Id = generateId()
    await db
      .insertInto('sessions')
      .values({
        id: session2Id,
        user_id: TEST_UID,
        milestone_id: milestoneId,
        is_active: false,
        started_at: new Date('2026-03-01T10:00:00Z'),
      })
      .execute()

    const subId1 = generateId()
    const subId2 = generateId()
    const subId3 = generateId()
    await db
      .insertInto('submissions')
      .values([
        { id: subId1, user_id: TEST_UID, milestone_id: milestoneId, code: 'v1', status: 'failed' },
        { id: subId2, user_id: TEST_UID, milestone_id: milestoneId, code: 'v2', status: 'failed' },
        { id: subId3, user_id: TEST_UID, milestone_id: milestoneId, code: 'v3', status: 'completed' },
      ])
      .execute()

    const umId = generateId()
    await db
      .insertInto('user_milestones')
      .values({
        id: umId,
        user_id: TEST_UID,
        milestone_id: milestoneId,
        completed_at: new Date('2026-03-01T12:00:00Z'),
      })
      .execute()

    const result = await sql<MilestoneTimeToCompletionRow>`
      SELECT * FROM milestone_time_to_completion
      WHERE user_id = ${TEST_UID} AND milestone_id = ${milestoneId}
    `.execute(db)

    expect(result.rows).toHaveLength(1)
    const row = result.rows[0]
    expect(row).toBeDefined()
    expect(Number(row!.total_sessions)).toBe(2)
    expect(Number(row!.total_submissions)).toBe(3)
  })
})

describe('user_resource_consumption view', () => {
  it('should aggregate all user resource usage', async () => {
    const subId = generateId()
    await db
      .insertInto('submissions')
      .values({ id: subId, user_id: TEST_UID, milestone_id: milestoneId, code: 'func main() {}', status: 'completed' })
      .execute()

    const msgId = generateId()
    await db
      .insertInto('tutor_messages')
      .values({ id: msgId, session_id: sessionId, user_id: TEST_UID, role: 'assistant', content: 'Hello', model: 'claude-haiku-4-5-20251001' })
      .execute()

    const brId = generateId()
    await db
      .insertInto('benchmark_results')
      .values({
        id: brId,
        submission_id: subId,
        user_id: TEST_UID,
        milestone_id: milestoneId,
        benchmark_name: 'throughput',
        raw_metrics: JSON.stringify({ ops: 1000 }),
        normalized_ratio: 1.5,
        reference_version: 'v1',
      })
      .execute()

    const csId = generateId()
    await db
      .insertInto('code_snapshots')
      .values({ id: csId, user_id: TEST_UID, milestone_id: milestoneId, session_id: sessionId, code: 'snapshot' })
      .execute()

    const umId = generateId()
    await db
      .insertInto('user_milestones')
      .values({ id: umId, user_id: TEST_UID, milestone_id: milestoneId, completed_at: new Date('2026-03-02T10:00:00Z') })
      .execute()

    const result = await sql<UserResourceConsumptionRow>`
      SELECT * FROM user_resource_consumption WHERE user_id = ${TEST_UID}
    `.execute(db)

    expect(result.rows).toHaveLength(1)
    const row = result.rows[0]
    expect(row).toBeDefined()
    expect(Number(row!.total_sessions)).toBe(1)
    expect(Number(row!.total_submissions)).toBe(1)
    expect(Number(row!.successful_submissions)).toBe(1)
    expect(Number(row!.failed_submissions)).toBe(0)
    expect(Number(row!.total_tutor_messages)).toBe(1)
    expect(Number(row!.total_benchmark_runs)).toBe(1)
    expect(Number(row!.total_code_snapshots)).toBe(1)
    expect(Number(row!.milestones_completed)).toBe(1)
  })

  it('should count model-specific tutor messages', async () => {
    await db
      .insertInto('tutor_messages')
      .values([
        { id: generateId(), session_id: sessionId, user_id: TEST_UID, role: 'assistant', content: 'Haiku 1', model: 'claude-haiku-4-5-20251001' },
        { id: generateId(), session_id: sessionId, user_id: TEST_UID, role: 'assistant', content: 'Haiku 2', model: 'claude-haiku-4-5-20251001' },
        { id: generateId(), session_id: sessionId, user_id: TEST_UID, role: 'assistant', content: 'Sonnet 1', model: 'claude-sonnet-4-6-20250514' },
        { id: generateId(), session_id: sessionId, user_id: TEST_UID, role: 'user', content: 'User msg', model: null },
      ])
      .execute()

    const result = await sql<UserResourceConsumptionRow>`
      SELECT * FROM user_resource_consumption WHERE user_id = ${TEST_UID}
    `.execute(db)

    expect(result.rows).toHaveLength(1)
    const row = result.rows[0]
    expect(row).toBeDefined()
    expect(Number(row!.haiku_messages)).toBe(2)
    expect(Number(row!.sonnet_messages)).toBe(1)
    expect(Number(row!.total_tutor_messages)).toBe(4)
  })

  it('should return zero counts for inactive users', async () => {
    const result = await sql<UserResourceConsumptionRow>`
      SELECT * FROM user_resource_consumption WHERE user_id = ${TEST_UID_2}
    `.execute(db)

    expect(result.rows).toHaveLength(1)
    const row = result.rows[0]
    expect(row).toBeDefined()
    expect(Number(row!.total_sessions)).toBe(0)
    expect(Number(row!.total_submissions)).toBe(0)
    expect(Number(row!.total_tutor_messages)).toBe(0)
    expect(Number(row!.total_benchmark_runs)).toBe(0)
    expect(Number(row!.total_code_snapshots)).toBe(0)
    expect(Number(row!.milestones_completed)).toBe(0)
  })
})

describe('migration up/down', () => {
  it('should create all 6 views on migration up', async () => {
    const result = await sql<{ viewname: string }>`
      SELECT viewname FROM pg_views
      WHERE schemaname = 'public'
        AND viewname IN (
          'platform_signup_metrics',
          'milestone_completion_metrics',
          'milestone_dropout_analysis',
          'user_retention_daily',
          'milestone_time_to_completion',
          'user_resource_consumption'
        )
      ORDER BY viewname
    `.execute(db)

    expect(result.rows).toHaveLength(6)
    expect(result.rows.map((r) => r.viewname)).toEqual([
      'milestone_completion_metrics',
      'milestone_dropout_analysis',
      'milestone_time_to_completion',
      'platform_signup_metrics',
      'user_resource_consumption',
      'user_retention_daily',
    ])
  })

  it('should drop all 6 views on migration down and recreate on up', async () => {
    await down(db)

    const afterDown = await sql<{ viewname: string }>`
      SELECT viewname FROM pg_views
      WHERE schemaname = 'public'
        AND viewname IN (
          'platform_signup_metrics',
          'milestone_completion_metrics',
          'milestone_dropout_analysis',
          'user_retention_daily',
          'milestone_time_to_completion',
          'user_resource_consumption'
        )
    `.execute(db)
    expect(afterDown.rows).toHaveLength(0)

    await up(db)

    const afterUp = await sql<{ viewname: string }>`
      SELECT viewname FROM pg_views
      WHERE schemaname = 'public'
        AND viewname IN (
          'platform_signup_metrics',
          'milestone_completion_metrics',
          'milestone_dropout_analysis',
          'user_retention_daily',
          'milestone_time_to_completion',
          'user_resource_consumption'
        )
      ORDER BY viewname
    `.execute(db)
    expect(afterUp.rows).toHaveLength(6)
  })
})
