import type { FastifyInstance } from 'fastify'
import type { Kysely } from 'kysely'
import type { DB } from '@mycscompanion/shared'
import type { TutorMessageResponse } from '@mycscompanion/shared'
import type { RateLimitChecker } from '../../../shared/rate-limiter.js'
import type { AnthropicService } from '../services/anthropic.js'
import type { ContextAssembler } from '../services/context-assembler.js'
import { loadConversationHistory } from '../services/conversation-history.js'
import { generateId } from '../../../shared/id.js'
import * as Sentry from '@sentry/node'

export type MessageRoutesOptions = {
  readonly db: Kysely<DB>
  readonly anthropicService: AnthropicService
  readonly contextAssembler: ContextAssembler
  readonly rateLimiter: RateLimitChecker
}

const messageSchema = {
  params: {
    type: 'object' as const,
    required: ['sessionId'],
    properties: {
      sessionId: { type: 'string' as const },
    },
  },
  body: {
    type: 'object' as const,
    required: ['message'],
    properties: {
      message: { type: 'string' as const, minLength: 1, maxLength: 2000 },
    },
  },
}

export async function messageRoutes(
  fastify: FastifyInstance,
  opts: MessageRoutesOptions
): Promise<void> {
  const { db, anthropicService, contextAssembler, rateLimiter } = opts

  fastify.post<{ Params: { sessionId: string }; Body: { message: string } }>(
    '/:sessionId/message',
    { schema: messageSchema },
    async (request, reply) => {
      const uid = request.uid
      const { sessionId } = request.params
      const message = request.body.message.trim()

      if (message.length === 0) {
        return reply.status(400).send({
          error: { code: 'MESSAGE_EMPTY', message: 'Message cannot be empty or whitespace-only' },
        })
      }

      // 1. Rate limit check
      const rateResult = await rateLimiter.check(`rate:tutor:${uid}`)
      if (!rateResult.allowed) {
        return reply.status(429).send({
          error: {
            code: 'RATE_LIMITED',
            message: 'Too many tutor messages',
            retryAfter: Math.ceil(rateResult.retryAfterMs / 1000),
          },
        })
      }

      // 2. Validate session ownership and get milestone info
      const session = await db
        .selectFrom('sessions')
        .select(['id', 'milestone_id'])
        .where('id', '=', sessionId)
        .where('user_id', '=', uid)
        .executeTakeFirst()

      if (!session) {
        return reply.status(404).send({
          error: { code: 'SESSION_NOT_FOUND', message: 'Session not found' },
        })
      }

      // 3. Get milestone slug for content loading
      const milestone = await db
        .selectFrom('milestones')
        .select(['slug'])
        .where('id', '=', session.milestone_id)
        .executeTakeFirst()

      if (!milestone) {
        return reply.status(404).send({
          error: { code: 'SESSION_NOT_FOUND', message: 'Session not found' },
        })
      }

      // 4. Load conversation history (cap at 50 most recent to limit token cost)
      const previousMessages = await loadConversationHistory(db, sessionId)

      const conversationHistory = [
        ...previousMessages,
        { role: 'user' as const, content: message },
      ]

      // 5. Check for compile errors in latest submission
      const latestSubmission = await db
        .selectFrom('submissions')
        .select(['status', 'error_message'])
        .where('user_id', '=', uid)
        .where('milestone_id', '=', session.milestone_id)
        .orderBy('created_at', 'desc')
        .limit(1)
        .executeTakeFirst()

      const hasCompileErrors = latestSubmission?.status === 'failed' && !!latestSubmission.error_message

      // 6. Assemble context
      const systemPrompt = await contextAssembler.assembleSystemPrompt({
        userId: uid,
        sessionId,
        milestoneId: session.milestone_id,
        milestoneSlug: milestone.slug,
      })

      // 7. Call Anthropic API
      const context = { userMessage: message, hasCompileErrors }
      let tutorResponse: { content: string; model: string }
      try {
        tutorResponse = await anthropicService.createTutorResponse({
          systemPrompt,
          conversationHistory,
          context,
        })
      } catch (error) {
        Sentry.captureException(error, {
          extra: {
            hasCompileErrors,
            messageLength: message.length,
            errorType: error instanceof Error ? error.constructor.name : 'Unknown',
          },
        })
        return reply.status(503).send({
          error: { code: 'TUTOR_UNAVAILABLE', message: 'Tutor is temporarily unavailable' },
        })
      }

      // 8. Persist both messages
      const userMessageId = generateId()
      const assistantMessageId = generateId()
      const now = new Date()

      await db
        .insertInto('tutor_messages')
        .values([
          {
            id: userMessageId,
            session_id: sessionId,
            user_id: uid,
            role: 'user',
            content: message,
            model: null,
            created_at: now,
          },
          {
            id: assistantMessageId,
            session_id: sessionId,
            user_id: uid,
            role: 'assistant',
            content: tutorResponse.content,
            model: tutorResponse.model,
            created_at: new Date(now.getTime() + 1), // Ensure ordering
          },
        ])
        .execute()

      // 9. Return response
      return {
        id: assistantMessageId,
        role: 'assistant' as const,
        content: tutorResponse.content,
        model: tutorResponse.model,
        createdAt: new Date(now.getTime() + 1).toISOString(),
      } satisfies TutorMessageResponse
    }
  )
}
