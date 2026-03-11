import { describe, it, expect, afterEach, vi } from 'vitest'
import Fastify from 'fastify'
import { authPlugin } from '../../auth/index.js'
import { benchmarkResultsRoutes } from './benchmark-results.js'
import { createMockFirebaseAuth } from '@mycscompanion/config/test-utils'
import { db } from '../../../shared/db.js'
import { generateId } from '../../../shared/id.js'

const TEST_UID = 'test-bench-results-uid'
const OTHER_UID = 'test-bench-results-other-uid'
const TEST_EMAIL = 'test-bench-results@example.com'
const mockAuth = createMockFirebaseAuth(TEST_UID)

afterEach(async () => {
  await db.deleteFrom('benchmark_results').where('user_id', 'in', [TEST_UID, OTHER_UID]).execute()
  await db.deleteFrom('submissions').where('user_id', 'in', [TEST_UID, OTHER_UID]).execute()
  await db.deleteFrom('milestones').where('id', '=', 'ms-bench-1').execute()
  await db.deleteFrom('tracks').where('id', '=', 'track-bench-1').execute()
  await db.deleteFrom('users').where('id', 'in', [TEST_UID, OTHER_UID]).execute()
  vi.restoreAllMocks()
})

async function seedData(opts: { userId?: string } = {}) {
  const userId = opts.userId ?? TEST_UID

  await db
    .insertInto('users')
    .values({ id: userId, email: userId === TEST_UID ? TEST_EMAIL : 'other@example.com' })
    .onConflict((oc) => oc.column('id').doNothing())
    .execute()

  await db
    .insertInto('tracks')
    .values({ id: 'track-bench-1', name: 'Test Track', slug: 'test-track' })
    .onConflict((oc) => oc.column('id').doNothing())
    .execute()

  await db
    .insertInto('milestones')
    .values({ id: 'ms-bench-1', track_id: 'track-bench-1', slug: '01-kv-store', title: 'KV Store', position: 1 })
    .onConflict((oc) => oc.column('id').doNothing())
    .execute()

  const submissionId = generateId()
  await db
    .insertInto('submissions')
    .values({
      id: submissionId,
      user_id: userId,
      milestone_id: 'ms-bench-1',
      code: 'package main',
      status: 'completed',
    })
    .execute()

  return { submissionId }
}

async function seedBenchmarkResult(submissionId: string, userId: string) {
  const benchmarkId = generateId()
  await db
    .insertInto('benchmark_results')
    .values({
      id: benchmarkId,
      submission_id: submissionId,
      user_id: userId,
      milestone_id: 'ms-bench-1',
      benchmark_name: 'sequential-inserts',
      raw_metrics: JSON.stringify({
        userMedian: 8200,
        referenceMedian: 10100,
        opsPerSec: 8200,
        p50LatencyUs: 120,
        p99LatencyUs: 445,
      }),
      normalized_ratio: '0.8119',
      reference_version: 'milestone-1-v1',
    })
    .execute()

  return benchmarkId
}

function buildApp() {
  const app = Fastify()
  app.register(authPlugin, { firebaseAuth: mockAuth })
  app.register(benchmarkResultsRoutes, { db })
  return app
}

describe('GET /submissions/:submissionId/benchmark', () => {
  it('should return benchmark result for valid submission owned by user', async () => {
    const { submissionId } = await seedData()
    const benchmarkId = await seedBenchmarkResult(submissionId, TEST_UID)
    const app = buildApp()

    const res = await app.inject({
      method: 'GET',
      url: `/submissions/${submissionId}/benchmark`,
      headers: { authorization: 'Bearer valid-token' },
    })

    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.id).toBe(benchmarkId)
    expect(body.submissionId).toBe(submissionId)
    expect(body.benchmarkName).toBe('sequential-inserts')
    expect(body.opsPerSec).toBe(8200)
    expect(body.normalizedRatio).toBeCloseTo(0.8119, 4)
    expect(body.userMedian).toBe(8200)
    expect(body.referenceMedian).toBe(10100)
    expect(body.p50LatencyUs).toBe(120)
    expect(body.p99LatencyUs).toBe(445)
    expect(body.referenceVersion).toBe('milestone-1-v1')
    expect(body.createdAt).toBeDefined()

    await app.close()
  })

  it('should return 404 when no benchmark result exists', async () => {
    const { submissionId } = await seedData()
    const app = buildApp()

    const res = await app.inject({
      method: 'GET',
      url: `/submissions/${submissionId}/benchmark`,
      headers: { authorization: 'Bearer valid-token' },
    })

    expect(res.statusCode).toBe(404)
    expect(res.json().error.code).toBe('NOT_FOUND')

    await app.close()
  })

  it('should return 403 when submission belongs to different user', async () => {
    await seedData({ userId: OTHER_UID })
    const otherSubmission = await db
      .selectFrom('submissions')
      .select('id')
      .where('user_id', '=', OTHER_UID)
      .executeTakeFirstOrThrow()
    await seedBenchmarkResult(otherSubmission.id, OTHER_UID)
    const app = buildApp()

    const res = await app.inject({
      method: 'GET',
      url: `/submissions/${otherSubmission.id}/benchmark`,
      headers: { authorization: 'Bearer valid-token' },
    })

    expect(res.statusCode).toBe(403)
    expect(res.json().error.code).toBe('FORBIDDEN')

    await app.close()
  })

  it('should return response fields in camelCase', async () => {
    const { submissionId } = await seedData()
    await seedBenchmarkResult(submissionId, TEST_UID)
    const app = buildApp()

    const res = await app.inject({
      method: 'GET',
      url: `/submissions/${submissionId}/benchmark`,
      headers: { authorization: 'Bearer valid-token' },
    })

    expect(res.statusCode).toBe(200)
    const body = res.json()
    // Verify camelCase fields (not snake_case)
    expect(body).toHaveProperty('submissionId')
    expect(body).toHaveProperty('benchmarkName')
    expect(body).toHaveProperty('opsPerSec')
    expect(body).toHaveProperty('normalizedRatio')
    expect(body).toHaveProperty('userMedian')
    expect(body).toHaveProperty('referenceMedian')
    expect(body).toHaveProperty('p50LatencyUs')
    expect(body).toHaveProperty('p99LatencyUs')
    expect(body).toHaveProperty('referenceVersion')
    expect(body).toHaveProperty('createdAt')
    // Verify no snake_case fields
    expect(body).not.toHaveProperty('submission_id')
    expect(body).not.toHaveProperty('benchmark_name')
    expect(body).not.toHaveProperty('normalized_ratio')
    expect(body).not.toHaveProperty('reference_version')
    expect(body).not.toHaveProperty('created_at')

    await app.close()
  })
})
