import { describe, it, expect, afterEach, vi } from 'vitest'
import { EXECUTION_QUEUE_NAME, createBullMQConnection, createExecutionQueue } from './queue.js'

const REDIS_URL = process.env['REDIS_URL'] ?? 'redis://localhost:6379'

describe('queue', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('EXECUTION_QUEUE_NAME', () => {
    it('should be execution-run', () => {
      expect(EXECUTION_QUEUE_NAME).toBe('execution-run')
    })
  })

  describe('createBullMQConnection', () => {
    it('should create a Redis connection with maxRetriesPerRequest null', () => {
      const connection = createBullMQConnection(REDIS_URL)
      try {
        expect(connection.options.maxRetriesPerRequest).toBeNull()
      } finally {
        connection.disconnect()
      }
    })
  })

  describe('createExecutionQueue', () => {
    it('should create a queue with correct name and default job options', async () => {
      const connection = createBullMQConnection(REDIS_URL)
      const queue = createExecutionQueue(connection)

      try {
        expect(queue.name).toBe('execution-run')

        const defaultOpts = queue.defaultJobOptions
        expect(defaultOpts.attempts).toBe(2)
        expect(defaultOpts.backoff).toEqual({ type: 'exponential', delay: 5000 })
        expect(defaultOpts.removeOnComplete).toEqual({ age: 3600 })
        expect(defaultOpts.removeOnFail).toEqual({ age: 86400 })
      } finally {
        await queue.close()
        connection.disconnect()
      }
    })
  })
})
