import { describe, it, expect, afterEach, afterAll, beforeEach, vi } from 'vitest'
import Fastify from 'fastify'
import { authPlugin } from '../../auth/index.js'
import { progressPlugin } from '../index.js'
import { createMockFirebaseAuth } from '@mycscompanion/config/test-utils'
import { db } from '../../../shared/db.js'
import { generateId } from '../../../shared/id.js'
import type { OverviewContentLoader } from './overview.js'

const TEST_UID = 'test-overview-uid'
const mockAuth = createMockFirebaseAuth(TEST_UID)

const BRIEF_CONTENT = '# Milestone 1: Simple Key-Value Store\n\nBuild a simple key-value store from scratch.'

const mockContentLoader: OverviewContentLoader = {
  loadMilestoneBrief: vi.fn(async () => BRIEF_CONTENT),
  loadMetadata: vi.fn(async () => ({ csConceptLabel: 'Systems Programming & I/O' })),
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
let nextMilestoneId: string
let userId: string

beforeEach(async () => {
  trackId = generateId()
  milestoneId = generateId()
  nextMilestoneId = generateId()
  userId = TEST_UID

  await db
    .insertInto('users')
    .values({ id: userId, email: 'overview-test@example.com' })
    .execute()

  await db
    .insertInto('tracks')
    .values({ id: trackId, name: 'Build Your Own Database', slug: 'build-your-own-database' })
    .execute()

  await db
    .insertInto('milestones')
    .values([
      { id: milestoneId, track_id: trackId, title: 'Simple Key-Value Store', slug: '01-kv-store', position: 1 },
      { id: nextMilestoneId, track_id: trackId, title: 'Storage Engine', slug: '02-storage-engine', position: 2 },
    ])
    .execute()
})

afterEach(async () => {
  vi.restoreAllMocks()
  await db.deleteFrom('benchmark_results').execute()
  await db.deleteFrom('session_summaries').execute()
  await db.deleteFrom('code_snapshots').execute()
  await db.deleteFrom('user_milestones').execute()
  await db.deleteFrom('submissions').execute()
  await db.deleteFrom('sessions').execute()
  await db.deleteFrom('milestones').execute()
  await db.deleteFrom('tracks').execute()
  await db.deleteFrom('users').execute()
})

afterAll(async () => {
  await app.close()
})

describe('GET /api/progress/overview', () => {
  it('should return first-time variant when user has no completions and no submissions', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/progress/overview',
      headers: { authorization: 'Bearer valid-token' },
    })

    expect(response.statusCode).toBe(200)
    const body = response.json()
    expect(body.variant).toBe('first-time')
    expect(body.milestone.id).toBe(milestoneId)
    expect(body.milestone.slug).toBe('01-kv-store')
    expect(body.milestone.title).toBe('Simple Key-Value Store')
    expect(body.milestone.position).toBe(1)
    expect(body.milestone.briefExcerpt).toBeTruthy()
    expect(body.milestone.csConceptLabel).toBe('Systems Programming & I/O')
    expect(body.criteriaProgress).toBeNull()
    expect(body.sessionSummary).toBeNull()
    expect(body.lastBenchmark).toBeNull()
  })

  it('should return milestone-start variant when user has submissions', async () => {
    const submissionId = generateId()
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
          { name: 'delete-key', order: 2, status: 'not-met', expected: 'PASS', actual: 'FAIL' },
        ]),
      })
      .execute()

    const response = await app.inject({
      method: 'GET',
      url: '/api/progress/overview',
      headers: { authorization: 'Bearer valid-token' },
    })

    expect(response.statusCode).toBe(200)
    const body = response.json()
    expect(body.variant).toBe('milestone-start')
    expect(body.milestone.id).toBe(milestoneId)
    expect(body.criteriaProgress).not.toBeNull()
    expect(body.criteriaProgress.met).toBe(1)
    expect(body.criteriaProgress.total).toBe(2)
    expect(body.criteriaProgress.nextCriterionName).toBe('delete-key')
  })

  it('should return next incomplete milestone when user has completions', async () => {
    // Complete milestone 1
    await db
      .insertInto('user_milestones')
      .values({
        id: generateId(),
        user_id: userId,
        milestone_id: milestoneId,
        completing_submission_id: null,
      })
      .execute()

    const response = await app.inject({
      method: 'GET',
      url: '/api/progress/overview',
      headers: { authorization: 'Bearer valid-token' },
    })

    expect(response.statusCode).toBe(200)
    const body = response.json()
    expect(body.variant).toBe('milestone-start')
    expect(body.milestone.id).toBe(nextMilestoneId)
    expect(body.milestone.title).toBe('Storage Engine')
    expect(body.milestone.position).toBe(2)
  })

  it('should return last milestone when all milestones are complete', async () => {
    // Complete both milestones
    await db
      .insertInto('user_milestones')
      .values([
        { id: generateId(), user_id: userId, milestone_id: milestoneId, completing_submission_id: null },
        { id: generateId(), user_id: userId, milestone_id: nextMilestoneId, completing_submission_id: null },
      ])
      .execute()

    const response = await app.inject({
      method: 'GET',
      url: '/api/progress/overview',
      headers: { authorization: 'Bearer valid-token' },
    })

    expect(response.statusCode).toBe(200)
    const body = response.json()
    expect(body.variant).toBe('milestone-start')
    expect(body.milestone.id).toBe(nextMilestoneId)
    expect(body.milestone.position).toBe(2)
  })

  it('should return criteria progress with next criterion name from latest submission', async () => {
    const submissionId = generateId()
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
          { name: 'range-scan', order: 3, status: 'not-met', expected: 'PASS', actual: 'FAIL' },
        ]),
      })
      .execute()

    const response = await app.inject({
      method: 'GET',
      url: '/api/progress/overview',
      headers: { authorization: 'Bearer valid-token' },
    })

    expect(response.statusCode).toBe(200)
    const body = response.json()
    expect(body.criteriaProgress.met).toBe(2)
    expect(body.criteriaProgress.total).toBe(3)
    expect(body.criteriaProgress.nextCriterionName).toBe('range-scan')
  })

  it('should return null nextCriterionName when all criteria are met', async () => {
    const submissionId = generateId()
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
        ]),
      })
      .execute()

    const response = await app.inject({
      method: 'GET',
      url: '/api/progress/overview',
      headers: { authorization: 'Bearer valid-token' },
    })

    expect(response.statusCode).toBe(200)
    const body = response.json()
    expect(body.criteriaProgress.nextCriterionName).toBeNull()
  })

  it('should return null for lastBenchmark when no benchmark results exist', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/progress/overview',
      headers: { authorization: 'Bearer valid-token' },
    })

    expect(response.statusCode).toBe(200)
    const body = response.json()
    expect(body.lastBenchmark).toBeNull()
  })

  it('should return sessionSummary when summary exists for active milestone', async () => {
    // Create an ended session with a summary
    const sessId = generateId()
    await db
      .insertInto('sessions')
      .values({
        id: sessId,
        user_id: userId,
        milestone_id: milestoneId,
        is_active: false,
        started_at: new Date('2026-03-01T10:00:00Z'),
        ended_at: new Date('2026-03-01T11:00:00Z'),
      })
      .execute()

    await db
      .insertInto('session_summaries')
      .values({
        id: generateId(),
        user_id: userId,
        session_id: sessId,
        milestone_id: milestoneId,
        summary_text: 'Working on Simple Key-Value Store. 2 of 5 criteria met.',
      })
      .execute()

    const response = await app.inject({
      method: 'GET',
      url: '/api/progress/overview',
      headers: { authorization: 'Bearer valid-token' },
    })

    expect(response.statusCode).toBe(200)
    const body = response.json()
    expect(body.sessionSummary).toBe('Working on Simple Key-Value Store. 2 of 5 criteria met.')
  })

  it('should return sessionSummary: null when no summary exists', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/progress/overview',
      headers: { authorization: 'Bearer valid-token' },
    })

    expect(response.statusCode).toBe(200)
    const body = response.json()
    expect(body.sessionSummary).toBeNull()
  })

  it('should return lastBenchmark with ops/sec and trend when benchmark results exist', async () => {
    const subId = generateId()
    await db
      .insertInto('submissions')
      .values({
        id: subId,
        user_id: userId,
        milestone_id: milestoneId,
        code: 'package main',
        status: 'completed',
      })
      .execute()

    await db
      .insertInto('benchmark_results')
      .values({
        id: generateId(),
        submission_id: subId,
        user_id: userId,
        milestone_id: milestoneId,
        benchmark_name: 'sequential-inserts',
        raw_metrics: JSON.stringify({ opsPerSec: 12400, userMedian: 12400, referenceMedian: 10000, p50LatencyUs: 80, p99LatencyUs: 300 }),
        normalized_ratio: '1.2400',
        reference_version: 'v1',
        created_at: new Date('2026-03-01T10:00:00Z'),
      })
      .execute()

    const response = await app.inject({
      method: 'GET',
      url: '/api/progress/overview',
      headers: { authorization: 'Bearer valid-token' },
    })

    expect(response.statusCode).toBe(200)
    const body = response.json()
    expect(body.lastBenchmark).not.toBeNull()
    expect(body.lastBenchmark.opsPerSec).toBe(12400)
    expect(body.lastBenchmark.normalizedRatio).toBeCloseTo(1.24)
  })

  it('should return trend up when latest ops/sec is greater than previous', async () => {
    const subId1 = generateId()
    const subId2 = generateId()
    await db
      .insertInto('submissions')
      .values([
        { id: subId1, user_id: userId, milestone_id: milestoneId, code: 'package main', status: 'completed' },
        { id: subId2, user_id: userId, milestone_id: milestoneId, code: 'package main', status: 'completed' },
      ])
      .execute()

    await db
      .insertInto('benchmark_results')
      .values([
        {
          id: generateId(),
          submission_id: subId1,
          user_id: userId,
          milestone_id: milestoneId,
          benchmark_name: 'sequential-inserts',
          raw_metrics: JSON.stringify({ opsPerSec: 8000, userMedian: 8000, referenceMedian: 10000, p50LatencyUs: 120, p99LatencyUs: 400 }),
          normalized_ratio: '0.8000',
          reference_version: 'v1',
          created_at: new Date('2026-03-01T10:00:00Z'),
        },
        {
          id: generateId(),
          submission_id: subId2,
          user_id: userId,
          milestone_id: milestoneId,
          benchmark_name: 'sequential-inserts',
          raw_metrics: JSON.stringify({ opsPerSec: 12400, userMedian: 12400, referenceMedian: 10000, p50LatencyUs: 80, p99LatencyUs: 300 }),
          normalized_ratio: '1.2400',
          reference_version: 'v1',
          created_at: new Date('2026-03-02T10:00:00Z'),
        },
      ])
      .execute()

    const response = await app.inject({
      method: 'GET',
      url: '/api/progress/overview',
      headers: { authorization: 'Bearer valid-token' },
    })

    expect(response.statusCode).toBe(200)
    const body = response.json()
    expect(body.lastBenchmark.trend).toBe('up')
  })

  it('should return trend down when latest ops/sec is less than previous', async () => {
    const subId1 = generateId()
    const subId2 = generateId()
    await db
      .insertInto('submissions')
      .values([
        { id: subId1, user_id: userId, milestone_id: milestoneId, code: 'package main', status: 'completed' },
        { id: subId2, user_id: userId, milestone_id: milestoneId, code: 'package main', status: 'completed' },
      ])
      .execute()

    await db
      .insertInto('benchmark_results')
      .values([
        {
          id: generateId(),
          submission_id: subId1,
          user_id: userId,
          milestone_id: milestoneId,
          benchmark_name: 'sequential-inserts',
          raw_metrics: JSON.stringify({ opsPerSec: 12400, userMedian: 12400, referenceMedian: 10000, p50LatencyUs: 80, p99LatencyUs: 300 }),
          normalized_ratio: '1.2400',
          reference_version: 'v1',
          created_at: new Date('2026-03-01T10:00:00Z'),
        },
        {
          id: generateId(),
          submission_id: subId2,
          user_id: userId,
          milestone_id: milestoneId,
          benchmark_name: 'sequential-inserts',
          raw_metrics: JSON.stringify({ opsPerSec: 6000, userMedian: 6000, referenceMedian: 10000, p50LatencyUs: 160, p99LatencyUs: 500 }),
          normalized_ratio: '0.6000',
          reference_version: 'v1',
          created_at: new Date('2026-03-02T10:00:00Z'),
        },
      ])
      .execute()

    const response = await app.inject({
      method: 'GET',
      url: '/api/progress/overview',
      headers: { authorization: 'Bearer valid-token' },
    })

    expect(response.statusCode).toBe(200)
    const body = response.json()
    expect(body.lastBenchmark.trend).toBe('down')
  })

  it('should return trend flat when only one benchmark result exists', async () => {
    const subId = generateId()
    await db
      .insertInto('submissions')
      .values({ id: subId, user_id: userId, milestone_id: milestoneId, code: 'package main', status: 'completed' })
      .execute()

    await db
      .insertInto('benchmark_results')
      .values({
        id: generateId(),
        submission_id: subId,
        user_id: userId,
        milestone_id: milestoneId,
        benchmark_name: 'sequential-inserts',
        raw_metrics: JSON.stringify({ opsPerSec: 9000, userMedian: 9000, referenceMedian: 10000, p50LatencyUs: 110, p99LatencyUs: 350 }),
        normalized_ratio: '0.9000',
        reference_version: 'v1',
        created_at: new Date('2026-03-01T10:00:00Z'),
      })
      .execute()

    const response = await app.inject({
      method: 'GET',
      url: '/api/progress/overview',
      headers: { authorization: 'Bearer valid-token' },
    })

    expect(response.statusCode).toBe(200)
    const body = response.json()
    expect(body.lastBenchmark.trend).toBe('flat')
  })

  it('should return trend flat when latest equals previous ops/sec', async () => {
    const subId1 = generateId()
    const subId2 = generateId()
    await db
      .insertInto('submissions')
      .values([
        { id: subId1, user_id: userId, milestone_id: milestoneId, code: 'package main', status: 'completed' },
        { id: subId2, user_id: userId, milestone_id: milestoneId, code: 'package main', status: 'completed' },
      ])
      .execute()

    await db
      .insertInto('benchmark_results')
      .values([
        {
          id: generateId(),
          submission_id: subId1,
          user_id: userId,
          milestone_id: milestoneId,
          benchmark_name: 'sequential-inserts',
          raw_metrics: JSON.stringify({ opsPerSec: 9000, userMedian: 9000, referenceMedian: 10000, p50LatencyUs: 110, p99LatencyUs: 350 }),
          normalized_ratio: '0.9000',
          reference_version: 'v1',
          created_at: new Date('2026-03-01T10:00:00Z'),
        },
        {
          id: generateId(),
          submission_id: subId2,
          user_id: userId,
          milestone_id: milestoneId,
          benchmark_name: 'sequential-inserts',
          raw_metrics: JSON.stringify({ opsPerSec: 9000, userMedian: 9000, referenceMedian: 10000, p50LatencyUs: 110, p99LatencyUs: 350 }),
          normalized_ratio: '0.9000',
          reference_version: 'v1',
          created_at: new Date('2026-03-02T10:00:00Z'),
        },
      ])
      .execute()

    const response = await app.inject({
      method: 'GET',
      url: '/api/progress/overview',
      headers: { authorization: 'Bearer valid-token' },
    })

    expect(response.statusCode).toBe(200)
    const body = response.json()
    expect(body.lastBenchmark.trend).toBe('flat')
  })

  it('should return 401 when no auth token provided', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/progress/overview',
    })

    expect(response.statusCode).toBe(401)
  })
})
