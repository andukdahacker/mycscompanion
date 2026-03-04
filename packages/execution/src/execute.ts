import type { FlyMachineConfig } from './index.js'
import type { ExecutionEvent } from './events.js'
import { type FlyClient, FlyApiError } from './fly-client.js'
import { buildMachineRequest } from './machine-request-builder.js'

export interface ExecuteCodeOptions {
  /** Milestone ID for machine metadata — passed through to Fly API for observability */
  readonly milestoneId?: string
  /** Callback for structured logging at each lifecycle phase.
   *  Worker in Story 3.3 uses this for NFR-P1 validation. */
  readonly onLifecycleEvent?: (phase: string, timestamp: number) => void
}

/** High-level orchestration: provision VM → wait for completion → destroy.
 *  Yields ExecutionEvent at each phase transition.
 *  This story's orchestrator only yields: queued, output, complete, error, timeout.
 *  Content-bearing events (compile_output, test_result, etc.) are populated by Story 3.3's worker. */
export async function* executeCode(
  client: FlyClient,
  config: FlyMachineConfig,
  code: string,
  submissionId: string,
  options?: ExecuteCodeOptions,
): AsyncGenerator<ExecutionEvent> {
  const log = options?.onLifecycleEvent

  yield { type: 'queued', submissionId }

  let machineId: string | undefined
  let sequenceId = 0

  try {
    // Build request
    const request = buildMachineRequest(config, code, {
      submissionId,
      milestoneId: options?.milestoneId ?? '',
    })

    // Create machine
    log?.('machine_create', Date.now())
    const createResponse = await client.createMachine(request)
    machineId = createResponse.id
    const instanceId = createResponse.instance_id

    yield {
      type: 'output',
      phase: 'preparing',
      data: `Machine ${machineId} created in ${createResponse.region}`,
      sequenceId: ++sequenceId,
    }

    // Wait for started
    await client.waitForState(machineId, 'started', {
      timeoutSeconds: config.timeoutSeconds,
    })
    log?.('machine_started', Date.now())

    yield {
      type: 'output',
      phase: 'preparing',
      data: `Machine ${machineId} started`,
      sequenceId: ++sequenceId,
    }

    // Wait for stopped (execution complete) — instanceId required
    try {
      await client.waitForState(machineId, 'stopped', {
        instanceId,
        timeoutSeconds: config.timeoutSeconds,
      })
      log?.('machine_stopped', Date.now())

      yield {
        type: 'complete',
        phase: 'preparing',
        data: `Machine ${machineId} execution completed`,
        sequenceId: ++sequenceId,
      }
    } catch (waitError) {
      if (
        waitError instanceof FlyApiError &&
        (waitError.status === 408 || waitError.status === 504)
      ) {
        // Timeout — machine didn't stop in time
        try {
          await client.stopMachine(machineId)
        } catch {
          // Best-effort stop — destroy will clean up
        }

        yield {
          type: 'timeout',
          phase: 'preparing',
          timeoutSeconds: config.timeoutSeconds,
          data: `Execution timed out after ${config.timeoutSeconds}s`,
          sequenceId: ++sequenceId,
        }
        return
      }
      throw waitError
    }
  } catch (error) {
    if (error instanceof FlyApiError && error.isRetryable) {
      yield {
        type: 'error',
        phase: 'preparing',
        message: 'Execution environment temporarily unavailable',
        isUserError: false,
        data: error.message,
        sequenceId: ++sequenceId,
      }
    } else if (error instanceof FlyApiError) {
      yield {
        type: 'error',
        phase: 'preparing',
        message: error.message,
        isUserError: false,
        data: `Fly API error: ${error.status}`,
        sequenceId: ++sequenceId,
      }
    } else {
      yield {
        type: 'error',
        phase: 'preparing',
        message:
          error instanceof Error ? error.message : 'Unknown execution error',
        isUserError: false,
        data: String(error),
        sequenceId: ++sequenceId,
      }
    }
  } finally {
    // CRITICAL: Always destroy machine in finally block
    if (machineId) {
      try {
        await client.destroyMachine(machineId, true)
        log?.('machine_destroyed', Date.now())
      } catch {
        // Best-effort destroy — auto_destroy is safety net
      }
    }
  }
}
