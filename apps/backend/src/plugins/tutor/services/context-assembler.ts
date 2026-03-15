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
  loadConceptExplainerMetadata,
} from './context-helpers.js'

export interface RedisCache {
  get(key: string): Promise<string | null>
  set(key: string, value: string, expiryMode: string, duration: number): Promise<string | null>
}

export interface ContextAssemblerLogger {
  warn(obj: Record<string, unknown>, msg: string): void
  error(obj: Record<string, unknown>, msg: string): void
}

export type ContextAssemblerOptions = {
  readonly db: Kysely<DB>
  readonly redis: RedisCache
  readonly contentRoot?: string
  readonly promptsRoot?: string
  readonly log?: ContextAssemblerLogger
}

export type AssembleParams = {
  readonly userId: string
  readonly sessionId: string
  readonly milestoneId: string
  readonly milestoneSlug: string
}

export interface ContextAssembler {
  assembleSystemPrompt(params: AssembleParams): Promise<string>
  resetPromptCache(): void
}

const DEFAULT_CONTENT_ROOT = resolve(process.cwd(), '..', '..', 'content', 'milestones')
const DEFAULT_PROMPTS_ROOT = resolve(process.cwd(), '..', '..', 'content', 'prompts')

const EXPECTED_TEMPLATE_VARS = [
  '{{milestone_brief}}',
  '{{current_code}}',
  '{{criteria_status}}',
  '{{user_background}}',
  '{{available_explainers}}',
]

export function createContextAssembler(opts: ContextAssemblerOptions): ContextAssembler {
  const { db, redis, log } = opts
  const contentRoot = opts.contentRoot ?? DEFAULT_CONTENT_ROOT
  const promptsRoot = opts.promptsRoot ?? DEFAULT_PROMPTS_ROOT

  let cachedBasePrompt: string | null = null

  async function loadBasePrompt(): Promise<string> {
    if (cachedBasePrompt) return cachedBasePrompt

    const filePath = join(promptsRoot, 'tutor-base.md')
    try {
      const content = await readFile(filePath, 'utf-8')
      if (content.length === 0) {
        log?.warn({ filePath }, 'Tutor base prompt file is empty')
      }
      const missingVars = EXPECTED_TEMPLATE_VARS.filter((v) => !content.includes(v))
      if (missingVars.length > 0) {
        log?.warn({ filePath, missingVars }, 'Tutor base prompt is missing expected template variables')
      }
      cachedBasePrompt = content
      return content
    } catch (err) {
      if (cachedBasePrompt) {
        log?.error({ filePath, error: String(err) }, 'Failed to reload tutor base prompt — using cached version')
        return cachedBasePrompt
      }
      throw new Error(`Failed to load tutor base prompt from ${filePath}: ${String(err)}`)
    }
  }

  return {
    resetPromptCache(): void {
      cachedBasePrompt = null
    },

    async assembleSystemPrompt(params: AssembleParams): Promise<string> {
      const [basePrompt, milestoneBrief, currentCode, criteriaStatus, userBackground, sessionSummary, explainerMetadata] =
        await Promise.all([
          loadBasePrompt(),
          loadMilestoneBrief(redis, contentRoot, params.milestoneSlug),
          loadCurrentCode(db, params.userId, params.milestoneId),
          loadCriteriaStatus(db, params.userId, params.milestoneId),
          loadUserBackground(db, params.userId),
          loadSessionSummary(db, params.userId, params.milestoneId),
          loadConceptExplainerMetadata(redis, contentRoot, params.milestoneSlug),
        ])

      const explainersText =
        explainerMetadata.length > 0
          ? explainerMetadata
              .map((e) => `- ${e.filename}: "${e.title}" — ${e.altText}`)
              .join('\n')
          : 'No visual explainers available for this milestone.'

      let prompt = basePrompt
        .replace('{{milestone_brief}}', milestoneBrief)
        .replace('{{current_code}}', currentCode)
        .replace('{{criteria_status}}', criteriaStatus)
        .replace('{{user_background}}', userBackground)
        .replace('{{available_explainers}}', explainersText)

      if (sessionSummary) {
        prompt += `\n\n## Previous Session Summary\n\n${sessionSummary}`
      }

      return prompt
    },
  }
}
