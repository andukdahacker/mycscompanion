import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from 'vitest'

// Mock @sentry/node to prevent real initialization
vi.mock('@sentry/node', () => ({
  init: vi.fn(),
  captureException: vi.fn(),
  close: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../auth/firebase.js', () => ({
  initFirebaseAdmin: () => ({
    verifyIdToken: vi.fn().mockResolvedValue({ uid: 'test-uid' }),
  }),
}))

import type { FastifyInstance } from 'fastify'
import { buildApp } from '../../app.js'
import { redis } from '../../shared/redis.js'

describe('Admin Plugin', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  afterAll(async () => {
    redis.disconnect()
  })

  describe('with MCC_ADMIN_PASSWORD set', () => {
    let app: FastifyInstance
    const adminUser = 'admin'
    const adminPass = 'test-password-123'

    beforeAll(async () => {
      process.env['MCC_ADMIN_PASSWORD'] = adminPass
      process.env['MCC_ADMIN_USER'] = adminUser
      app = await buildApp()
      await app.ready()
    })

    afterAll(async () => {
      await app.close()
      delete process.env['MCC_ADMIN_PASSWORD']
      delete process.env['MCC_ADMIN_USER']
    })

    it('should return 401 when no credentials provided', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/admin/queues',
      })

      expect(response.statusCode).toBe(401)
    })

    it('should return 200 with valid basic auth credentials', async () => {
      const credentials = Buffer.from(`${adminUser}:${adminPass}`).toString(
        'base64'
      )

      const response = await app.inject({
        method: 'GET',
        url: '/admin/queues',
        headers: {
          authorization: `Basic ${credentials}`,
        },
      })

      // Bull Board serves its UI — 200 means auth passed and dashboard loaded
      expect(response.statusCode).toBe(200)
    })

    it('should return 401 with invalid credentials', async () => {
      const credentials = Buffer.from('admin:wrong-password').toString(
        'base64'
      )

      const response = await app.inject({
        method: 'GET',
        url: '/admin/queues',
        headers: {
          authorization: `Basic ${credentials}`,
        },
      })

      expect(response.statusCode).toBe(401)
    })
  })

  describe('without MCC_ADMIN_PASSWORD', () => {
    let app: FastifyInstance

    beforeAll(async () => {
      delete process.env['MCC_ADMIN_PASSWORD']
      app = await buildApp()
      await app.ready()
    })

    afterAll(async () => {
      await app.close()
    })

    it('should not register admin routes when password not set', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/admin/queues',
      })

      // Route doesn't exist — Fastify returns 404
      expect(response.statusCode).toBe(404)
    })
  })
})
