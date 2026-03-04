import type { Redis } from 'ioredis'
import type { ExecutionEvent } from '@mycscompanion/execution'

export type EventPublisher = {
  readonly publish: (submissionId: string, event: ExecutionEvent) => Promise<void>
  readonly setLogTTL: (submissionId: string, ttlSeconds: number) => Promise<void>
}

// Safety TTL in seconds — prevents unbounded list growth if setLogTTL is never called
const SAFETY_TTL_SECONDS = 600

export function createEventPublisher(redis: Redis): EventPublisher {
  return {
    async publish(submissionId: string, event: ExecutionEvent): Promise<void> {
      const payload = JSON.stringify(event)
      const listKey = `execution:${submissionId}:log`
      await Promise.all([
        redis.publish(`execution:${submissionId}`, payload),
        redis.rpush(listKey, payload),
      ])
      // Set safety TTL on the list to prevent unbounded growth if execution never completes
      await redis.expire(listKey, SAFETY_TTL_SECONDS)
    },
    async setLogTTL(submissionId: string, ttlSeconds: number): Promise<void> {
      await redis.expire(`execution:${submissionId}:log`, ttlSeconds)
    },
  }
}
