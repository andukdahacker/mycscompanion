import { readFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import type { Kysely } from 'kysely'
import type { DB } from '@mycscompanion/shared'
import {
  loadMilestoneBrief,
  loadCurrentCode,
  loadCriteriaStatus,
  loadUserBackground,
  loadSessionSummary,
} from './context-helpers.js'

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

  return {
    async assembleSystemPrompt(params: AssembleParams): Promise<string> {
      const [basePrompt, milestoneBrief, currentCode, criteriaStatus, userBackground, sessionSummary] =
        await Promise.all([
          loadBasePrompt(),
          loadMilestoneBrief(redis, contentRoot, params.milestoneSlug),
          loadCurrentCode(db, params.userId, params.milestoneId),
          loadCriteriaStatus(db, params.userId, params.milestoneId),
          loadUserBackground(db, params.userId),
          loadSessionSummary(db, params.userId, params.milestoneId),
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
