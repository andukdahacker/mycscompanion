import type { Kysely } from 'kysely'
import type { Logger } from 'pino'
import type { DB } from '@mycscompanion/shared'
import type { FlyMachineConfig } from '@mycscompanion/execution'
import { type FlyClient, FlyApiError, buildMachineRequest } from '@mycscompanion/execution'
import type { EventPublisher } from '../../shared/event-publisher.js'
import type { ExecutionJobData } from '../../shared/queue.js'
import type { ExecutionResult } from '../../shared/execution-types.js'

/** Narrow job interface — only properties actually used by the processor */
export interface ExecutionJob {
  readonly data: ExecutionJobData
}

export interface ExecutionProcessorDeps {
  readonly flyClient: FlyClient
  readonly flyConfig: FlyMachineConfig
  readonly db: Kysely<DB>
  readonly eventPublisher: EventPublisher
  readonly logger: Logger
  readonly flyApiToken: string
  readonly flyAppName: string
}

const MAX_OUTPUT_BYTES = 65536

function isLogEntryWithMessage(value: unknown): value is Readonly<{ message: string }> {
  if (typeof value !== 'object' || value === null || !('message' in value)) return false
  return typeof value.message === 'string'
}

async function fetchMachineLogs(
  appName: string,
  machineId: string,
  apiToken: string,
): Promise<string[]> {
  const url = new URL(`https://api.fly.io/api/v1/apps/${encodeURIComponent(appName)}/logs`)
  url.searchParams.set('instance', machineId)
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${apiToken}` },
    signal: AbortSignal.timeout(10_000),
  })
  if (!response.ok) return []
  const text = await response.text()
  return text
    .trim()
    .split('\n')
    .filter(Boolean)
    .flatMap((line) => {
      try {
        const entry: unknown = JSON.parse(line)
        if (isLogEntryWithMessage(entry)) {
          return [entry.message]
        }
        return []
      } catch {
        return [line]
      }
    })
}

function analyzeOutput(output: string[], exitCode: number | null): {
  compilationSucceeded: boolean
  isUserError: boolean
  combinedOutput: string
} {
  const combinedOutput = output.join('\n')
  const hasGoErrorPatterns =
    /\.go:\d+:\d+:/.test(combinedOutput) ||
    combinedOutput.includes('# command-line-arguments')

  if (exitCode !== null && exitCode !== 0 && hasGoErrorPatterns) {
    return { compilationSucceeded: false, isUserError: true, combinedOutput }
  }
  if (exitCode !== null && exitCode !== 0) {
    return { compilationSucceeded: true, isUserError: true, combinedOutput }
  }
  if (exitCode === null) {
    // Unknown exit code (machine crash, OOM, API failure) — treat as indeterminate failure
    // unless output is empty or contains no error indicators
    if (hasGoErrorPatterns) {
      return { compilationSucceeded: false, isUserError: true, combinedOutput }
    }
    // No exit code and no error patterns: best-effort success if we got output
    return { compilationSucceeded: true, isUserError: false, combinedOutput }
  }
  return { compilationSucceeded: true, isUserError: false, combinedOutput }
}

function truncateOutput(lines: string[], maxBytes: number): string[] {
  let totalBytes = 0
  const result: string[] = []
  for (const line of lines) {
    totalBytes += line.length + 1 // +1 for newline
    if (totalBytes > maxBytes) break
    result.push(line)
  }
  return result
}

export function createExecutionProcessor(
  deps: ExecutionProcessorDeps,
): (job: ExecutionJob) => Promise<void> {
  const { flyClient, flyConfig, db, eventPublisher, logger, flyApiToken, flyAppName } = deps

  return async (job: ExecutionJob): Promise<void> => {
    const { submissionId, milestoneId, code } = job.data
    let machineId: string | undefined
    const startTime = Date.now()
    let sequenceId = 1

    try {
      // Update status to running (only if still queued — guards against retry resurrection)
      await db
        .updateTable('submissions')
        .set({ status: 'running', updated_at: new Date() })
        .where('id', '=', submissionId)
        .where('status', '=', 'queued')
        .execute()

      await eventPublisher.publish(submissionId, {
        type: 'output',
        phase: 'preparing',
        data: 'Provisioning execution environment...',
        sequenceId: sequenceId++,
      })

      // Build machine request and create
      const request = buildMachineRequest(flyConfig, code, { submissionId, milestoneId })
      const machine = await flyClient.createMachine(request)
      const createdMachineId = machine.id
      machineId = createdMachineId
      const instanceId = machine.instance_id

      await eventPublisher.publish(submissionId, {
        type: 'output',
        phase: 'preparing',
        data: `Machine created in ${machine.region}`,
        sequenceId: sequenceId++,
      })

      // Wait for started
      await flyClient.waitForState(createdMachineId, 'started', {
        timeoutSeconds: flyConfig.timeoutSeconds,
      })

      await eventPublisher.publish(submissionId, {
        type: 'output',
        phase: 'compiling',
        data: 'Compiling and running...',
        sequenceId: sequenceId++,
      })

      // Wait for stopped
      await flyClient.waitForState(createdMachineId, 'stopped', {
        instanceId,
        timeoutSeconds: flyConfig.timeoutSeconds,
      })

      // Fetch logs and extract exit code
      const logMessages = await fetchMachineLogs(flyAppName, createdMachineId, flyApiToken)

      // Try to get exit code from machine details
      let exitCode: number | null = null
      try {
        const machineDetails = await flyClient.getMachine(createdMachineId)
        const exitEvent = machineDetails.events.find(
          (e) => e.type === 'exit'
        )
        if (exitEvent && 'exit_code' in exitEvent) {
          exitCode = typeof exitEvent.exit_code === 'number' ? exitEvent.exit_code : null
        }
      } catch {
        // Exit code unavailable — determine from log content only
      }

      // Truncate log output to prevent oversized DB entries
      const truncatedMessages = truncateOutput(logMessages, MAX_OUTPUT_BYTES)
      const analysis = analyzeOutput(truncatedMessages, exitCode)

      // Publish output events
      if (!analysis.compilationSucceeded) {
        await eventPublisher.publish(submissionId, {
          type: 'compile_error',
          phase: 'compiling',
          data: analysis.combinedOutput,
          sequenceId: sequenceId++,
        })
      } else if (analysis.combinedOutput) {
        await eventPublisher.publish(submissionId, {
          type: 'output',
          phase: 'compiling',
          data: analysis.combinedOutput,
          sequenceId: sequenceId++,
        })
      }

      const durationMs = Date.now() - startTime
      const executionResult: ExecutionResult = {
        exitCode,
        output: analysis.combinedOutput,
        machineId: createdMachineId,
        durationMs,
        compilationSucceeded: analysis.compilationSucceeded,
      }

      if (analysis.isUserError) {
        await eventPublisher.publish(submissionId, {
          type: 'error',
          phase: 'compiling',
          message: analysis.compilationSucceeded ? 'Runtime error' : 'Compilation failed',
          isUserError: true,
          data: analysis.combinedOutput,
          sequenceId: sequenceId++,
        })

        await db
          .updateTable('submissions')
          .set({
            status: 'failed',
            execution_result: JSON.stringify(executionResult),
            error_message: analysis.compilationSucceeded ? 'Runtime error' : 'Compilation failed',
            updated_at: new Date(),
          })
          .where('id', '=', submissionId)
          .execute()
      } else {
        await eventPublisher.publish(submissionId, {
          type: 'complete',
          phase: 'compiling',
          data: 'Execution completed successfully',
          sequenceId: sequenceId++,
        })

        await db
          .updateTable('submissions')
          .set({
            status: 'completed',
            execution_result: JSON.stringify(executionResult),
            updated_at: new Date(),
          })
          .where('id', '=', submissionId)
          .execute()
      }

      await eventPublisher.setLogTTL(submissionId, 300)
    } catch (err) {
      // Timeout handling
      if (
        err instanceof FlyApiError &&
        (err.status === 408 || err.status === 504)
      ) {
        if (machineId) {
          try {
            await flyClient.stopMachine(machineId)
          } catch {
            // Best-effort stop
          }
        }

        await eventPublisher.publish(submissionId, {
          type: 'timeout',
          phase: 'compiling',
          timeoutSeconds: flyConfig.timeoutSeconds,
          data: `Execution timed out after ${flyConfig.timeoutSeconds}s`,
          sequenceId: sequenceId++,
        })

        await db
          .updateTable('submissions')
          .set({
            status: 'failed',
            error_message: `Execution timed out after ${flyConfig.timeoutSeconds}s`,
            updated_at: new Date(),
          })
          .where('id', '=', submissionId)
          .execute()

        await eventPublisher.setLogTTL(submissionId, 300)
        return
      }

      // Retryable error — update DB status back to queued and throw for BullMQ retry
      if (err instanceof FlyApiError && err.isRetryable) {
        logger.warn({ err, submissionId, machineId }, 'retryable_fly_error')
        try {
          await db
            .updateTable('submissions')
            .set({ status: 'queued', updated_at: new Date() })
            .where('id', '=', submissionId)
            .execute()
        } catch (dbErr) {
          logger.error({ err: dbErr instanceof Error ? dbErr : new Error(String(dbErr)), submissionId }, 'failed_to_reset_status_on_retry')
        }
        await eventPublisher.setLogTTL(submissionId, 300)
        throw err
      }

      // Non-retryable error — mark as failed, don't re-throw
      const errorObj = err instanceof Error ? err : new Error(String(err))
      logger.error({ err: errorObj, submissionId, machineId }, 'execution_processor_error')

      await eventPublisher.publish(submissionId, {
        type: 'error',
        phase: 'preparing',
        message: 'An internal error occurred during execution',
        isUserError: false,
        data: '',
        sequenceId: sequenceId++,
      })

      await db
        .updateTable('submissions')
        .set({
          status: 'failed',
          error_message: errorObj.message,
          updated_at: new Date(),
        })
        .where('id', '=', submissionId)
        .execute()

      await eventPublisher.setLogTTL(submissionId, 300)
    } finally {
      if (machineId) {
        try {
          await flyClient.destroyMachine(machineId, true)
        } catch (destroyErr) {
          logger.warn({ err: destroyErr, machineId }, 'machine_destroy_failed')
        }
      }
    }
  }
}
