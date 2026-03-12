import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import Fastify from 'fastify'
import type { FastifyInstance } from 'fastify'
import { authPlugin } from '../auth/index.js'
import { accountPlugin } from './index.js'
import { createMockFirebaseAuth } from '@mycscompanion/config/test-utils'
import { db } from '../../shared/db.js'
import type { FirebaseAdminAuth } from '../auth/firebase.js'

const TEST_UID = 'test-delete-uid'
const OTHER_UID = 'test-delete-other'
const TRACK_ID = 'test-delete-track'
const MILESTONE_ID = 'test-delete-milestone'

const mockDeleteUser = vi.fn<(uid: string) => Promise<void>>().mockResolvedValue(undefined)
const mockFirebaseAuth: FirebaseAdminAuth = {
  ...createMockFirebaseAuth(TEST_UID),
  deleteUser: mockDeleteUser,
}

let app: FastifyInstance

beforeEach(async () => {
  mockDeleteUser.mockResolvedValue(undefined)
  app = Fastify({ logger: false })
  await app.register(authPlugin, { firebaseAuth: mockFirebaseAuth })
  await app.register(accountPlugin, { prefix: '/api/account', firebaseAuth: mockFirebaseAuth })
  await app.ready()
})

afterEach(async () => {
  vi.restoreAllMocks()
  // Cleanup in FK-safe order (children before parents)
  await db.deleteFrom('data_exports').where('user_id', 'like', 'test-%').execute()
  await db.deleteFrom('benchmark_results').where('user_id', 'like', 'test-%').execute()
  await db.deleteFrom('tutor_messages').where('user_id', 'like', 'test-%').execute()
  await db.deleteFrom('session_summaries').where('user_id', 'like', 'test-%').execute()
  await db.deleteFrom('code_snapshots').where('user_id', 'like', 'test-%').execute()
  await db.deleteFrom('user_milestones').where('user_id', 'like', 'test-%').execute()
  await db.deleteFrom('submissions').where('user_id', 'like', 'test-%').execute()
  await db.deleteFrom('sessions').where('user_id', 'like', 'test-%').execute()
  await db.deleteFrom('users').where('id', 'like', 'test-%').execute()
  await db.deleteFrom('milestones').where('id', 'like', 'test-%').execute()
  await db.deleteFrom('tracks').where('id', 'like', 'test-%').execute()
  await app.close()
})

async function insertTestTrackAndMilestone(): Promise<void> {
  await db.insertInto('tracks').values({ id: TRACK_ID, name: 'Test Track', slug: 'test-track' }).execute()
  await db.insertInto('milestones').values({ id: MILESTONE_ID, track_id: TRACK_ID, title: 'Test Milestone', slug: 'test-milestone', position: 1 }).execute()
}

async function insertFullUserData(uid: string): Promise<void> {
  await db.insertInto('users').values({ id: uid, email: `${uid}@example.com` }).execute()
  await db.insertInto('sessions').values({ id: `${uid}-session`, user_id: uid, milestone_id: MILESTONE_ID, is_active: true }).execute()
  const submissionId = `${uid}-sub`
  await db.insertInto('submissions').values({ id: submissionId, user_id: uid, milestone_id: MILESTONE_ID, code: 'package main' }).execute()
  await db.insertInto('code_snapshots').values({ id: `${uid}-snap`, user_id: uid, milestone_id: MILESTONE_ID, session_id: `${uid}-session`, code: 'package main' }).execute()
  await db.insertInto('tutor_messages').values({ id: `${uid}-msg`, session_id: `${uid}-session`, user_id: uid, role: 'user', content: 'help' }).execute()
  await db.insertInto('session_summaries').values({ id: `${uid}-summary`, user_id: uid, session_id: `${uid}-session`, milestone_id: MILESTONE_ID, summary_text: 'Summary' }).execute()
  await db.insertInto('user_milestones').values({ id: `${uid}-um`, user_id: uid, milestone_id: MILESTONE_ID }).execute()
  await db.insertInto('benchmark_results').values({ id: `${uid}-bench`, submission_id: submissionId, user_id: uid, milestone_id: MILESTONE_ID, benchmark_name: 'test-bench', raw_metrics: JSON.stringify({ ops: 100 }), normalized_ratio: '1.0000', reference_version: 'v1' }).execute()
  await db.insertInto('data_exports').values({ id: `${uid}-export`, user_id: uid, status: 'completed' }).execute()
}

describe('Delete Account Routes', () => {
  describe('DELETE /api/account/delete', () => {
    it('should delete all user data from database', async () => {
      await insertTestTrackAndMilestone()
      await insertFullUserData(TEST_UID)

      const response = await app.inject({
        method: 'DELETE',
        url: '/api/account/delete',
        headers: { authorization: 'Bearer valid-token' },
      })

      expect(response.statusCode).toBe(200)

      // Verify all tables are empty for this user
      const user = await db.selectFrom('users').selectAll().where('id', '=', TEST_UID).executeTakeFirst()
      expect(user).toBeUndefined()

      const sessions = await db.selectFrom('sessions').selectAll().where('user_id', '=', TEST_UID).execute()
      expect(sessions).toHaveLength(0)

      const snapshots = await db.selectFrom('code_snapshots').selectAll().where('user_id', '=', TEST_UID).execute()
      expect(snapshots).toHaveLength(0)

      const submissions = await db.selectFrom('submissions').selectAll().where('user_id', '=', TEST_UID).execute()
      expect(submissions).toHaveLength(0)

      const benchmarks = await db.selectFrom('benchmark_results').selectAll().where('user_id', '=', TEST_UID).execute()
      expect(benchmarks).toHaveLength(0)

      const messages = await db.selectFrom('tutor_messages').selectAll().where('user_id', '=', TEST_UID).execute()
      expect(messages).toHaveLength(0)

      const summaries = await db.selectFrom('session_summaries').selectAll().where('user_id', '=', TEST_UID).execute()
      expect(summaries).toHaveLength(0)

      const milestones = await db.selectFrom('user_milestones').selectAll().where('user_id', '=', TEST_UID).execute()
      expect(milestones).toHaveLength(0)

      const exports = await db.selectFrom('data_exports').selectAll().where('user_id', '=', TEST_UID).execute()
      expect(exports).toHaveLength(0)
    })

    it('should delete Firebase Auth user', async () => {
      await insertTestTrackAndMilestone()
      await db.insertInto('users').values({ id: TEST_UID, email: 'test@example.com' }).execute()

      await app.inject({
        method: 'DELETE',
        url: '/api/account/delete',
        headers: { authorization: 'Bearer valid-token' },
      })

      expect(mockDeleteUser).toHaveBeenCalledWith(TEST_UID)
    })

    it('should not delete other users data', async () => {
      await insertTestTrackAndMilestone()
      await insertFullUserData(TEST_UID)
      await insertFullUserData(OTHER_UID)

      // Mock auth returns TEST_UID for all requests
      await app.inject({
        method: 'DELETE',
        url: '/api/account/delete',
        headers: { authorization: 'Bearer valid-token' },
      })

      // Other user's data should be intact
      const otherUser = await db.selectFrom('users').selectAll().where('id', '=', OTHER_UID).executeTakeFirst()
      expect(otherUser).toBeDefined()

      const otherSessions = await db.selectFrom('sessions').selectAll().where('user_id', '=', OTHER_UID).execute()
      expect(otherSessions).toHaveLength(1)

      const otherBenchmarks = await db.selectFrom('benchmark_results').selectAll().where('user_id', '=', OTHER_UID).execute()
      expect(otherBenchmarks).toHaveLength(1)

      const otherExports = await db.selectFrom('data_exports').selectAll().where('user_id', '=', OTHER_UID).execute()
      expect(otherExports).toHaveLength(1)
    })

    it('should return success message on successful deletion', async () => {
      await db.insertInto('users').values({ id: TEST_UID, email: 'test@example.com' }).execute()

      const response = await app.inject({
        method: 'DELETE',
        url: '/api/account/delete',
        headers: { authorization: 'Bearer valid-token' },
      })

      expect(response.statusCode).toBe(200)
      expect(response.json()).toEqual({ message: 'Account deleted successfully' })
    })

    it('should return 500 with DELETION_FAILED when user not found in database', async () => {
      // No user inserted — deletion should fail
      const response = await app.inject({
        method: 'DELETE',
        url: '/api/account/delete',
        headers: { authorization: 'Bearer valid-token' },
      })

      expect(response.statusCode).toBe(500)
      expect(response.json()).toEqual({
        error: { code: 'DELETION_FAILED', message: 'Account deletion failed. Please try again.' },
      })
    })

    it('should succeed even if Firebase deletion fails', async () => {
      await insertTestTrackAndMilestone()
      await insertFullUserData(TEST_UID)

      mockDeleteUser.mockRejectedValueOnce(new Error('Firebase error'))

      const response = await app.inject({
        method: 'DELETE',
        url: '/api/account/delete',
        headers: { authorization: 'Bearer valid-token' },
      })

      expect(response.statusCode).toBe(200)
      expect(response.json()).toEqual({ message: 'Account deleted successfully' })

      // Verify DB deletion still happened
      const user = await db.selectFrom('users').selectAll().where('id', '=', TEST_UID).executeTakeFirst()
      expect(user).toBeUndefined()
    })

    it('should require authentication', async () => {
      const response = await app.inject({
        method: 'DELETE',
        url: '/api/account/delete',
      })

      expect(response.statusCode).toBe(401)
    })
  })
})
