import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createTutorMetrics } from './tutor-metrics.js'
import type { Redis } from 'ioredis'

function createMockRedis(): Redis {
  const store = new Map<string, string>()

  const mockPipeline = {
    incr: vi.fn().mockImplementation((key: string) => {
      store.set(key, String((Number(store.get(key)) || 0) + 1))
      return mockPipeline
    }),
    expire: vi.fn().mockReturnThis(),
    exec: vi.fn().mockResolvedValue([]),
  }

  return {
    incr: vi.fn().mockImplementation(async (key: string) => {
      const val = (Number(store.get(key)) || 0) + 1
      store.set(key, String(val))
      return val
    }),
    expire: vi.fn().mockResolvedValue(1),
    get: vi.fn().mockImplementation(async (key: string) => store.get(key) ?? null),
    pipeline: vi.fn().mockReturnValue(mockPipeline),
    // Expose store for test inspection
    _store: store,
  } as unknown as Redis
}

describe('TutorMetrics', () => {
  let redis: Redis

  beforeEach(() => {
    redis = createMockRedis()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('recordSuccess', () => {
    it('should increment request counter', async () => {
      const metrics = createTutorMetrics(redis)
      await metrics.recordSuccess()

      expect(redis.incr).toHaveBeenCalledWith(expect.stringMatching(/^tutor:metrics:requests:\d{4}-\d{2}-\d{2}$/))
      expect(redis.expire).toHaveBeenCalled()
    })
  })

  describe('recordFailure', () => {
    it('should increment both request and failure counters', async () => {
      const metrics = createTutorMetrics(redis)
      await metrics.recordFailure('timeout')

      const pipeline = (redis.pipeline as ReturnType<typeof vi.fn>).mock.results[0]?.value
      expect(pipeline.incr).toHaveBeenCalledWith(expect.stringMatching(/^tutor:metrics:requests:/))
      expect(pipeline.incr).toHaveBeenCalledWith(expect.stringMatching(/^tutor:metrics:failures:/))
      expect(pipeline.incr).toHaveBeenCalledWith(expect.stringMatching(/^tutor:metrics:errors:timeout:/))
    })
  })

  describe('getAvailabilityRate', () => {
    it('should return 100 when no requests', async () => {
      const metrics = createTutorMetrics(redis)
      const rate = await metrics.getAvailabilityRate()
      expect(rate).toBe(100)
    })

    it('should calculate correct percentage', async () => {
      const metrics = createTutorMetrics(redis)

      // Simulate 10 requests, 2 failures
      for (let i = 0; i < 8; i++) await metrics.recordSuccess()
      await metrics.recordFailure('timeout')
      await metrics.recordFailure('rate_limit')

      const rate = await metrics.getAvailabilityRate()
      expect(rate).toBe(80) // (10 - 2) / 10 = 80%
    })
  })
})
