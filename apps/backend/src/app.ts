import type { FastifyError, FastifyInstance } from 'fastify'
import Fastify from 'fastify'
import cors from '@fastify/cors'
import fastifyStatic from '@fastify/static'
import { resolve, join } from 'node:path'
import { Sentry } from './instrument.js'
import { authPlugin } from './plugins/auth/index.js'
import { initFirebaseAdmin } from './plugins/auth/firebase.js'
import { executionPlugin } from './plugins/execution/index.js'
import { tutorPlugin } from './plugins/tutor/index.js'
import { curriculumPlugin } from './plugins/curriculum/index.js'
import { completionPlugin } from './plugins/completion/index.js'
import { createContentLoader } from './plugins/curriculum/content-loader.js'
import { progressPlugin } from './plugins/progress/index.js'
import { accountPlugin } from './plugins/account/index.js'
import { adminPlugin } from './plugins/admin/index.js'
import { generateId } from './shared/id.js'
import { redis } from './shared/redis.js'
import { createBullMQConnection, createExecutionQueue, createExportQueue } from './shared/queue.js'
import { RateLimiter } from './shared/rate-limiter.js'
import { createEventPublisher } from './shared/event-publisher.js'
import Anthropic from '@anthropic-ai/sdk'

export async function buildApp(): Promise<FastifyInstance> {
  const fastify = Fastify({
    genReqId: () => generateId(),
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
  const firebaseAuth = initFirebaseAdmin()
  await fastify.register(authPlugin, { firebaseAuth })

  // Position 2: Rate limiter + queue infrastructure
  const redisUrl = process.env['REDIS_URL']
  if (!redisUrl) throw new Error('REDIS_URL environment variable is required')
  const bullmqConnection = createBullMQConnection(redisUrl)
  bullmqConnection.on('error', (err) => { fastify.log.error(err, 'BullMQ connection error') })
  const executionQueue = createExecutionQueue(bullmqConnection)
  const exportQueue = createExportQueue(bullmqConnection)
  const rateLimiter = new RateLimiter({ redis, windowMs: 60_000, maxRequests: 10 })
  const eventPublisher = createEventPublisher(redis)

  // Log enrichment: add user ID to request logger for authenticated requests
  fastify.addHook('onRequest', async (request) => {
    if (request.uid !== '') {
      request.log = request.log.child({ uid: request.uid })
    }
  })

  // Return request ID in response header for client-side traceability
  fastify.addHook('onSend', async (request, reply) => {
    void reply.header('x-request-id', request.id)
  })

  // Position 3: Domain plugins
  await fastify.register(executionPlugin, {
    prefix: '/api/execution',
    queue: executionQueue,
    rateLimiter,
    eventPublisher,
    redis,
  })
  const tutorRateLimiter = new RateLimiter({ redis, windowMs: 60_000, maxRequests: 30 })
  const anthropicApiKey = process.env['ANTHROPIC_API_KEY']
  await fastify.register(tutorPlugin, {
    prefix: '/api/tutor',
    redis,
    rateLimiter: tutorRateLimiter,
    ...(anthropicApiKey ? { anthropicClient: new Anthropic({ apiKey: anthropicApiKey }) } : {}),
  })
  await fastify.register(curriculumPlugin, { prefix: '/api/curriculum', redis })

  // Serve milestone concept explainer SVG assets
  // Maps /assets/milestones/{slug}/{file} → content/milestones/{slug}/assets/{file}
  const contentMilestonesRoot = resolve(process.cwd(), '..', '..', 'content', 'milestones')
  await fastify.register(fastifyStatic, {
    root: contentMilestonesRoot,
    serve: false,
  })
  const VALID_ASSET_SLUG = /^[\w-]+$/
  const VALID_ASSET_FILENAME = /^[\w.-]+$/
  fastify.get<{ Params: { slug: string; filename: string } }>(
    '/assets/milestones/:slug/:filename',
    async (request, reply) => {
      const { slug, filename } = request.params
      if (!VALID_ASSET_SLUG.test(slug) || !VALID_ASSET_FILENAME.test(filename)) {
        return reply.status(400).send({
          error: { code: 'INVALID_PARAMS', message: 'Invalid slug or filename' },
        })
      }
      return reply.sendFile(join(slug, 'assets', filename))
    }
  )

  const contentLoader = createContentLoader({ redis, log: fastify.log })
  await fastify.register(completionPlugin, { prefix: '/api/completion', contentLoader })
  await fastify.register(progressPlugin, { prefix: '/api/progress', contentLoader })
  await fastify.register(accountPlugin, { prefix: '/api/account', exportQueue, firebaseAuth })

  // Position 4: Admin tools (Bull Board) — after domain plugins, uses own auth (basic auth)
  // Prefix scopes basicAuth hook + routes. setBasePath for UI link generation.
  await fastify.register(adminPlugin, { prefix: '/admin/queues', executionQueue, exportQueue })

  // Cleanup on close
  fastify.addHook('onClose', async () => {
    await executionQueue.close()
    await exportQueue.close()
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
