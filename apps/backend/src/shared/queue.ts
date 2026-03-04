import { Queue } from 'bullmq'
import { Redis } from 'ioredis'

export const EXECUTION_QUEUE_NAME = 'execution-run'

export type ExecutionJobData = {
  readonly submissionId: string
  readonly milestoneId: string
  readonly code: string
  readonly userId: string
}

export function createBullMQConnection(redisUrl: string): Redis {
  return new Redis(redisUrl, { maxRetriesPerRequest: null })
}

export function createExecutionQueue(connection: Redis): Queue<ExecutionJobData> {
  return new Queue<ExecutionJobData>(EXECUTION_QUEUE_NAME, {
    connection,
    defaultJobOptions: {
      attempts: 2,
      backoff: { type: 'exponential', delay: 5000 },
      removeOnComplete: { age: 3600 },
      removeOnFail: { age: 86400 },
    },
  })
}
