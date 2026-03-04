import { Sentry } from '../instrument.js' // Must be first — Sentry auto-instrumentation
import pino from 'pino'
import { Redis } from 'ioredis'
import { Worker } from 'bullmq'
import { FlyClient, DEFAULT_FLY_MACHINE_CONFIG, getExecutionImageRef } from '@mycscompanion/execution'
import { db, destroyDb } from '../shared/db.js'
import { createBullMQConnection, EXECUTION_QUEUE_NAME } from '../shared/queue.js'
import { createEventPublisher } from '../shared/event-publisher.js'
import { createExecutionProcessor } from './processors/execution-processor.js'

const logger = pino({
  level: process.env['LOG_LEVEL'] ?? 'info',
  transport:
    process.env['NODE_ENV'] !== 'production'
      ? { target: 'pino-pretty' }
      : undefined,
})

// Validate required env vars
if (!process.env['MCC_FLY_API_TOKEN']) {
  throw new Error('MCC_FLY_API_TOKEN environment variable is required')
}

const flyApiToken = process.env['MCC_FLY_API_TOKEN']
const flyAppName = process.env['MCC_FLY_APP_NAME'] ?? 'mcc-execution'

const redisUrl = process.env['REDIS_URL']
if (!redisUrl) throw new Error('REDIS_URL environment variable is required')

// Create BullMQ connection (maxRetriesPerRequest: null)
const bullmqConnection = createBullMQConnection(redisUrl)
bullmqConnection.on('error', (err) => { logger.error(err, 'BullMQ connection error') })

// Standard Redis connection for pub/sub
const redis = new Redis(redisUrl)
redis.on('error', (err) => { logger.error(err, 'Redis connection error') })

// Create Fly client
const flyClient = new FlyClient({ apiToken: flyApiToken, appName: flyAppName })

// Build runtime config with current execution image
const flyConfig = {
  ...DEFAULT_FLY_MACHINE_CONFIG,
  image: getExecutionImageRef(),
}

// Create event publisher
const eventPublisher = createEventPublisher(redis)

// Create execution processor
const processor = createExecutionProcessor({
  flyClient,
  flyConfig,
  db,
  eventPublisher,
  logger,
  flyApiToken,
  flyAppName,
})

// Create BullMQ Worker
const worker = new Worker(EXECUTION_QUEUE_NAME, processor, {
  connection: bullmqConnection,
  concurrency: 10,
})

worker.on('failed', (job, err) => {
  if (job && job.attemptsMade >= (job.opts.attempts ?? 1)) {
    Sentry.captureException(err, {
      extra: { submissionId: job.data.submissionId },
    })
    // Update DB status to failed for permanently failed jobs
    db.updateTable('submissions')
      .set({ status: 'failed', error_message: err.message, updated_at: new Date() })
      .where('id', '=', job.data.submissionId)
      .execute()
      .catch((dbErr) => { logger.error(dbErr, 'failed_to_update_exhausted_job_status') })
  }
})

worker.on('error', (err) => {
  logger.error(err, 'Worker connection error')
})

logger.info('Worker started')

// Graceful shutdown with re-entry guard
let isShuttingDown = false
for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.on(signal, () => {
    if (isShuttingDown) return
    isShuttingDown = true
    logger.info({ signal }, 'Worker shutting down')
    void (async () => {
      await worker.close()
      await redis.quit()
      await bullmqConnection.quit()
      await destroyDb()
      await Sentry.close(2000)
      process.exit(0)
    })().catch(() => process.exit(1))
  })
}
