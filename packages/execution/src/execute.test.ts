import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { setupServer } from 'msw/node'
import { http, HttpResponse } from 'msw'
import {
  setupFlyApiHandlers,
  createMockFlyMachineResponse,
} from '@mycscompanion/config/test-utils'
import { executeCode } from './execute'
import { FlyClient } from './fly-client'
import { DEFAULT_FLY_MACHINE_CONFIG } from './fly-config'
import type { ExecutionEvent } from './events'

const TEST_BASE_URL = 'https://api.machines.dev'
const TEST_APP_NAME = 'mcc-execution'
const TEST_TOKEN = 'test-fly-token'
const TEST_CODE = 'package main\n\nfunc main() {\n\tprintln("Hello")\n}'
const TEST_SUBMISSION_ID = 'sub_test123'

// Single server for all tests — use server.use() for per-test overrides
const defaultHandlers = setupFlyApiHandlers({
  baseUrl: TEST_BASE_URL,
  appName: TEST_APP_NAME,
})
const server = setupServer(...defaultHandlers)

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterAll(() => server.close())
afterEach(() => {
  server.resetHandlers()
  vi.restoreAllMocks()
})

const createClient = (): FlyClient =>
  new FlyClient({
    apiToken: TEST_TOKEN,
    appName: TEST_APP_NAME,
    baseUrl: TEST_BASE_URL,
  })

const collectEvents = async (
  gen: AsyncGenerator<ExecutionEvent>,
): Promise<ExecutionEvent[]> => {
  const events: ExecutionEvent[] = []
  for await (const event of gen) {
    events.push(event)
  }
  return events
}

describe('executeCode', () => {
  describe('happy path', () => {
    it('should yield queued event first with submissionId', async () => {
      const events = await collectEvents(
        executeCode(createClient(), DEFAULT_FLY_MACHINE_CONFIG, TEST_CODE, TEST_SUBMISSION_ID),
      )

      const queued = events.find((e) => e.type === 'queued')
      expect(queued).toBeDefined()
      expect(queued?.type === 'queued' && queued.submissionId).toBe(TEST_SUBMISSION_ID)
    })

    it('should yield complete event on successful execution', async () => {
      const events = await collectEvents(
        executeCode(createClient(), DEFAULT_FLY_MACHINE_CONFIG, TEST_CODE, TEST_SUBMISSION_ID),
      )

      const complete = events.find((e) => e.type === 'complete')
      expect(complete).toBeDefined()
    })

    it('should always destroy machine after lifecycle', async () => {
      let destroyCalled = false

      server.use(
        http.delete(
          `${TEST_BASE_URL}/v1/apps/${TEST_APP_NAME}/machines/:machineId`,
          () => {
            destroyCalled = true
            return new HttpResponse(null, { status: 200 })
          },
        ),
      )

      await collectEvents(
        executeCode(createClient(), DEFAULT_FLY_MACHINE_CONFIG, TEST_CODE, TEST_SUBMISSION_ID),
      )

      expect(destroyCalled).toBe(true)
    })

    it('should call onLifecycleEvent callback at each phase', async () => {
      const lifecycleEvents: Array<{ phase: string; timestamp: number }> = []

      await collectEvents(
        executeCode(
          createClient(),
          DEFAULT_FLY_MACHINE_CONFIG,
          TEST_CODE,
          TEST_SUBMISSION_ID,
          {
            onLifecycleEvent: (phase: string, timestamp: number) => {
              lifecycleEvents.push({ phase, timestamp })
            },
          },
        ),
      )

      const phases = lifecycleEvents.map((e) => e.phase)
      expect(phases).toContain('machine_create')
      expect(phases).toContain('machine_started')
      expect(phases).toContain('machine_stopped')
      expect(phases).toContain('machine_destroyed')
    })
  })

  describe('timeout handling', () => {
    it('should yield timeout event when machine does not stop within timeout', async () => {
      server.use(
        http.get(
          `${TEST_BASE_URL}/v1/apps/${TEST_APP_NAME}/machines/:machineId/wait`,
          ({ request }) => {
            const url = new URL(request.url)
            const state = url.searchParams.get('state')
            if (state === 'started') {
              return HttpResponse.json(
                createMockFlyMachineResponse({ state: 'started' }),
              )
            }
            // For 'stopped' state, simulate timeout
            return HttpResponse.json(
              { error: 'timeout waiting for machine' },
              { status: 408 },
            )
          },
        ),
      )

      const configWithShortTimeout = {
        ...DEFAULT_FLY_MACHINE_CONFIG,
        timeoutSeconds: 5,
      }

      const events = await collectEvents(
        executeCode(
          createClient(),
          configWithShortTimeout,
          TEST_CODE,
          TEST_SUBMISSION_ID,
        ),
      )

      const timeoutEvent = events.find((e) => e.type === 'timeout')
      expect(timeoutEvent).toBeDefined()
      if (timeoutEvent?.type === 'timeout') {
        expect(timeoutEvent.timeoutSeconds).toBe(5)
      }
    })
  })

  describe('Fly API failure', () => {
    it('should yield error event with isUserError=false on retryable Fly API error', async () => {
      server.use(
        http.post(
          `${TEST_BASE_URL}/v1/apps/${TEST_APP_NAME}/machines`,
          () =>
            HttpResponse.json(
              { error: 'service unavailable' },
              { status: 503 },
            ),
        ),
      )

      const events = await collectEvents(
        executeCode(createClient(), DEFAULT_FLY_MACHINE_CONFIG, TEST_CODE, TEST_SUBMISSION_ID),
      )

      const errorEvent = events.find((e) => e.type === 'error')
      expect(errorEvent).toBeDefined()
      if (errorEvent?.type === 'error') {
        expect(errorEvent.isUserError).toBe(false)
        expect(errorEvent.message).toContain('temporarily unavailable')
      }
    })
  })

  describe('non-zero exit code', () => {
    it('should yield complete event and destroy machine when program exits with non-zero code', async () => {
      let destroyCalled = false

      server.use(
        http.get(
          `${TEST_BASE_URL}/v1/apps/${TEST_APP_NAME}/machines/:machineId/wait`,
          ({ request }) => {
            const url = new URL(request.url)
            const state = url.searchParams.get('state')
            if (state === 'started') {
              return HttpResponse.json(
                createMockFlyMachineResponse({ state: 'started' }),
              )
            }
            // Machine stops normally even on non-zero exit — Fly returns stopped state
            return HttpResponse.json(
              createMockFlyMachineResponse({ state: 'stopped' }),
            )
          },
        ),
        http.delete(
          `${TEST_BASE_URL}/v1/apps/${TEST_APP_NAME}/machines/:machineId`,
          () => {
            destroyCalled = true
            return new HttpResponse(null, { status: 200 })
          },
        ),
      )

      const events = await collectEvents(
        executeCode(createClient(), DEFAULT_FLY_MACHINE_CONFIG, TEST_CODE, TEST_SUBMISSION_ID),
      )

      // Should still yield complete — actual exit code distinction is Story 3.3's worker responsibility
      const complete = events.find((e) => e.type === 'complete')
      expect(complete).toBeDefined()
      expect(destroyCalled).toBe(true)
    })
  })

  describe('machine destroy on error', () => {
    it('should destroy machine even when wait for started fails', async () => {
      let destroyCalled = false

      server.use(
        http.get(
          `${TEST_BASE_URL}/v1/apps/${TEST_APP_NAME}/machines/:machineId/wait`,
          () =>
            HttpResponse.json(
              { error: 'internal error' },
              { status: 500 },
            ),
        ),
        http.delete(
          `${TEST_BASE_URL}/v1/apps/${TEST_APP_NAME}/machines/:machineId`,
          () => {
            destroyCalled = true
            return new HttpResponse(null, { status: 200 })
          },
        ),
      )

      await collectEvents(
        executeCode(createClient(), DEFAULT_FLY_MACHINE_CONFIG, TEST_CODE, TEST_SUBMISSION_ID),
      )

      expect(destroyCalled).toBe(true)
    })
  })
})
