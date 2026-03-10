import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { join } from 'node:path'
import { db } from '../../../shared/db.js'
import { generateId } from '../../../shared/id.js'
import { createStuckContextAssembler } from './stuck-context-assembler.js'
import type { RedisCache } from './context-assembler.js'

const TEST_UID = 'test-stuck-ctx-uid'

const FIXTURES_ROOT = join(process.cwd(), 'src', 'plugins', 'tutor', 'services', '__fixtures__')
const PROMPTS_FIXTURES_ROOT = join(FIXTURES_ROOT, 'prompts')
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
let sessionId: string

beforeEach(async () => {
  trackId = generateId()
  milestoneId = generateId()
  sessionId = generateId()

  await db
    .insertInto('users')
    .values({
      id: TEST_UID,
      email: 'stuck-ctx-test@example.com',
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

  await db
    .insertInto('sessions')
    .values({ id: sessionId, user_id: TEST_UID, milestone_id: milestoneId, is_active: true })
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

describe('StuckContextAssembler', () => {
  describe('assembleStuckInterventionPrompt', () => {
    it('should assemble prompt with all template variables replaced', async () => {
      await db
        .insertInto('code_snapshots')
        .values({
          id: generateId(),
          user_id: TEST_UID,
          milestone_id: milestoneId,
          session_id: sessionId,
          code: 'package main\nfunc main() {}',
        })
        .execute()

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
            { name: 'persistence', order: 2, status: 'not-met', expected: 'pass', actual: 'fail', errorHint: 'Data lost' },
          ]),
        })
        .execute()

      const mockRedis = createMockRedis()
      const assembler = createStuckContextAssembler({
        db,
        redis: mockRedis,
        contentRoot: CONTENT_FIXTURES_ROOT,
        promptsRoot: PROMPTS_FIXTURES_ROOT,
      })

      const prompt = await assembler.assembleStuckInterventionPrompt({
        userId: TEST_UID,
        sessionId,
        milestoneId,
        milestoneSlug: 'test-milestone',
        timeStuckMinutes: 15,
      })

      // Template variables should be replaced
      expect(prompt).not.toContain('{{milestone_brief}}')
      expect(prompt).not.toContain('{{current_code}}')
      expect(prompt).not.toContain('{{criteria_status}}')
      expect(prompt).not.toContain('{{stuck_criterion}}')
      expect(prompt).not.toContain('{{time_stuck_minutes}}')
      expect(prompt).not.toContain('{{recent_diffs}}')
      expect(prompt).not.toContain('{{user_background}}')

      // Actual values should be present
      expect(prompt).toContain('Build a key-value store')
      expect(prompt).toContain('package main')
      expect(prompt).toContain('persistence')
      expect(prompt).toContain('15')
      expect(prompt).toContain('Role: backend-engineer')
    })

    it('should handle missing stuck criterion gracefully when no completed submissions exist', async () => {
      const mockRedis = createMockRedis()
      const assembler = createStuckContextAssembler({
        db,
        redis: mockRedis,
        contentRoot: CONTENT_FIXTURES_ROOT,
        promptsRoot: PROMPTS_FIXTURES_ROOT,
      })

      const prompt = await assembler.assembleStuckInterventionPrompt({
        userId: TEST_UID,
        sessionId,
        milestoneId,
        milestoneSlug: 'test-milestone',
        timeStuckMinutes: 10,
      })

      expect(prompt).toContain('(unknown)')
    })

    it('should compute recent diffs from 2 snapshots', async () => {
      const baseTime = new Date()
      await db
        .insertInto('code_snapshots')
        .values([
          {
            id: generateId(),
            user_id: TEST_UID,
            milestone_id: milestoneId,
            session_id: sessionId,
            code: 'package main\nfunc main() {}',
            created_at: new Date(baseTime.getTime()),
          },
          {
            id: generateId(),
            user_id: TEST_UID,
            milestone_id: milestoneId,
            session_id: sessionId,
            code: 'package main\nfunc main() {}\nfunc Put() {}',
            created_at: new Date(baseTime.getTime() + 1000),
          },
        ])
        .execute()

      const mockRedis = createMockRedis()
      const assembler = createStuckContextAssembler({
        db,
        redis: mockRedis,
        contentRoot: CONTENT_FIXTURES_ROOT,
        promptsRoot: PROMPTS_FIXTURES_ROOT,
      })

      const prompt = await assembler.assembleStuckInterventionPrompt({
        userId: TEST_UID,
        sessionId,
        milestoneId,
        milestoneSlug: 'test-milestone',
        timeStuckMinutes: 20,
      })

      expect(prompt).toContain('Added')
      expect(prompt).toContain('removed')
      expect(prompt).toContain('func Put() {}')
    })

    it('should handle single snapshot with no diff available', async () => {
      await db
        .insertInto('code_snapshots')
        .values({
          id: generateId(),
          user_id: TEST_UID,
          milestone_id: milestoneId,
          session_id: sessionId,
          code: 'package main\nfunc main() {}',
        })
        .execute()

      const mockRedis = createMockRedis()
      const assembler = createStuckContextAssembler({
        db,
        redis: mockRedis,
        contentRoot: CONTENT_FIXTURES_ROOT,
        promptsRoot: PROMPTS_FIXTURES_ROOT,
      })

      const prompt = await assembler.assembleStuckInterventionPrompt({
        userId: TEST_UID,
        sessionId,
        milestoneId,
        milestoneSlug: 'test-milestone',
        timeStuckMinutes: 5,
      })

      expect(prompt).toContain('(No previous snapshot for comparison)')
    })

    it('should cache stuck intervention prompt template', async () => {
      const mockRedis = createMockRedis()
      const assembler = createStuckContextAssembler({
        db,
        redis: mockRedis,
        contentRoot: CONTENT_FIXTURES_ROOT,
        promptsRoot: PROMPTS_FIXTURES_ROOT,
      })

      const prompt1 = await assembler.assembleStuckInterventionPrompt({
        userId: TEST_UID,
        sessionId,
        milestoneId,
        milestoneSlug: 'test-milestone',
        timeStuckMinutes: 5,
      })

      const prompt2 = await assembler.assembleStuckInterventionPrompt({
        userId: TEST_UID,
        sessionId,
        milestoneId,
        milestoneSlug: 'test-milestone',
        timeStuckMinutes: 10,
      })

      // Both prompts should be valid (template was read and cached)
      expect(prompt1).toContain('5')
      expect(prompt2).toContain('10')
      // Both should contain the template header (proving it was loaded)
      expect(prompt1).toContain('Stuck Intervention')
      expect(prompt2).toContain('Stuck Intervention')
    })
  })
})
