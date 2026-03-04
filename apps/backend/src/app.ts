import type { FastifyError, FastifyInstance } from 'fastify'
import Fastify from 'fastify'
import cors from '@fastify/cors'
import { Sentry } from './instrument.js'
import { authPlugin } from './plugins/auth/index.js'
import { executionPlugin } from './plugins/execution/index.js'
import { tutorPlugin } from './plugins/tutor/index.js'
import { curriculumPlugin } from './plugins/curriculum/index.js'
import { progressPlugin } from './plugins/progress/index.js'
import { accountPlugin } from './plugins/account/index.js'
import { adminPlugin } from './plugins/admin/index.js'
import { redis } from './shared/redis.js'
import { createBullMQConnection, createExecutionQueue } from './shared/queue.js'
import { RateLimiter } from './shared/rate-limiter.js'
import { createEventPublisher } from './shared/event-publisher.js'

export async function buildApp(): Promise<FastifyInstance> {
  const fastify = Fastify({
    logger: {
      level: process.env['LOG_LEVEL'] ?? 'info',
      transport:
        process.env['NODE_ENV'] !== 'production'
          ? { target: 'pino-pretty' }
          : undefined,
    },
    trustProxy: true, // Trust Railway's reverse proxy for X-Forwarded-* headers
  })

  // CORS — allow webapp origin
  await fastify.register(cors, {
    origin: process.env['CORS_ORIGIN'] ?? 'http://localhost:5173',
    credentials: true,
  })

  // Health check — unauthenticated, registered before auth plugin
  fastify.get('/health', async () => {
    return { status: 'ok' }
  })

  // --- Plugin registration order (ARCH-5) ---
  // Position 1: Auth (global onRequest hook — must be first)
  await fastify.register(authPlugin)

  // Position 2: Rate limiter + queue infrastructure
  const redisUrl = process.env['REDIS_URL']
  if (!redisUrl) throw new Error('REDIS_URL environment variable is required')
  const bullmqConnection = createBullMQConnection(redisUrl)
  bullmqConnection.on('error', (err) => { fastify.log.error(err, 'BullMQ connection error') })
  const executionQueue = createExecutionQueue(bullmqConnection)
  const rateLimiter = new RateLimiter({ redis, windowMs: 60_000, maxRequests: 10 })
  const eventPublisher = createEventPublisher(redis)

  // Position 3: Domain plugins
  await fastify.register(executionPlugin, {
    prefix: '/api/execution',
    queue: executionQueue,
    rateLimiter,
    eventPublisher,
    redis,
  })
  await fastify.register(tutorPlugin, { prefix: '/api/tutor' })
  await fastify.register(curriculumPlugin, { prefix: '/api/curriculum' })
  await fastify.register(progressPlugin, { prefix: '/api/progress' })
  await fastify.register(accountPlugin, { prefix: '/api/account' })

  // Position 4: Admin tools (Bull Board) — after domain plugins, uses own auth (basic auth)
  // Prefix scopes basicAuth hook + routes. setBasePath for UI link generation.
  await fastify.register(adminPlugin, { prefix: '/admin/queues', executionQueue })

  // Cleanup on close
  fastify.addHook('onClose', async () => {
    await executionQueue.close()
    await bullmqConnection.quit()
  })

  // Error handler — must be registered last (after all plugins)
  fastify.setErrorHandler((error: FastifyError, request, reply) => {
    const statusCode = error.statusCode ?? 500

    if (statusCode >= 500) {
      Sentry.captureException(error, {
        extra: {
          method: request.method,
          url: request.url,
          params: request.params,
        },
      })
      request.log.error(error, 'Platform error')
    } else {
      request.log.warn(error, 'Client error')
    }

    void reply.status(statusCode).send({
      error: {
        code: error.code ?? 'INTERNAL_ERROR',
        message: statusCode >= 500 ? 'Internal Server Error' : error.message,
      },
    })
  })

  return fastify
}
