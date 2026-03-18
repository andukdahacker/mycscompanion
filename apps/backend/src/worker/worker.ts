import { Sentry } from '../instrument.js' // Must be first — Sentry auto-instrumentation
import pino from 'pino'
import { Redis } from 'ioredis'
import { Worker } from 'bullmq'
import { ExecutionServiceClient, executionServiceConfig } from '@mycscompanion/execution'
import { db, destroyDb } from '../shared/db.js'
import { createBullMQConnection, EXECUTION_QUEUE_NAME, EXPORT_QUEUE_NAME } from '../shared/queue.js'
import { createEventPublisher } from '../shared/event-publisher.js'
import { createExecutionProcessor } from './processors/execution-processor.js'
import { createExportProcessor } from './processors/export-processor.js'
import { createContentLoader } from '../plugins/curriculum/content-loader.js'

const logger = pino({
  level: process.env['LOG_LEVEL'] ?? 'info',
  transport:
    process.env['NODE_ENV'] !== 'production'
      ? { target: 'pino-pretty' }
      : undefined,
})

// Validate required env vars
if (!process.env['MCC_EXECUTION_URL']) {
  throw new Error('MCC_EXECUTION_URL environment variable is required')
}
if (!process.env['MCC_EXECUTION_SECRET']) {
  throw new Error('MCC_EXECUTION_SECRET environment variable is required')
}

const executionUrl = process.env['MCC_EXECUTION_URL']
const executionSecret = process.env['MCC_EXECUTION_SECRET']

const redisUrl = process.env['REDIS_URL']
if (!redisUrl) throw new Error('REDIS_URL environment variable is required')

// Create BullMQ connection (maxRetriesPerRequest: null)
const bullmqConnection = createBullMQConnection(redisUrl)
bullmqConnection.on('error', (err) => { logger.error(err, 'BullMQ connection error') })

// Standard Redis connection for pub/sub
const redis = new Redis(redisUrl)
redis.on('error', (err) => { logger.error(err, 'Redis connection error') })

// Create execution service client
const executionClient = new ExecutionServiceClient(executionUrl, executionSecret)

// Create event publisher
const eventPublisher = createEventPublisher(redis)

// Create content loader for criteria evaluation
const contentLoader = createContentLoader({ redis })

// Create execution processor
const processor = createExecutionProcessor({
  executionClient,
  db,
  eventPublisher,
  logger,
  contentLoader,
  defaultTimeoutSeconds: executionServiceConfig.defaultTimeoutSeconds,
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

// Create export processor
const exportProcessor = createExportProcessor({ db, logger })

// Create export Worker
const exportWorker = new Worker(EXPORT_QUEUE_NAME, exportProcessor, {
  connection: bullmqConnection,
  concurrency: 2,
})

exportWorker.on('failed', (job, err) => {
  if (job && job.attemptsMade >= (job.opts.attempts ?? 1)) {
    Sentry.captureException(err, {
      extra: { exportId: job.data.exportId, userId: job.data.userId },
    })
  }
})

exportWorker.on('error', (err) => {
  logger.error(err, 'Export worker connection error')
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
      await exportWorker.close()
      await redis.quit()
      await bullmqConnection.quit()
      await destroyDb()
      await Sentry.close(2000)
      process.exit(0)
    })().catch(() => process.exit(1))
  })
}
