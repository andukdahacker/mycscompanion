import { describe, it, expect, afterEach, vi } from 'vitest'
import type { Job } from 'bullmq'
import { db } from '../../shared/db.js'
import { generateId } from '../../shared/id.js'
import { createExportProcessor } from './export-processor.js'
import type { ExportJobData } from '../../shared/queue.js'
import pino from 'pino'

const logger = pino({ level: 'silent' })
const processor = createExportProcessor({ db, logger })

const TEST_USER_ID = 'test-export-user-1'
const OTHER_USER_ID = 'test-export-user-2'

let trackId: string
let milestoneId: string

async function seedTestData() {
  trackId = generateId()
  milestoneId = generateId()

  await db
    .insertInto('users')
    .values([
      { id: TEST_USER_ID, email: 'export-test@example.com', display_name: 'Test User' },
      { id: OTHER_USER_ID, email: 'other@example.com', display_name: 'Other User' },
    ])
    .execute()

  await db
    .insertInto('tracks')
    .values({ id: trackId, name: 'Test Track', slug: 'test-track' })
    .execute()

  await db
    .insertInto('milestones')
    .values({ id: milestoneId, track_id: trackId, title: 'Test Milestone', slug: 'test-milestone', position: 1 })
    .execute()

  const sessionId1 = generateId()
  const sessionId2 = generateId()

  await db
    .insertInto('sessions')
    .values([
      { id: sessionId1, user_id: TEST_USER_ID, milestone_id: milestoneId },
      { id: sessionId2, user_id: OTHER_USER_ID, milestone_id: milestoneId },
    ])
    .execute()

  await db
    .insertInto('code_snapshots')
    .values([
      { id: generateId(), user_id: TEST_USER_ID, session_id: sessionId1, milestone_id: milestoneId, code: 'package main' },
      { id: generateId(), user_id: OTHER_USER_ID, session_id: sessionId2, milestone_id: milestoneId, code: 'package other' },
    ])
    .execute()

  const submissionId1 = generateId()
  const submissionId2 = generateId()

  await db
    .insertInto('submissions')
    .values([
      { id: submissionId1, user_id: TEST_USER_ID, milestone_id: milestoneId, code: 'package main', status: 'completed' },
      { id: submissionId2, user_id: OTHER_USER_ID, milestone_id: milestoneId, code: 'package other', status: 'completed' },
    ])
    .execute()

  await db
    .insertInto('benchmark_results')
    .values([
      { id: generateId(), submission_id: submissionId1, user_id: TEST_USER_ID, milestone_id: milestoneId, benchmark_name: 'throughput', raw_metrics: JSON.stringify({ ops: 1000 }), normalized_ratio: 0.85, reference_version: 'v1' },
      { id: generateId(), submission_id: submissionId2, user_id: OTHER_USER_ID, milestone_id: milestoneId, benchmark_name: 'throughput', raw_metrics: JSON.stringify({ ops: 500 }), normalized_ratio: 0.5, reference_version: 'v1' },
    ])
    .execute()

  await db
    .insertInto('tutor_messages')
    .values([
      { id: generateId(), user_id: TEST_USER_ID, session_id: sessionId1, role: 'user', content: 'Help me' },
      { id: generateId(), user_id: OTHER_USER_ID, session_id: sessionId2, role: 'user', content: 'Other help' },
    ])
    .execute()

  await db
    .insertInto('session_summaries')
    .values([
      { id: generateId(), user_id: TEST_USER_ID, session_id: sessionId1, milestone_id: milestoneId, summary_text: 'Good session' },
      { id: generateId(), user_id: OTHER_USER_ID, session_id: sessionId2, milestone_id: milestoneId, summary_text: 'Other session' },
    ])
    .execute()

  await db
    .insertInto('user_milestones')
    .values([
      { id: generateId(), user_id: TEST_USER_ID, milestone_id: milestoneId, completing_submission_id: submissionId1 },
      { id: generateId(), user_id: OTHER_USER_ID, milestone_id: milestoneId, completing_submission_id: submissionId2 },
    ])
    .execute()
}

function createMockJob(data: ExportJobData): Job<ExportJobData> {
  return { data } as Job<ExportJobData>
}

afterEach(async () => {
  vi.restoreAllMocks()
  await db.deleteFrom('data_exports').where('user_id', 'like', 'test-export-%').execute()
  await db.deleteFrom('benchmark_results').where('user_id', 'like', 'test-export-%').execute()
  await db.deleteFrom('tutor_messages').where('user_id', 'like', 'test-export-%').execute()
  await db.deleteFrom('session_summaries').where('user_id', 'like', 'test-export-%').execute()
  await db.deleteFrom('code_snapshots').where('user_id', 'like', 'test-export-%').execute()
  await db.deleteFrom('user_milestones').where('user_id', 'like', 'test-export-%').execute()
  await db.deleteFrom('submissions').where('user_id', 'like', 'test-export-%').execute()
  await db.deleteFrom('sessions').where('user_id', 'like', 'test-export-%').execute()
  await db.deleteFrom('milestones').where('slug', '=', 'test-milestone').execute()
  await db.deleteFrom('tracks').where('slug', '=', 'test-track').execute()
  await db.deleteFrom('users').where('id', 'like', 'test-export-%').execute()
})

describe('ExportProcessor', () => {
  it('should gather all user data categories and store in data_exports table', async () => {
    await seedTestData()

    const exportId = generateId()
    await db
      .insertInto('data_exports')
      .values({ id: exportId, user_id: TEST_USER_ID, status: 'processing' })
      .execute()

    await processor(createMockJob({ exportId, userId: TEST_USER_ID }))

    const exportRow = await db
      .selectFrom('data_exports')
      .selectAll()
      .where('id', '=', exportId)
      .executeTakeFirstOrThrow()

    expect(exportRow.status).toBe('completed')
    expect(exportRow.completed_at).not.toBeNull()
    expect(exportRow.export_data).not.toBeNull()

    const payload = exportRow.export_data as Record<string, unknown>
    const data = payload.data as Record<string, unknown>

    expect(data.profile).toBeDefined()
    expect(data.sessions).toBeDefined()
    expect(data.codeSnapshots).toBeDefined()
    expect(data.submissions).toBeDefined()
    expect(data.benchmarkResults).toBeDefined()
    expect(data.tutorMessages).toBeDefined()
    expect(data.sessionSummaries).toBeDefined()
    expect(data.milestoneProgress).toBeDefined()
  })

  it('should only include data for the specified userId', async () => {
    await seedTestData()

    const exportId = generateId()
    await db
      .insertInto('data_exports')
      .values({ id: exportId, user_id: TEST_USER_ID, status: 'processing' })
      .execute()

    await processor(createMockJob({ exportId, userId: TEST_USER_ID }))

    const exportRow = await db
      .selectFrom('data_exports')
      .selectAll()
      .where('id', '=', exportId)
      .executeTakeFirstOrThrow()

    const payload = exportRow.export_data as Record<string, unknown>
    const data = payload.data as Record<string, unknown>

    const sessions = data.sessions as Array<Record<string, unknown>>
    expect(sessions).toHaveLength(1)
    expect(sessions[0]!.userId).toBe(TEST_USER_ID)

    const codeSnapshots = data.codeSnapshots as Array<Record<string, unknown>>
    expect(codeSnapshots).toHaveLength(1)
    expect(codeSnapshots[0]!.userId).toBe(TEST_USER_ID)

    const submissions = data.submissions as Array<Record<string, unknown>>
    expect(submissions).toHaveLength(1)
    expect(submissions[0]!.userId).toBe(TEST_USER_ID)

    const benchmarkResults = data.benchmarkResults as Array<Record<string, unknown>>
    expect(benchmarkResults).toHaveLength(1)
    expect(benchmarkResults[0]!.userId).toBe(TEST_USER_ID)

    const tutorMessages = data.tutorMessages as Array<Record<string, unknown>>
    expect(tutorMessages).toHaveLength(1)
    expect(tutorMessages[0]!.userId).toBe(TEST_USER_ID)

    const sessionSummaries = data.sessionSummaries as Array<Record<string, unknown>>
    expect(sessionSummaries).toHaveLength(1)
    expect(sessionSummaries[0]!.userId).toBe(TEST_USER_ID)

    const milestoneProgress = data.milestoneProgress as Array<Record<string, unknown>>
    expect(milestoneProgress).toHaveLength(1)
    expect(milestoneProgress[0]!.userId).toBe(TEST_USER_ID)

    const profile = data.profile as Record<string, unknown>
    expect(profile.id).toBe(TEST_USER_ID)
  })

  it('should include metadata with export date and categories', async () => {
    await seedTestData()

    const exportId = generateId()
    await db
      .insertInto('data_exports')
      .values({ id: exportId, user_id: TEST_USER_ID, status: 'processing' })
      .execute()

    await processor(createMockJob({ exportId, userId: TEST_USER_ID }))

    const exportRow = await db
      .selectFrom('data_exports')
      .selectAll()
      .where('id', '=', exportId)
      .executeTakeFirstOrThrow()

    const payload = exportRow.export_data as Record<string, unknown>
    const metadata = payload.metadata as Record<string, unknown>

    expect(metadata.exportDate).toBeDefined()
    expect(metadata.userId).toBe(TEST_USER_ID)
    expect(metadata.categoriesIncluded).toEqual([
      'profile', 'sessions', 'codeSnapshots', 'submissions',
      'benchmarkResults', 'tutorMessages', 'sessionSummaries', 'milestoneProgress',
    ])
  })

  it('should update status to failed with error message on processor error', async () => {
    // Create user and export row, but pass a nonexistent userId to the job.
    // The processor queries users WHERE id = job.userId, which won't match,
    // so executeTakeFirstOrThrow() throws. The catch block updates the export row.
    await db
      .insertInto('users')
      .values({ id: TEST_USER_ID, email: 'test@example.com' })
      .execute()

    const exportId = generateId()
    await db
      .insertInto('data_exports')
      .values({ id: exportId, user_id: TEST_USER_ID, status: 'processing' })
      .execute()

    await expect(
      processor(createMockJob({ exportId, userId: 'nonexistent-user-id' }))
    ).rejects.toThrow()

    const exportRow = await db
      .selectFrom('data_exports')
      .selectAll()
      .where('id', '=', exportId)
      .executeTakeFirstOrThrow()

    expect(exportRow.status).toBe('failed')
    expect(exportRow.error_message).not.toBeNull()
  })

  it('should use toCamelCase on all DB results', async () => {
    await seedTestData()

    const exportId = generateId()
    await db
      .insertInto('data_exports')
      .values({ id: exportId, user_id: TEST_USER_ID, status: 'processing' })
      .execute()

    await processor(createMockJob({ exportId, userId: TEST_USER_ID }))

    const exportRow = await db
      .selectFrom('data_exports')
      .selectAll()
      .where('id', '=', exportId)
      .executeTakeFirstOrThrow()

    const payload = exportRow.export_data as Record<string, unknown>
    const data = payload.data as Record<string, unknown>

    // Profile should have camelCase keys
    const profile = data.profile as Record<string, unknown>
    expect('displayName' in profile).toBe(true)
    expect('display_name' in profile).toBe(false)
    expect('createdAt' in profile).toBe(true)
    expect('created_at' in profile).toBe(false)

    // Sessions should have camelCase keys
    const sessions = data.sessions as Array<Record<string, unknown>>
    expect(sessions.length).toBeGreaterThan(0)
    expect('userId' in sessions[0]!).toBe(true)
    expect('user_id' in sessions[0]!).toBe(false)
    expect('milestoneId' in sessions[0]!).toBe(true)
    expect('milestone_id' in sessions[0]!).toBe(false)
  })
})
