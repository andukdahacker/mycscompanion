import { describe, it, expect, afterEach, vi, beforeEach } from 'vitest'
import { setupServer } from 'msw/node'
import { http, HttpResponse } from 'msw'
import { FlyClient } from '@mycscompanion/execution'
import { DEFAULT_FLY_MACHINE_CONFIG } from '@mycscompanion/execution'
import {
  setupFlyApiHandlers,
} from '@mycscompanion/config/test-utils'
import { db } from '../../shared/db.js'
import type { EventPublisher } from '../../shared/event-publisher.js'
import type { ExecutionJobData } from '../../shared/queue.js'
import { createExecutionProcessor } from './execution-processor.js'
import type { ExecutionJob, RunBenchmarkFn } from './execution-processor.js'
import type { ContentLoader } from '../../plugins/curriculum/content-loader.js'
import pino from 'pino'

const TEST_UID = 'test-exec-proc-uid'
const TEST_EMAIL = 'test-exec-proc@example.com'
const TEST_SUBMISSION_ID = 'test-sub-proc-1'
const FLY_BASE_URL = 'https://api.machines.dev'
const FLY_APP_NAME = 'mcc-execution'
const FLY_API_TOKEN = 'test-fly-token'
const FLY_LOGS_BASE = 'https://api.fly.io'

const logger = pino({ level: 'silent' })

const flyConfig = {
  ...DEFAULT_FLY_MACHINE_CONFIG,
  image: 'test-image:latest',
}

function createMockEventPublisher(): EventPublisher {
  return {
    publish: vi.fn().mockResolvedValue(undefined),
    setLogTTL: vi.fn().mockResolvedValue(undefined),
  }
}

function createMockContentLoader(): ContentLoader {
  return {
    loadMilestoneBrief: vi.fn().mockResolvedValue(null),
    loadAcceptanceCriteria: vi.fn().mockResolvedValue([]),
    loadBenchmarkConfig: vi.fn().mockResolvedValue(null),
    listConceptExplainerAssets: vi.fn().mockResolvedValue([]),
    getStarterCodePath: vi.fn().mockResolvedValue(null),
    loadStarterCode: vi.fn().mockResolvedValue(null),
    loadMetadata: vi.fn().mockResolvedValue({ title: 'Test', description: '', csConceptLabel: null }),
    invalidateCache: vi.fn().mockResolvedValue(undefined),
    invalidateAllCaches: vi.fn().mockResolvedValue(undefined),
  }
}

function createTestJob(overrides: Partial<ExecutionJobData> = {}): ExecutionJob {
  return {
    data: {
      submissionId: TEST_SUBMISSION_ID,
      milestoneId: 'ms-1',
      code: 'package main\nfunc main() {}',
      userId: TEST_UID,
      ...overrides,
    },
  }
}

// Set up msw server
const flyHandlers = setupFlyApiHandlers({
  baseUrl: FLY_BASE_URL,
  appName: FLY_APP_NAME,
})

// Fly Logs API handler
const logsHandler = http.get(
  `${FLY_LOGS_BASE}/api/v1/apps/${FLY_APP_NAME}/logs`,
  () => {
    return new HttpResponse(
      '{"timestamp":"2026-03-01T00:00:01Z","message":"Hello, World!","level":"info"}\n',
      { status: 200 }
    )
  }
)

const server = setupServer(...flyHandlers, logsHandler)

beforeEach(() => {
  server.listen({ onUnhandledRequest: 'bypass' })
})

afterEach(async () => {
  server.resetHandlers()
  server.close()
  await db.deleteFrom('benchmark_results').where('user_id', '=', TEST_UID).execute()
  await db.deleteFrom('submissions').where('user_id', '=', TEST_UID).execute()
  await db.deleteFrom('users').where('id', '=', TEST_UID).execute()
  vi.restoreAllMocks()
})

async function seedUserAndSubmission(submissionId: string = TEST_SUBMISSION_ID) {
  await db
    .insertInto('users')
    .values({ id: TEST_UID, email: TEST_EMAIL })
    .onConflict((oc) => oc.column('id').doNothing())
    .execute()
  await db
    .insertInto('submissions')
    .values({
      id: submissionId,
      user_id: TEST_UID,
      milestone_id: 'ms-1',
      code: 'package main\nfunc main() {}',
      status: 'queued',
    })
    .execute()
}

describe('ExecutionProcessor', () => {
  it('should process a successful execution and update DB to completed', async () => {
    await seedUserAndSubmission()

    const eventPublisher = createMockEventPublisher()
    const flyClient = new FlyClient({
      apiToken: FLY_API_TOKEN,
      appName: FLY_APP_NAME,
      baseUrl: FLY_BASE_URL,
    })

    const processor = createExecutionProcessor({
      flyClient,
      flyConfig,
      db,
      eventPublisher,
      logger,
      flyApiToken: FLY_API_TOKEN,
      flyAppName: FLY_APP_NAME,
      contentLoader: createMockContentLoader(),
    })

    await processor(createTestJob())

    // Verify DB status updated to completed
    const row = await db
      .selectFrom('submissions')
      .selectAll()
      .where('id', '=', TEST_SUBMISSION_ID)
      .executeTakeFirst()

    expect(row?.status).toBe('completed')
    expect(row?.execution_result).not.toBeNull()
  })

  it('should update DB status to running before processing', async () => {
    await seedUserAndSubmission()

    const eventPublisher = createMockEventPublisher()
    const flyClient = new FlyClient({
      apiToken: FLY_API_TOKEN,
      appName: FLY_APP_NAME,
      baseUrl: FLY_BASE_URL,
    })

    // Track status when first event is published
    let statusAtFirstEvent: string | undefined
    ;(eventPublisher.publish as ReturnType<typeof vi.fn>).mockImplementation(
      async () => {
        if (statusAtFirstEvent === undefined) {
          const row = await db
            .selectFrom('submissions')
            .select('status')
            .where('id', '=', TEST_SUBMISSION_ID)
            .executeTakeFirst()
          if (row) statusAtFirstEvent = row.status
        }
      }
    )

    const processor = createExecutionProcessor({
      flyClient,
      flyConfig,
      db,
      eventPublisher,
      logger,
      flyApiToken: FLY_API_TOKEN,
      flyAppName: FLY_APP_NAME,
      contentLoader: createMockContentLoader(),
    })

    await processor(createTestJob())

    // Status should be 'running' when first event is published
    expect(statusAtFirstEvent).toBe('running')
  })

  it('should publish events in correct sequence', async () => {
    await seedUserAndSubmission()

    const eventPublisher = createMockEventPublisher()
    const flyClient = new FlyClient({
      apiToken: FLY_API_TOKEN,
      appName: FLY_APP_NAME,
      baseUrl: FLY_BASE_URL,
    })

    const processor = createExecutionProcessor({
      flyClient,
      flyConfig,
      db,
      eventPublisher,
      logger,
      flyApiToken: FLY_API_TOKEN,
      flyAppName: FLY_APP_NAME,
      contentLoader: createMockContentLoader(),
    })

    await processor(createTestJob())

    const publishCalls = (eventPublisher.publish as ReturnType<typeof vi.fn>).mock.calls as Array<[string, { type: string }]>
    const eventTypes = publishCalls.map((call) => call[1].type)

    // Should have: output (preparing), output (machine created), output (compiling), output (logs), complete
    expect(eventTypes[0]).toBe('output')
    expect(eventTypes[1]).toBe('output')
    expect(eventTypes[2]).toBe('output')
    expect(eventTypes[eventTypes.length - 1]).toBe('complete')
  })

  it('should set log TTL after completion', async () => {
    await seedUserAndSubmission()

    const eventPublisher = createMockEventPublisher()
    const flyClient = new FlyClient({
      apiToken: FLY_API_TOKEN,
      appName: FLY_APP_NAME,
      baseUrl: FLY_BASE_URL,
    })

    const processor = createExecutionProcessor({
      flyClient,
      flyConfig,
      db,
      eventPublisher,
      logger,
      flyApiToken: FLY_API_TOKEN,
      flyAppName: FLY_APP_NAME,
      contentLoader: createMockContentLoader(),
    })

    await processor(createTestJob())

    expect(eventPublisher.setLogTTL).toHaveBeenCalledWith(TEST_SUBMISSION_ID, 300)
  })

  it('should handle timeout by setting status to failed', async () => {
    await seedUserAndSubmission()

    // Override wait handler to return 408
    server.use(
      http.get(`${FLY_BASE_URL}/v1/apps/${FLY_APP_NAME}/machines/:machineId/wait`, () => {
        return HttpResponse.json(
          { error: 'Timeout waiting for state' },
          { status: 408 }
        )
      })
    )

    const eventPublisher = createMockEventPublisher()
    const flyClient = new FlyClient({
      apiToken: FLY_API_TOKEN,
      appName: FLY_APP_NAME,
      baseUrl: FLY_BASE_URL,
    })

    const processor = createExecutionProcessor({
      flyClient,
      flyConfig,
      db,
      eventPublisher,
      logger,
      flyApiToken: FLY_API_TOKEN,
      flyAppName: FLY_APP_NAME,
      contentLoader: createMockContentLoader(),
    })

    await processor(createTestJob())

    const row = await db
      .selectFrom('submissions')
      .selectAll()
      .where('id', '=', TEST_SUBMISSION_ID)
      .executeTakeFirst()

    expect(row?.status).toBe('failed')
    expect(row?.error_message).toContain('timed out')

    // Should have published a timeout event
    const publishCalls = (eventPublisher.publish as ReturnType<typeof vi.fn>).mock.calls as Array<[string, { type: string }]>
    const timeoutEvent = publishCalls.find((call) => call[1].type === 'timeout')
    expect(timeoutEvent).toBeDefined()
  })

  it('should throw on retryable Fly error for BullMQ retry', async () => {
    await seedUserAndSubmission()

    // Override create to return 503
    server.use(
      http.post(`${FLY_BASE_URL}/v1/apps/${FLY_APP_NAME}/machines`, () => {
        return HttpResponse.json(
          { error: 'Service unavailable' },
          { status: 503 }
        )
      })
    )

    const eventPublisher = createMockEventPublisher()
    const flyClient = new FlyClient({
      apiToken: FLY_API_TOKEN,
      appName: FLY_APP_NAME,
      baseUrl: FLY_BASE_URL,
    })

    const processor = createExecutionProcessor({
      flyClient,
      flyConfig,
      db,
      eventPublisher,
      logger,
      flyApiToken: FLY_API_TOKEN,
      flyAppName: FLY_APP_NAME,
      contentLoader: createMockContentLoader(),
    })

    // Should re-throw for BullMQ retry
    await expect(processor(createTestJob())).rejects.toThrow()
  })

  it('should handle non-retryable error without re-throwing', async () => {
    await seedUserAndSubmission()

    // Override create to return 400 (non-retryable)
    server.use(
      http.post(`${FLY_BASE_URL}/v1/apps/${FLY_APP_NAME}/machines`, () => {
        return HttpResponse.json(
          { error: 'Bad request' },
          { status: 400 }
        )
      })
    )

    const eventPublisher = createMockEventPublisher()
    const flyClient = new FlyClient({
      apiToken: FLY_API_TOKEN,
      appName: FLY_APP_NAME,
      baseUrl: FLY_BASE_URL,
    })

    const processor = createExecutionProcessor({
      flyClient,
      flyConfig,
      db,
      eventPublisher,
      logger,
      flyApiToken: FLY_API_TOKEN,
      flyAppName: FLY_APP_NAME,
      contentLoader: createMockContentLoader(),
    })

    // Should NOT throw — non-retryable errors are swallowed
    await processor(createTestJob())

    const row = await db
      .selectFrom('submissions')
      .selectAll()
      .where('id', '=', TEST_SUBMISSION_ID)
      .executeTakeFirst()

    expect(row?.status).toBe('failed')

    // Should have published an error event with isUserError: false
    const publishCalls = (eventPublisher.publish as ReturnType<typeof vi.fn>).mock.calls as Array<[string, { type: string }]>
    const errorEvent = publishCalls.find((call) => call[1].type === 'error')
    expect(errorEvent).toBeDefined()
  })

  it('should always destroy machine even on error', async () => {
    await seedUserAndSubmission()

    let destroyCalled = false

    // Track destroy calls
    // Override wait to return 500 (non-retryable) and track destroy calls
    server.use(
      http.get(`${FLY_BASE_URL}/v1/apps/${FLY_APP_NAME}/machines/:machineId/wait`, () => {
        return HttpResponse.json(
          { error: 'Internal error' },
          { status: 500 }
        )
      }),
      http.delete(`${FLY_BASE_URL}/v1/apps/${FLY_APP_NAME}/machines/:machineId`, () => {
        destroyCalled = true
        return new HttpResponse(null, { status: 200 })
      }),
    )

    const eventPublisher = createMockEventPublisher()
    const flyClient = new FlyClient({
      apiToken: FLY_API_TOKEN,
      appName: FLY_APP_NAME,
      baseUrl: FLY_BASE_URL,
    })

    const processor = createExecutionProcessor({
      flyClient,
      flyConfig,
      db,
      eventPublisher,
      logger,
      flyApiToken: FLY_API_TOKEN,
      flyAppName: FLY_APP_NAME,
      contentLoader: createMockContentLoader(),
    })

    // Non-retryable error — processor should complete without throwing
    await processor(createTestJob())

    expect(destroyCalled).toBe(true)
  })

  it('should evaluate criteria and publish results for successful execution', async () => {
    // Seed milestone with known ID
    await db
      .insertInto('tracks')
      .values({ id: 'track-1', name: 'Test Track', slug: 'test-track' })
      .onConflict((oc) => oc.column('id').doNothing())
      .execute()
    await db
      .insertInto('milestones')
      .values({ id: 'ms-1', track_id: 'track-1', slug: '01-kv-store', title: 'KV Store', position: 1 })
      .onConflict((oc) => oc.column('id').doNothing())
      .execute()
    await seedUserAndSubmission()

    const eventPublisher = createMockEventPublisher()
    const contentLoader = createMockContentLoader()
    ;(contentLoader.loadAcceptanceCriteria as ReturnType<typeof vi.fn>).mockResolvedValue([
      { name: 'put-and-get', order: 1, assertion: { type: 'stdout-contains', expected: 'Hello, World!' } },
    ])

    const flyClient = new FlyClient({
      apiToken: FLY_API_TOKEN,
      appName: FLY_APP_NAME,
      baseUrl: FLY_BASE_URL,
    })

    const processor = createExecutionProcessor({
      flyClient,
      flyConfig,
      db,
      eventPublisher,
      logger,
      flyApiToken: FLY_API_TOKEN,
      flyAppName: FLY_APP_NAME,
      contentLoader,
    })

    await processor(createTestJob())

    // Verify criteria_results event was published
    const publishCalls = (eventPublisher.publish as ReturnType<typeof vi.fn>).mock.calls as Array<[string, { type: string }]>
    const criteriaEvent = publishCalls.find((call) => call[1].type === 'criteria_results')
    expect(criteriaEvent).toBeDefined()

    // Verify DB has criteria_results with correct content
    const row = await db
      .selectFrom('submissions')
      .selectAll()
      .where('id', '=', TEST_SUBMISSION_ID)
      .executeTakeFirst()
    expect(row?.criteria_results).not.toBeNull()
    // JSONB column — DB driver may return object or string depending on driver
    const parsedResults = (typeof row!.criteria_results === 'string'
      ? JSON.parse(row!.criteria_results)
      : row!.criteria_results) as Array<{ name: string; status: string }>
    expect(parsedResults).toHaveLength(1)
    expect(parsedResults[0]!.name).toBe('put-and-get')
    expect(parsedResults[0]!.status).toBe('met')

    // Clean up milestone/track data
    await db.deleteFrom('milestones').where('id', '=', 'ms-1').execute()
    await db.deleteFrom('tracks').where('id', '=', 'track-1').execute()
  })

  it('should mark all criteria not-met when execution fails', async () => {
    await db
      .insertInto('tracks')
      .values({ id: 'track-1', name: 'Test Track', slug: 'test-track' })
      .onConflict((oc) => oc.column('id').doNothing())
      .execute()
    await db
      .insertInto('milestones')
      .values({ id: 'ms-1', track_id: 'track-1', slug: '01-kv-store', title: 'KV Store', position: 1 })
      .onConflict((oc) => oc.column('id').doNothing())
      .execute()
    await seedUserAndSubmission()

    // Override logs to return Go compilation error
    server.use(
      http.get(`${FLY_LOGS_BASE}/api/v1/apps/${FLY_APP_NAME}/logs`, () => {
        return new HttpResponse(
          '{"timestamp":"2026-03-01T00:00:01Z","message":"./main.go:5:2: undefined: x","level":"info"}\n',
          { status: 200 }
        )
      }),
      // Override getMachine to return exit code 2
      http.get(`${FLY_BASE_URL}/v1/apps/${FLY_APP_NAME}/machines/:machineId`, () => {
        return HttpResponse.json({
          id: 'test-machine-id',
          instance_id: 'test-instance',
          state: 'stopped',
          region: 'iad',
          events: [{ type: 'exit', exit_code: 2 }],
        })
      }),
    )

    const eventPublisher = createMockEventPublisher()
    const contentLoader = createMockContentLoader()
    ;(contentLoader.loadAcceptanceCriteria as ReturnType<typeof vi.fn>).mockResolvedValue([
      { name: 'put-and-get', order: 1, assertion: { type: 'stdout-contains', expected: 'PASS' } },
      { name: 'exit-clean', order: 2, assertion: { type: 'exit-code-equals', expected: 0 } },
    ])

    const flyClient = new FlyClient({
      apiToken: FLY_API_TOKEN,
      appName: FLY_APP_NAME,
      baseUrl: FLY_BASE_URL,
    })

    const processor = createExecutionProcessor({
      flyClient,
      flyConfig,
      db,
      eventPublisher,
      logger,
      flyApiToken: FLY_API_TOKEN,
      flyAppName: FLY_APP_NAME,
      contentLoader,
    })

    await processor(createTestJob())

    const publishCalls = (eventPublisher.publish as ReturnType<typeof vi.fn>).mock.calls as Array<[string, { type: string; results?: ReadonlyArray<{ status: string }> }]>
    const criteriaEvent = publishCalls.find((call) => call[1].type === 'criteria_results')
    expect(criteriaEvent).toBeDefined()
    const results = criteriaEvent![1].results!
    expect(results).toHaveLength(2)
    expect(results.every((r) => r.status === 'not-met')).toBe(true)

    await db.deleteFrom('milestones').where('id', '=', 'ms-1').execute()
    await db.deleteFrom('tracks').where('id', '=', 'track-1').execute()
  })

  it('should gracefully skip criteria evaluation when milestone not found', async () => {
    await seedUserAndSubmission()

    const eventPublisher = createMockEventPublisher()
    const contentLoader = createMockContentLoader()

    const flyClient = new FlyClient({
      apiToken: FLY_API_TOKEN,
      appName: FLY_APP_NAME,
      baseUrl: FLY_BASE_URL,
    })

    const processor = createExecutionProcessor({
      flyClient,
      flyConfig,
      db,
      eventPublisher,
      logger,
      flyApiToken: FLY_API_TOKEN,
      flyAppName: FLY_APP_NAME,
      contentLoader,
    })

    await processor(createTestJob())

    // Should NOT have called loadAcceptanceCriteria (milestone not found)
    expect(contentLoader.loadAcceptanceCriteria).not.toHaveBeenCalled()

    // Should still complete successfully
    const row = await db
      .selectFrom('submissions')
      .selectAll()
      .where('id', '=', TEST_SUBMISSION_ID)
      .executeTakeFirst()
    expect(row?.status).toBe('completed')
  })

  it('should skip benchmark phase when loadBenchmarkConfig returns null', async () => {
    await db
      .insertInto('tracks')
      .values({ id: 'track-1', name: 'Test Track', slug: 'test-track' })
      .onConflict((oc) => oc.column('id').doNothing())
      .execute()
    await db
      .insertInto('milestones')
      .values({ id: 'ms-1', track_id: 'track-1', slug: '01-kv-store', title: 'KV Store', position: 1 })
      .onConflict((oc) => oc.column('id').doNothing())
      .execute()
    await seedUserAndSubmission()

    const eventPublisher = createMockEventPublisher()
    const contentLoader = createMockContentLoader()
    ;(contentLoader.loadBenchmarkConfig as ReturnType<typeof vi.fn>).mockResolvedValue(null)

    const flyClient = new FlyClient({
      apiToken: FLY_API_TOKEN,
      appName: FLY_APP_NAME,
      baseUrl: FLY_BASE_URL,
    })

    const processor = createExecutionProcessor({
      flyClient,
      flyConfig,
      db,
      eventPublisher,
      logger,
      flyApiToken: FLY_API_TOKEN,
      flyAppName: FLY_APP_NAME,
      contentLoader,
    })

    await processor(createTestJob())

    // No benchmark_progress events should be published
    const publishCalls = (eventPublisher.publish as ReturnType<typeof vi.fn>).mock.calls as Array<[string, { type: string }]>
    const benchmarkEvents = publishCalls.filter((call) => call[1].type === 'benchmark_progress' || call[1].type === 'benchmark_result')
    expect(benchmarkEvents).toHaveLength(0)

    // Still completes successfully
    const row = await db.selectFrom('submissions').selectAll().where('id', '=', TEST_SUBMISSION_ID).executeTakeFirst()
    expect(row?.status).toBe('completed')

    await db.deleteFrom('milestones').where('id', '=', 'ms-1').execute()
    await db.deleteFrom('tracks').where('id', '=', 'track-1').execute()
  })

  it('should skip benchmark phase when benchmarks array is empty', async () => {
    await db
      .insertInto('tracks')
      .values({ id: 'track-1', name: 'Test Track', slug: 'test-track' })
      .onConflict((oc) => oc.column('id').doNothing())
      .execute()
    await db
      .insertInto('milestones')
      .values({ id: 'ms-1', track_id: 'track-1', slug: '01-kv-store', title: 'KV Store', position: 1 })
      .onConflict((oc) => oc.column('id').doNothing())
      .execute()
    await seedUserAndSubmission()

    const eventPublisher = createMockEventPublisher()
    const contentLoader = createMockContentLoader()
    ;(contentLoader.loadBenchmarkConfig as ReturnType<typeof vi.fn>).mockResolvedValue({ benchmarks: [] })

    const flyClient = new FlyClient({
      apiToken: FLY_API_TOKEN,
      appName: FLY_APP_NAME,
      baseUrl: FLY_BASE_URL,
    })

    const processor = createExecutionProcessor({
      flyClient,
      flyConfig,
      db,
      eventPublisher,
      logger,
      flyApiToken: FLY_API_TOKEN,
      flyAppName: FLY_APP_NAME,
      contentLoader,
    })

    await processor(createTestJob())

    const publishCalls = (eventPublisher.publish as ReturnType<typeof vi.fn>).mock.calls as Array<[string, { type: string }]>
    const benchmarkEvents = publishCalls.filter((call) => call[1].type === 'benchmark_progress' || call[1].type === 'benchmark_result')
    expect(benchmarkEvents).toHaveLength(0)

    const row = await db.selectFrom('submissions').selectAll().where('id', '=', TEST_SUBMISSION_ID).executeTakeFirst()
    expect(row?.status).toBe('completed')

    await db.deleteFrom('milestones').where('id', '=', 'ms-1').execute()
    await db.deleteFrom('tracks').where('id', '=', 'track-1').execute()
  })

  it('should not run benchmarks when compilation fails', async () => {
    await db
      .insertInto('tracks')
      .values({ id: 'track-1', name: 'Test Track', slug: 'test-track' })
      .onConflict((oc) => oc.column('id').doNothing())
      .execute()
    await db
      .insertInto('milestones')
      .values({ id: 'ms-1', track_id: 'track-1', slug: '01-kv-store', title: 'KV Store', position: 1 })
      .onConflict((oc) => oc.column('id').doNothing())
      .execute()
    await seedUserAndSubmission()

    // Override logs to return Go compilation error
    server.use(
      http.get(`${FLY_LOGS_BASE}/api/v1/apps/${FLY_APP_NAME}/logs`, () => {
        return new HttpResponse(
          '{"timestamp":"2026-03-01T00:00:01Z","message":"./main.go:5:2: undefined: x","level":"info"}\n',
          { status: 200 }
        )
      }),
      http.get(`${FLY_BASE_URL}/v1/apps/${FLY_APP_NAME}/machines/:machineId`, () => {
        return HttpResponse.json({
          id: 'test-machine-id',
          instance_id: 'test-instance',
          state: 'stopped',
          region: 'iad',
          events: [{ type: 'exit', exit_code: 2 }],
        })
      }),
    )

    const eventPublisher = createMockEventPublisher()
    const contentLoader = createMockContentLoader()
    ;(contentLoader.loadBenchmarkConfig as ReturnType<typeof vi.fn>).mockResolvedValue({
      benchmarks: [{ name: 'test-bench', warmupIterations: 2, measuredIterations: 10, workload: { type: 'inserts', numOperations: 100 }, targetMetrics: { opsPerSec: 100 } }],
    })

    const flyClient = new FlyClient({
      apiToken: FLY_API_TOKEN,
      appName: FLY_APP_NAME,
      baseUrl: FLY_BASE_URL,
    })

    const processor = createExecutionProcessor({
      flyClient,
      flyConfig,
      db,
      eventPublisher,
      logger,
      flyApiToken: FLY_API_TOKEN,
      flyAppName: FLY_APP_NAME,
      contentLoader,
    })

    await processor(createTestJob())

    // Benchmark should NOT have been loaded (compilation failed = user error)
    expect(contentLoader.loadBenchmarkConfig).not.toHaveBeenCalled()

    const row = await db.selectFrom('submissions').selectAll().where('id', '=', TEST_SUBMISSION_ID).executeTakeFirst()
    expect(row?.status).toBe('failed')

    await db.deleteFrom('milestones').where('id', '=', 'ms-1').execute()
    await db.deleteFrom('tracks').where('id', '=', 'track-1').execute()
  })

  // ── Benchmark positive-path tests (using injected runBenchmark) ──

  const BENCHMARK_FIXTURE_STDOUT = [
    '{"type":"benchmark_iteration","target":"user","iteration":1,"total":12,"ops_per_sec":8500,"p50_latency_us":117,"p99_latency_us":450}',
    '{"type":"benchmark_iteration","target":"reference","iteration":1,"total":12,"ops_per_sec":10200,"p50_latency_us":98,"p99_latency_us":380}',
    '{"type":"benchmark_iteration","target":"user","iteration":2,"total":12,"ops_per_sec":8700,"p50_latency_us":115,"p99_latency_us":440}',
    '{"type":"benchmark_iteration","target":"reference","iteration":2,"total":12,"ops_per_sec":10100,"p50_latency_us":99,"p99_latency_us":385}',
    '{"type":"benchmark_complete","user_median_ops":8200,"reference_median_ops":10100,"normalized_ratio":0.8119,"user_p50_us":120,"user_p99_us":445,"ref_p50_us":100,"ref_p99_us":385}',
  ].join('\n')

  function createMockRunBenchmark(stdout: string = BENCHMARK_FIXTURE_STDOUT): RunBenchmarkFn {
    return vi.fn().mockResolvedValue(stdout)
  }

  async function seedMilestoneWithBenchmarkConfig(contentLoader: ContentLoader) {
    await db
      .insertInto('tracks')
      .values({ id: 'track-1', name: 'Test Track', slug: 'test-track' })
      .onConflict((oc) => oc.column('id').doNothing())
      .execute()
    await db
      .insertInto('milestones')
      .values({ id: 'ms-1', track_id: 'track-1', slug: '01-kv-store', title: 'KV Store', position: 1 })
      .onConflict((oc) => oc.column('id').doNothing())
      .execute()
    ;(contentLoader.loadBenchmarkConfig as ReturnType<typeof vi.fn>).mockResolvedValue({
      benchmarks: [{
        name: 'sequential-inserts',
        warmupIterations: 2,
        measuredIterations: 10,
        referenceVersion: 'milestone-1-v1',
        workload: { type: 'inserts', numOperations: 1000, keySizeBytes: 16, valueSizeBytes: 64 },
        targetMetrics: { opsPerSec: 100 },
      }],
    })
  }

  async function cleanupMilestone() {
    await db.deleteFrom('benchmark_results').where('user_id', '=', TEST_UID).execute()
    await db.deleteFrom('milestones').where('id', '=', 'ms-1').execute()
    await db.deleteFrom('tracks').where('id', '=', 'track-1').execute()
  }

  it('should run benchmark phase after successful compilation and tests pass', async () => {
    await seedUserAndSubmission()
    const eventPublisher = createMockEventPublisher()
    const contentLoader = createMockContentLoader()
    await seedMilestoneWithBenchmarkConfig(contentLoader)
    const runBenchmark = createMockRunBenchmark()

    const flyClient = new FlyClient({ apiToken: FLY_API_TOKEN, appName: FLY_APP_NAME, baseUrl: FLY_BASE_URL })
    const processor = createExecutionProcessor({
      flyClient, flyConfig, db, eventPublisher, logger,
      flyApiToken: FLY_API_TOKEN, flyAppName: FLY_APP_NAME,
      contentLoader, runBenchmark,
    })

    await processor(createTestJob())

    // runBenchmark should have been called
    expect(runBenchmark).toHaveBeenCalledTimes(1)

    // Should have published benchmark_progress and benchmark_result events
    const publishCalls = (eventPublisher.publish as ReturnType<typeof vi.fn>).mock.calls as Array<[string, { type: string }]>
    const progressEvents = publishCalls.filter((call) => call[1].type === 'benchmark_progress')
    const resultEvents = publishCalls.filter((call) => call[1].type === 'benchmark_result')
    expect(progressEvents.length).toBeGreaterThanOrEqual(1)
    expect(resultEvents).toHaveLength(1)

    const row = await db.selectFrom('submissions').selectAll().where('id', '=', TEST_SUBMISSION_ID).executeTakeFirst()
    expect(row?.status).toBe('completed')

    await cleanupMilestone()
  })

  it('should persist benchmark results to benchmark_results table with correct fields', async () => {
    await seedUserAndSubmission()
    const eventPublisher = createMockEventPublisher()
    const contentLoader = createMockContentLoader()
    await seedMilestoneWithBenchmarkConfig(contentLoader)
    const runBenchmark = createMockRunBenchmark()

    const flyClient = new FlyClient({ apiToken: FLY_API_TOKEN, appName: FLY_APP_NAME, baseUrl: FLY_BASE_URL })
    const processor = createExecutionProcessor({
      flyClient, flyConfig, db, eventPublisher, logger,
      flyApiToken: FLY_API_TOKEN, flyAppName: FLY_APP_NAME,
      contentLoader, runBenchmark,
    })

    await processor(createTestJob())

    const benchRow = await db
      .selectFrom('benchmark_results')
      .selectAll()
      .where('submission_id', '=', TEST_SUBMISSION_ID)
      .executeTakeFirst()

    expect(benchRow).toBeDefined()
    expect(benchRow!.user_id).toBe(TEST_UID)
    expect(benchRow!.milestone_id).toBe('ms-1')
    expect(benchRow!.benchmark_name).toBe('sequential-inserts')
    expect(benchRow!.reference_version).toBe('milestone-1-v1')
    // normalized_ratio is numeric(8,4) → Kysely returns string
    expect(parseFloat(String(benchRow!.normalized_ratio))).toBeCloseTo(0.8119, 3)

    await cleanupMilestone()
  })

  it('should publish benchmark_progress events with iteration counts', async () => {
    await seedUserAndSubmission()
    const eventPublisher = createMockEventPublisher()
    const contentLoader = createMockContentLoader()
    await seedMilestoneWithBenchmarkConfig(contentLoader)
    const runBenchmark = createMockRunBenchmark()

    const flyClient = new FlyClient({ apiToken: FLY_API_TOKEN, appName: FLY_APP_NAME, baseUrl: FLY_BASE_URL })
    const processor = createExecutionProcessor({
      flyClient, flyConfig, db, eventPublisher, logger,
      flyApiToken: FLY_API_TOKEN, flyAppName: FLY_APP_NAME,
      contentLoader, runBenchmark,
    })

    await processor(createTestJob())

    const publishCalls = (eventPublisher.publish as ReturnType<typeof vi.fn>).mock.calls as Array<[string, { type: string; iteration?: number; total?: number; data?: string }]>
    const progressEvent = publishCalls.find((call) => call[1].type === 'benchmark_progress')
    expect(progressEvent).toBeDefined()
    expect(progressEvent![1].iteration).toBe(0)
    expect(progressEvent![1].total).toBe(12) // warmup(2) + measured(10)
    expect(progressEvent![1].data).toContain('sequential-inserts')

    await cleanupMilestone()
  })

  it('should publish benchmark_result event with correct metrics including opsPerSec', async () => {
    await seedUserAndSubmission()
    const eventPublisher = createMockEventPublisher()
    const contentLoader = createMockContentLoader()
    await seedMilestoneWithBenchmarkConfig(contentLoader)
    const runBenchmark = createMockRunBenchmark()

    const flyClient = new FlyClient({ apiToken: FLY_API_TOKEN, appName: FLY_APP_NAME, baseUrl: FLY_BASE_URL })
    const processor = createExecutionProcessor({
      flyClient, flyConfig, db, eventPublisher, logger,
      flyApiToken: FLY_API_TOKEN, flyAppName: FLY_APP_NAME,
      contentLoader, runBenchmark,
    })

    await processor(createTestJob())

    const publishCalls = (eventPublisher.publish as ReturnType<typeof vi.fn>).mock.calls as Array<[string, { type: string; userMedian?: number; referenceMedian?: number; normalizedRatio?: number; opsPerSec?: number }]>
    const resultEvent = publishCalls.find((call) => call[1].type === 'benchmark_result')
    expect(resultEvent).toBeDefined()
    expect(resultEvent![1].userMedian).toBe(8200)
    expect(resultEvent![1].referenceMedian).toBe(10100)
    expect(resultEvent![1].normalizedRatio).toBeCloseTo(0.8119, 3)
    expect(resultEvent![1].opsPerSec).toBe(8200)

    await cleanupMilestone()
  })

  it('should handle benchmark timeout gracefully — submission still completes', async () => {
    await seedUserAndSubmission()
    const eventPublisher = createMockEventPublisher()
    const contentLoader = createMockContentLoader()
    await seedMilestoneWithBenchmarkConfig(contentLoader)
    const runBenchmark: RunBenchmarkFn = vi.fn().mockRejectedValue(new Error('Operation timed out after 60s'))

    const flyClient = new FlyClient({ apiToken: FLY_API_TOKEN, appName: FLY_APP_NAME, baseUrl: FLY_BASE_URL })
    const processor = createExecutionProcessor({
      flyClient, flyConfig, db, eventPublisher, logger,
      flyApiToken: FLY_API_TOKEN, flyAppName: FLY_APP_NAME,
      contentLoader, runBenchmark,
    })

    await processor(createTestJob())

    // Submission still completes (benchmark failure doesn't crash the submission)
    const row = await db.selectFrom('submissions').selectAll().where('id', '=', TEST_SUBMISSION_ID).executeTakeFirst()
    expect(row?.status).toBe('completed')

    // No benchmark_result event (benchmark failed)
    const publishCalls = (eventPublisher.publish as ReturnType<typeof vi.fn>).mock.calls as Array<[string, { type: string }]>
    const resultEvents = publishCalls.filter((call) => call[1].type === 'benchmark_result')
    expect(resultEvents).toHaveLength(0)

    await cleanupMilestone()
  })

  it('should not run benchmarks when tests fail (runtime error)', async () => {
    await db
      .insertInto('tracks')
      .values({ id: 'track-1', name: 'Test Track', slug: 'test-track' })
      .onConflict((oc) => oc.column('id').doNothing())
      .execute()
    await db
      .insertInto('milestones')
      .values({ id: 'ms-1', track_id: 'track-1', slug: '01-kv-store', title: 'KV Store', position: 1 })
      .onConflict((oc) => oc.column('id').doNothing())
      .execute()
    await seedUserAndSubmission()

    // Simulate runtime error — non-zero exit code, no Go error patterns (compilation succeeded but tests failed)
    server.use(
      http.get(`${FLY_LOGS_BASE}/api/v1/apps/${FLY_APP_NAME}/logs`, () => {
        return new HttpResponse(
          '{"timestamp":"2026-03-01T00:00:01Z","message":"FAIL: test-case-1","level":"info"}\n',
          { status: 200 }
        )
      }),
      http.get(`${FLY_BASE_URL}/v1/apps/${FLY_APP_NAME}/machines/:machineId`, () => {
        return HttpResponse.json({
          id: 'test-machine-id',
          instance_id: 'test-instance',
          state: 'stopped',
          region: 'iad',
          events: [{ type: 'exit', exit_code: 1 }],
        })
      }),
    )

    const eventPublisher = createMockEventPublisher()
    const contentLoader = createMockContentLoader()
    ;(contentLoader.loadBenchmarkConfig as ReturnType<typeof vi.fn>).mockResolvedValue({
      benchmarks: [{ name: 'test-bench', warmupIterations: 2, measuredIterations: 10, workload: { type: 'inserts', numOperations: 100 }, targetMetrics: { opsPerSec: 100 } }],
    })
    const runBenchmark = createMockRunBenchmark()

    const flyClient = new FlyClient({ apiToken: FLY_API_TOKEN, appName: FLY_APP_NAME, baseUrl: FLY_BASE_URL })
    const processor = createExecutionProcessor({
      flyClient, flyConfig, db, eventPublisher, logger,
      flyApiToken: FLY_API_TOKEN, flyAppName: FLY_APP_NAME,
      contentLoader, runBenchmark,
    })

    await processor(createTestJob())

    // runBenchmark should NOT have been called (user error = runtime failure)
    expect(runBenchmark).not.toHaveBeenCalled()

    const row = await db.selectFrom('submissions').selectAll().where('id', '=', TEST_SUBMISSION_ID).executeTakeFirst()
    expect(row?.status).toBe('failed')

    await cleanupMilestone()
  })

  it('should execute and persist multiple benchmarks from benchmarks array', async () => {
    await seedUserAndSubmission()
    const eventPublisher = createMockEventPublisher()
    const contentLoader = createMockContentLoader()

    await db
      .insertInto('tracks')
      .values({ id: 'track-1', name: 'Test Track', slug: 'test-track' })
      .onConflict((oc) => oc.column('id').doNothing())
      .execute()
    await db
      .insertInto('milestones')
      .values({ id: 'ms-1', track_id: 'track-1', slug: '01-kv-store', title: 'KV Store', position: 1 })
      .onConflict((oc) => oc.column('id').doNothing())
      .execute()

    // Two benchmarks in the array
    ;(contentLoader.loadBenchmarkConfig as ReturnType<typeof vi.fn>).mockResolvedValue({
      benchmarks: [
        { name: 'sequential-inserts', warmupIterations: 2, measuredIterations: 10, referenceVersion: 'v1', workload: { type: 'inserts', numOperations: 1000 }, targetMetrics: { opsPerSec: 100 } },
        { name: 'random-reads', warmupIterations: 2, measuredIterations: 10, referenceVersion: 'v1', workload: { type: 'reads', numOperations: 1000 }, targetMetrics: { opsPerSec: 200 } },
      ],
    })

    const runBenchmark = createMockRunBenchmark()

    const flyClient = new FlyClient({ apiToken: FLY_API_TOKEN, appName: FLY_APP_NAME, baseUrl: FLY_BASE_URL })
    const processor = createExecutionProcessor({
      flyClient, flyConfig, db, eventPublisher, logger,
      flyApiToken: FLY_API_TOKEN, flyAppName: FLY_APP_NAME,
      contentLoader, runBenchmark,
    })

    await processor(createTestJob())

    // runBenchmark called twice (once per benchmark)
    expect(runBenchmark).toHaveBeenCalledTimes(2)

    // Two benchmark_result events published
    const publishCalls = (eventPublisher.publish as ReturnType<typeof vi.fn>).mock.calls as Array<[string, { type: string }]>
    const resultEvents = publishCalls.filter((call) => call[1].type === 'benchmark_result')
    expect(resultEvents).toHaveLength(2)

    // Two rows in benchmark_results table
    const rows = await db
      .selectFrom('benchmark_results')
      .selectAll()
      .where('submission_id', '=', TEST_SUBMISSION_ID)
      .execute()
    expect(rows).toHaveLength(2)
    const names = rows.map((r) => r.benchmark_name).sort()
    expect(names).toEqual(['random-reads', 'sequential-inserts'])

    await cleanupMilestone()
  })

  it('should handle missing reference implementation files gracefully', async () => {
    await db
      .insertInto('tracks')
      .values({ id: 'track-1', name: 'Test Track', slug: 'test-track' })
      .onConflict((oc) => oc.column('id').doNothing())
      .execute()
    await db
      .insertInto('milestones')
      .values({ id: 'ms-1', track_id: 'track-1', slug: 'nonexistent-milestone', title: 'Test', position: 1 })
      .onConflict((oc) => oc.column('id').doNothing())
      .execute()
    await seedUserAndSubmission()

    const eventPublisher = createMockEventPublisher()
    const contentLoader = createMockContentLoader()
    ;(contentLoader.loadBenchmarkConfig as ReturnType<typeof vi.fn>).mockResolvedValue({
      benchmarks: [{ name: 'test-bench', warmupIterations: 2, measuredIterations: 10, workload: { type: 'inserts', numOperations: 100 }, targetMetrics: { opsPerSec: 100 } }],
    })

    const flyClient = new FlyClient({
      apiToken: FLY_API_TOKEN,
      appName: FLY_APP_NAME,
      baseUrl: FLY_BASE_URL,
    })

    const processor = createExecutionProcessor({
      flyClient,
      flyConfig,
      db,
      eventPublisher,
      logger,
      flyApiToken: FLY_API_TOKEN,
      flyAppName: FLY_APP_NAME,
      contentLoader,
    })

    // Should not crash — benchmark gracefully skipped
    await processor(createTestJob())

    // No benchmark events published (reference files missing)
    const publishCalls = (eventPublisher.publish as ReturnType<typeof vi.fn>).mock.calls as Array<[string, { type: string }]>
    const benchmarkEvents = publishCalls.filter((call) => call[1].type === 'benchmark_progress' || call[1].type === 'benchmark_result')
    expect(benchmarkEvents).toHaveLength(0)

    // Submission still completes successfully
    const row = await db.selectFrom('submissions').selectAll().where('id', '=', TEST_SUBMISSION_ID).executeTakeFirst()
    expect(row?.status).toBe('completed')

    await db.deleteFrom('milestones').where('id', '=', 'ms-1').execute()
    await db.deleteFrom('tracks').where('id', '=', 'track-1').execute()
  })
})
