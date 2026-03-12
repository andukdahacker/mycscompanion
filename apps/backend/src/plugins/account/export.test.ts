import { describe, it, expect, afterEach, afterAll, vi } from 'vitest'
import Fastify from 'fastify'
import type { Queue } from 'bullmq'
import { authPlugin } from '../auth/index.js'
import { accountPlugin } from './index.js'
import { createMockFirebaseAuth } from '@mycscompanion/config/test-utils'
import { db } from '../../shared/db.js'
import { generateId } from '../../shared/id.js'
import type { ExportJobData } from '../../shared/queue.js'
import { sql } from 'kysely'

const TEST_UID = 'test-export-uid'
const OTHER_UID = 'test-export-other'
const mockAuth = createMockFirebaseAuth(TEST_UID)

const mockExportQueue = {
  add: vi.fn(),
} as unknown as Queue<ExportJobData>

async function buildApp() {
  const app = Fastify({ logger: false })
  await app.register(authPlugin, { firebaseAuth: mockAuth })
  await app.register(accountPlugin, { prefix: '/api/account', exportQueue: mockExportQueue })
  await app.ready()
  return app
}

const app = await buildApp()

afterEach(async () => {
  vi.restoreAllMocks()
  await db.deleteFrom('data_exports').where('user_id', 'like', 'test-%').execute()
  await db.deleteFrom('users').where('id', 'like', 'test-%').execute()
})

afterAll(async () => {
  await app.close()
})

describe('Export Routes', () => {
  describe('POST /api/account/export', () => {
    it('should create data_exports row and return exportId', async () => {
      await db.insertInto('users').values({ id: TEST_UID, email: 'test@example.com' }).execute()

      const response = await app.inject({
        method: 'POST',
        url: '/api/account/export',
        headers: { authorization: 'Bearer valid-token' },
      })

      expect(response.statusCode).toBe(200)
      const body = response.json()
      expect(body.exportId).toBeDefined()
      expect(body.status).toBe('processing')

      const exportRow = await db
        .selectFrom('data_exports')
        .selectAll()
        .where('id', '=', body.exportId)
        .executeTakeFirst()

      expect(exportRow).toBeDefined()
      expect(exportRow?.user_id).toBe(TEST_UID)
      expect(exportRow?.status).toBe('processing')
    })

    it('should return existing exportId if export already processing', async () => {
      await db.insertInto('users').values({ id: TEST_UID, email: 'test@example.com' }).execute()

      const existingId = generateId()
      await db.insertInto('data_exports').values({
        id: existingId,
        user_id: TEST_UID,
        status: 'processing',
      }).execute()

      const response = await app.inject({
        method: 'POST',
        url: '/api/account/export',
        headers: { authorization: 'Bearer valid-token' },
      })

      expect(response.statusCode).toBe(200)
      const body = response.json()
      expect(body.exportId).toBe(existingId)
      expect(body.status).toBe('processing')
      expect(body.message).toBe('Export already in progress')
    })

    it('should rate limit to 1 per 5 minutes', async () => {
      await db.insertInto('users').values({ id: TEST_UID, email: 'test@example.com' }).execute()

      // Create a recent completed export
      await db.insertInto('data_exports').values({
        id: generateId(),
        user_id: TEST_UID,
        status: 'completed',
        created_at: sql`now()`,
      }).execute()

      const response = await app.inject({
        method: 'POST',
        url: '/api/account/export',
        headers: { authorization: 'Bearer valid-token' },
      })

      expect(response.statusCode).toBe(429)
      expect(response.json().error.code).toBe('RATE_LIMITED')
    })
  })

  describe('GET /api/account/export/status', () => {
    it('should return latest export status for user', async () => {
      await db.insertInto('users').values({ id: TEST_UID, email: 'test@example.com' }).execute()

      const exportId = generateId()
      await db.insertInto('data_exports').values({
        id: exportId,
        user_id: TEST_UID,
        status: 'completed',
        completed_at: sql`now()`,
      }).execute()

      const response = await app.inject({
        method: 'GET',
        url: '/api/account/export/status',
        headers: { authorization: 'Bearer valid-token' },
      })

      expect(response.statusCode).toBe(200)
      const body = response.json()
      expect(body.exportId).toBe(exportId)
      expect(body.status).toBe('completed')
      expect(body.createdAt).toBeDefined()
      expect(body.completedAt).toBeDefined()
    })

    it('should return status none when no exports exist', async () => {
      await db.insertInto('users').values({ id: TEST_UID, email: 'test@example.com' }).execute()

      const response = await app.inject({
        method: 'GET',
        url: '/api/account/export/status',
        headers: { authorization: 'Bearer valid-token' },
      })

      expect(response.statusCode).toBe(200)
      expect(response.json()).toEqual({
        exportId: null,
        status: 'none',
        createdAt: null,
        completedAt: null,
      })
    })
  })

  describe('GET /api/account/export/download', () => {
    it('should return JSON file with Content-Disposition header', async () => {
      await db.insertInto('users').values({ id: TEST_UID, email: 'test@example.com' }).execute()

      const exportData = { metadata: { exportDate: '2026-03-12' }, data: { profile: {} } }
      await db.insertInto('data_exports').values({
        id: generateId(),
        user_id: TEST_UID,
        status: 'completed',
        export_data: JSON.stringify(exportData),
        completed_at: sql`now()`,
      }).execute()

      const response = await app.inject({
        method: 'GET',
        url: '/api/account/export/download',
        headers: { authorization: 'Bearer valid-token' },
      })

      expect(response.statusCode).toBe(200)
      expect(response.headers['content-disposition']).toContain('attachment; filename="mycscompanion-export-')
      expect(response.headers['content-type']).toContain('application/json')
      const body = response.json()
      expect(body.metadata.exportDate).toBe('2026-03-12')
    })

    it('should return 404 when no completed export exists', async () => {
      await db.insertInto('users').values({ id: TEST_UID, email: 'test@example.com' }).execute()

      const response = await app.inject({
        method: 'GET',
        url: '/api/account/export/download',
        headers: { authorization: 'Bearer valid-token' },
      })

      expect(response.statusCode).toBe(404)
      expect(response.json().error.code).toBe('NO_EXPORT')
    })
  })

  describe('Authentication', () => {
    it('should only return data for authenticated user', async () => {
      await db.insertInto('users').values([
        { id: TEST_UID, email: 'test@example.com' },
        { id: OTHER_UID, email: 'other@example.com' },
      ]).execute()

      // Create export for OTHER user
      await db.insertInto('data_exports').values({
        id: generateId(),
        user_id: OTHER_UID,
        status: 'completed',
        export_data: JSON.stringify({ data: 'other-user-data' }),
        completed_at: sql`now()`,
      }).execute()

      // Authenticated user (TEST_UID) should NOT see other user's export
      const statusResponse = await app.inject({
        method: 'GET',
        url: '/api/account/export/status',
        headers: { authorization: 'Bearer valid-token' },
      })
      expect(statusResponse.json().status).toBe('none')

      const downloadResponse = await app.inject({
        method: 'GET',
        url: '/api/account/export/download',
        headers: { authorization: 'Bearer valid-token' },
      })
      expect(downloadResponse.statusCode).toBe(404)
    })
  })
})
