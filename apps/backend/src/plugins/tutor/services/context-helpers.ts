import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { Kysely } from 'kysely'
import type { DB, CriterionResult } from '@mycscompanion/shared'
import type { RedisCache } from './context-assembler.js'

export async function loadMilestoneBrief(
  redis: RedisCache,
  contentRoot: string,
  milestoneSlug: string
): Promise<string> {
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

export async function loadCurrentCode(
  db: Kysely<DB>,
  userId: string,
  milestoneId: string
): Promise<string> {
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

export async function loadCriteriaStatus(
  db: Kysely<DB>,
  userId: string,
  milestoneId: string
): Promise<string> {
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

export async function loadUserBackground(
  db: Kysely<DB>,
  userId: string
): Promise<string> {
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

export async function loadSessionSummary(
  db: Kysely<DB>,
  userId: string,
  milestoneId: string
): Promise<string | null> {
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
