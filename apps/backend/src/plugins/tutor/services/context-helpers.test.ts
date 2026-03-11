import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { join } from 'node:path'
import { db } from '../../../shared/db.js'
import { generateId } from '../../../shared/id.js'
import {
  loadCurrentCode,
  loadCriteriaStatus,
  loadUserBackground,
  loadMilestoneBrief,
  loadSessionSummary,
  loadConceptExplainerMetadata,
} from './context-helpers.js'
import type { RedisCache } from './context-assembler.js'

const TEST_UID = 'test-helpers-uid'

const FIXTURES_ROOT = join(process.cwd(), 'src', 'plugins', 'tutor', 'services', '__fixtures__')
const CONTENT_FIXTURES_ROOT = join(FIXTURES_ROOT, 'milestones')

function createMockRedis(): RedisCache {
  const store = new Map<string, string>()
  return {
    get: vi.fn(async (key: string) => store.get(key) ?? null),
    set: vi.fn(async (key: string, value: string) => {
      store.set(key, value)
      return 'OK'
    }),
  }
}

let trackId: string
let milestoneId: string

beforeEach(async () => {
  trackId = generateId()
  milestoneId = generateId()

  await db
    .insertInto('users')
    .values({
      id: TEST_UID,
      email: 'helpers-test@example.com',
      role: 'backend-engineer',
      experience_level: '3-to-5',
      primary_language: 'go',
    })
    .execute()

  await db
    .insertInto('tracks')
    .values({ id: trackId, name: 'Test Track', slug: 'test-track' })
    .execute()

  await db
    .insertInto('milestones')
    .values({ id: milestoneId, track_id: trackId, title: 'KV Store', slug: 'test-milestone', position: 1 })
    .execute()
})

afterEach(async () => {
  vi.restoreAllMocks()
  await db.deleteFrom('tutor_messages').execute()
  await db.deleteFrom('session_summaries').execute()
  await db.deleteFrom('code_snapshots').execute()
  await db.deleteFrom('submissions').execute()
  await db.deleteFrom('sessions').execute()
  await db.deleteFrom('user_milestones').execute()
  await db.deleteFrom('milestones').execute()
  await db.deleteFrom('tracks').execute()
  await db.deleteFrom('users').execute()
})

describe('context-helpers', () => {
  describe('loadCurrentCode', () => {
    it('should return latest snapshot code', async () => {
      const sessionId = generateId()
      await db
        .insertInto('sessions')
        .values({ id: sessionId, user_id: TEST_UID, milestone_id: milestoneId, is_active: true })
        .execute()

      await db
        .insertInto('code_snapshots')
        .values({
          id: generateId(),
          user_id: TEST_UID,
          milestone_id: milestoneId,
          session_id: sessionId,
          code: 'package main\nfunc main() { fmt.Println("hello") }',
        })
        .execute()

      const code = await loadCurrentCode(db, TEST_UID, milestoneId)

      expect(code).toBe('package main\nfunc main() { fmt.Println("hello") }')
    })

    it('should return fallback when no snapshots exist', async () => {
      const code = await loadCurrentCode(db, TEST_UID, milestoneId)

      expect(code).toBe('(No code submitted yet)')
    })
  })

  describe('loadCriteriaStatus', () => {
    it('should format criterion results', async () => {
      await db
        .insertInto('submissions')
        .values({
          id: generateId(),
          user_id: TEST_UID,
          milestone_id: milestoneId,
          code: 'package main',
          status: 'completed',
          criteria_results: JSON.stringify([
            { name: 'put-and-get', order: 1, status: 'met', expected: 'pass', actual: 'pass' },
            { name: 'persistence', order: 2, status: 'not-met', expected: 'pass', actual: 'fail', errorHint: 'Data lost on restart' },
          ]),
        })
        .execute()

      const status = await loadCriteriaStatus(db, TEST_UID, milestoneId)

      expect(status).toContain('put-and-get: met')
      expect(status).toContain('persistence: not-met (Data lost on restart)')
    })

    it('should return fallback when no submissions exist', async () => {
      const status = await loadCriteriaStatus(db, TEST_UID, milestoneId)

      expect(status).toBe('(No submissions yet)')
    })
  })

  describe('loadUserBackground', () => {
    it('should build profile string from user fields', async () => {
      const background = await loadUserBackground(db, TEST_UID)

      expect(background).toContain('Role: backend-engineer')
      expect(background).toContain('Experience: 3-to-5')
      expect(background).toContain('Primary language: go')
    })

    it('should return fallback for unknown user', async () => {
      const background = await loadUserBackground(db, 'nonexistent-user-id')

      expect(background).toBe('(Unknown user)')
    })
  })

  describe('loadMilestoneBrief', () => {
    it('should read brief from filesystem and cache in Redis', async () => {
      const mockRedis = createMockRedis()

      const brief = await loadMilestoneBrief(mockRedis, CONTENT_FIXTURES_ROOT, 'test-milestone')

      expect(brief).toContain('Build a key-value store')
      expect(mockRedis.set).toHaveBeenCalledWith(
        'tutor:brief:test-milestone',
        expect.stringContaining('Build a key-value store'),
        'EX',
        3600
      )
    })

    it('should return cached brief from Redis on second call', async () => {
      const mockRedis = createMockRedis()

      // First call caches
      await loadMilestoneBrief(mockRedis, CONTENT_FIXTURES_ROOT, 'test-milestone')
      // Second call should hit cache
      const brief = await loadMilestoneBrief(mockRedis, CONTENT_FIXTURES_ROOT, 'test-milestone')

      expect(brief).toContain('Build a key-value store')
      expect(mockRedis.get).toHaveBeenCalledTimes(2)
      // set called only once (first call cached, second call used cache)
      expect(mockRedis.set).toHaveBeenCalledOnce()
    })

    it('should return fallback when brief file does not exist', async () => {
      const mockRedis = createMockRedis()

      const brief = await loadMilestoneBrief(mockRedis, CONTENT_FIXTURES_ROOT, 'nonexistent-milestone')

      expect(brief).toBe('(No milestone brief available)')
    })
  })

  describe('loadConceptExplainerMetadata', () => {
    it('should return correct metadata when manifest and SVGs exist', async () => {
      const mockRedis = createMockRedis()
      const result = await loadConceptExplainerMetadata(mockRedis, CONTENT_FIXTURES_ROOT, 'test-milestone')

      expect(result).toHaveLength(2)
      expect(result).toEqual(
        expect.arrayContaining([
          {
            filename: 'kv-store-operations.svg',
            title: 'Key-Value Store Operations',
            altText: 'Diagram showing how PUT, GET, and DELETE operations interact with the in-memory hash map data structure',
          },
          {
            filename: 'persistence-flow.svg',
            title: 'Persistence Flow',
            altText: 'Diagram showing the data persistence flow from in-memory storage to disk file and back during reload',
          },
        ])
      )
    })

    it('should cache result in Redis', async () => {
      const mockRedis = createMockRedis()
      await loadConceptExplainerMetadata(mockRedis, CONTENT_FIXTURES_ROOT, 'test-milestone')

      expect(mockRedis.set).toHaveBeenCalledWith(
        'tutor:explainers:test-milestone',
        expect.any(String),
        'EX',
        3600
      )

      // Second call should hit cache
      const result = await loadConceptExplainerMetadata(mockRedis, CONTENT_FIXTURES_ROOT, 'test-milestone')
      expect(result).toHaveLength(2)
    })

    it('should return empty array when no assets directory exists', async () => {
      const mockRedis = createMockRedis()
      const result = await loadConceptExplainerMetadata(mockRedis, CONTENT_FIXTURES_ROOT, 'nonexistent-milestone')

      expect(result).toEqual([])
    })
  })

  describe('loadSessionSummary', () => {
    it('should return session summary text when available', async () => {
      const sessionId = generateId()
      await db
        .insertInto('sessions')
        .values({ id: sessionId, user_id: TEST_UID, milestone_id: milestoneId, is_active: true })
        .execute()

      await db
        .insertInto('session_summaries')
        .values({
          id: generateId(),
          user_id: TEST_UID,
          session_id: sessionId,
          milestone_id: milestoneId,
          summary_text: 'You worked on Put and Get methods.',
        })
        .execute()

      const summary = await loadSessionSummary(db, TEST_UID, milestoneId)

      expect(summary).toBe('You worked on Put and Get methods.')
    })

    it('should return null when no session summary exists', async () => {
      const summary = await loadSessionSummary(db, TEST_UID, milestoneId)

      expect(summary).toBeNull()
    })
  })
})
