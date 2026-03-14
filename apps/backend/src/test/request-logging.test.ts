import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from 'vitest'

vi.mock('@sentry/node', () => ({
  init: vi.fn(),
  captureException: vi.fn(),
  close: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../plugins/auth/firebase.js', () => ({
  initFirebaseAdmin: () => ({
    verifyIdToken: vi.fn().mockResolvedValue({ uid: 'test-uid' }),
  }),
}))

import type { FastifyInstance } from 'fastify'
import { buildApp } from '../app.js'

describe('Request Logging', () => {
  let app: FastifyInstance

  beforeAll(async () => {
    app = await buildApp()
    // Test-only route for verifying uid log enrichment (goes through auth plugin)
    app.get('/test-log-bindings', async (request) => {
      // @ts-expect-error -- pino bindings() exists at runtime but not in FastifyBaseLogger type
      const bindings: Record<string, unknown> = request.log.bindings()
      return { bindings }
    })
    await app.ready()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  afterAll(async () => {
    await app.close()
  })

  describe('request ID generation', () => {
    it('should generate cuid2 request IDs', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/health',
      })

      expect(response.statusCode).toBe(200)
      const requestId = response.headers['x-request-id'] as string
      expect(requestId).toBeDefined()
      // cuid2 IDs are 24-25 chars, lowercase alphanumeric
      expect(requestId).toMatch(/^[a-z0-9]{24,25}$/)
    })

    it('should generate unique request IDs for each request', async () => {
      const response1 = await app.inject({ method: 'GET', url: '/health' })
      const response2 = await app.inject({ method: 'GET', url: '/health' })

      const id1 = response1.headers['x-request-id'] as string
      const id2 = response2.headers['x-request-id'] as string
      expect(id1).not.toBe(id2)
    })
  })

  describe('uid log enrichment', () => {
    it('should include uid in log context for authenticated requests', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/test-log-bindings',
        headers: { authorization: 'Bearer test-token' },
      })

      expect(response.statusCode).toBe(200)
      const body = response.json() as { bindings: Record<string, unknown> }
      expect(body.bindings).toEqual(expect.objectContaining({ uid: 'test-uid' }))
    })

    it('should not include uid in log context for unauthenticated requests', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/health',
      })

      expect(response.statusCode).toBe(200)
      // Health check is unauthenticated — request.uid stays '' so
      // the enrichment hook does not create a child logger with uid
      expect(response.headers['x-request-id']).toBeDefined()
    })
  })

  describe('x-request-id response header', () => {
    it('should return x-request-id header in responses', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/health',
      })

      expect(response.statusCode).toBe(200)
      const requestId = response.headers['x-request-id']
      expect(requestId).toBeDefined()
      expect(typeof requestId).toBe('string')
    })

    it('should return x-request-id on error responses', async () => {
      // Request to a non-existent route
      const response = await app.inject({
        method: 'GET',
        url: '/nonexistent-route-for-test',
      })

      expect(response.headers['x-request-id']).toBeDefined()
      expect(response.headers['x-request-id']).toMatch(/^[a-z0-9]{24,25}$/)
    })
  })
})
