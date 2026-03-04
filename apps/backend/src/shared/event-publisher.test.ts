import { afterEach, describe, it, expect, vi } from 'vitest'
import type { Redis } from 'ioredis'
import type { ExecutionEvent } from '@mycscompanion/execution'
import { createEventPublisher } from './event-publisher.js'

function createSpyRedis(): Pick<Redis, 'publish' | 'rpush' | 'expire'> {
  return {
    publish: vi.fn().mockResolvedValue(1),
    rpush: vi.fn().mockResolvedValue(1),
    expire: vi.fn().mockResolvedValue(1),
  }
}

describe('EventPublisher', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('publish', () => {
    it('should publish event to the correct Redis channel', async () => {
      const redis = createSpyRedis()
      const publisher = createEventPublisher(redis as Redis)
      const event: ExecutionEvent = { type: 'queued', submissionId: 'sub-123' }

      await publisher.publish('sub-123', event)

      expect(redis.publish).toHaveBeenCalledWith(
        'execution:sub-123',
        JSON.stringify(event)
      )
    })

    it('should rpush event to the correct Redis list', async () => {
      const redis = createSpyRedis()
      const publisher = createEventPublisher(redis as Redis)
      const event: ExecutionEvent = { type: 'queued', submissionId: 'sub-456' }

      await publisher.publish('sub-456', event)

      expect(redis.rpush).toHaveBeenCalledWith(
        'execution:sub-456:log',
        JSON.stringify(event)
      )
    })

    it('should publish to both channel and list', async () => {
      const redis = createSpyRedis()
      const publisher = createEventPublisher(redis as Redis)
      const event: ExecutionEvent = {
        type: 'output',
        phase: 'compiling',
        data: 'Compiling...',
        sequenceId: 1,
      }

      await publisher.publish('sub-789', event)

      expect(redis.publish).toHaveBeenCalledTimes(1)
      expect(redis.rpush).toHaveBeenCalledTimes(1)
    })

    it('should serialize ExecutionEvent as JSON', async () => {
      const redis = createSpyRedis()
      const publisher = createEventPublisher(redis as Redis)
      const event: ExecutionEvent = {
        type: 'complete',
        phase: 'compiling',
        data: 'Execution completed',
        sequenceId: 1,
      }

      await publisher.publish('sub-abc', event)

      const expectedPayload = JSON.stringify(event)
      expect(redis.publish).toHaveBeenCalledWith('execution:sub-abc', expectedPayload)
      expect(redis.rpush).toHaveBeenCalledWith('execution:sub-abc:log', expectedPayload)
    })

    it('should set safety TTL on the event log list', async () => {
      const redis = createSpyRedis()
      const publisher = createEventPublisher(redis as Redis)
      const event: ExecutionEvent = { type: 'queued', submissionId: 'sub-ttl' }

      await publisher.publish('sub-ttl', event)

      expect(redis.expire).toHaveBeenCalledWith('execution:sub-ttl:log', 600)
    })
  })

  describe('setLogTTL', () => {
    it('should set expire on the event log list', async () => {
      const redis = createSpyRedis()
      const publisher = createEventPublisher(redis as Redis)

      await publisher.setLogTTL('sub-123', 300)

      expect(redis.expire).toHaveBeenCalledWith('execution:sub-123:log', 300)
    })
  })
})
