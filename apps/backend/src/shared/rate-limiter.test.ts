import { afterAll, afterEach, beforeEach, describe, it, expect, vi } from 'vitest'
import { Redis } from 'ioredis'
import { RateLimiter } from './rate-limiter.js'

const TEST_KEY_PREFIX = 'test:rate-limiter'

describe('RateLimiter', () => {
  let redis: Redis
  let testKeyCount = 0

  function uniqueKey(): string {
    testKeyCount++
    return `${TEST_KEY_PREFIX}:${testKeyCount}:${Date.now()}`
  }

  beforeEach(() => {
    redis = new Redis(process.env['REDIS_URL'] ?? 'redis://localhost:6379')
  })

  afterEach(async () => {
    vi.restoreAllMocks()
    const keys = await redis.keys(`${TEST_KEY_PREFIX}:*`)
    if (keys.length > 0) {
      await redis.del(...keys)
    }
    await redis.quit()
  })

  afterAll(async () => {
    // Extra cleanup in case tests failed mid-execution
    const cleanupRedis = new Redis(process.env['REDIS_URL'] ?? 'redis://localhost:6379')
    const keys = await cleanupRedis.keys(`${TEST_KEY_PREFIX}:*`)
    if (keys.length > 0) {
      await cleanupRedis.del(...keys)
    }
    await cleanupRedis.quit()
  })

  it('should allow requests under the limit', async () => {
    const key = uniqueKey()
    const limiter = new RateLimiter({ redis, windowMs: 60_000, maxRequests: 3 })

    const result = await limiter.check(key)

    expect(result.allowed).toBe(true)
    expect(result.remaining).toBe(2)
    expect(result.retryAfterMs).toBe(0)
  })

  it('should decrement remaining count with each request', async () => {
    const key = uniqueKey()
    const limiter = new RateLimiter({ redis, windowMs: 60_000, maxRequests: 3 })

    const r1 = await limiter.check(key)
    const r2 = await limiter.check(key)
    const r3 = await limiter.check(key)

    expect(r1.remaining).toBe(2)
    expect(r2.remaining).toBe(1)
    expect(r3.remaining).toBe(0)
  })

  it('should deny requests at the limit', async () => {
    const key = uniqueKey()
    const limiter = new RateLimiter({ redis, windowMs: 60_000, maxRequests: 2 })

    await limiter.check(key)
    await limiter.check(key)
    const result = await limiter.check(key)

    expect(result.allowed).toBe(false)
    expect(result.remaining).toBe(0)
    expect(result.retryAfterMs).toBeGreaterThan(0)
  })

  it('should provide a positive retry-after value when denied', async () => {
    const key = uniqueKey()
    const limiter = new RateLimiter({ redis, windowMs: 60_000, maxRequests: 1 })

    await limiter.check(key)
    const result = await limiter.check(key)

    expect(result.allowed).toBe(false)
    expect(result.retryAfterMs).toBeGreaterThan(0)
    expect(result.retryAfterMs).toBeLessThanOrEqual(60_000)
  })

  it('should set TTL on the rate limit key', async () => {
    const key = uniqueKey()
    const limiter = new RateLimiter({ redis, windowMs: 60_000, maxRequests: 10 })

    await limiter.check(key)

    const ttl = await redis.ttl(key)
    expect(ttl).toBeGreaterThan(0)
    expect(ttl).toBeLessThanOrEqual(60)
  })

  it('should allow requests again after window expires', async () => {
    const key = uniqueKey()
    // Use a very short window for this test
    const limiter = new RateLimiter({ redis, windowMs: 100, maxRequests: 1 })

    await limiter.check(key)
    const denied = await limiter.check(key)
    expect(denied.allowed).toBe(false)

    // Wait for the window to expire
    await new Promise((resolve) => setTimeout(resolve, 150))

    const allowed = await limiter.check(key)
    expect(allowed.allowed).toBe(true)
  })

  it('should use default execution config of 10 requests per 60s', async () => {
    const key = uniqueKey()
    const limiter = new RateLimiter({ redis, windowMs: 60_000, maxRequests: 10 })

    // Make 10 requests — all should be allowed
    for (let i = 0; i < 10; i++) {
      const result = await limiter.check(key)
      expect(result.allowed).toBe(true)
    }

    // 11th should be denied
    const denied = await limiter.check(key)
    expect(denied.allowed).toBe(false)
  })
})
