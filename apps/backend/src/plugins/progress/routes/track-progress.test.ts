import { describe, it, expect, afterEach, afterAll, beforeEach, vi } from 'vitest'
import Fastify from 'fastify'
import { authPlugin } from '../../auth/index.js'
import { progressPlugin } from '../index.js'
import { createMockFirebaseAuth } from '@mycscompanion/config/test-utils'
import { db } from '../../../shared/db.js'
import { generateId } from '../../../shared/id.js'
import type { OverviewContentLoader } from './overview.js'

const TEST_UID = 'test-track-progress-uid'
const mockAuth = createMockFirebaseAuth(TEST_UID)

const mockContentLoader: OverviewContentLoader = {
  loadMilestoneBrief: vi.fn(async () => '# Brief'),
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
let milestone1Id: string
let milestone2Id: string
let milestone3Id: string

beforeEach(async () => {
  trackId = generateId()
  milestone1Id = generateId()
  milestone2Id = generateId()
  milestone3Id = generateId()

  await db
    .insertInto('users')
    .values({ id: TEST_UID, email: 'track-progress-test@example.com' })
    .execute()

  await db
    .insertInto('tracks')
    .values({ id: trackId, name: 'Build Your Own Database', slug: 'build-your-own-database' })
    .execute()

  await db
    .insertInto('milestones')
    .values([
      { id: milestone1Id, track_id: trackId, title: 'Simple Key-Value Store', slug: '01-kv-store', position: 1, description: 'Build a basic KV store' },
      { id: milestone2Id, track_id: trackId, title: 'Storage Engine', slug: '02-storage-engine', position: 2, description: 'Add persistent storage' },
      { id: milestone3Id, track_id: trackId, title: 'Query Parser', slug: '03-query-parser', position: 3, description: 'Parse SQL queries' },
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

describe('GET /api/progress/track-progress', () => {
  it('should return all milestones in correct order with status', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/progress/track-progress',
      headers: { authorization: 'Bearer valid-token' },
    })

    expect(response.statusCode).toBe(200)
    const body = response.json()
    expect(body.trackName).toBe('Build Your Own Database')
    expect(body.trackSlug).toBe('build-your-own-database')
    expect(body.milestones).toHaveLength(3)
    expect(body.milestones[0].position).toBe(1)
    expect(body.milestones[1].position).toBe(2)
    expect(body.milestones[2].position).toBe(3)
  })

  it('should show completed milestone with criteriaMet count and completedAt', async () => {
    // Create a submission with criteria for milestone 1
    const submissionId = generateId()
    await db
      .insertInto('submissions')
      .values({
        id: submissionId,
        user_id: TEST_UID,
        milestone_id: milestone1Id,
        code: 'package main',
        status: 'completed',
        criteria_results: JSON.stringify([
          { name: 'put-and-get', order: 1, status: 'met', expected: 'PASS', actual: 'PASS' },
          { name: 'delete-key', order: 2, status: 'met', expected: 'PASS', actual: 'PASS' },
          { name: 'range-scan', order: 3, status: 'met', expected: 'PASS', actual: 'PASS' },
        ]),
      })
      .execute()

    // Complete milestone 1
    await db
      .insertInto('user_milestones')
      .values({
        id: generateId(),
        user_id: TEST_UID,
        milestone_id: milestone1Id,
        completing_submission_id: submissionId,
      })
      .execute()

    const response = await app.inject({
      method: 'GET',
      url: '/api/progress/track-progress',
      headers: { authorization: 'Bearer valid-token' },
    })

    expect(response.statusCode).toBe(200)
    const body = response.json()
    const milestone1 = body.milestones[0]
    expect(milestone1.status).toBe('completed')
    expect(milestone1.criteriaMet).toBe(3)
    expect(milestone1.criteriaTotal).toBe(3)
    expect(milestone1.completedAt).toBeTruthy()
  })

  it('should show in-progress milestone with current criteria progress', async () => {
    // Create a submission with partial criteria for milestone 1
    await db
      .insertInto('submissions')
      .values({
        id: generateId(),
        user_id: TEST_UID,
        milestone_id: milestone1Id,
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
      url: '/api/progress/track-progress',
      headers: { authorization: 'Bearer valid-token' },
    })

    expect(response.statusCode).toBe(200)
    const body = response.json()
    const milestone1 = body.milestones[0]
    expect(milestone1.status).toBe('in-progress')
    expect(milestone1.criteriaMet).toBe(1)
    expect(milestone1.criteriaTotal).toBe(2)
  })

  it('should show upcoming milestone with null for criteria fields', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/progress/track-progress',
      headers: { authorization: 'Bearer valid-token' },
    })

    expect(response.statusCode).toBe(200)
    const body = response.json()
    // First milestone is in-progress (first incomplete), rest are upcoming
    const milestone2 = body.milestones[1]
    expect(milestone2.status).toBe('upcoming')
    expect(milestone2.criteriaMet).toBeNull()
    expect(milestone2.criteriaTotal).toBeNull()
    expect(milestone2.completedAt).toBeNull()
  })

  it('should show first milestone as in-progress for first-time user with no activity', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/progress/track-progress',
      headers: { authorization: 'Bearer valid-token' },
    })

    expect(response.statusCode).toBe(200)
    const body = response.json()
    expect(body.milestones[0].status).toBe('in-progress')
    expect(body.milestones[0].criteriaMet).toBeNull()
    expect(body.milestones[0].criteriaTotal).toBeNull()
    expect(body.milestones[1].status).toBe('upcoming')
    expect(body.milestones[2].status).toBe('upcoming')
  })

  it('should show all milestones as completed when all are done', async () => {
    // Create submissions and completions for all milestones
    for (const milestoneId of [milestone1Id, milestone2Id, milestone3Id]) {
      const subId = generateId()
      await db
        .insertInto('submissions')
        .values({
          id: subId,
          user_id: TEST_UID,
          milestone_id: milestoneId,
          code: 'package main',
          status: 'completed',
          criteria_results: JSON.stringify([
            { name: 'criterion-1', order: 1, status: 'met', expected: 'PASS', actual: 'PASS' },
          ]),
        })
        .execute()

      await db
        .insertInto('user_milestones')
        .values({
          id: generateId(),
          user_id: TEST_UID,
          milestone_id: milestoneId,
          completing_submission_id: subId,
        })
        .execute()
    }

    const response = await app.inject({
      method: 'GET',
      url: '/api/progress/track-progress',
      headers: { authorization: 'Bearer valid-token' },
    })

    expect(response.statusCode).toBe(200)
    const body = response.json()
    expect(body.milestones.every((m: { status: string }) => m.status === 'completed')).toBe(true)
  })

  it('should return 401 without auth token', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/progress/track-progress',
    })

    expect(response.statusCode).toBe(401)
  })

  it('should return null for lastBenchmark when no benchmark results exist', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/progress/track-progress',
      headers: { authorization: 'Bearer valid-token' },
    })

    expect(response.statusCode).toBe(200)
    const body = response.json()
    expect(body.milestones.every((m: { lastBenchmark: null }) => m.lastBenchmark === null)).toBe(true)
  })

  it('should return lastBenchmark with bestOpsPerSec for milestone with benchmark data', async () => {
    const subId = generateId()
    await db
      .insertInto('submissions')
      .values({ id: subId, user_id: TEST_UID, milestone_id: milestone1Id, code: 'package main', status: 'completed' })
      .execute()

    await db
      .insertInto('benchmark_results')
      .values({
        id: generateId(),
        submission_id: subId,
        user_id: TEST_UID,
        milestone_id: milestone1Id,
        benchmark_name: 'sequential-inserts',
        raw_metrics: JSON.stringify({ opsPerSec: 9500, userMedian: 9500, referenceMedian: 10000, p50LatencyUs: 100, p99LatencyUs: 350 }),
        normalized_ratio: '0.9500',
        reference_version: 'v1',
        created_at: new Date('2026-03-01T10:00:00Z'),
      })
      .execute()

    const response = await app.inject({
      method: 'GET',
      url: '/api/progress/track-progress',
      headers: { authorization: 'Bearer valid-token' },
    })

    expect(response.statusCode).toBe(200)
    const body = response.json()
    expect(body.milestones[0].lastBenchmark).not.toBeNull()
    expect(body.milestones[0].lastBenchmark.bestOpsPerSec).toBe(9500)
    // Upcoming milestones should still be null
    expect(body.milestones[1].lastBenchmark).toBeNull()
    expect(body.milestones[2].lastBenchmark).toBeNull()
  })

  it('should return best (max) ops/sec across multiple benchmark runs', async () => {
    const subId1 = generateId()
    const subId2 = generateId()
    await db
      .insertInto('submissions')
      .values([
        { id: subId1, user_id: TEST_UID, milestone_id: milestone1Id, code: 'package main', status: 'completed' },
        { id: subId2, user_id: TEST_UID, milestone_id: milestone1Id, code: 'package main', status: 'completed' },
      ])
      .execute()

    await db
      .insertInto('benchmark_results')
      .values([
        {
          id: generateId(),
          submission_id: subId1,
          user_id: TEST_UID,
          milestone_id: milestone1Id,
          benchmark_name: 'sequential-inserts',
          raw_metrics: JSON.stringify({ opsPerSec: 8000, userMedian: 8000, referenceMedian: 10000, p50LatencyUs: 120, p99LatencyUs: 400 }),
          normalized_ratio: '0.8000',
          reference_version: 'v1',
          created_at: new Date('2026-03-01T10:00:00Z'),
        },
        {
          id: generateId(),
          submission_id: subId2,
          user_id: TEST_UID,
          milestone_id: milestone1Id,
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
      url: '/api/progress/track-progress',
      headers: { authorization: 'Bearer valid-token' },
    })

    expect(response.statusCode).toBe(200)
    const body = response.json()
    expect(body.milestones[0].lastBenchmark.bestOpsPerSec).toBe(12400)
  })

  it('should return correct completedCount and totalCount', async () => {
    // Complete milestone 1
    await db
      .insertInto('user_milestones')
      .values({
        id: generateId(),
        user_id: TEST_UID,
        milestone_id: milestone1Id,
        completing_submission_id: null,
      })
      .execute()

    const response = await app.inject({
      method: 'GET',
      url: '/api/progress/track-progress',
      headers: { authorization: 'Bearer valid-token' },
    })

    expect(response.statusCode).toBe(200)
    const body = response.json()
    expect(body.completedCount).toBe(1)
    expect(body.totalCount).toBe(3)
  })

  it('should include milestone description', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/progress/track-progress',
      headers: { authorization: 'Bearer valid-token' },
    })

    expect(response.statusCode).toBe(200)
    const body = response.json()
    expect(body.milestones[0].description).toBe('Build a basic KV store')
    expect(body.milestones[1].description).toBe('Add persistent storage')
    expect(body.milestones[2].description).toBe('Parse SQL queries')
  })
})
