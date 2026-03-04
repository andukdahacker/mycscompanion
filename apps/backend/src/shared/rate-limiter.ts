import { randomUUID } from 'node:crypto'
import type { Redis } from 'ioredis'

export type RateLimitResult = {
  readonly allowed: boolean
  readonly remaining: number
  readonly retryAfterMs: number
}

export interface RateLimitChecker {
  check(key: string): Promise<RateLimitResult>
}

export type RateLimiterOptions = {
  readonly redis: Redis
  readonly windowMs: number
  readonly maxRequests: number
}

export class RateLimiter implements RateLimitChecker {
  private readonly redis: Redis
  private readonly windowMs: number
  private readonly maxRequests: number

  constructor(options: RateLimiterOptions) {
    this.redis = options.redis
    this.windowMs = options.windowMs
    this.maxRequests = options.maxRequests
  }

  async check(key: string): Promise<RateLimitResult> {
    const now = Date.now()
    const windowStart = now - this.windowMs

    // Phase 1: Clean expired entries and check count
    const checkPipeline = this.redis.pipeline()
    checkPipeline.zremrangebyscore(key, 0, windowStart)
    checkPipeline.zcard(key)
    const checkResults = await checkPipeline.exec()

    // Propagate Redis errors instead of silently allowing all requests
    const zcardResult = checkResults?.[1]
    if (zcardResult?.[0]) {
      throw zcardResult[0]
    }
    const countResult = zcardResult?.[1]
    const count = typeof countResult === 'number' ? countResult : 0

    if (count >= this.maxRequests) {
      // Over limit — find oldest entry to calculate retry-after
      const oldest = await this.redis.zrange(key, 0, 0, 'WITHSCORES')
      const retryAfterMs =
        oldest.length >= 2 ? Number(oldest[1]) + this.windowMs - now : this.windowMs
      return { allowed: false, remaining: 0, retryAfterMs: Math.max(retryAfterMs, 0) }
    }

    // Phase 2: Allowed — add entry and set TTL
    const addPipeline = this.redis.pipeline()
    addPipeline.zadd(key, now, `${now}:${randomUUID()}`)
    addPipeline.expire(key, Math.ceil(this.windowMs / 1000))
    const addResults = await addPipeline.exec()
    const zaddResult = addResults?.[0]
    if (zaddResult?.[0]) {
      throw zaddResult[0]
    }

    return { allowed: true, remaining: this.maxRequests - count - 1, retryAfterMs: 0 }
  }
}
