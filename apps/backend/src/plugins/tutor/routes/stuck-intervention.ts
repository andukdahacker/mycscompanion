import type { FastifyInstance } from 'fastify'
import type { Kysely } from 'kysely'
import type { DB } from '@mycscompanion/shared'
import type { TutorStreamEvent } from '@mycscompanion/shared'
import type { RateLimitChecker } from '../../../shared/rate-limiter.js'
import type { AnthropicService, AnthropicMessageStream } from '../services/anthropic.js'
import type { StuckContextAssembler } from '../services/stuck-context-assembler.js'
import type { CircuitBreaker } from '../services/circuit-breaker.js'
import type { TutorMetrics } from '../services/tutor-metrics.js'
import { CircuitOpenError } from '../services/circuit-breaker.js'
import { classifyError } from '../services/anthropic.js'
import { loadConversationHistory } from '../services/conversation-history.js'
import { generateId } from '../../../shared/id.js'
import * as Sentry from '@sentry/node'

const HEARTBEAT_INTERVAL_MS = 30_000
const MAX_STREAM_DURATION_MS = 180_000

export type StuckInterventionRoutesOptions = {
  readonly db: Kysely<DB>
  readonly anthropicService: AnthropicService
  readonly stuckContextAssembler: StuckContextAssembler
  readonly rateLimiter: RateLimitChecker
  readonly circuitBreaker: CircuitBreaker
  readonly tutorMetrics: TutorMetrics | null
}

const stuckInterventionSchema = {
  params: {
    type: 'object' as const,
    required: ['sessionId'],
    properties: {
      sessionId: { type: 'string' as const },
    },
  },
  body: {
    type: 'object' as const,
    required: ['timeStuckMinutes'],
    additionalProperties: false,
    properties: {
      timeStuckMinutes: { type: 'integer' as const, minimum: 1, maximum: 60 },
    },
  },
}

function writeSSE(raw: NodeJS.WritableStream, event: TutorStreamEvent): void {
  raw.write(`data: ${JSON.stringify(event)}\n\n`)
}

export async function stuckInterventionRoutes(
  fastify: FastifyInstance,
  opts: StuckInterventionRoutesOptions
): Promise<void> {
  const { db, anthropicService, stuckContextAssembler, rateLimiter, circuitBreaker, tutorMetrics } = opts

  fastify.post<{ Params: { sessionId: string }; Body: { timeStuckMinutes: number } }>(
    '/:sessionId/stuck-intervention',
    { schema: stuckInterventionSchema },
    async (request, reply) => {
      const uid = request.uid
      const { sessionId } = request.params
      const { timeStuckMinutes } = request.body

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

      // 2. Validate session ownership
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

      // 3. Get milestone slug
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

      // 4. Persist synthetic user message
      const syntheticMessageId = generateId()
      await db
        .insertInto('tutor_messages')
        .values({
          id: syntheticMessageId,
          session_id: sessionId,
          user_id: uid,
          role: 'user',
          content: '[System: Stuck detection triggered — proactive intervention]',
          model: null,
          created_at: new Date(),
        })
        .execute()

      // 5. Load conversation history (includes synthetic message)
      const conversationHistory = await loadConversationHistory(db, sessionId)

      // 6. Assemble stuck intervention prompt
      const systemPrompt = await stuckContextAssembler.assembleStuckInterventionPrompt({
        userId: uid,
        sessionId,
        milestoneId: session.milestone_id,
        milestoneSlug: milestone.slug,
        timeStuckMinutes,
      })

      // 7. Start Anthropic stream (forced Sonnet via isStuckIntervention)
      const context = {
        userMessage: '[System: Stuck detection triggered]',
        hasCompileErrors: false,
        isStuckIntervention: true,
      }

      const requestStartTime = Date.now()
      let stream: AnthropicMessageStream
      try {
        stream = anthropicService.createStreamingTutorResponse({
          systemPrompt,
          conversationHistory: [...conversationHistory],
          context,
        })
      } catch (error) {
        if (error instanceof CircuitOpenError) {
          await tutorMetrics?.recordFailure('circuit_open')
          request.log.info({ event: 'tutor_request', success: false, durationMs: Date.now() - requestStartTime, errorType: 'circuit_open' }, 'tutor_request')
          return reply
            .status(503)
            .header('Retry-After', String(Math.ceil(error.retryAfterMs / 1000)))
            .send({
              error: {
                code: 'TUTOR_UNAVAILABLE',
                message: 'AI tutor temporarily unavailable',
                retryAfter: Math.ceil(error.retryAfterMs / 1000),
              },
            })
        }
        const errorType = classifyError(error)
        await tutorMetrics?.recordFailure(errorType)
        const logLevel = errorType === 'rate_limit' || errorType === 'overloaded' || errorType === 'timeout' ? 'warn' : 'error'
        request.log[logLevel]({ event: 'tutor_request', success: false, durationMs: Date.now() - requestStartTime, errorType }, 'tutor_request')
        Sentry.captureException(error, {
          tags: { tutor_error_type: errorType },
          extra: { circuitState: circuitBreaker.state },
        })
        const retryAfter = circuitBreaker.retryAfterSeconds()
        return reply
          .status(503)
          .header('Retry-After', String(retryAfter ?? 30))
          .send({
            error: {
              code: 'TUTOR_UNAVAILABLE',
              message: 'Tutor is temporarily unavailable',
              retryAfter: retryAfter ?? 30,
            },
          })
      }

      // 8. Set SSE headers
      const origin = request.headers.origin ?? '*'
      reply.raw.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Credentials': 'true',
      })

      if (typeof request.raw.socket?.setTimeout === 'function') {
        request.raw.socket.setTimeout(0)
      }

      // 9. Setup cleanup and heartbeat
      let isClosed = false
      const heartbeatTimer = setInterval(() => {
        if (!isClosed) reply.raw.write(': heartbeat\n\n')
      }, HEARTBEAT_INTERVAL_MS)

      const maxDurationTimer = setTimeout(() => cleanup(), MAX_STREAM_DURATION_MS)

      function cleanup(): void {
        if (isClosed) return
        isClosed = true
        clearInterval(heartbeatTimer)
        clearTimeout(maxDurationTimer)
        reply.raw.end()
      }

      request.raw.on('close', cleanup)
      reply.raw.on('error', cleanup)

      // 10. Forward stream events
      stream.on('text', (textDelta: string) => {
        if (isClosed) return
        writeSSE(reply.raw, { type: 'text_delta', delta: textDelta })
      })

      stream.on('finalMessage', async (finalMessage) => {
        if (isClosed) return

        const fullText = finalMessage.content[0]?.type === 'text'
          ? (finalMessage.content[0].text ?? '')
          : ''

        const assistantMessageId = generateId()

        writeSSE(reply.raw, {
          type: 'message_complete',
          id: assistantMessageId,
          model: finalMessage.model,
          content: fullText,
        })

        await tutorMetrics?.recordSuccess()
        request.log.info({ event: 'tutor_request', success: true, model: finalMessage.model, durationMs: Date.now() - requestStartTime }, 'tutor_request')

        try {
          await db
            .insertInto('tutor_messages')
            .values({
              id: assistantMessageId,
              session_id: sessionId,
              user_id: uid,
              role: 'assistant',
              content: fullText,
              model: finalMessage.model,
              created_at: new Date(),
            })
            .execute()
        } catch (err) {
          request.log.error(err, 'stuck_intervention_persist_error')
          Sentry.captureException(err)
        }

        cleanup()
      })

      stream.on('error', (error: Error) => {
        if (isClosed) return

        const errorType = classifyError(error)
        const logLevel = errorType === 'rate_limit' || errorType === 'overloaded' || errorType === 'timeout' ? 'warn' : 'error'
        request.log[logLevel]({ event: 'tutor_request', success: false, durationMs: Date.now() - requestStartTime, errorType }, 'tutor_request')

        Sentry.captureException(error, {
          tags: { tutor_error_type: errorType },
          extra: { circuitState: circuitBreaker.state },
        })

        tutorMetrics?.recordFailure(errorType)

        writeSSE(reply.raw, {
          type: 'error',
          code: 'TUTOR_UNAVAILABLE',
          message: 'Tutor encountered an error during streaming',
        })

        cleanup()
      })
    }
  )
}
