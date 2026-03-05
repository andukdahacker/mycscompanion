import { describe, it, expect, afterEach, afterAll, beforeEach, vi } from 'vitest'
import Fastify from 'fastify'
import { authPlugin } from '../auth/index.js'
import { completionPlugin } from './index.js'
import { createMockFirebaseAuth } from '@mycscompanion/config/test-utils'
import { db } from '../../shared/db.js'
import { generateId } from '../../shared/id.js'
import type { BriefLoader } from './routes/completion.js'

const TEST_UID = 'test-completion-uid'
const mockAuth = createMockFirebaseAuth(TEST_UID)

const NEXT_BRIEF = '# Milestone 2: Storage Engine\n\nBuild a storage engine that persists data to disk using a log-structured approach.'

const mockContentLoader: BriefLoader = {
  loadMilestoneBrief: vi.fn(async () => NEXT_BRIEF),
}

async function buildApp() {
  const app = Fastify({ logger: false })
  await app.register(authPlugin, { firebaseAuth: mockAuth })
  await app.register(completionPlugin, {
    prefix: '/api/completion',
    contentLoader: mockContentLoader,
  })
  await app.ready()
  return app
}

const app = await buildApp()

let trackId: string
let milestoneId: string
let nextMilestoneId: string
let userId: string
let submissionId: string

beforeEach(async () => {
  trackId = generateId()
  milestoneId = generateId()
  nextMilestoneId = generateId()
  userId = TEST_UID
  submissionId = generateId()

  await db
    .insertInto('users')
    .values({ id: userId, email: 'test@example.com' })
    .execute()

  await db
    .insertInto('tracks')
    .values({ id: trackId, name: 'Build Your Own Database', slug: 'build-your-own-database' })
    .execute()

  await db
    .insertInto('milestones')
    .values([
      { id: milestoneId, track_id: trackId, title: 'Simple Key-Value Store', slug: 'kv-store', position: 1 },
      { id: nextMilestoneId, track_id: trackId, title: 'Storage Engine', slug: 'storage-engine', position: 2 },
    ])
    .execute()

  await db
    .insertInto('submissions')
    .values({
      id: submissionId,
      user_id: userId,
      milestone_id: milestoneId,
      code: 'package main',
      status: 'completed',
      criteria_results: JSON.stringify([
        { name: 'put-and-get', order: 1, status: 'met', expected: 'PASS', actual: 'PASS' },
        { name: 'delete-key', order: 2, status: 'met', expected: 'PASS', actual: 'PASS' },
      ]),
    })
    .execute()
})

afterEach(async () => {
  vi.restoreAllMocks()
  await db.deleteFrom('user_milestones').execute()
  await db.deleteFrom('submissions').execute()
  await db.deleteFrom('milestones').execute()
  await db.deleteFrom('tracks').execute()
  await db.deleteFrom('users').execute()
})

afterAll(async () => {
  await app.close()
})

describe('POST /api/completion/:milestoneId/complete', () => {
  it('should complete milestone and return next milestone ID', async () => {
    const response = await app.inject({
      method: 'POST',
      url: `/api/completion/${milestoneId}/complete`,
      headers: { authorization: 'Bearer valid-token' },
      payload: { submissionId },
    })

    expect(response.statusCode).toBe(200)
    const body = response.json()
    expect(body.nextMilestoneId).toBe(nextMilestoneId)

    // Verify DB record was created
    const record = await db
      .selectFrom('user_milestones')
      .select(['user_id', 'milestone_id', 'completing_submission_id'])
      .where('user_id', '=', userId)
      .where('milestone_id', '=', milestoneId)
      .executeTakeFirst()

    expect(record).toBeDefined()
    expect(record?.completing_submission_id).toBe(submissionId)
  })

  it('should return 409 when criteria not all met', async () => {
    const failedSubmissionId = generateId()
    await db
      .insertInto('submissions')
      .values({
        id: failedSubmissionId,
        user_id: userId,
        milestone_id: milestoneId,
        code: 'package main',
        status: 'completed',
        criteria_results: JSON.stringify([
          { name: 'put-and-get', order: 1, status: 'met', expected: 'PASS', actual: 'PASS' },
          { name: 'delete-key', order: 2, status: 'not-met', expected: 'PASS', actual: 'FAIL' },
        ]),
      })
      .execute()

    const response = await app.inject({
      method: 'POST',
      url: `/api/completion/${milestoneId}/complete`,
      headers: { authorization: 'Bearer valid-token' },
      payload: { submissionId: failedSubmissionId },
    })

    expect(response.statusCode).toBe(409)
    expect(response.json().error.code).toBe('CRITERIA_NOT_MET')
  })

  it('should be idempotent — second call returns success', async () => {
    // First call
    await app.inject({
      method: 'POST',
      url: `/api/completion/${milestoneId}/complete`,
      headers: { authorization: 'Bearer valid-token' },
      payload: { submissionId },
    })

    // Second call — should not fail
    const response = await app.inject({
      method: 'POST',
      url: `/api/completion/${milestoneId}/complete`,
      headers: { authorization: 'Bearer valid-token' },
      payload: { submissionId },
    })

    expect(response.statusCode).toBe(200)
    expect(response.json().nextMilestoneId).toBe(nextMilestoneId)

    // Only one DB record
    const records = await db
      .selectFrom('user_milestones')
      .select(['id'])
      .where('user_id', '=', userId)
      .where('milestone_id', '=', milestoneId)
      .execute()

    expect(records).toHaveLength(1)
  })

  it('should return nextMilestoneId null for last milestone in track', async () => {
    const response = await app.inject({
      method: 'POST',
      url: `/api/completion/${nextMilestoneId}/complete`,
      headers: { authorization: 'Bearer valid-token' },
      payload: { submissionId },
    })

    expect(response.statusCode).toBe(200)
    expect(response.json().nextMilestoneId).toBeNull()
  })

  it('should return 404 for nonexistent submission', async () => {
    const response = await app.inject({
      method: 'POST',
      url: `/api/completion/${milestoneId}/complete`,
      headers: { authorization: 'Bearer valid-token' },
      payload: { submissionId: 'nonexistent' },
    })

    expect(response.statusCode).toBe(404)
    expect(response.json().error.code).toBe('NOT_FOUND')
  })

  it('should return 403 when submission belongs to different user', async () => {
    const otherUserId = generateId()
    const otherSubmissionId = generateId()

    await db.insertInto('users').values({ id: otherUserId, email: 'other@example.com' }).execute()
    await db
      .insertInto('submissions')
      .values({
        id: otherSubmissionId,
        user_id: otherUserId,
        milestone_id: milestoneId,
        code: 'package main',
        status: 'completed',
        criteria_results: JSON.stringify([{ name: 'test', order: 1, status: 'met', expected: 'PASS', actual: 'PASS' }]),
      })
      .execute()

    const response = await app.inject({
      method: 'POST',
      url: `/api/completion/${milestoneId}/complete`,
      headers: { authorization: 'Bearer valid-token' },
      payload: { submissionId: otherSubmissionId },
    })

    expect(response.statusCode).toBe(403)
    expect(response.json().error.code).toBe('FORBIDDEN')
  })

  it('should return 401 when no auth token provided', async () => {
    const response = await app.inject({
      method: 'POST',
      url: `/api/completion/${milestoneId}/complete`,
      payload: { submissionId },
    })

    expect(response.statusCode).toBe(401)
  })
})

describe('GET /api/completion/:milestoneId', () => {
  it('should return completion data with criteria summary and next milestone', async () => {
    // First complete the milestone
    await db
      .insertInto('user_milestones')
      .values({
        id: generateId(),
        user_id: userId,
        milestone_id: milestoneId,
        completing_submission_id: submissionId,
      })
      .execute()

    const response = await app.inject({
      method: 'GET',
      url: `/api/completion/${milestoneId}`,
      headers: { authorization: 'Bearer valid-token' },
    })

    expect(response.statusCode).toBe(200)
    const body = response.json()
    expect(body.milestoneId).toBe(milestoneId)
    expect(body.milestoneName).toBe('Simple Key-Value Store')
    expect(body.milestoneNumber).toBe(1)
    expect(body.completedAt).toBeDefined()
    expect(body.criteriaResults).toHaveLength(2)
    expect(body.criteriaResults[0].name).toBe('put-and-get')
    expect(body.criteriaResults[0].status).toBe('met')
    expect(body.nextMilestone).not.toBeNull()
    expect(body.nextMilestone.id).toBe(nextMilestoneId)
    expect(body.nextMilestone.title).toBe('Storage Engine')
    expect(body.nextMilestone.position).toBe(2)
    expect(body.nextMilestone.briefExcerpt).toBeTruthy()
  })

  it('should return 404 when milestone not completed', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/completion/${milestoneId}`,
      headers: { authorization: 'Bearer valid-token' },
    })

    expect(response.statusCode).toBe(404)
    expect(response.json().error.code).toBe('NOT_FOUND')
  })

  it('should return camelCase keys in response', async () => {
    await db
      .insertInto('user_milestones')
      .values({
        id: generateId(),
        user_id: userId,
        milestone_id: milestoneId,
        completing_submission_id: submissionId,
      })
      .execute()

    const response = await app.inject({
      method: 'GET',
      url: `/api/completion/${milestoneId}`,
      headers: { authorization: 'Bearer valid-token' },
    })

    expect(response.statusCode).toBe(200)
    const body = response.json()
    expect('milestoneId' in body).toBe(true)
    expect('milestone_id' in body).toBe(false)
    expect('milestoneName' in body).toBe(true)
    expect('milestoneNumber' in body).toBe(true)
    expect('completedAt' in body).toBe(true)
    expect('criteriaResults' in body).toBe(true)
    expect('nextMilestone' in body).toBe(true)
  })

  it('should return null nextMilestone for last milestone in track', async () => {
    await db
      .insertInto('user_milestones')
      .values({
        id: generateId(),
        user_id: userId,
        milestone_id: nextMilestoneId,
        completing_submission_id: submissionId,
      })
      .execute()

    const response = await app.inject({
      method: 'GET',
      url: `/api/completion/${nextMilestoneId}`,
      headers: { authorization: 'Bearer valid-token' },
    })

    expect(response.statusCode).toBe(200)
    expect(response.json().nextMilestone).toBeNull()
  })
})
