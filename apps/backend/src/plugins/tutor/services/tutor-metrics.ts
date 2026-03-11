import type { Redis } from 'ioredis'

const METRICS_TTL_SECONDS = 7 * 24 * 60 * 60 // 7 days

function dateKey(date?: Date): string {
  const d = date ?? new Date()
  return d.toISOString().slice(0, 10) // YYYY-MM-DD
}

export interface TutorMetrics {
  recordSuccess(): Promise<void>
  recordFailure(errorType: string): Promise<void>
  getAvailabilityRate(date?: Date): Promise<number>
}

export function createTutorMetrics(redis: Redis): TutorMetrics {
  return {
    async recordSuccess() {
      const key = `tutor:metrics:requests:${dateKey()}`
      await redis.incr(key)
      await redis.expire(key, METRICS_TTL_SECONDS)
    },

    async recordFailure(errorType: string) {
      const day = dateKey()
      const reqKey = `tutor:metrics:requests:${day}`
      const failKey = `tutor:metrics:failures:${day}`

      const pipeline = redis.pipeline()
      pipeline.incr(reqKey)
      pipeline.expire(reqKey, METRICS_TTL_SECONDS)
      pipeline.incr(failKey)
      pipeline.expire(failKey, METRICS_TTL_SECONDS)
      pipeline.incr(`tutor:metrics:errors:${errorType}:${day}`)
      pipeline.expire(`tutor:metrics:errors:${errorType}:${day}`, METRICS_TTL_SECONDS)
      await pipeline.exec()
    },

    async getAvailabilityRate(date?: Date) {
      const day = dateKey(date)
      const [requests, failures] = await Promise.all([
        redis.get(`tutor:metrics:requests:${day}`),
        redis.get(`tutor:metrics:failures:${day}`),
      ])

      const totalRequests = Number(requests) || 0
      const totalFailures = Number(failures) || 0

      if (totalRequests === 0) return 100

      return Math.round(((totalRequests - totalFailures) / totalRequests) * 10000) / 100
    },
  }
}
