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
import type { ExecutionJob } from './execution-processor.js'
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
    })

    // Non-retryable error — processor should complete without throwing
    await processor(createTestJob())

    expect(destroyCalled).toBe(true)
  })
})
