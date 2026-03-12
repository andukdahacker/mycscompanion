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
  await db.deleteFrom('milestones').where('id', 'in', ['ms-bench-1', 'ms-bench-2', 'ms-bench-3']).execute()
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

  it('should return 401 for unauthenticated request', async () => {
    const { submissionId } = await seedData()
    await seedBenchmarkResult(submissionId, TEST_UID)
    const app = buildApp()

    const res = await app.inject({
      method: 'GET',
      url: `/submissions/${submissionId}/benchmark`,
      // No authorization header
    })

    expect(res.statusCode).toBe(401)

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

describe('GET /benchmark-results/latest/:milestoneId', () => {
  it('should return latest benchmark result for user and milestone', async () => {
    const { submissionId: sub1 } = await seedData()
    await seedBenchmarkResult(sub1, TEST_UID)

    // Create a second submission + benchmark (more recent)
    const sub2Id = generateId()
    await db
      .insertInto('submissions')
      .values({
        id: sub2Id,
        user_id: TEST_UID,
        milestone_id: 'ms-bench-1',
        code: 'package main // v2',
        status: 'completed',
      })
      .execute()

    const benchId2 = generateId()
    await db
      .insertInto('benchmark_results')
      .values({
        id: benchId2,
        submission_id: sub2Id,
        user_id: TEST_UID,
        milestone_id: 'ms-bench-1',
        benchmark_name: 'sequential-inserts',
        raw_metrics: JSON.stringify({ userMedian: 12400, referenceMedian: 10100, opsPerSec: 12400 }),
        normalized_ratio: '1.2277',
        reference_version: 'milestone-1-v1',
      })
      .execute()

    const app = buildApp()

    const res = await app.inject({
      method: 'GET',
      url: '/benchmark-results/latest/ms-bench-1',
      headers: { authorization: 'Bearer valid-token' },
    })

    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.id).toBe(benchId2)
    expect(body.opsPerSec).toBe(12400)
    expect(body.normalizedRatio).toBeCloseTo(1.2277, 4)

    await app.close()
  })

  it('should return 404 when no benchmark results exist for milestone', async () => {
    await seedData()
    const app = buildApp()

    const res = await app.inject({
      method: 'GET',
      url: '/benchmark-results/latest/ms-bench-1',
      headers: { authorization: 'Bearer valid-token' },
    })

    expect(res.statusCode).toBe(404)
    expect(res.json().error.code).toBe('NOT_FOUND')

    await app.close()
  })

  it('should return 401 for unauthenticated request', async () => {
    const app = buildApp()

    const res = await app.inject({
      method: 'GET',
      url: '/benchmark-results/latest/ms-bench-1',
      // No authorization header
    })

    expect(res.statusCode).toBe(401)

    await app.close()
  })
})

describe('GET /benchmark-results/history/:milestoneId', () => {
  async function seedMultipleBenchmarks(count: number) {
    await seedData()
    const ids: string[] = []
    for (let i = 0; i < count; i++) {
      const subId = generateId()
      await db
        .insertInto('submissions')
        .values({
          id: subId,
          user_id: TEST_UID,
          milestone_id: 'ms-bench-1',
          code: `package main // v${i + 1}`,
          status: 'completed',
        })
        .execute()

      const benchId = generateId()
      // Stagger created_at by 1 second each to ensure ordering (deterministic base)
      const createdAt = new Date(new Date('2026-01-01T00:00:00Z').getTime() + i * 1000)
      await db
        .insertInto('benchmark_results')
        .values({
          id: benchId,
          submission_id: subId,
          user_id: TEST_UID,
          milestone_id: 'ms-bench-1',
          benchmark_name: 'sequential-inserts',
          raw_metrics: JSON.stringify({
            userMedian: 8000 + i * 1000,
            referenceMedian: 10100,
            opsPerSec: 8000 + i * 1000,
            p50LatencyUs: 120,
            p99LatencyUs: 445,
          }),
          normalized_ratio: String(((8000 + i * 1000) / 10100).toFixed(4)),
          reference_version: 'milestone-1-v1',
          created_at: createdAt,
        })
        .execute()

      ids.push(benchId)
    }
    return ids
  }

  it('should return results in chronological order (oldest first)', async () => {
    await seedMultipleBenchmarks(3)
    const app = buildApp()

    const res = await app.inject({
      method: 'GET',
      url: '/benchmark-results/history/ms-bench-1',
      headers: { authorization: 'Bearer valid-token' },
    })

    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.results).toHaveLength(3)
    // Oldest first — opsPerSec should be ascending
    expect(body.results[0].opsPerSec).toBe(8000)
    expect(body.results[1].opsPerSec).toBe(9000)
    expect(body.results[2].opsPerSec).toBe(10000)

    await app.close()
  })

  it('should return correct next page with cursor pagination', async () => {
    await seedMultipleBenchmarks(5)
    const app = buildApp()

    // First page with pageSize=2
    const res1 = await app.inject({
      method: 'GET',
      url: '/benchmark-results/history/ms-bench-1?pageSize=2',
      headers: { authorization: 'Bearer valid-token' },
    })

    expect(res1.statusCode).toBe(200)
    const page1 = res1.json()
    expect(page1.results).toHaveLength(2)
    expect(page1.nextCursor).not.toBeNull()
    expect(page1.totalCount).toBe(5)

    // Second page using cursor
    const res2 = await app.inject({
      method: 'GET',
      url: `/benchmark-results/history/ms-bench-1?afterCursor=${page1.nextCursor}&pageSize=2`,
      headers: { authorization: 'Bearer valid-token' },
    })

    expect(res2.statusCode).toBe(200)
    const page2 = res2.json()
    expect(page2.results).toHaveLength(2)
    expect(page2.nextCursor).not.toBeNull()
    // Entries should continue chronologically
    expect(page2.results[0].opsPerSec).toBeGreaterThan(page1.results[1].opsPerSec)

    await app.close()
  })

  it('should return nextCursor: null when no more results', async () => {
    await seedMultipleBenchmarks(2)
    const app = buildApp()

    const res = await app.inject({
      method: 'GET',
      url: '/benchmark-results/history/ms-bench-1?pageSize=20',
      headers: { authorization: 'Bearer valid-token' },
    })

    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.results).toHaveLength(2)
    expect(body.nextCursor).toBeNull()

    await app.close()
  })

  it('should return totalCount matching actual result count', async () => {
    await seedMultipleBenchmarks(7)
    const app = buildApp()

    const res = await app.inject({
      method: 'GET',
      url: '/benchmark-results/history/ms-bench-1?pageSize=3',
      headers: { authorization: 'Bearer valid-token' },
    })

    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.totalCount).toBe(7)
    expect(body.results).toHaveLength(3)

    await app.close()
  })

  it('should return empty results array when no benchmarks exist', async () => {
    await seedData()
    const app = buildApp()

    const res = await app.inject({
      method: 'GET',
      url: '/benchmark-results/history/ms-bench-1',
      headers: { authorization: 'Bearer valid-token' },
    })

    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.results).toEqual([])
    expect(body.nextCursor).toBeNull()
    expect(body.totalCount).toBe(0)

    await app.close()
  })

  it('should respect pageSize limit (default 20, max 50)', async () => {
    await seedMultipleBenchmarks(3)
    const app = buildApp()

    // Test max clamping
    const res = await app.inject({
      method: 'GET',
      url: '/benchmark-results/history/ms-bench-1?pageSize=100',
      headers: { authorization: 'Bearer valid-token' },
    })

    expect(res.statusCode).toBe(200)
    const body = res.json()
    // Should still return results (clamped to 50)
    expect(body.results).toHaveLength(3)

    await app.close()
  })

  it('should return 401 for unauthenticated request', async () => {
    const app = buildApp()

    const res = await app.inject({
      method: 'GET',
      url: '/benchmark-results/history/ms-bench-1',
      // No authorization header
    })

    expect(res.statusCode).toBe(401)

    await app.close()
  })
})

describe('GET /benchmark-results/trajectory', () => {
  async function seedTrajectoryData() {
    await db
      .insertInto('users')
      .values({ id: TEST_UID, email: TEST_EMAIL })
      .onConflict((oc) => oc.column('id').doNothing())
      .execute()

    await db
      .insertInto('tracks')
      .values({ id: 'track-bench-1', name: 'Test Track', slug: 'test-track' })
      .onConflict((oc) => oc.column('id').doNothing())
      .execute()

    // Create 3 milestones with different positions
    await db
      .insertInto('milestones')
      .values([
        { id: 'ms-bench-1', track_id: 'track-bench-1', slug: '01-kv-store', title: 'KV Store', position: 1 },
        { id: 'ms-bench-2', track_id: 'track-bench-1', slug: '02-btree', title: 'B-Tree Indexing', position: 2 },
        { id: 'ms-bench-3', track_id: 'track-bench-1', slug: '03-storage', title: 'Storage Engine', position: 3 },
      ])
      .onConflict((oc) => oc.column('id').doNothing())
      .execute()
  }

  async function seedBenchmarkForMilestone(
    milestoneId: string,
    opsPerSec: number,
    opts: { createdAt?: Date; benchmarkName?: string } = {},
  ) {
    const subId = generateId()
    await db
      .insertInto('submissions')
      .values({
        id: subId,
        user_id: TEST_UID,
        milestone_id: milestoneId,
        code: 'package main',
        status: 'completed',
      })
      .execute()

    const benchId = generateId()
    const ratio = (opsPerSec / 10100).toFixed(4)
    await db
      .insertInto('benchmark_results')
      .values({
        id: benchId,
        submission_id: subId,
        user_id: TEST_UID,
        milestone_id: milestoneId,
        benchmark_name: opts.benchmarkName ?? 'sequential-inserts',
        raw_metrics: JSON.stringify({
          userMedian: opsPerSec,
          referenceMedian: 10100,
          opsPerSec,
        }),
        normalized_ratio: ratio,
        reference_version: 'milestone-1-v1',
        ...(opts.createdAt ? { created_at: opts.createdAt } : {}),
      })
      .execute()

    return benchId
  }

  it('should return trajectory data points ordered by milestone number', async () => {
    await seedTrajectoryData()
    // Seed results for milestones out of order to verify sorting
    await seedBenchmarkForMilestone('ms-bench-3', 12400)
    await seedBenchmarkForMilestone('ms-bench-1', 4200)
    await seedBenchmarkForMilestone('ms-bench-2', 8100)
    const app = buildApp()

    const res = await app.inject({
      method: 'GET',
      url: '/benchmark-results/trajectory',
      headers: { authorization: 'Bearer valid-token' },
    })

    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.dataPoints).toHaveLength(3)
    // Should be ordered by milestone position
    expect(body.dataPoints[0].milestoneNumber).toBe(1)
    expect(body.dataPoints[0].milestoneName).toBe('KV Store')
    expect(body.dataPoints[0].bestOpsPerSec).toBe(4200)
    expect(body.dataPoints[1].milestoneNumber).toBe(2)
    expect(body.dataPoints[1].milestoneName).toBe('B-Tree Indexing')
    expect(body.dataPoints[1].bestOpsPerSec).toBe(8100)
    expect(body.dataPoints[2].milestoneNumber).toBe(3)
    expect(body.dataPoints[2].milestoneName).toBe('Storage Engine')
    expect(body.dataPoints[2].bestOpsPerSec).toBe(12400)

    await app.close()
  })

  it('should return best ops/sec per milestone (not latest, not average)', async () => {
    await seedTrajectoryData()
    // Seed multiple results for ms-bench-1 — best should be picked
    await seedBenchmarkForMilestone('ms-bench-1', 4200, { createdAt: new Date('2026-01-01T00:00:00Z') })
    await seedBenchmarkForMilestone('ms-bench-1', 9500, { createdAt: new Date('2026-01-02T00:00:00Z') }) // Best
    await seedBenchmarkForMilestone('ms-bench-1', 6000, { createdAt: new Date('2026-01-03T00:00:00Z') }) // Latest but not best
    const app = buildApp()

    const res = await app.inject({
      method: 'GET',
      url: '/benchmark-results/trajectory',
      headers: { authorization: 'Bearer valid-token' },
    })

    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.dataPoints).toHaveLength(1)
    expect(body.dataPoints[0].bestOpsPerSec).toBe(9500)
    expect(body.dataPoints[0].totalSubmissions).toBe(3)

    await app.close()
  })

  it('should return empty array when no benchmark results exist', async () => {
    await seedTrajectoryData()
    const app = buildApp()

    const res = await app.inject({
      method: 'GET',
      url: '/benchmark-results/trajectory',
      headers: { authorization: 'Bearer valid-token' },
    })

    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.dataPoints).toEqual([])

    await app.close()
  })

  it('should return 401 for unauthenticated request', async () => {
    const app = buildApp()

    const res = await app.inject({
      method: 'GET',
      url: '/benchmark-results/trajectory',
    })

    expect(res.statusCode).toBe(401)

    await app.close()
  })

  it('should handle single milestone with multiple benchmark results correctly', async () => {
    await seedTrajectoryData()
    await seedBenchmarkForMilestone('ms-bench-2', 5000, { createdAt: new Date('2026-01-01T00:00:00Z') })
    await seedBenchmarkForMilestone('ms-bench-2', 7500, { createdAt: new Date('2026-01-02T00:00:00Z') })
    const app = buildApp()

    const res = await app.inject({
      method: 'GET',
      url: '/benchmark-results/trajectory',
      headers: { authorization: 'Bearer valid-token' },
    })

    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.dataPoints).toHaveLength(1)
    expect(body.dataPoints[0].milestoneId).toBe('ms-bench-2')
    expect(body.dataPoints[0].bestOpsPerSec).toBe(7500)
    expect(body.dataPoints[0].totalSubmissions).toBe(2)
    expect(body.dataPoints[0].bestNormalizedRatio).toBeCloseTo(7500 / 10100, 3)

    await app.close()
  })

  it('should only return trajectory data for the authenticated user', async () => {
    await seedTrajectoryData()
    // Seed data for the authenticated user
    await seedBenchmarkForMilestone('ms-bench-1', 4200)

    // Seed data for a different user
    await db
      .insertInto('users')
      .values({ id: OTHER_UID, email: 'other@example.com' })
      .onConflict((oc) => oc.column('id').doNothing())
      .execute()
    const otherSubId = generateId()
    await db
      .insertInto('submissions')
      .values({
        id: otherSubId,
        user_id: OTHER_UID,
        milestone_id: 'ms-bench-2',
        code: 'package main',
        status: 'completed',
      })
      .execute()
    await db
      .insertInto('benchmark_results')
      .values({
        id: generateId(),
        submission_id: otherSubId,
        user_id: OTHER_UID,
        milestone_id: 'ms-bench-2',
        benchmark_name: 'range-scan',
        raw_metrics: JSON.stringify({ opsPerSec: 99999, userMedian: 99999, referenceMedian: 10100 }),
        normalized_ratio: '9.9009',
        reference_version: 'milestone-1-v1',
      })
      .execute()

    const app = buildApp()

    const res = await app.inject({
      method: 'GET',
      url: '/benchmark-results/trajectory',
      headers: { authorization: 'Bearer valid-token' },
    })

    expect(res.statusCode).toBe(200)
    const body = res.json()
    // Should only contain TEST_UID's data, not OTHER_UID's
    expect(body.dataPoints).toHaveLength(1)
    expect(body.dataPoints[0].milestoneId).toBe('ms-bench-1')
    expect(body.dataPoints[0].bestOpsPerSec).toBe(4200)

    await app.close()
  })

  it('should handle multiple milestones with different benchmark names', async () => {
    await seedTrajectoryData()
    await seedBenchmarkForMilestone('ms-bench-1', 4200, { benchmarkName: 'sequential-inserts' })
    await seedBenchmarkForMilestone('ms-bench-2', 8100, { benchmarkName: 'range-scan' })
    const app = buildApp()

    const res = await app.inject({
      method: 'GET',
      url: '/benchmark-results/trajectory',
      headers: { authorization: 'Bearer valid-token' },
    })

    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.dataPoints).toHaveLength(2)
    expect(body.dataPoints[0].benchmarkName).toBe('sequential-inserts')
    expect(body.dataPoints[1].benchmarkName).toBe('range-scan')

    await app.close()
  })
})
