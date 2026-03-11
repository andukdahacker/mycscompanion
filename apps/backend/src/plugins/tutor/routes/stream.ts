import type { FastifyInstance } from 'fastify'
import type { Kysely } from 'kysely'
import type { DB } from '@mycscompanion/shared'
import type { TutorStreamEvent } from '@mycscompanion/shared'
import type { RateLimitChecker } from '../../../shared/rate-limiter.js'
import type { AnthropicService, AnthropicMessageStream } from '../services/anthropic.js'
import type { ContextAssembler } from '../services/context-assembler.js'
import type { CircuitBreaker } from '../services/circuit-breaker.js'
import type { TutorMetrics } from '../services/tutor-metrics.js'
import { CircuitOpenError } from '../services/circuit-breaker.js'
import { classifyError } from '../services/anthropic.js'
import { loadConversationHistory } from '../services/conversation-history.js'
import { generateId } from '../../../shared/id.js'
import * as Sentry from '@sentry/node'

const HEARTBEAT_INTERVAL_MS = 30_000
const MAX_STREAM_DURATION_MS = 180_000 // 3 minutes

export type StreamRoutesOptions = {
  readonly db: Kysely<DB>
  readonly anthropicService: AnthropicService
  readonly contextAssembler: ContextAssembler
  readonly rateLimiter: RateLimitChecker
  readonly circuitBreaker: CircuitBreaker
  readonly tutorMetrics: TutorMetrics | null
}

const streamSchema = {
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

function writeSSE(raw: NodeJS.WritableStream, event: TutorStreamEvent): void {
  raw.write(`data: ${JSON.stringify(event)}\n\n`)
}

export async function streamRoutes(
  fastify: FastifyInstance,
  opts: StreamRoutesOptions
): Promise<void> {
  const { db, anthropicService, contextAssembler, rateLimiter, circuitBreaker, tutorMetrics } = opts

  fastify.post<{ Params: { sessionId: string }; Body: { message: string } }>(
    '/:sessionId/stream',
    { schema: streamSchema },
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

      // 4. Persist user message IMMEDIATELY
      const userMessageId = generateId()
      const userMessageTimestamp = new Date()
      await db
        .insertInto('tutor_messages')
        .values({
          id: userMessageId,
          session_id: sessionId,
          user_id: uid,
          role: 'user',
          content: message,
          model: null,
          created_at: userMessageTimestamp,
        })
        .execute()

      // 5. Load conversation history (includes the just-persisted user message)
      const conversationHistory = await loadConversationHistory(db, sessionId)

      // 6. Check for compile errors in latest submission
      const latestSubmission = await db
        .selectFrom('submissions')
        .select(['status', 'error_message'])
        .where('user_id', '=', uid)
        .where('milestone_id', '=', session.milestone_id)
        .orderBy('created_at', 'desc')
        .limit(1)
        .executeTakeFirst()

      const hasCompileErrors = latestSubmission?.status === 'failed' && !!latestSubmission.error_message

      // 7. Assemble context
      const systemPrompt = await contextAssembler.assembleSystemPrompt({
        userId: uid,
        sessionId,
        milestoneId: session.milestone_id,
        milestoneSlug: milestone.slug,
      })

      // 8. Start Anthropic stream
      const context = { userMessage: message, hasCompileErrors }
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
          extra: {
            hasCompileErrors,
            messageLength: message.length,
            circuitState: circuitBreaker.state,
          },
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

      // 9. Set SSE headers — bypass Fastify pipeline
      const origin = request.headers.origin ?? '*'
      reply.raw.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Credentials': 'true',
      })

      // 10. Disable socket timeout for SSE
      if (typeof request.raw.socket?.setTimeout === 'function') {
        request.raw.socket.setTimeout(0)
      }

      // 11. Setup cleanup and heartbeat
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

      // 12. Forward Anthropic stream events as SSE
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

        // Send message_complete BEFORE persistence — client notification
        // must not depend on DB success
        writeSSE(reply.raw, {
          type: 'message_complete',
          id: assistantMessageId,
          model: finalMessage.model,
          content: fullText,
        })

        // Log prompt caching metrics at debug level
        const usage = finalMessage.usage
        request.log.debug({
          cache_creation_input_tokens: usage.cache_creation_input_tokens ?? 0,
          cache_read_input_tokens: usage.cache_read_input_tokens ?? 0,
          input_tokens: usage.input_tokens,
          output_tokens: usage.output_tokens,
        }, 'tutor_prompt_cache_metrics')

        // Record success metric
        await tutorMetrics?.recordSuccess()

        request.log.info({
          event: 'tutor_request',
          success: true,
          model: finalMessage.model,
          durationMs: Date.now() - requestStartTime,
        }, 'tutor_request')

        // Persist assistant message (best-effort — don't block client)
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
          request.log.error(err, 'tutor_stream_persist_error')
          Sentry.captureException(err)
        }

        cleanup()
      })

      stream.on('error', (error: Error) => {
        if (isClosed) return

        const errorType = classifyError(error)
        const logLevel = errorType === 'rate_limit' || errorType === 'overloaded' || errorType === 'timeout' ? 'warn' : 'error'
        request.log[logLevel]({
          event: 'tutor_request',
          success: false,
          durationMs: Date.now() - requestStartTime,
          errorType,
        }, 'tutor_request')

        Sentry.captureException(error, {
          tags: { tutor_error_type: errorType },
          extra: {
            hasCompileErrors,
            messageLength: message.length,
            circuitState: circuitBreaker.state,
          },
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
