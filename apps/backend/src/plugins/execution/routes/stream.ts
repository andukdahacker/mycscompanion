import type { FastifyInstance } from 'fastify'
import type { Kysely } from 'kysely'
import type { DB } from '@mycscompanion/shared'
import type { ExecutionEvent } from '@mycscompanion/execution'
import type { Redis } from 'ioredis'
import { db as defaultDb } from '../../../shared/db.js'

const DEFAULT_HEARTBEAT_MS = 30_000
const DEFAULT_MAX_STREAM_MS = 5 * 60 * 1000 // 5 minutes

/** Terminal event types that signal end of execution */
const TERMINAL_EVENTS = new Set(['complete', 'error', 'timeout'])

export interface StreamRoutesOptions {
  readonly db?: Kysely<DB>
  readonly redis: Redis
  readonly heartbeatIntervalMs?: number
  readonly maxStreamDurationMs?: number
}

function formatSSEEvent(event: ExecutionEvent): string {
  const type = event.type
  const data = JSON.stringify(event)
  if ('sequenceId' in event) {
    return `id: ${event.sequenceId}\nevent: ${type}\ndata: ${data}\n\n`
  }
  return `event: ${type}\ndata: ${data}\n\n`
}

function formatHeartbeat(): string {
  return `: heartbeat\n\n`
}

/** Safely parse a JSON string as ExecutionEvent. Returns null on parse failure or invalid shape.
 *  Validated cast after shape check — trusted internal data from EventPublisher. */
function tryParseEvent(raw: string): ExecutionEvent | null {
  try {
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed === 'object' && parsed !== null && 'type' in parsed) {
      return parsed as ExecutionEvent
    }
    return null
  } catch {
    return null
  }
}

export async function streamRoutes(
  fastify: FastifyInstance,
  opts: StreamRoutesOptions
): Promise<void> {
  const db = opts.db ?? defaultDb
  const redis = opts.redis
  const heartbeatIntervalMs = opts.heartbeatIntervalMs ?? DEFAULT_HEARTBEAT_MS
  const maxStreamDurationMs = opts.maxStreamDurationMs ?? DEFAULT_MAX_STREAM_MS

  fastify.get<{ Params: { submissionId: string } }>(
    '/:submissionId/stream',
    {
      schema: {
        params: {
          type: 'object',
          required: ['submissionId'],
          properties: {
            submissionId: { type: 'string', minLength: 1 },
          },
        },
      },
    },
    async (request, reply) => {
      const { submissionId } = request.params

      // Ownership verification
      const submission = await db
        .selectFrom('submissions')
        .select(['user_id', 'status'])
        .where('id', '=', submissionId)
        .executeTakeFirst()

      if (!submission) {
        reply.code(404)
        return { error: { code: 'NOT_FOUND', message: 'Submission not found' } }
      }

      if (submission.user_id !== request.uid) {
        reply.code(403)
        return { error: { code: 'FORBIDDEN', message: 'Access denied' } }
      }

      // Disable socket idle timeout for long-lived SSE connection
      // Guard: socket.setTimeout may not exist in test (fastify.inject) mode
      if (typeof request.raw.socket?.setTimeout === 'function') {
        request.raw.socket.setTimeout(0)
      }

      // Set SSE headers
      // CORS headers must be set manually since raw.writeHead bypasses Fastify's plugin pipeline
      const origin = request.headers.origin ?? '*'
      reply.raw.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Credentials': 'true',
      })

      const logKey = `execution:${submissionId}:log`
      const channel = `execution:${submissionId}`
      let isClosed = false
      let subscriber: Redis | null = null
      let heartbeatTimer: ReturnType<typeof setInterval> | null = null
      let maxDurationTimer: ReturnType<typeof setTimeout> | null = null

      function cleanup(): void {
        if (isClosed) return
        isClosed = true

        if (heartbeatTimer) {
          clearInterval(heartbeatTimer)
          heartbeatTimer = null
        }
        if (maxDurationTimer) {
          clearTimeout(maxDurationTimer)
          maxDurationTimer = null
        }
        if (subscriber) {
          subscriber.unsubscribe().catch(() => {})
          subscriber.quit().catch(() => {})
          subscriber = null
        }
        reply.raw.end()
      }

      // Client disconnect handling
      request.raw.on('close', cleanup)
      // Write error handling (broken pipe)
      reply.raw.on('error', (err) => {
        request.log.error(err, 'sse_write_error')
        cleanup()
      })

      // Helper to write an event, returns false if stream is closed
      function writeEvent(event: ExecutionEvent): boolean {
        if (isClosed) return false
        const ok = reply.raw.write(formatSSEEvent(event))
        if (!ok) request.log.warn({ submissionId }, 'sse_backpressure')
        return true
      }

      // Parse Last-Event-ID for reconnection (guard against NaN from malformed headers)
      const lastEventIdHeader = request.headers['last-event-id']
      const parsedEventId = lastEventIdHeader ? Number(lastEventIdHeader) : NaN
      const lastEventId = Number.isNaN(parsedEventId) ? -1 : parsedEventId

      try {
        // Terminal submission — replay all events and close
        const isTerminal = submission.status === 'completed' || submission.status === 'failed'
        if (isTerminal) {
          const entries = await redis.lrange(logKey, 0, -1)
          for (const entry of entries) {
            const event = tryParseEvent(entry)
            if (!event) continue
            if (lastEventId >= 0 && event.type === 'queued') continue
            if ('sequenceId' in event && event.sequenceId <= lastEventId) continue
            writeEvent(event)
          }
          cleanup()
          return
        }

        // --- Live stream: replay-then-subscribe with double LRANGE ---

        let highestSequenceId = lastEventId

        // FIRST LRANGE — initial replay
        const firstReplay = await redis.lrange(logKey, 0, -1)
        for (const entry of firstReplay) {
          const event = tryParseEvent(entry)
          if (!event) continue
          // Skip queued event on reconnect (it has no sequenceId)
          if (event.type === 'queued') {
            if (lastEventId >= 0) continue // reconnect — skip queued
            writeEvent(event)
            continue
          }
          if ('sequenceId' in event) {
            if (event.sequenceId <= lastEventId) continue // already seen
            writeEvent(event)
            if (event.sequenceId > highestSequenceId) {
              highestSequenceId = event.sequenceId
            }
            if (TERMINAL_EVENTS.has(event.type)) {
              cleanup()
              return
            }
          }
        }

        if (isClosed) return

        // SUBSCRIBE to Redis channel
        subscriber = redis.duplicate()
        subscriber.on('error', (err) => {
          request.log.error(err, 'sse_subscriber_error')
          cleanup()
        })
        await subscriber.subscribe(channel)

        // Set up live event handler
        subscriber.on('message', (_channel: string, message: string) => {
          if (isClosed) return
          const event = tryParseEvent(message)
          if (!event) {
            request.log.error({ raw: message.slice(0, 200) }, 'sse_invalid_event_json')
            return
          }
          // Deduplication — skip events already replayed
          if ('sequenceId' in event && event.sequenceId <= highestSequenceId) return
          if (event.type === 'queued') return // queued event already handled in replay
          writeEvent(event)
          if ('sequenceId' in event && event.sequenceId > highestSequenceId) {
            highestSequenceId = event.sequenceId
          }
          if (TERMINAL_EVENTS.has(event.type)) {
            cleanup()
          }
        })

        // SECOND LRANGE — replay events that arrived between first LRANGE and SUBSCRIBE
        const secondReplay = await redis.lrange(logKey, 0, -1)
        for (const entry of secondReplay) {
          if (isClosed) return
          const event = tryParseEvent(entry)
          if (!event) continue
          if (event.type === 'queued') continue
          if ('sequenceId' in event) {
            if (event.sequenceId <= highestSequenceId) continue
            writeEvent(event)
            if (event.sequenceId > highestSequenceId) {
              highestSequenceId = event.sequenceId
            }
            if (TERMINAL_EVENTS.has(event.type)) {
              cleanup()
              return
            }
          }
        }

        if (isClosed) return

        // Heartbeat — keep connection alive
        heartbeatTimer = setInterval(() => {
          if (isClosed) return
          reply.raw.write(formatHeartbeat())
        }, heartbeatIntervalMs)

        // Max stream duration — 5 minute hard cap
        maxDurationTimer = setTimeout(() => {
          cleanup()
        }, maxStreamDurationMs)
      } catch (err) {
        request.log.error(err, 'sse_stream_error')
        cleanup()
      }
    }
  )
}
