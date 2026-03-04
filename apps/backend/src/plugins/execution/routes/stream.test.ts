import { describe, it, expect, afterEach, vi } from 'vitest'
import Fastify from 'fastify'
import { authPlugin } from '../../auth/index.js'
import { streamRoutes } from './stream.js'
import { createMockFirebaseAuth } from '@mycscompanion/config/test-utils'
import { db } from '../../../shared/db.js'
import type { ExecutionEvent } from '@mycscompanion/execution'
import type { Redis } from 'ioredis'

const TEST_UID = 'test-stream-uid'
const OTHER_UID = 'test-stream-other-uid'
const TEST_EMAIL = 'test-stream@example.com'
const mockAuth = createMockFirebaseAuth(TEST_UID)

// --- Mock Redis infrastructure ---

interface MockRedisSubscriber {
  subscribe: ReturnType<typeof vi.fn>
  unsubscribe: ReturnType<typeof vi.fn>
  quit: ReturnType<typeof vi.fn>
  on: ReturnType<typeof vi.fn>
  triggerMessage: (channel: string, data: string) => void
  messageHandler: ((channel: string, message: string) => void) | null
  errorHandler: ((err: Error) => void) | null
}

function createMockSubscriber(): MockRedisSubscriber {
  const sub: MockRedisSubscriber = {
    subscribe: vi.fn().mockResolvedValue(undefined),
    unsubscribe: vi.fn().mockResolvedValue(undefined),
    quit: vi.fn().mockResolvedValue(undefined),
    on: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
      if (event === 'message') sub.messageHandler = handler as (channel: string, message: string) => void
      if (event === 'error') sub.errorHandler = handler as (err: Error) => void
      return sub
    }),
    messageHandler: null,
    errorHandler: null,
    triggerMessage(channel: string, data: string) {
      if (sub.messageHandler) sub.messageHandler(channel, data)
    },
  }
  return sub
}

function createMockRedis(opts: {
  lrangeResults?: string[][]
  subscriber?: MockRedisSubscriber
}) {
  let lrangeCallIndex = 0
  const subscriber = opts.subscriber ?? createMockSubscriber()

  const redis = {
    lrange: vi.fn(async () => {
      const result = (opts.lrangeResults ?? [])[lrangeCallIndex] ?? []
      lrangeCallIndex++
      return result
    }),
    duplicate: vi.fn(() => subscriber),
  }

  return { redis, subscriber }
}

// --- Test helpers ---

function makeEvent(type: string, sequenceId: number, extra: Record<string, unknown> = {}): ExecutionEvent {
  const base = { type, sequenceId, phase: 'compiling' as const, data: '' }
  if (type === 'error') {
    return { ...base, message: 'test error', isUserError: false, ...extra } as ExecutionEvent
  }
  return { ...base, ...extra } as ExecutionEvent
}

function makeQueuedEvent(submissionId: string): ExecutionEvent {
  return { type: 'queued', submissionId } as ExecutionEvent
}

async function seedUser(uid: string = TEST_UID) {
  await db
    .insertInto('users')
    .values({ id: uid, email: uid === TEST_UID ? TEST_EMAIL : `${uid}@test.com` })
    .onConflict((oc) => oc.column('id').doNothing())
    .execute()
}

async function seedSubmission(id: string, userId: string, status: string = 'running') {
  await db
    .insertInto('submissions')
    .values({
      id,
      user_id: userId,
      milestone_id: 'ms-test',
      code: 'package main',
      status,
    })
    .execute()
}

function parseSSEResponse(body: string): Array<{ id?: string; event?: string; data?: string; comment?: string }> {
  const events: Array<{ id?: string; event?: string; data?: string; comment?: string }> = []
  const blocks = body.split('\n\n').filter((b) => b.trim().length > 0)

  for (const block of blocks) {
    const lines = block.split('\n')
    if (lines.length === 1 && lines[0]!.startsWith(':')) {
      events.push({ comment: lines[0]!.slice(2) })
      continue
    }
    const entry: Record<string, string> = {}
    for (const line of lines) {
      if (line.startsWith('id: ')) entry['id'] = line.slice(4)
      else if (line.startsWith('event: ')) entry['event'] = line.slice(7)
      else if (line.startsWith('data: ')) entry['data'] = line.slice(6)
      else if (line.startsWith(':')) entry['comment'] = line.slice(2)
    }
    events.push(entry)
  }
  return events
}

async function buildApp(redisOpts: {
  lrangeResults?: string[][]
  subscriber?: MockRedisSubscriber
  heartbeatIntervalMs?: number
  maxStreamDurationMs?: number
}) {
  const { redis, subscriber } = createMockRedis(redisOpts)
  const app = Fastify({ logger: false })
  await app.register(authPlugin, { firebaseAuth: mockAuth })
  await app.register(streamRoutes, {
    prefix: '/api/execution',
    db,
    // Partial mock — only implements methods used by streamRoutes
    redis: redis as unknown as Redis,
    heartbeatIntervalMs: redisOpts.heartbeatIntervalMs,
    maxStreamDurationMs: redisOpts.maxStreamDurationMs,
  })
  await app.ready()
  return { app, redis, subscriber }
}

// --- Cleanup ---

const createdSubmissionIds: string[] = []

afterEach(async () => {
  vi.useRealTimers()
  for (const id of createdSubmissionIds) {
    await db.deleteFrom('submissions').where('id', '=', id).execute()
  }
  createdSubmissionIds.length = 0
  await db.deleteFrom('users').where('id', '=', TEST_UID).execute()
  await db.deleteFrom('users').where('id', '=', OTHER_UID).execute()
  vi.restoreAllMocks()
})

// --- Tests ---

describe('GET /api/execution/:submissionId/stream', () => {
  it('should replay events and close stream for completed submission', async () => {
    await seedUser()
    const subId = 'sub-completed-1'
    createdSubmissionIds.push(subId)
    await seedSubmission(subId, TEST_UID, 'completed')

    const events = [
      JSON.stringify(makeQueuedEvent(subId)),
      JSON.stringify(makeEvent('compile_output', 1)),
      JSON.stringify(makeEvent('complete', 2)),
    ]

    const { app, redis } = await buildApp({ lrangeResults: [events] })

    const response = await app.inject({
      method: 'GET',
      url: `/api/execution/${subId}/stream`,
      headers: { authorization: 'Bearer valid-token' },
    })

    expect(response.statusCode).toBe(200)
    expect(response.headers['content-type']).toBe('text/event-stream')

    const parsed = parseSSEResponse(response.body)
    expect(parsed.length).toBe(3)
    expect(parsed[0]!.event).toBe('queued')
    expect(parsed[1]!.event).toBe('compile_output')
    expect(parsed[1]!.id).toBe('1')
    expect(parsed[2]!.event).toBe('complete')
    expect(parsed[2]!.id).toBe('2')

    // Subscriber should NOT have been created for terminal submissions
    expect(redis.duplicate).not.toHaveBeenCalled()

    await app.close()
  })

  it('should return 403 when submission belongs to different user', async () => {
    await seedUser(TEST_UID)
    await seedUser(OTHER_UID)
    const subId = 'sub-forbidden-1'
    createdSubmissionIds.push(subId)
    await seedSubmission(subId, OTHER_UID)

    const { app } = await buildApp({})

    const response = await app.inject({
      method: 'GET',
      url: `/api/execution/${subId}/stream`,
      headers: { authorization: 'Bearer valid-token' },
    })

    expect(response.statusCode).toBe(403)
    expect(response.json().error.code).toBe('FORBIDDEN')

    await app.close()
  })

  it('should return 404 when submission does not exist', async () => {
    const { app } = await buildApp({})

    const response = await app.inject({
      method: 'GET',
      url: '/api/execution/nonexistent-sub/stream',
      headers: { authorization: 'Bearer valid-token' },
    })

    expect(response.statusCode).toBe(404)
    expect(response.json().error.code).toBe('NOT_FOUND')

    await app.close()
  })

  it('should replay events after Last-Event-ID on reconnection', async () => {
    await seedUser()
    const subId = 'sub-reconnect-1'
    createdSubmissionIds.push(subId)
    await seedSubmission(subId, TEST_UID, 'running')

    const events = [
      JSON.stringify(makeQueuedEvent(subId)),
      JSON.stringify(makeEvent('compile_output', 1)),
      JSON.stringify(makeEvent('compile_output', 2)),
      JSON.stringify(makeEvent('compile_output', 3)),
      JSON.stringify(makeEvent('compile_output', 4)),
      JSON.stringify(makeEvent('compile_output', 5)),
    ]

    const subscriber = createMockSubscriber()
    const { app } = await buildApp({
      lrangeResults: [events, []], // first LRANGE returns events, second returns empty
      subscriber,
    })

    // Schedule terminal event after subscribe
    subscriber.subscribe.mockImplementation(async () => {
      setTimeout(() => {
        subscriber.triggerMessage(
          `execution:${subId}`,
          JSON.stringify(makeEvent('complete', 6))
        )
      }, 10)
    })

    const response = await app.inject({
      method: 'GET',
      url: `/api/execution/${subId}/stream`,
      headers: {
        authorization: 'Bearer valid-token',
        'last-event-id': '3',
      },
    })

    expect(response.statusCode).toBe(200)
    const parsed = parseSSEResponse(response.body)

    // Should only contain events with sequenceId > 3 (events 4, 5 from replay + 6 from live)
    const eventIds = parsed.filter((e) => e.id).map((e) => e.id)
    expect(eventIds).toEqual(['4', '5', '6'])
    // Should NOT contain queued event on reconnect
    expect(parsed.find((e) => e.event === 'queued')).toBeUndefined()

    await app.close()
  })

  it('should close stream after terminal event', async () => {
    await seedUser()
    const subId = 'sub-terminal-1'
    createdSubmissionIds.push(subId)
    await seedSubmission(subId, TEST_UID, 'running')

    const subscriber = createMockSubscriber()
    const { app } = await buildApp({
      lrangeResults: [[], []], // empty replay
      subscriber,
    })

    // Schedule terminal event after subscribe
    subscriber.subscribe.mockImplementation(async () => {
      setTimeout(() => {
        subscriber.triggerMessage(
          `execution:${subId}`,
          JSON.stringify(makeEvent('complete', 1))
        )
      }, 10)
    })

    const response = await app.inject({
      method: 'GET',
      url: `/api/execution/${subId}/stream`,
      headers: { authorization: 'Bearer valid-token' },
    })

    expect(response.statusCode).toBe(200)
    const parsed = parseSSEResponse(response.body)
    expect(parsed.some((e) => e.event === 'complete')).toBe(true)

    // Subscriber should be cleaned up
    expect(subscriber.unsubscribe).toHaveBeenCalled()
    expect(subscriber.quit).toHaveBeenCalled()

    await app.close()
  })

  it('should return 401 when no auth token provided', async () => {
    const { app } = await buildApp({})

    const response = await app.inject({
      method: 'GET',
      url: '/api/execution/some-sub/stream',
    })

    expect(response.statusCode).toBe(401)

    await app.close()
  })

  it('should deduplicate events across replay and live subscription', async () => {
    await seedUser()
    const subId = 'sub-dedup-1'
    createdSubmissionIds.push(subId)
    await seedSubmission(subId, TEST_UID, 'running')

    const firstReplayEvents = [
      JSON.stringify(makeQueuedEvent(subId)),
      JSON.stringify(makeEvent('compile_output', 1)),
      JSON.stringify(makeEvent('compile_output', 2)),
      JSON.stringify(makeEvent('compile_output', 3)),
    ]

    // Second LRANGE returns events 1-4 (event 4 arrived between first LRANGE and SUBSCRIBE)
    const secondReplayEvents = [
      JSON.stringify(makeQueuedEvent(subId)),
      JSON.stringify(makeEvent('compile_output', 1)),
      JSON.stringify(makeEvent('compile_output', 2)),
      JSON.stringify(makeEvent('compile_output', 3)),
      JSON.stringify(makeEvent('compile_output', 4)),
    ]

    const subscriber = createMockSubscriber()
    const { app } = await buildApp({
      lrangeResults: [firstReplayEvents, secondReplayEvents],
      subscriber,
    })

    // Subscriber emits duplicate sequenceId 3, then new 5, then terminal
    subscriber.subscribe.mockImplementation(async () => {
      setTimeout(() => {
        subscriber.triggerMessage(
          `execution:${subId}`,
          JSON.stringify(makeEvent('compile_output', 3)) // duplicate — should be skipped
        )
        subscriber.triggerMessage(
          `execution:${subId}`,
          JSON.stringify(makeEvent('complete', 5))
        )
      }, 10)
    })

    const response = await app.inject({
      method: 'GET',
      url: `/api/execution/${subId}/stream`,
      headers: { authorization: 'Bearer valid-token' },
    })

    expect(response.statusCode).toBe(200)
    const parsed = parseSSEResponse(response.body)

    // Extract sequenceIds from events (filter out queued which has no id)
    const sequenceIds = parsed.filter((e) => e.id && e.id !== '').map((e) => e.id)
    // Each sequenceId should appear exactly once: 1, 2, 3, 4, 5
    expect(sequenceIds).toEqual(['1', '2', '3', '4', '5'])

    await app.close()
  })

  it('should send heartbeat comments', async () => {
    await seedUser()
    const subId = 'sub-heartbeat-1'
    createdSubmissionIds.push(subId)
    await seedSubmission(subId, TEST_UID, 'running')

    const subscriber = createMockSubscriber()
    // Use short heartbeat interval for testing
    const { app } = await buildApp({
      lrangeResults: [[], []], // empty replay
      subscriber,
      heartbeatIntervalMs: 50,
    })

    // Schedule terminal event after heartbeat fires (give enough time for heartbeat)
    subscriber.subscribe.mockImplementation(async () => {
      setTimeout(() => {
        subscriber.triggerMessage(
          `execution:${subId}`,
          JSON.stringify(makeEvent('complete', 1))
        )
      }, 150) // terminal after ~150ms — heartbeat at 50ms should fire 2-3 times
    })

    const response = await app.inject({
      method: 'GET',
      url: `/api/execution/${subId}/stream`,
      headers: { authorization: 'Bearer valid-token' },
    })

    expect(response.statusCode).toBe(200)
    const parsed = parseSSEResponse(response.body)
    // Should contain at least one heartbeat comment
    expect(parsed.some((e) => e.comment === 'heartbeat')).toBe(true)

    await app.close()
  })

  it('should clean up subscriber on terminal event', async () => {
    await seedUser()
    const subId = 'sub-cleanup-1'
    createdSubmissionIds.push(subId)
    await seedSubmission(subId, TEST_UID, 'running')

    const subscriber = createMockSubscriber()
    const { app } = await buildApp({
      lrangeResults: [[], []],
      subscriber,
    })

    subscriber.subscribe.mockImplementation(async () => {
      setTimeout(() => {
        subscriber.triggerMessage(
          `execution:${subId}`,
          JSON.stringify(makeEvent('error', 1, { isUserError: true, message: 'compile failed' }))
        )
      }, 10)
    })

    await app.inject({
      method: 'GET',
      url: `/api/execution/${subId}/stream`,
      headers: { authorization: 'Bearer valid-token' },
    })

    expect(subscriber.unsubscribe).toHaveBeenCalled()
    expect(subscriber.quit).toHaveBeenCalled()

    await app.close()
  })

  it('should replay all events for failed submission without creating subscriber', async () => {
    await seedUser()
    const subId = 'sub-failed-1'
    createdSubmissionIds.push(subId)
    await seedSubmission(subId, TEST_UID, 'failed')

    const events = [
      JSON.stringify(makeQueuedEvent(subId)),
      JSON.stringify(makeEvent('compile_error', 1)),
      JSON.stringify(makeEvent('error', 2, { isUserError: true, message: 'compilation failed' })),
    ]

    const { app, redis } = await buildApp({ lrangeResults: [events] })

    const response = await app.inject({
      method: 'GET',
      url: `/api/execution/${subId}/stream`,
      headers: { authorization: 'Bearer valid-token' },
    })

    expect(response.statusCode).toBe(200)
    const parsed = parseSSEResponse(response.body)
    expect(parsed.length).toBe(3)
    expect(parsed[0]!.event).toBe('queued')
    expect(parsed[1]!.event).toBe('compile_error')
    expect(parsed[2]!.event).toBe('error')

    // No subscriber created for terminal submissions
    expect(redis.duplicate).not.toHaveBeenCalled()

    await app.close()
  })

  it('should handle timeout terminal event and close stream', async () => {
    await seedUser()
    const subId = 'sub-timeout-1'
    createdSubmissionIds.push(subId)
    await seedSubmission(subId, TEST_UID, 'running')

    const subscriber = createMockSubscriber()
    const { app } = await buildApp({
      lrangeResults: [[], []],
      subscriber,
    })

    subscriber.subscribe.mockImplementation(async () => {
      setTimeout(() => {
        subscriber.triggerMessage(
          `execution:${subId}`,
          JSON.stringify({
            type: 'timeout',
            phase: 'compiling',
            timeoutSeconds: 30,
            data: '',
            sequenceId: 1,
          })
        )
      }, 10)
    })

    const response = await app.inject({
      method: 'GET',
      url: `/api/execution/${subId}/stream`,
      headers: { authorization: 'Bearer valid-token' },
    })

    expect(response.statusCode).toBe(200)
    const parsed = parseSSEResponse(response.body)
    expect(parsed.some((e) => e.event === 'timeout')).toBe(true)
    expect(subscriber.unsubscribe).toHaveBeenCalled()

    await app.close()
  })

  it('should close stream after max duration timeout', async () => {
    await seedUser()
    const subId = 'sub-maxduration-1'
    createdSubmissionIds.push(subId)
    await seedSubmission(subId, TEST_UID, 'running')

    const subscriber = createMockSubscriber()
    const { app } = await buildApp({
      lrangeResults: [[], []],
      subscriber,
      maxStreamDurationMs: 50, // Short duration for testing
    })

    // No terminal event — stream should close via max duration timeout
    subscriber.subscribe.mockImplementation(async () => {})

    const response = await app.inject({
      method: 'GET',
      url: `/api/execution/${subId}/stream`,
      headers: { authorization: 'Bearer valid-token' },
    })

    expect(response.statusCode).toBe(200)
    expect(subscriber.unsubscribe).toHaveBeenCalled()
    expect(subscriber.quit).toHaveBeenCalled()

    await app.close()
  })
})
