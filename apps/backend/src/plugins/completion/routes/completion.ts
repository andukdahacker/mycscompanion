import type { FastifyInstance } from 'fastify'
import type { Kysely } from 'kysely'
import type { DB } from '@mycscompanion/shared'
import type { CriterionResult, MilestoneCompletionData, CompleteMilestoneResponse } from '@mycscompanion/shared'
import { generateId } from '../../../shared/id.js'

const BRIEF_EXCERPT_LENGTH = 200

export interface BriefLoader {
  loadMilestoneBrief(slug: string): Promise<string | null>
}

interface CompletionRoutesOptions {
  readonly db: Kysely<DB>
  readonly contentLoader: BriefLoader
}

export async function completionRoutes(
  fastify: FastifyInstance,
  opts: CompletionRoutesOptions
): Promise<void> {
  const { db, contentLoader } = opts

  fastify.get<{ Params: { milestoneId: string } }>(
    '/:milestoneId',
    async (request, reply) => {
      const { milestoneId } = request.params
      const uid = request.uid

      const userMilestone = await db
        .selectFrom('user_milestones')
        .select(['id', 'milestone_id', 'completed_at', 'completing_submission_id'])
        .where('user_id', '=', uid)
        .where('milestone_id', '=', milestoneId)
        .executeTakeFirst()

      if (!userMilestone) {
        return reply.status(404).send({
          error: { code: 'NOT_FOUND', message: 'Milestone completion not found' },
        })
      }

      const milestone = await db
        .selectFrom('milestones')
        .select(['id', 'title', 'slug', 'position', 'track_id'])
        .where('id', '=', milestoneId)
        .executeTakeFirstOrThrow()

      let criteriaResults: readonly CriterionResult[] = []
      if (userMilestone.completing_submission_id) {
        const submission = await db
          .selectFrom('submissions')
          .select(['criteria_results'])
          .where('id', '=', userMilestone.completing_submission_id)
          .executeTakeFirst()

        if (submission?.criteria_results) {
          // criteria_results JSONB stores camelCase keys matching CriterionResult
          criteriaResults = submission.criteria_results as unknown[] as readonly CriterionResult[]
        }
      }

      const nextMilestone = await db
        .selectFrom('milestones')
        .select(['id', 'title', 'slug', 'position'])
        .where('track_id', '=', milestone.track_id)
        .where('position', '=', milestone.position + 1)
        .executeTakeFirst()

      let nextMilestonePreview = null
      if (nextMilestone) {
        const brief = await contentLoader.loadMilestoneBrief(nextMilestone.slug)
        nextMilestonePreview = {
          id: nextMilestone.id,
          title: nextMilestone.title,
          position: nextMilestone.position,
          briefExcerpt: brief ? brief.slice(0, BRIEF_EXCERPT_LENGTH) : '',
        }
      }

      const result: MilestoneCompletionData = {
        milestoneId: milestone.id,
        milestoneName: milestone.title,
        milestoneNumber: milestone.position,
        completedAt: (userMilestone.completed_at instanceof Date
          ? userMilestone.completed_at
          : new Date(String(userMilestone.completed_at))
        ).toISOString(),
        criteriaResults,
        nextMilestone: nextMilestonePreview,
      }

      return result
    }
  )

  fastify.post<{ Params: { milestoneId: string }; Body: { submissionId: string } }>(
    '/:milestoneId/complete',
    {
      schema: {
        body: {
          type: 'object',
          required: ['submissionId'],
          properties: {
            submissionId: { type: 'string' },
          },
          additionalProperties: false,
        },
      },
    },
    async (request, reply) => {
      const { milestoneId } = request.params
      const { submissionId } = request.body
      const uid = request.uid

      const submission = await db
        .selectFrom('submissions')
        .select(['id', 'user_id', 'status', 'criteria_results'])
        .where('id', '=', submissionId)
        .executeTakeFirst()

      if (!submission) {
        return reply.status(404).send({
          error: { code: 'NOT_FOUND', message: 'Submission not found' },
        })
      }

      if (submission.user_id !== uid) {
        return reply.status(403).send({
          error: { code: 'FORBIDDEN', message: 'Submission does not belong to user' },
        })
      }

      if (submission.status !== 'completed') {
        return reply.status(409).send({
          error: { code: 'SUBMISSION_NOT_COMPLETED', message: 'Submission has not completed execution' },
        })
      }

      if (!submission.criteria_results) {
        return reply.status(409).send({
          error: { code: 'CRITERIA_NOT_MET', message: 'Not all criteria are met' },
        })
      }

      const parsedResults = Array.isArray(submission.criteria_results) ? submission.criteria_results : []
      const allMet = parsedResults.length > 0
        && parsedResults.every((r) => r !== null && typeof r === 'object' && 'status' in r && r['status'] === 'met')

      if (!allMet) {
        return reply.status(409).send({
          error: { code: 'CRITERIA_NOT_MET', message: 'Not all criteria are met' },
        })
      }

      // Check for existing completion (idempotent)
      const existing = await db
        .selectFrom('user_milestones')
        .select(['id'])
        .where('user_id', '=', uid)
        .where('milestone_id', '=', milestoneId)
        .executeTakeFirst()

      if (!existing) {
        await db
          .insertInto('user_milestones')
          .values({
            id: generateId(),
            user_id: uid,
            milestone_id: milestoneId,
            completing_submission_id: submissionId,
          })
          .execute()
      }

      request.log.info({ userId: uid, milestoneId, submissionId }, 'milestone completed')

      const currentMilestone = await db
        .selectFrom('milestones')
        .select(['track_id', 'position'])
        .where('id', '=', milestoneId)
        .executeTakeFirstOrThrow()

      const nextMilestone = await db
        .selectFrom('milestones')
        .select(['id'])
        .where('track_id', '=', currentMilestone.track_id)
        .where('position', '=', currentMilestone.position + 1)
        .executeTakeFirst()

      const result: CompleteMilestoneResponse = {
        nextMilestoneId: nextMilestone?.id ?? null,
      }

      return result
    }
  )
}
