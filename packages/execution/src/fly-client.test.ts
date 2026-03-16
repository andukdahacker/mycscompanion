import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { setupServer } from 'msw/node'
import { http, HttpResponse } from 'msw'
import { setupFlyApiHandlers } from '@mycscompanion/config/test-utils'
import { FlyClient, FlyApiError } from './fly-client'
import type { FlyCreateMachineRequest } from './fly-api-types'

const TEST_BASE_URL = 'https://api.machines.dev'
const TEST_APP_NAME = 'mcc-execution'
const TEST_TOKEN = 'test-fly-token'

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

const TEST_CREATE_REQUEST: FlyCreateMachineRequest = {
  config: {
    image: 'registry.fly.io/mcc-execution:latest',
    auto_destroy: true,
    guest: { cpu_kind: 'shared', cpus: 1, memory_mb: 256 },
    init: { exec: ['sh', '-c', 'echo hello'] },
    restart: { policy: 'no' },
    services: [],
    files: [],
  },
}

describe('FlyClient', () => {
  describe('constructor', () => {
    it('should create a client with required options', () => {
      const client = new FlyClient({
        apiToken: TEST_TOKEN,
        appName: TEST_APP_NAME,
      })
      expect(client).toBeDefined()
    })

    it('should default baseUrl to https://api.machines.dev', () => {
      const client = new FlyClient({
        apiToken: TEST_TOKEN,
        appName: TEST_APP_NAME,
      })
      expect(client.baseUrl).toBe('https://api.machines.dev')
    })

    it('should accept custom baseUrl', () => {
      const client = new FlyClient({
        apiToken: TEST_TOKEN,
        appName: TEST_APP_NAME,
        baseUrl: 'http://localhost:4280',
      })
      expect(client.baseUrl).toBe('http://localhost:4280')
    })
  })

  describe('API methods', () => {
    describe('createMachine', () => {
      it('should create a machine and return response', async () => {
        const client = createClient()
        const response = await client.createMachine(TEST_CREATE_REQUEST)
        expect(response.id).toBe('mach_test123456')
        expect(response.state).toBe('created')
        expect(response.instance_id).toBe('inst_test789')
      })
    })

    describe('waitForState', () => {
      it('should wait for machine to reach target state', async () => {
        const client = createClient()
        const response = await client.waitForState('mach_test123456', 'started')
        expect(response.state).toBe('started')
      })

      it('should pass instanceId as query param', async () => {
        const client = createClient()
        const response = await client.waitForState('mach_test123456', 'stopped', {
          instanceId: 'inst_test789',
        })
        expect(response.state).toBe('stopped')
      })

      it('should pass timeout as query param', async () => {
        const client = createClient()
        const response = await client.waitForState('mach_test123456', 'started', {
          timeoutSeconds: 30,
        })
        expect(response.state).toBe('started')
      })
    })

    describe('getMachine', () => {
      it('should get machine details', async () => {
        const client = createClient()
        const response = await client.getMachine('mach_test123456')
        expect(response.id).toBe('mach_test123456')
      })
    })

    describe('stopMachine', () => {
      it('should stop a machine', async () => {
        const client = createClient()
        await expect(client.stopMachine('mach_test123456')).resolves.toBeUndefined()
      })
    })

    describe('destroyMachine', () => {
      it('should destroy a machine', async () => {
        const client = createClient()
        await expect(
          client.destroyMachine('mach_test123456'),
        ).resolves.toBeUndefined()
      })

      it('should force destroy when force=true', async () => {
        const client = createClient()
        await expect(
          client.destroyMachine('mach_test123456', true),
        ).resolves.toBeUndefined()
      })
    })
  })

  describe('error handling', () => {
    it('should mark 429 as retryable', async () => {
      server.use(
        http.post(
          `${TEST_BASE_URL}/v1/apps/${TEST_APP_NAME}/machines`,
          () =>
            HttpResponse.json(
              { error: 'rate limited' },
              { status: 429 },
            ),
        ),
      )

      const client = createClient()
      try {
        await client.createMachine(TEST_CREATE_REQUEST)
        expect.unreachable('should have thrown')
      } catch (err) {
        expect(err).toBeInstanceOf(FlyApiError)
        if (err instanceof FlyApiError) {
          expect(err.status).toBe(429)
          expect(err.isRetryable).toBe(true)
        }
      }
    })

    it('should mark 503 as retryable', async () => {
      server.use(
        http.get(
          `${TEST_BASE_URL}/v1/apps/${TEST_APP_NAME}/machines/:machineId`,
          () =>
            HttpResponse.json(
              { error: 'service unavailable' },
              { status: 503 },
            ),
        ),
      )

      const client = createClient()
      try {
        await client.getMachine('mach_test123456')
        expect.unreachable('should have thrown')
      } catch (err) {
        expect(err).toBeInstanceOf(FlyApiError)
        if (err instanceof FlyApiError) {
          expect(err.status).toBe(503)
          expect(err.isRetryable).toBe(true)
        }
      }
    })

    it('should mark 400 as not retryable', async () => {
      server.use(
        http.post(
          `${TEST_BASE_URL}/v1/apps/${TEST_APP_NAME}/machines`,
          () =>
            HttpResponse.json(
              { error: 'bad request' },
              { status: 400 },
            ),
        ),
      )

      const client = createClient()
      try {
        await client.createMachine(TEST_CREATE_REQUEST)
        expect.unreachable('should have thrown')
      } catch (err) {
        expect(err).toBeInstanceOf(FlyApiError)
        if (err instanceof FlyApiError) {
          expect(err.status).toBe(400)
          expect(err.isRetryable).toBe(false)
        }
      }
    })

    it('should mark 500 as not retryable', async () => {
      server.use(
        http.post(
          `${TEST_BASE_URL}/v1/apps/${TEST_APP_NAME}/machines`,
          () =>
            HttpResponse.json(
              { error: 'internal server error' },
              { status: 500 },
            ),
        ),
      )

      const client = createClient()
      try {
        await client.createMachine(TEST_CREATE_REQUEST)
        expect.unreachable('should have thrown')
      } catch (err) {
        expect(err).toBeInstanceOf(FlyApiError)
        if (err instanceof FlyApiError) {
          expect(err.status).toBe(500)
          expect(err.isRetryable).toBe(false)
        }
      }
    })

    it('should include machineId when available', async () => {
      server.use(
        http.get(
          `${TEST_BASE_URL}/v1/apps/${TEST_APP_NAME}/machines/:machineId`,
          () =>
            HttpResponse.json(
              { error: 'not found' },
              { status: 404 },
            ),
        ),
      )

      const client = createClient()
      try {
        await client.getMachine('mach_missing')
        expect.unreachable('should have thrown')
      } catch (err) {
        expect(err).toBeInstanceOf(FlyApiError)
        if (err instanceof FlyApiError) {
          expect(err.machineId).toBe('mach_missing')
        }
      }
    })
  })
})
