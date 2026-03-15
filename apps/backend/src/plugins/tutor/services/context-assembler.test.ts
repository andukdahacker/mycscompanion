import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { join } from 'node:path'
import { db } from '../../../shared/db.js'
import { generateId } from '../../../shared/id.js'
import { createContextAssembler } from './context-assembler.js'
import type { RedisCache } from './context-assembler.js'

const TEST_UID = 'test-context-uid'

// Mock Redis for brief caching
function createMockRedis(): RedisCache {
  const store = new Map<string, string>()
  return {
    get: vi.fn(async (key: string) => store.get(key) ?? null),
    set: vi.fn(async (key: string, value: string, _expiryMode: string, _duration: number) => {
      store.set(key, value)
      return 'OK'
    }),
  }
}

// Use test fixtures for content
const FIXTURES_ROOT = join(process.cwd(), 'src', 'plugins', 'tutor', 'services', '__fixtures__')
const PROMPTS_FIXTURES_ROOT = join(FIXTURES_ROOT, 'prompts')
const CONTENT_FIXTURES_ROOT = join(FIXTURES_ROOT, 'milestones')

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
      email: 'context-test@example.com',
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

describe('ContextAssembler', () => {
  describe('assembleSystemPrompt', () => {
    it('should include milestone brief when session is active', async () => {
      const mockRedis = createMockRedis()
      const assembler = createContextAssembler({
        db,
        redis: mockRedis,
        contentRoot: CONTENT_FIXTURES_ROOT,
        promptsRoot: PROMPTS_FIXTURES_ROOT,
      })

      const prompt = await assembler.assembleSystemPrompt({
        userId: TEST_UID,
        sessionId,
        milestoneId,
        milestoneSlug: 'test-milestone',
      })

      expect(prompt).toContain('Build a key-value store')
    })

    it('should include current code from latest snapshot', async () => {
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

      const mockRedis = createMockRedis()
      const assembler = createContextAssembler({
        db,
        redis: mockRedis,
        contentRoot: CONTENT_FIXTURES_ROOT,
        promptsRoot: PROMPTS_FIXTURES_ROOT,
      })

      const prompt = await assembler.assembleSystemPrompt({
        userId: TEST_UID,
        sessionId,
        milestoneId,
        milestoneSlug: 'test-milestone',
      })

      expect(prompt).toContain('package main')
      expect(prompt).toContain('fmt.Println("hello")')
    })

    it('should include criteria status from latest submission', async () => {
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

      const mockRedis = createMockRedis()
      const assembler = createContextAssembler({
        db,
        redis: mockRedis,
        contentRoot: CONTENT_FIXTURES_ROOT,
        promptsRoot: PROMPTS_FIXTURES_ROOT,
      })

      const prompt = await assembler.assembleSystemPrompt({
        userId: TEST_UID,
        sessionId,
        milestoneId,
        milestoneSlug: 'test-milestone',
      })

      expect(prompt).toContain('put-and-get: met')
      expect(prompt).toContain('persistence: not-met (Data lost on restart)')
    })

    it('should include user background', async () => {
      const mockRedis = createMockRedis()
      const assembler = createContextAssembler({
        db,
        redis: mockRedis,
        contentRoot: CONTENT_FIXTURES_ROOT,
        promptsRoot: PROMPTS_FIXTURES_ROOT,
      })

      const prompt = await assembler.assembleSystemPrompt({
        userId: TEST_UID,
        sessionId,
        milestoneId,
        milestoneSlug: 'test-milestone',
      })

      expect(prompt).toContain('Role: backend-engineer')
      expect(prompt).toContain('Experience: 3-to-5')
      expect(prompt).toContain('Primary language: go')
    })

    it('should include session summary for returning users', async () => {
      await db
        .insertInto('session_summaries')
        .values({
          id: generateId(),
          user_id: TEST_UID,
          session_id: sessionId,
          milestone_id: milestoneId,
          summary_text: 'Last session you worked on implementing Put and Get methods.',
        })
        .execute()

      const mockRedis = createMockRedis()
      const assembler = createContextAssembler({
        db,
        redis: mockRedis,
        contentRoot: CONTENT_FIXTURES_ROOT,
        promptsRoot: PROMPTS_FIXTURES_ROOT,
      })

      const prompt = await assembler.assembleSystemPrompt({
        userId: TEST_UID,
        sessionId,
        milestoneId,
        milestoneSlug: 'test-milestone',
      })

      expect(prompt).toContain('Previous Session Summary')
      expect(prompt).toContain('Last session you worked on implementing Put and Get methods.')
    })

    it('should handle missing optional context gracefully', async () => {
      const mockRedis = createMockRedis()
      const assembler = createContextAssembler({
        db,
        redis: mockRedis,
        contentRoot: CONTENT_FIXTURES_ROOT,
        promptsRoot: PROMPTS_FIXTURES_ROOT,
      })

      const prompt = await assembler.assembleSystemPrompt({
        userId: TEST_UID,
        sessionId,
        milestoneId,
        milestoneSlug: 'test-milestone',
      })

      // Should still produce a valid prompt with fallback values
      expect(prompt).toContain('(No code submitted yet)')
      expect(prompt).toContain('(No submissions yet)')
      // Should NOT contain session summary section when there is none
      expect(prompt).not.toContain('Previous Session Summary')
    })

    it('should replace template variables correctly', async () => {
      const mockRedis = createMockRedis()
      const assembler = createContextAssembler({
        db,
        redis: mockRedis,
        contentRoot: CONTENT_FIXTURES_ROOT,
        promptsRoot: PROMPTS_FIXTURES_ROOT,
      })

      const prompt = await assembler.assembleSystemPrompt({
        userId: TEST_UID,
        sessionId,
        milestoneId,
        milestoneSlug: 'test-milestone',
      })

      // Template variables should be replaced, not present as raw placeholders
      expect(prompt).not.toContain('{{milestone_brief}}')
      expect(prompt).not.toContain('{{current_code}}')
      expect(prompt).not.toContain('{{criteria_status}}')
      expect(prompt).not.toContain('{{user_background}}')
    })

    it('should include explainer metadata in system prompt when assets exist', async () => {
      const mockRedis = createMockRedis()
      const assembler = createContextAssembler({
        db,
        redis: mockRedis,
        contentRoot: CONTENT_FIXTURES_ROOT,
        promptsRoot: PROMPTS_FIXTURES_ROOT,
      })

      const prompt = await assembler.assembleSystemPrompt({
        userId: TEST_UID,
        sessionId,
        milestoneId,
        milestoneSlug: 'test-milestone',
      })

      expect(prompt).toContain('kv-store-operations.svg')
      expect(prompt).toContain('Key-Value Store Operations')
      expect(prompt).toContain('persistence-flow.svg')
      expect(prompt).toContain('Persistence Flow')
      expect(prompt).not.toContain('{{available_explainers}}')
    })

    it('should replace placeholder with no explainers message when no assets exist', async () => {
      const mockRedis = createMockRedis()
      const assembler = createContextAssembler({
        db,
        redis: mockRedis,
        contentRoot: CONTENT_FIXTURES_ROOT,
        promptsRoot: PROMPTS_FIXTURES_ROOT,
      })

      const prompt = await assembler.assembleSystemPrompt({
        userId: TEST_UID,
        sessionId,
        milestoneId,
        milestoneSlug: 'nonexistent-milestone',
      })

      expect(prompt).toContain('No visual explainers available for this milestone.')
      expect(prompt).not.toContain('{{available_explainers}}')
    })

    it('should re-read prompt from filesystem after resetPromptCache', async () => {
      const mockRedis = createMockRedis()
      const assembler = createContextAssembler({
        db,
        redis: mockRedis,
        contentRoot: CONTENT_FIXTURES_ROOT,
        promptsRoot: PROMPTS_FIXTURES_ROOT,
      })

      const prompt1 = await assembler.assembleSystemPrompt({
        userId: TEST_UID,
        sessionId,
        milestoneId,
        milestoneSlug: 'test-milestone',
      })

      expect(prompt1).toContain('Build a key-value store')

      // Reset cache — next call will re-read from filesystem
      assembler.resetPromptCache()

      const prompt2 = await assembler.assembleSystemPrompt({
        userId: TEST_UID,
        sessionId,
        milestoneId,
        milestoneSlug: 'test-milestone',
      })

      // Should still work after cache reset
      expect(prompt2).toContain('Build a key-value store')
    })

    it('should cache milestone brief in Redis', async () => {
      const mockRedis = createMockRedis()
      const assembler = createContextAssembler({
        db,
        redis: mockRedis,
        contentRoot: CONTENT_FIXTURES_ROOT,
        promptsRoot: PROMPTS_FIXTURES_ROOT,
      })

      await assembler.assembleSystemPrompt({
        userId: TEST_UID,
        sessionId,
        milestoneId,
        milestoneSlug: 'test-milestone',
      })

      expect(mockRedis.set).toHaveBeenCalledWith(
        'tutor:brief:test-milestone',
        expect.stringContaining('Build a key-value store'),
        'EX',
        3600
      )
    })
  })
})
