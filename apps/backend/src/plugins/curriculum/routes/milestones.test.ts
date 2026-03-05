import { describe, it, expect, afterEach, afterAll, beforeEach, vi } from 'vitest'
import Fastify from 'fastify'
import type { Redis } from 'ioredis'
import { authPlugin } from '../../auth/index.js'
import { curriculumPlugin } from '../index.js'
import { createMockFirebaseAuth, createMockRedis } from '@mycscompanion/config/test-utils'
import { db } from '../../../shared/db.js'
import { generateId } from '../../../shared/id.js'

const mockReadFile = vi.fn()
const mockReaddir = vi.fn()

vi.mock('node:fs/promises', () => ({
  readFile: (...args: unknown[]) => mockReadFile(...args),
  readdir: (...args: unknown[]) => mockReaddir(...args),
}))

const TEST_UID = 'test-milestone-uid'
const mockAuth = createMockFirebaseAuth(TEST_UID)
const mockRedis = createMockRedis()

const CONTENT_ROOT = '/test-content/milestones'

const BRIEF_CONTENT = '# Milestone 1: Simple Key-Value Store\n\n## What You\'re Building'

const ACCEPTANCE_CRITERIA_YAML = `milestone: 01-kv-store
criteria:
  - name: put-and-get
    order: 1
    description: Put and get.
    assertion:
      type: stdout-contains
      expected: "PASS: put-and-get"
      command_args: test
    error_hint: Check put.
`

const BENCHMARK_CONFIG_YAML = `milestone: 01-kv-store
benchmarks:
  - name: sequential-inserts
    description: Sequential insertion test.
    warmup_iterations: 2
    measured_iterations: 10
    workload:
      type: inserts
      num_operations: 1000
    target_metrics:
      ops_per_sec: 100
`

function setupFs(): void {
  mockReadFile.mockImplementation(async (path: string) => {
    if (path.endsWith('brief.md')) return BRIEF_CONTENT
    if (path.endsWith('acceptance-criteria.yaml')) return ACCEPTANCE_CRITERIA_YAML
    if (path.endsWith('benchmark-config.yaml')) return BENCHMARK_CONFIG_YAML
    const err = new Error('ENOENT') as NodeJS.ErrnoException
    err.code = 'ENOENT'
    throw err
  })

  mockReaddir.mockImplementation(async (path: string) => {
    if (path.endsWith('/assets')) return ['.gitkeep']
    if (path.endsWith('/starter-code')) return ['.gitkeep']
    const err = new Error('ENOENT') as NodeJS.ErrnoException
    err.code = 'ENOENT'
    throw err
  })
}

async function buildApp() {
  const app = Fastify({ logger: false })
  await app.register(authPlugin, { firebaseAuth: mockAuth })
  await app.register(curriculumPlugin, {
    prefix: '/api/curriculum',
    redis: mockRedis as unknown as Redis,
    contentRoot: CONTENT_ROOT,
  })
  await app.ready()
  return app
}

const app = await buildApp()

let trackId: string
let milestoneId: string

beforeEach(async () => {
  setupFs()
  trackId = generateId()
  milestoneId = generateId()

  await db
    .insertInto('tracks')
    .values({
      id: trackId,
      name: 'Build Your Own Database',
      slug: 'build-your-own-database',
    })
    .execute()

  await db
    .insertInto('milestones')
    .values({
      id: milestoneId,
      track_id: trackId,
      title: 'Simple Key-Value Store',
      slug: 'kv-store',
      position: 1,
    })
    .execute()
})

afterEach(async () => {
  vi.restoreAllMocks()
  await db.deleteFrom('milestones').execute()
  await db.deleteFrom('tracks').execute()
})

afterAll(async () => {
  await app.close()
})

describe('GET /api/curriculum/milestones/:id', () => {
  it('should return milestone content by id', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/curriculum/milestones/${milestoneId}`,
      headers: { authorization: 'Bearer valid-token' },
    })

    expect(response.statusCode).toBe(200)
    const body = response.json()
    expect(body.milestoneId).toBe(milestoneId)
    expect(body.trackId).toBe(trackId)
    expect(body.slug).toBe('kv-store')
    expect(body.title).toBe('Simple Key-Value Store')
    expect(body.position).toBe(1)
    expect(body.brief).toBe(BRIEF_CONTENT)
    expect(body.acceptanceCriteria).toHaveLength(1)
    expect(body.acceptanceCriteria[0].name).toBe('put-and-get')
    expect(body.acceptanceCriteria[0].assertion.commandArgs).toBe('test')
    expect(body.benchmarkConfig).not.toBeNull()
    expect(body.benchmarkConfig.benchmarks[0].warmupIterations).toBe(2)
  })

  it('should return milestone content by slug', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/curriculum/milestones/kv-store',
      headers: { authorization: 'Bearer valid-token' },
    })

    expect(response.statusCode).toBe(200)
    const body = response.json()
    expect(body.slug).toBe('kv-store')
    expect(body.milestoneId).toBe(milestoneId)
  })

  it('should return 404 for nonexistent milestone', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/curriculum/milestones/nonexistent',
      headers: { authorization: 'Bearer valid-token' },
    })

    expect(response.statusCode).toBe(404)
    expect(response.json().error.code).toBe('NOT_FOUND')
  })

  it('should return 401 when no auth token provided', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/curriculum/milestones/${milestoneId}`,
    })

    expect(response.statusCode).toBe(401)
  })

  it('should return camelCase keys in acceptance criteria', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/curriculum/milestones/${milestoneId}`,
      headers: { authorization: 'Bearer valid-token' },
    })

    expect(response.statusCode).toBe(200)
    const body = response.json()
    const criterion = body.acceptanceCriteria[0]
    expect('commandArgs' in criterion.assertion).toBe(true)
    expect('command_args' in criterion.assertion).toBe(false)
    expect('errorHint' in criterion).toBe(true)
    expect('error_hint' in criterion).toBe(false)
  })

  it('should return camelCase keys in benchmark config', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/curriculum/milestones/${milestoneId}`,
      headers: { authorization: 'Bearer valid-token' },
    })

    expect(response.statusCode).toBe(200)
    const body = response.json()
    const bench = body.benchmarkConfig.benchmarks[0]
    expect('warmupIterations' in bench).toBe(true)
    expect('warmup_iterations' in bench).toBe(false)
    expect('measuredIterations' in bench).toBe(true)
    expect('numOperations' in bench.workload).toBe(true)
    expect('opsPerSec' in bench.targetMetrics).toBe(true)
  })
})
