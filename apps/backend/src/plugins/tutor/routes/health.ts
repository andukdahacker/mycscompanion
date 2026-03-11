import type { FastifyInstance } from 'fastify'
import type { CircuitBreaker } from '../services/circuit-breaker.js'
import type { TutorMetrics } from '../services/tutor-metrics.js'

export type HealthRoutesOptions = {
  readonly circuitBreaker: CircuitBreaker
  readonly tutorMetrics: TutorMetrics | null
}

export async function healthRoutes(
  fastify: FastifyInstance,
  opts: HealthRoutesOptions
): Promise<void> {
  const { circuitBreaker, tutorMetrics } = opts

  fastify.get('/health', async () => {
    const circuitState = circuitBreaker.state
    const retryAfterSec = circuitBreaker.retryAfterSeconds()
    const availabilityRate = await tutorMetrics?.getAvailabilityRate() ?? 100

    return {
      available: circuitState !== 'OPEN',
      circuitState,
      availabilityRate,
      consecutiveFailures: circuitBreaker.consecutiveFailures,
      retryAfterMs: retryAfterSec !== null ? retryAfterSec * 1000 : null,
    }
  })
}
