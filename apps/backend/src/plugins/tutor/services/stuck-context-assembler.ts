import { readFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import type { Kysely } from 'kysely'
import type { DB, CriterionResult } from '@mycscompanion/shared'
import type { RedisCache } from './context-assembler.js'
import {
  loadMilestoneBrief,
  loadCurrentCode,
  loadCriteriaStatus,
  loadUserBackground,
  loadSessionSummary,
} from './context-helpers.js'

export interface StuckContextAssemblerOptions {
  readonly db: Kysely<DB>
  readonly redis: RedisCache
  readonly contentRoot?: string
  readonly promptsRoot?: string
}

export interface StuckContextAssembler {
  assembleStuckInterventionPrompt(params: StuckAssembleParams): Promise<string>
}

export interface StuckAssembleParams {
  readonly userId: string
  readonly sessionId: string
  readonly milestoneId: string
  readonly milestoneSlug: string
  readonly timeStuckMinutes: number
}

const DEFAULT_CONTENT_ROOT = resolve(process.cwd(), '..', '..', 'content', 'milestones')
const DEFAULT_PROMPTS_ROOT = resolve(process.cwd(), '..', '..', 'content', 'prompts')

export function createStuckContextAssembler(opts: StuckContextAssemblerOptions): StuckContextAssembler {
  const { db, redis } = opts
  const contentRoot = opts.contentRoot ?? DEFAULT_CONTENT_ROOT
  const promptsRoot = opts.promptsRoot ?? DEFAULT_PROMPTS_ROOT

  let cachedPromptTemplate: string | null = null

  async function loadPromptTemplate(): Promise<string> {
    if (cachedPromptTemplate) return cachedPromptTemplate
    cachedPromptTemplate = await readFile(join(promptsRoot, 'stuck-intervention.md'), 'utf-8')
    return cachedPromptTemplate
  }

  async function computeStuckCriterion(userId: string, milestoneId: string): Promise<string> {
    const submission = await db
      .selectFrom('submissions')
      .select('criteria_results')
      .where('user_id', '=', userId)
      .where('milestone_id', '=', milestoneId)
      .where('status', '=', 'completed')
      .orderBy('created_at', 'desc')
      .limit(1)
      .executeTakeFirst()

    if (!submission?.criteria_results) return '(unknown)'

    const results = submission.criteria_results as unknown as readonly CriterionResult[] | null
    if (!results) return '(unknown)'

    const firstUnmet = results.find((r) => r.status === 'not-met')
    return firstUnmet?.name ?? '(all criteria met)'
  }

  async function computeRecentDiffs(userId: string, milestoneId: string): Promise<string> {
    const snapshots = await db
      .selectFrom('code_snapshots')
      .select(['code', 'created_at'])
      .where('user_id', '=', userId)
      .where('milestone_id', '=', milestoneId)
      .orderBy('created_at', 'desc')
      .limit(2)
      .execute()

    if (snapshots.length < 2) return '(No previous snapshot for comparison)'

    const currentSnapshot = snapshots[0]
    const previousSnapshot = snapshots[1]
    if (!currentSnapshot || !previousSnapshot) return '(No previous snapshot for comparison)'

    const current = currentSnapshot.code.split('\n')
    const previous = previousSnapshot.code.split('\n')
    const added = current.filter((line) => !previous.includes(line))
    const removed = previous.filter((line) => !current.includes(line))

    return `Added ${added.length} lines, removed ${removed.length} lines.\n\nRecent additions:\n${added.slice(0, 10).join('\n')}`
  }

  return {
    async assembleStuckInterventionPrompt(params: StuckAssembleParams): Promise<string> {
      const [
        template,
        milestoneBrief,
        currentCode,
        criteriaStatus,
        userBackground,
        sessionSummary,
        stuckCriterion,
        recentDiffs,
      ] = await Promise.all([
        loadPromptTemplate(),
        loadMilestoneBrief(redis, contentRoot, params.milestoneSlug),
        loadCurrentCode(db, params.userId, params.milestoneId),
        loadCriteriaStatus(db, params.userId, params.milestoneId),
        loadUserBackground(db, params.userId),
        loadSessionSummary(db, params.userId, params.milestoneId),
        computeStuckCriterion(params.userId, params.milestoneId),
        computeRecentDiffs(params.userId, params.milestoneId),
      ])

      let prompt = template
        .replace('{{milestone_brief}}', milestoneBrief)
        .replace('{{current_code}}', currentCode)
        .replace('{{criteria_status}}', criteriaStatus)
        .replace('{{stuck_criterion}}', stuckCriterion)
        .replace('{{time_stuck_minutes}}', String(params.timeStuckMinutes))
        .replace('{{recent_diffs}}', recentDiffs)
        .replace('{{user_background}}', userBackground)

      if (sessionSummary) {
        prompt += `\n\n## Previous Session Summary\n\n${sessionSummary}`
      }

      return prompt
    },
  }
}
