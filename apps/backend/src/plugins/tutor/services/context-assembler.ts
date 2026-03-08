import { readFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import type { Kysely } from 'kysely'
import type { DB } from '@mycscompanion/shared'
import type { CriterionResult } from '@mycscompanion/shared'

export interface RedisCache {
  get(key: string): Promise<string | null>
  set(key: string, value: string, expiryMode: string, duration: number): Promise<string | null>
}

export type ContextAssemblerOptions = {
  readonly db: Kysely<DB>
  readonly redis: RedisCache
  readonly contentRoot?: string
  readonly promptsRoot?: string
}

export type AssembleParams = {
  readonly userId: string
  readonly sessionId: string
  readonly milestoneId: string
  readonly milestoneSlug: string
}

export interface ContextAssembler {
  assembleSystemPrompt(params: AssembleParams): Promise<string>
}

const DEFAULT_CONTENT_ROOT = resolve(process.cwd(), '..', '..', 'content', 'milestones')
const DEFAULT_PROMPTS_ROOT = resolve(process.cwd(), '..', '..', 'content', 'prompts')

export function createContextAssembler(opts: ContextAssemblerOptions): ContextAssembler {
  const { db, redis } = opts
  const contentRoot = opts.contentRoot ?? DEFAULT_CONTENT_ROOT
  const promptsRoot = opts.promptsRoot ?? DEFAULT_PROMPTS_ROOT

  let cachedBasePrompt: string | null = null

  async function loadBasePrompt(): Promise<string> {
    if (cachedBasePrompt) return cachedBasePrompt
    cachedBasePrompt = await readFile(join(promptsRoot, 'tutor-base.md'), 'utf-8')
    return cachedBasePrompt
  }

  async function loadMilestoneBrief(milestoneSlug: string): Promise<string> {
    const cacheKey = `tutor:brief:${milestoneSlug}`
    const cached = await redis.get(cacheKey)
    if (cached) return cached

    try {
      const brief = await readFile(join(contentRoot, milestoneSlug, 'brief.md'), 'utf-8')
      await redis.set(cacheKey, brief, 'EX', 3600)
      return brief
    } catch {
      return '(No milestone brief available)'
    }
  }

  async function loadCurrentCode(userId: string, milestoneId: string): Promise<string> {
    const snapshot = await db
      .selectFrom('code_snapshots')
      .select('code')
      .where('user_id', '=', userId)
      .where('milestone_id', '=', milestoneId)
      .orderBy('created_at', 'desc')
      .limit(1)
      .executeTakeFirst()

    return snapshot?.code ?? '(No code submitted yet)'
  }

  async function loadCriteriaStatus(userId: string, milestoneId: string): Promise<string> {
    const submission = await db
      .selectFrom('submissions')
      .select('criteria_results')
      .where('user_id', '=', userId)
      .where('milestone_id', '=', milestoneId)
      .where('status', '=', 'completed')
      .orderBy('created_at', 'desc')
      .limit(1)
      .executeTakeFirst()

    if (!submission?.criteria_results) return '(No submissions yet)'

    const results = submission.criteria_results as unknown as readonly CriterionResult[] | null
    if (!results) return '(No criteria results)'

    return results
      .map((r) => `- ${r.name}: ${r.status}${r.errorHint ? ` (${r.errorHint})` : ''}`)
      .join('\n')
  }

  async function loadUserBackground(userId: string): Promise<string> {
    const user = await db
      .selectFrom('users')
      .select(['role', 'experience_level', 'primary_language'])
      .where('id', '=', userId)
      .executeTakeFirst()

    if (!user) return '(Unknown user)'

    const parts: string[] = []
    if (user.role) parts.push(`Role: ${user.role}`)
    if (user.experience_level) parts.push(`Experience: ${user.experience_level}`)
    if (user.primary_language) parts.push(`Primary language: ${user.primary_language}`)

    return parts.length > 0 ? parts.join(', ') : '(No background info provided)'
  }

  async function loadSessionSummary(userId: string, milestoneId: string): Promise<string | null> {
    const summary = await db
      .selectFrom('session_summaries')
      .select('summary_text')
      .where('user_id', '=', userId)
      .where('milestone_id', '=', milestoneId)
      .orderBy('created_at', 'desc')
      .limit(1)
      .executeTakeFirst()

    return summary?.summary_text ?? null
  }

  return {
    async assembleSystemPrompt(params: AssembleParams): Promise<string> {
      const [basePrompt, milestoneBrief, currentCode, criteriaStatus, userBackground, sessionSummary] =
        await Promise.all([
          loadBasePrompt(),
          loadMilestoneBrief(params.milestoneSlug),
          loadCurrentCode(params.userId, params.milestoneId),
          loadCriteriaStatus(params.userId, params.milestoneId),
          loadUserBackground(params.userId),
          loadSessionSummary(params.userId, params.milestoneId),
        ])

      let prompt = basePrompt
        .replace('{{milestone_brief}}', milestoneBrief)
        .replace('{{current_code}}', currentCode)
        .replace('{{criteria_status}}', criteriaStatus)
        .replace('{{user_background}}', userBackground)

      if (sessionSummary) {
        prompt += `\n\n## Previous Session Summary\n\n${sessionSummary}`
      }

      return prompt
    },
  }
}
