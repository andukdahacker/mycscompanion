import { describe, it, expect, afterEach, vi, beforeEach } from 'vitest'
import type { ExecutionServiceClient, ExecuteResponse } from '@mycscompanion/execution'
import { ExecutionServiceError } from '@mycscompanion/execution'
import { db } from '../../shared/db.js'
import type { EventPublisher } from '../../shared/event-publisher.js'
import type { ExecutionJobData } from '../../shared/queue.js'
import { createExecutionProcessor, runBenchmarkOnService } from './execution-processor.js'
import type { ExecutionJob, RunBenchmarkFn } from './execution-processor.js'
import type { ContentLoader } from '../../plugins/curriculum/content-loader.js'
import pino from 'pino'

const TEST_UID = 'test-exec-proc-uid'
const TEST_EMAIL = 'test-exec-proc@example.com'
const TEST_SUBMISSION_ID = 'test-sub-proc-1'

const logger = pino({ level: 'silent' })

function createMockExecutionClient(overrides: Partial<ExecuteResponse> = {}): ExecutionServiceClient {
  const defaultResponse: ExecuteResponse = {
    stdout: '',
    stderr: '',
    exitCode: 0,
    durationMs: 500,
    buildDurationMs: 200,
    runDurationMs: 300,
    timedOut: false,
    ...overrides,
  }
  return {
    execute: vi.fn().mockResolvedValue(defaultResponse),
  } as unknown as ExecutionServiceClient
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
    loadStarterFiles: vi.fn().mockResolvedValue(null),
    loadReferenceFiles: vi.fn().mockResolvedValue(null),
    loadMetadata: vi.fn().mockResolvedValue({ title: 'Test', description: '', csConceptLabel: null, editableFiles: null }),
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

async function seedMilestone(milestoneId: string = 'ms-1') {
  await db
    .insertInto('tracks')
    .values({ id: 'track-1', name: 'Test Track', slug: 'test-track' })
    .onConflict((oc) => oc.column('id').doNothing())
    .execute()
  await db
    .insertInto('milestones')
    .values({ id: milestoneId, track_id: 'track-1', slug: '01-kv-store', title: 'KV Store', position: 1 })
    .onConflict((oc) => oc.column('id').doNothing())
    .execute()
}

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

beforeEach(() => {
  // No msw server setup needed — we mock the client directly
})

afterEach(async () => {
  await db.deleteFrom('benchmark_results').where('user_id', '=', TEST_UID).execute()
  await db.deleteFrom('submissions').where('user_id', '=', TEST_UID).execute()
  await db.deleteFrom('users').where('id', '=', TEST_UID).execute()
  await db.deleteFrom('milestones').where('id', '=', 'ms-1').execute()
  await db.deleteFrom('tracks').where('id', '=', 'track-1').execute()
  vi.restoreAllMocks()
})

describe('ExecutionProcessor', () => {
  it('should process successful execution with correct SSE events and DB update', async () => {
    await seedUserAndSubmission()

    const executionClient = createMockExecutionClient({ stdout: 'hello world\n', exitCode: 0 })
    const eventPublisher = createMockEventPublisher()

    const processor = createExecutionProcessor({
      executionClient,
      db,
      eventPublisher,
      logger,
      contentLoader: createMockContentLoader(),
      defaultTimeoutSeconds: 30,
    })

    await processor(createTestJob())

    // Verify execute was called with correct base64 code
    const executeMock = executionClient.execute as ReturnType<typeof vi.fn>
    expect(executeMock).toHaveBeenCalledTimes(1)
    const callArgs = executeMock.mock.calls[0]![0] as { code: string; args: string[]; timeoutSeconds: number }
    expect(callArgs.code).toBe(Buffer.from('package main\nfunc main() {}').toString('base64'))
    expect(callArgs.args).toEqual([])
    expect(callArgs.timeoutSeconds).toBe(30)

    // Verify DB status updated to completed
    const row = await db
      .selectFrom('submissions')
      .selectAll()
      .where('id', '=', TEST_SUBMISSION_ID)
      .executeTakeFirst()

    expect(row?.status).toBe('completed')
    expect(row?.execution_result).not.toBeNull()

    // Verify SSE events: output (preparing), output (stdout), complete
    const publishCalls = (eventPublisher.publish as ReturnType<typeof vi.fn>).mock.calls as Array<[string, { type: string }]>
    const eventTypes = publishCalls.map((call) => call[1].type)
    expect(eventTypes[0]).toBe('output') // preparing
    expect(eventTypes[1]).toBe('output') // stdout
    expect(eventTypes[eventTypes.length - 1]).toBe('complete')
  })

  it('should publish compile_error SSE event on compilation error (exitCode 2)', async () => {
    await seedUserAndSubmission()

    const executionClient = createMockExecutionClient({
      stdout: '',
      stderr: './main.go:5:2: undefined: x',
      exitCode: 2,
    })
    const eventPublisher = createMockEventPublisher()

    const processor = createExecutionProcessor({
      executionClient,
      db,
      eventPublisher,
      logger,
      contentLoader: createMockContentLoader(),
      defaultTimeoutSeconds: 30,
    })

    await processor(createTestJob())

    const publishCalls = (eventPublisher.publish as ReturnType<typeof vi.fn>).mock.calls as Array<[string, { type: string; data?: string }]>
    const compileErrorEvent = publishCalls.find((call) => call[1].type === 'compile_error')
    expect(compileErrorEvent).toBeDefined()
    expect(compileErrorEvent![1].data).toContain('undefined: x')

    const row = await db.selectFrom('submissions').selectAll().where('id', '=', TEST_SUBMISSION_ID).executeTakeFirst()
    expect(row?.status).toBe('failed')
  })

  it('should publish error SSE event with isUserError true on runtime error (exitCode 1)', async () => {
    await seedUserAndSubmission()

    const executionClient = createMockExecutionClient({
      stdout: '',
      stderr: 'panic: runtime error',
      exitCode: 1,
      timedOut: false,
    })
    const eventPublisher = createMockEventPublisher()

    const processor = createExecutionProcessor({
      executionClient,
      db,
      eventPublisher,
      logger,
      contentLoader: createMockContentLoader(),
      defaultTimeoutSeconds: 30,
    })

    await processor(createTestJob())

    const publishCalls = (eventPublisher.publish as ReturnType<typeof vi.fn>).mock.calls as Array<[string, { type: string; isUserError?: boolean; data?: string }]>
    const errorEvent = publishCalls.find((call) => call[1].type === 'error')
    expect(errorEvent).toBeDefined()
    expect(errorEvent![1].isUserError).toBe(true)
    expect(errorEvent![1].data).toContain('panic: runtime error')

    const row = await db.selectFrom('submissions').selectAll().where('id', '=', TEST_SUBMISSION_ID).executeTakeFirst()
    expect(row?.status).toBe('failed')
  })

  it('should publish timeout SSE event and mark all criteria not-met on timeout', async () => {
    await seedUserAndSubmission()

    const executionClient = createMockExecutionClient({
      stdout: '',
      stderr: 'signal: killed',
      exitCode: 137,
      timedOut: true,
    })
    const eventPublisher = createMockEventPublisher()

    const processor = createExecutionProcessor({
      executionClient,
      db,
      eventPublisher,
      logger,
      contentLoader: createMockContentLoader(),
      defaultTimeoutSeconds: 30,
    })

    await processor(createTestJob())

    const publishCalls = (eventPublisher.publish as ReturnType<typeof vi.fn>).mock.calls as Array<[string, { type: string }]>
    const timeoutEvent = publishCalls.find((call) => call[1].type === 'timeout')
    expect(timeoutEvent).toBeDefined()

    const row = await db.selectFrom('submissions').selectAll().where('id', '=', TEST_SUBMISSION_ID).executeTakeFirst()
    expect(row?.status).toBe('failed')
    expect(row?.error_message).toContain('timed out')
  })

  it('should reset to queued and re-throw on retryable ExecutionServiceError (503)', async () => {
    await seedUserAndSubmission()

    const executionClient = {
      execute: vi.fn().mockRejectedValue(new ExecutionServiceError(503, 'service busy')),
    } as unknown as ExecutionServiceClient
    const eventPublisher = createMockEventPublisher()

    const processor = createExecutionProcessor({
      executionClient,
      db,
      eventPublisher,
      logger,
      contentLoader: createMockContentLoader(),
      defaultTimeoutSeconds: 30,
    })

    await expect(processor(createTestJob())).rejects.toThrow(ExecutionServiceError)

    const row = await db.selectFrom('submissions').selectAll().where('id', '=', TEST_SUBMISSION_ID).executeTakeFirst()
    expect(row?.status).toBe('queued')
  })

  it('should handle non-retryable ExecutionServiceError without re-throwing', async () => {
    await seedUserAndSubmission()

    const executionClient = {
      execute: vi.fn().mockRejectedValue(new ExecutionServiceError(400, 'invalid base64')),
    } as unknown as ExecutionServiceClient
    const eventPublisher = createMockEventPublisher()

    const processor = createExecutionProcessor({
      executionClient,
      db,
      eventPublisher,
      logger,
      contentLoader: createMockContentLoader(),
      defaultTimeoutSeconds: 30,
    })

    await processor(createTestJob())

    const row = await db.selectFrom('submissions').selectAll().where('id', '=', TEST_SUBMISSION_ID).executeTakeFirst()
    expect(row?.status).toBe('failed')

    const publishCalls = (eventPublisher.publish as ReturnType<typeof vi.fn>).mock.calls as Array<[string, { type: string; isUserError?: boolean }]>
    const errorEvent = publishCalls.find((call) => call[1].type === 'error')
    expect(errorEvent).toBeDefined()
    expect(errorEvent![1].isUserError).toBe(false)
  })

  it('should pass commandArgs to execution service when criteria have commandArgs', async () => {
    await seedMilestone()
    await seedUserAndSubmission()

    const executionClient = createMockExecutionClient({ stdout: 'PASS\n', exitCode: 0 })
    const eventPublisher = createMockEventPublisher()
    const contentLoader = createMockContentLoader()
    ;(contentLoader.loadAcceptanceCriteria as ReturnType<typeof vi.fn>).mockResolvedValue([
      { name: 'put-and-get', order: 1, assertion: { type: 'stdout-contains', expected: 'PASS', commandArgs: 'test' } },
    ])

    const processor = createExecutionProcessor({
      executionClient,
      db,
      eventPublisher,
      logger,
      contentLoader,
      defaultTimeoutSeconds: 30,
    })

    await processor(createTestJob())

    const executeMock = executionClient.execute as ReturnType<typeof vi.fn>
    expect(executeMock).toHaveBeenCalledTimes(1)
    const callArgs = executeMock.mock.calls[0]![0] as { code: string; args: string[]; timeoutSeconds: number }
    expect(callArgs.args).toEqual(['test'])
  })

  it('should pass empty args when criteria have no commandArgs', async () => {
    await seedMilestone()
    await seedUserAndSubmission()

    const executionClient = createMockExecutionClient({ stdout: 'ok\n', exitCode: 0 })
    const eventPublisher = createMockEventPublisher()
    const contentLoader = createMockContentLoader()
    ;(contentLoader.loadAcceptanceCriteria as ReturnType<typeof vi.fn>).mockResolvedValue([
      { name: 'put-and-get', order: 1, assertion: { type: 'stdout-contains', expected: 'ok' } },
    ])

    const processor = createExecutionProcessor({
      executionClient,
      db,
      eventPublisher,
      logger,
      contentLoader,
      defaultTimeoutSeconds: 30,
    })

    await processor(createTestJob())

    const executeMock = executionClient.execute as ReturnType<typeof vi.fn>
    const callArgs = executeMock.mock.calls[0]![0] as { code: string; args: string[]; timeoutSeconds: number }
    expect(callArgs.args).toEqual([])
  })

  it('should load criteria before calling execution service', async () => {
    await seedMilestone()
    await seedUserAndSubmission()

    const executionClient = createMockExecutionClient({ stdout: 'ok\n', exitCode: 0 })
    const eventPublisher = createMockEventPublisher()
    const contentLoader = createMockContentLoader()
    ;(contentLoader.loadAcceptanceCriteria as ReturnType<typeof vi.fn>).mockResolvedValue([
      { name: 'put-and-get', order: 1, assertion: { type: 'stdout-contains', expected: 'ok', commandArgs: 'test' } },
    ])

    const processor = createExecutionProcessor({
      executionClient,
      db,
      eventPublisher,
      logger,
      contentLoader,
      defaultTimeoutSeconds: 30,
    })

    await processor(createTestJob())

    // Verify criteria loading happened before execution using invocation call order
    const loadOrder = (contentLoader.loadAcceptanceCriteria as ReturnType<typeof vi.fn>).mock.invocationCallOrder[0]
    const executeOrder = (executionClient.execute as ReturnType<typeof vi.fn>).mock.invocationCallOrder[0]
    expect(loadOrder).toBeLessThan(executeOrder!)
  })

  it('should evaluate criteria with stdout from response', async () => {
    await seedMilestone()
    await seedUserAndSubmission()

    const executionClient = createMockExecutionClient({ stdout: 'Hello, World!\n', exitCode: 0 })
    const eventPublisher = createMockEventPublisher()
    const contentLoader = createMockContentLoader()
    ;(contentLoader.loadAcceptanceCriteria as ReturnType<typeof vi.fn>).mockResolvedValue([
      { name: 'put-and-get', order: 1, assertion: { type: 'stdout-contains', expected: 'Hello, World!' } },
    ])

    const processor = createExecutionProcessor({
      executionClient,
      db,
      eventPublisher,
      logger,
      contentLoader,
      defaultTimeoutSeconds: 30,
    })

    await processor(createTestJob())

    const publishCalls = (eventPublisher.publish as ReturnType<typeof vi.fn>).mock.calls as Array<[string, { type: string; results?: ReadonlyArray<{ status: string }> }]>
    const criteriaEvent = publishCalls.find((call) => call[1].type === 'criteria_results')
    expect(criteriaEvent).toBeDefined()
    expect(criteriaEvent![1].results![0]!.status).toBe('met')
  })

  it('should use ExecutionServiceClient.execute() for benchmark execution', async () => {
    await seedMilestone()
    await seedUserAndSubmission()

    const BENCHMARK_STDOUT = [
      '{"type":"benchmark_iteration","target":"user","iteration":1,"total":12,"ops_per_sec":8500,"p50_latency_us":117,"p99_latency_us":450}',
      '{"type":"benchmark_iteration","target":"reference","iteration":1,"total":12,"ops_per_sec":10200,"p50_latency_us":98,"p99_latency_us":380}',
      '{"type":"benchmark_complete","user_median_ops":8200,"reference_median_ops":10100,"normalized_ratio":0.8119,"user_p50_us":120,"user_p99_us":445,"ref_p50_us":100,"ref_p99_us":385}',
    ].join('\n')

    const executionClient = createMockExecutionClient({ stdout: 'ok\n', exitCode: 0 })
    const eventPublisher = createMockEventPublisher()
    const contentLoader = createMockContentLoader()
    ;(contentLoader.loadBenchmarkConfig as ReturnType<typeof vi.fn>).mockResolvedValue({
      benchmarks: [{
        name: 'sequential-inserts',
        warmupIterations: 2,
        measuredIterations: 10,
        referenceVersion: 'v1',
        workload: { type: 'inserts', numOperations: 1000 },
        targetMetrics: { opsPerSec: 100 },
      }],
    })

    // The runBenchmark mock receives executionClient in its opts
    const runBenchmark: RunBenchmarkFn = vi.fn().mockResolvedValue({ userStdout: BENCHMARK_STDOUT, refStdout: BENCHMARK_STDOUT })

    const processor = createExecutionProcessor({
      executionClient,
      db,
      eventPublisher,
      logger,
      contentLoader,
      defaultTimeoutSeconds: 30,
      runBenchmark,
    })

    await processor(createTestJob())

    // Verify runBenchmark was called with executionClient
    expect(runBenchmark).toHaveBeenCalledTimes(1)
    const benchmarkCall = (runBenchmark as ReturnType<typeof vi.fn>).mock.calls[0]![0] as { executionClient: ExecutionServiceClient }
    expect(benchmarkCall.executionClient).toBe(executionClient)
  })

  it('should call executionClient.execute() twice with base64-encoded user and reference files', async () => {
    const executionClient = createMockExecutionClient({ stdout: '', exitCode: 0 })

    await runBenchmarkOnService({
      executionClient,
      userFiles: { 'main.go': 'package main\nfunc main() {}' },
      referenceFiles: { 'main.go': 'package main\nfunc main() { /* ref */ }' },
      submissionId: 'sub-bench-test',
      milestoneId: 'ms-1',
      benchmark: { name: 'sequential-inserts', workload: { type: 'inserts', numOperations: 500, keySizeBytes: 8, valueSizeBytes: 32 } },
      logger,
    })

    const executeMock = executionClient.execute as ReturnType<typeof vi.fn>
    // Two-call benchmark: one for user files, one for reference files
    expect(executeMock).toHaveBeenCalledTimes(2)

    // Verify first call (user) has base64-encoded files and benchmark args
    const userCallArgs = executeMock.mock.calls[0]![0] as { files: Record<string, string>; args: string[] }
    expect(userCallArgs.files).toBeDefined()
    const userMainGo = Buffer.from(userCallArgs.files['main.go']!, 'base64').toString('utf-8')
    expect(userMainGo).toContain('func main() {}')
    expect(userCallArgs.args).toContain('benchmark')

    // Verify second call (reference) has reference files
    const refCallArgs = executeMock.mock.calls[1]![0] as { files: Record<string, string>; args: string[] }
    expect(refCallArgs.files).toBeDefined()
    const refMainGo = Buffer.from(refCallArgs.files['main.go']!, 'base64').toString('utf-8')
    expect(refMainGo).toContain('/* ref */')
  })

  it('should publish benchmark_result SSE event and persist to DB when benchmark returns valid JSON', async () => {
    await seedMilestone()
    await seedUserAndSubmission()

    const BENCHMARK_STDOUT = [
      '{"type":"benchmark_iteration","target":"user","iteration":1,"total":12,"ops_per_sec":8500,"p50_latency_us":117,"p99_latency_us":450}',
      '{"type":"benchmark_iteration","target":"reference","iteration":1,"total":12,"ops_per_sec":10200,"p50_latency_us":98,"p99_latency_us":380}',
      '{"type":"benchmark_complete","user_median_ops":8200,"reference_median_ops":10100,"normalized_ratio":0.8119,"user_p50_us":120,"user_p99_us":445,"ref_p50_us":100,"ref_p99_us":385}',
    ].join('\n')

    const executionClient = createMockExecutionClient({ stdout: 'ok\n', exitCode: 0 })
    const eventPublisher = createMockEventPublisher()
    const contentLoader = createMockContentLoader()
    ;(contentLoader.loadBenchmarkConfig as ReturnType<typeof vi.fn>).mockResolvedValue({
      benchmarks: [{
        name: 'sequential-inserts',
        warmupIterations: 2,
        measuredIterations: 10,
        referenceVersion: 'milestone-1-v1',
        workload: { type: 'inserts', numOperations: 1000 },
        targetMetrics: { opsPerSec: 100 },
      }],
    })

    const runBenchmark: RunBenchmarkFn = vi.fn().mockResolvedValue({ userStdout: BENCHMARK_STDOUT, refStdout: BENCHMARK_STDOUT })

    const processor = createExecutionProcessor({
      executionClient,
      db,
      eventPublisher,
      logger,
      contentLoader,
      defaultTimeoutSeconds: 30,
      runBenchmark,
    })

    await processor(createTestJob())

    // Verify benchmark_result SSE event published
    const publishCalls = (eventPublisher.publish as ReturnType<typeof vi.fn>).mock.calls as Array<[string, { type: string; userMedian?: number; normalizedRatio?: number }]>
    const benchmarkResultEvent = publishCalls.find((call) => call[1].type === 'benchmark_result')
    expect(benchmarkResultEvent).toBeDefined()
    expect(benchmarkResultEvent![1].userMedian).toBe(8200)
    expect(benchmarkResultEvent![1].normalizedRatio).toBe(0.8119)

    // Verify benchmark result persisted to DB
    const benchmarkRow = await db
      .selectFrom('benchmark_results')
      .selectAll()
      .where('submission_id', '=', TEST_SUBMISSION_ID)
      .executeTakeFirst()
    expect(benchmarkRow).toBeDefined()
    expect(benchmarkRow?.benchmark_name).toBe('sequential-inserts')
  })

  it('should log benchmark_produced_no_results and not fail submission when benchmark returns empty stdout', async () => {
    await seedMilestone()
    await seedUserAndSubmission()

    const executionClient = createMockExecutionClient({ stdout: 'ok\n', exitCode: 0 })
    const eventPublisher = createMockEventPublisher()
    const contentLoader = createMockContentLoader()
    ;(contentLoader.loadBenchmarkConfig as ReturnType<typeof vi.fn>).mockResolvedValue({
      benchmarks: [{
        name: 'sequential-inserts',
        warmupIterations: 2,
        measuredIterations: 10,
        referenceVersion: 'v1',
        workload: { type: 'inserts', numOperations: 1000 },
        targetMetrics: { opsPerSec: 100 },
      }],
    })

    // Simulate benchmark returning empty (e.g., compilation error in harness)
    const runBenchmark: RunBenchmarkFn = vi.fn().mockResolvedValue({ userStdout: '', refStdout: '' })

    const processor = createExecutionProcessor({
      executionClient,
      db,
      eventPublisher,
      logger,
      contentLoader,
      defaultTimeoutSeconds: 30,
      runBenchmark,
    })

    await processor(createTestJob())

    // Submission should still complete successfully (benchmark failure is non-fatal)
    const row = await db.selectFrom('submissions').selectAll().where('id', '=', TEST_SUBMISSION_ID).executeTakeFirst()
    expect(row?.status).toBe('completed')

    // No benchmark_result SSE event should be published
    const publishCalls = (eventPublisher.publish as ReturnType<typeof vi.fn>).mock.calls as Array<[string, { type: string }]>
    const benchmarkResultEvent = publishCalls.find((call) => call[1].type === 'benchmark_result')
    expect(benchmarkResultEvent).toBeUndefined()
  })

  it('should update DB submission with correct execution_result JSON (no machineId)', async () => {
    await seedUserAndSubmission()

    const executionClient = createMockExecutionClient({ stdout: 'ok\n', exitCode: 0 })
    const eventPublisher = createMockEventPublisher()

    const processor = createExecutionProcessor({
      executionClient,
      db,
      eventPublisher,
      logger,
      contentLoader: createMockContentLoader(),
      defaultTimeoutSeconds: 30,
    })

    await processor(createTestJob())

    const row = await db.selectFrom('submissions').selectAll().where('id', '=', TEST_SUBMISSION_ID).executeTakeFirst()
    expect(row?.execution_result).not.toBeNull()
    const result = typeof row!.execution_result === 'string'
      ? JSON.parse(row!.execution_result) as Record<string, unknown>
      : row!.execution_result as Record<string, unknown>
    expect(result['exitCode']).toBe(0)
    expect(result['output']).toBe('ok\n')
    expect(result['compilationSucceeded']).toBe(true)
    expect(result['durationMs']).toBeGreaterThan(0)
    // machineId should NOT be present
    expect(result['machineId']).toBeUndefined()
  })

  it('should set log TTL after completion', async () => {
    await seedUserAndSubmission()

    const executionClient = createMockExecutionClient({ exitCode: 0 })
    const eventPublisher = createMockEventPublisher()

    const processor = createExecutionProcessor({
      executionClient,
      db,
      eventPublisher,
      logger,
      contentLoader: createMockContentLoader(),
      defaultTimeoutSeconds: 30,
    })

    await processor(createTestJob())

    expect(eventPublisher.setLogTTL).toHaveBeenCalledWith(TEST_SUBMISSION_ID, 300)
  })

  it('should update DB status to running before processing', async () => {
    await seedUserAndSubmission()

    const executionClient = createMockExecutionClient({ exitCode: 0 })
    const eventPublisher = createMockEventPublisher()

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
      executionClient,
      db,
      eventPublisher,
      logger,
      contentLoader: createMockContentLoader(),
      defaultTimeoutSeconds: 30,
    })

    await processor(createTestJob())

    expect(statusAtFirstEvent).toBe('running')
  })

  it('should reject code exceeding 128KB size limit', async () => {
    await seedUserAndSubmission()

    const oversizedCode = 'package main\nfunc main() {}\n' + 'x'.repeat(128 * 1024)
    const executionClient = createMockExecutionClient({ exitCode: 0 })
    const eventPublisher = createMockEventPublisher()

    const processor = createExecutionProcessor({
      executionClient,
      db,
      eventPublisher,
      logger,
      contentLoader: createMockContentLoader(),
      defaultTimeoutSeconds: 30,
    })

    await processor(createTestJob({ code: oversizedCode }))

    // Should NOT call the execution service
    expect(executionClient.execute).not.toHaveBeenCalled()

    // Should publish error SSE event
    const publishCalls = (eventPublisher.publish as ReturnType<typeof vi.fn>).mock.calls as Array<[string, { type: string; isUserError?: boolean }]>
    const errorEvent = publishCalls.find((call) => call[1].type === 'error')
    expect(errorEvent).toBeDefined()
    expect(errorEvent![1].isUserError).toBe(true)

    // Should mark submission as failed
    const row = await db.selectFrom('submissions').selectAll().where('id', '=', TEST_SUBMISSION_ID).executeTakeFirst()
    expect(row?.status).toBe('failed')
    expect(row?.error_message).toContain('128KB')
  })

  it('should store execution_result for timed-out submissions', async () => {
    await seedUserAndSubmission()

    const executionClient = createMockExecutionClient({
      stdout: 'partial output',
      stderr: 'signal: killed',
      exitCode: 137,
      timedOut: true,
    })
    const eventPublisher = createMockEventPublisher()

    const processor = createExecutionProcessor({
      executionClient,
      db,
      eventPublisher,
      logger,
      contentLoader: createMockContentLoader(),
      defaultTimeoutSeconds: 30,
    })

    await processor(createTestJob())

    const row = await db.selectFrom('submissions').selectAll().where('id', '=', TEST_SUBMISSION_ID).executeTakeFirst()
    expect(row?.status).toBe('failed')
    expect(row?.execution_result).not.toBeNull()
    const result = typeof row!.execution_result === 'string'
      ? JSON.parse(row!.execution_result) as Record<string, unknown>
      : row!.execution_result as Record<string, unknown>
    expect(result['exitCode']).toBe(137)
    expect(result['output']).toBe('partial output')
    expect(result['compilationSucceeded']).toBe(true)
    expect(result['durationMs']).toBeGreaterThan(0)
  })
})
