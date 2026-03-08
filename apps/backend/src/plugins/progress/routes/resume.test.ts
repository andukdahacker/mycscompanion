import { describe, it, expect, afterEach, afterAll, beforeEach, vi } from 'vitest'
import Fastify from 'fastify'
import { sql } from 'kysely'
import { authPlugin } from '../../auth/index.js'
import { progressPlugin } from '../index.js'
import { createMockFirebaseAuth } from '@mycscompanion/config/test-utils'
import { db } from '../../../shared/db.js'
import { generateId } from '../../../shared/id.js'
import type { OverviewContentLoader } from './overview.js'

const TEST_UID = 'test-resume-uid'
const OTHER_UID = 'test-resume-other-uid'
const mockAuth = createMockFirebaseAuth(TEST_UID)

const mockContentLoader: OverviewContentLoader = {
  loadMilestoneBrief: vi.fn(async () => null),
  loadMetadata: vi.fn(async () => ({ csConceptLabel: null })),
}

async function buildApp() {
  const app = Fastify({ logger: false })
  await app.register(authPlugin, { firebaseAuth: mockAuth })
  await app.register(progressPlugin, {
    prefix: '/api/progress',
    contentLoader: mockContentLoader,
  })
  await app.ready()
  return app
}

const app = await buildApp()

let trackId: string
let milestoneId: string
let otherMilestoneId: string
let sessionId: string

beforeEach(async () => {
  trackId = generateId()
  milestoneId = generateId()
  otherMilestoneId = generateId()
  sessionId = generateId()

  await db
    .insertInto('users')
    .values([
      { id: TEST_UID, email: 'resume-test@example.com' },
      { id: OTHER_UID, email: 'resume-other@example.com' },
    ])
    .execute()

  await db
    .insertInto('tracks')
    .values({ id: trackId, name: 'Test Track', slug: 'test-track' })
    .execute()

  await db
    .insertInto('milestones')
    .values([
      { id: milestoneId, track_id: trackId, title: 'Test Milestone', slug: 'test-milestone', position: 1 },
      { id: otherMilestoneId, track_id: trackId, title: 'Other Milestone', slug: 'other-milestone', position: 2 },
    ])
    .execute()

  await db
    .insertInto('sessions')
    .values({
      id: sessionId,
      user_id: TEST_UID,
      milestone_id: milestoneId,
      is_active: true,
    })
    .execute()
})

afterEach(async () => {
  vi.restoreAllMocks()
  await db.deleteFrom('code_snapshots').execute()
  await db.deleteFrom('submissions').execute()
  await db.deleteFrom('sessions').execute()
  await db.deleteFrom('user_milestones').execute()
  await db.deleteFrom('milestones').execute()
  await db.deleteFrom('tracks').execute()
  await db.deleteFrom('users').execute()
})

afterAll(async () => {
  await app.close()
})

describe('GET /api/progress/resume/:milestoneId', () => {
  it('should return latest snapshot when snapshots exist', async () => {
    const olderSnapshotId = generateId()
    const newerSnapshotId = generateId()

    await db
      .insertInto('code_snapshots')
      .values({
        id: olderSnapshotId,
        user_id: TEST_UID,
        milestone_id: milestoneId,
        session_id: sessionId,
        code: 'old code',
        created_at: sql`now() - interval '1 hour'`,
      })
      .execute()

    await db
      .insertInto('code_snapshots')
      .values({
        id: newerSnapshotId,
        user_id: TEST_UID,
        milestone_id: milestoneId,
        session_id: sessionId,
        code: 'new code',
        created_at: sql`now()`,
      })
      .execute()

    const response = await app.inject({
      method: 'GET',
      url: `/api/progress/resume/${milestoneId}`,
      headers: { authorization: 'Bearer valid-token' },
    })

    expect(response.statusCode).toBe(200)
    const body = response.json()
    expect(body.latestSnapshot).not.toBeNull()
    expect(body.latestSnapshot.id).toBe(newerSnapshotId)
    expect(body.latestSnapshot.code).toBe('new code')
    expect(body.latestSnapshot.createdAt).toBeDefined()
  })

  it('should return null latestSnapshot when no snapshots exist', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/progress/resume/${milestoneId}`,
      headers: { authorization: 'Bearer valid-token' },
    })

    expect(response.statusCode).toBe(200)
    const body = response.json()
    expect(body.latestSnapshot).toBeNull()
  })

  it('should return latest completed submission criteria_results and submission ID', async () => {
    const submissionId = generateId()
    const criteriaResults = [
      { name: 'Test Criterion', order: 1, status: 'met', expected: 'yes', actual: 'yes' },
      { name: 'Other Criterion', order: 2, status: 'not-met', expected: 'foo', actual: 'bar' },
    ]

    await db
      .insertInto('submissions')
      .values({
        id: submissionId,
        user_id: TEST_UID,
        milestone_id: milestoneId,
        status: 'completed',
        code: 'test code',
        criteria_results: JSON.stringify(criteriaResults),
      })
      .execute()

    const response = await app.inject({
      method: 'GET',
      url: `/api/progress/resume/${milestoneId}`,
      headers: { authorization: 'Bearer valid-token' },
    })

    expect(response.statusCode).toBe(200)
    const body = response.json()
    expect(body.lastSubmissionId).toBe(submissionId)
    expect(body.lastSubmissionCriteria).toEqual(criteriaResults)
  })

  it('should return null lastSubmissionCriteria and null lastSubmissionId when no completed submissions exist', async () => {
    // Insert a non-completed submission
    await db
      .insertInto('submissions')
      .values({
        id: generateId(),
        user_id: TEST_UID,
        milestone_id: milestoneId,
        status: 'queued',
        code: 'test code',
      })
      .execute()

    const response = await app.inject({
      method: 'GET',
      url: `/api/progress/resume/${milestoneId}`,
      headers: { authorization: 'Bearer valid-token' },
    })

    expect(response.statusCode).toBe(200)
    const body = response.json()
    expect(body.lastSubmissionId).toBeNull()
    expect(body.lastSubmissionCriteria).toBeNull()
  })

  it('should return null lastSubmissionCriteria when completed submission has null criteria_results', async () => {
    const submissionId = generateId()

    await db
      .insertInto('submissions')
      .values({
        id: submissionId,
        user_id: TEST_UID,
        milestone_id: milestoneId,
        status: 'completed',
        code: 'test code',
        criteria_results: null,
      })
      .execute()

    const response = await app.inject({
      method: 'GET',
      url: `/api/progress/resume/${milestoneId}`,
      headers: { authorization: 'Bearer valid-token' },
    })

    expect(response.statusCode).toBe(200)
    const body = response.json()
    expect(body.lastSubmissionId).toBe(submissionId)
    expect(body.lastSubmissionCriteria).toBeNull()
  })

  it('should return null for all fields when user has no data for milestone', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/progress/resume/${milestoneId}`,
      headers: { authorization: 'Bearer valid-token' },
    })

    expect(response.statusCode).toBe(200)
    const body = response.json()
    expect(body.latestSnapshot).toBeNull()
    expect(body.lastSubmissionId).toBeNull()
    expect(body.lastSubmissionCriteria).toBeNull()
  })

  it('should return correct data for the specific user only', async () => {
    const otherSessionId = generateId()
    await db
      .insertInto('sessions')
      .values({
        id: otherSessionId,
        user_id: OTHER_UID,
        milestone_id: milestoneId,
        is_active: true,
      })
      .execute()

    await db
      .insertInto('code_snapshots')
      .values({
        id: generateId(),
        user_id: OTHER_UID,
        milestone_id: milestoneId,
        session_id: otherSessionId,
        code: 'other user code',
      })
      .execute()

    await db
      .insertInto('submissions')
      .values({
        id: generateId(),
        user_id: OTHER_UID,
        milestone_id: milestoneId,
        status: 'completed',
        code: 'other user code',
        criteria_results: JSON.stringify([{ name: 'Test', order: 1, status: 'met', expected: 'yes', actual: 'yes' }]),
      })
      .execute()

    const response = await app.inject({
      method: 'GET',
      url: `/api/progress/resume/${milestoneId}`,
      headers: { authorization: 'Bearer valid-token' },
    })

    expect(response.statusCode).toBe(200)
    const body = response.json()
    expect(body.latestSnapshot).toBeNull()
    expect(body.lastSubmissionId).toBeNull()
    expect(body.lastSubmissionCriteria).toBeNull()
  })

  it('should return correct data for the specific milestone only', async () => {
    await db
      .insertInto('code_snapshots')
      .values({
        id: generateId(),
        user_id: TEST_UID,
        milestone_id: milestoneId,
        session_id: sessionId,
        code: 'milestone 1 code',
      })
      .execute()

    await db
      .insertInto('submissions')
      .values({
        id: generateId(),
        user_id: TEST_UID,
        milestone_id: milestoneId,
        status: 'completed',
        code: 'test code',
        criteria_results: JSON.stringify([{ name: 'Test', order: 1, status: 'met', expected: 'yes', actual: 'yes' }]),
      })
      .execute()

    // Query for OTHER milestone — should return null
    const response = await app.inject({
      method: 'GET',
      url: `/api/progress/resume/${otherMilestoneId}`,
      headers: { authorization: 'Bearer valid-token' },
    })

    expect(response.statusCode).toBe(200)
    const body = response.json()
    expect(body.latestSnapshot).toBeNull()
    expect(body.lastSubmissionId).toBeNull()
    expect(body.lastSubmissionCriteria).toBeNull()
  })

  it('should return 401 without auth', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/progress/resume/${milestoneId}`,
    })

    expect(response.statusCode).toBe(401)
  })
})
