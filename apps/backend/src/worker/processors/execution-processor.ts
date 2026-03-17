import { readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import type { Kysely } from 'kysely'
import type { Logger } from 'pino'
import type { DB, AcceptanceCriterion, CriterionResult } from '@mycscompanion/shared'
import type { FlyMachineConfig } from '@mycscompanion/execution'
import {
  type FlyClient,
  FlyApiError,
  buildMachineRequest,
  parseBenchmarkOutput,
  classifyBenchmarkError,
} from '@mycscompanion/execution'
import type { BenchmarkRunResult } from '@mycscompanion/execution'
import type { EventPublisher } from '../../shared/event-publisher.js'
import type { ExecutionJobData } from '../../shared/queue.js'
import type { ExecutionResult } from '../../shared/execution-types.js'
import type { ContentLoader } from '../../plugins/curriculum/content-loader.js'
import { evaluateCriteria, evaluateAllNotMet } from '../../shared/criteria-evaluator.js'
import { persistBenchmarkResult } from '../../shared/benchmark-persistence.js'

/** Narrow job interface — only properties actually used by the processor */
export interface ExecutionJob {
  readonly data: ExecutionJobData
}

/** Signature for the benchmark execution function — injectable for testing */
export type RunBenchmarkFn = (opts: {
  readonly flyClient: FlyClient
  readonly flyConfig: FlyMachineConfig
  readonly flyApiToken: string
  readonly flyAppName: string
  readonly code: string
  readonly submissionId: string
  readonly milestoneId: string
  readonly referenceMainGo: string
  readonly referenceGoMod: string
  readonly benchmark: { readonly name: string; readonly workload?: { readonly type?: string; readonly numOperations?: number; readonly keySizeBytes?: number; readonly valueSizeBytes?: number } }
  readonly warmup: number
  readonly iterations: number
  readonly logger: Logger
}) => Promise<string>

export interface ExecutionProcessorDeps {
  readonly flyClient: FlyClient
  readonly flyConfig: FlyMachineConfig
  readonly db: Kysely<DB>
  readonly eventPublisher: EventPublisher
  readonly logger: Logger
  readonly flyApiToken: string
  readonly flyAppName: string
  readonly contentLoader: ContentLoader
  readonly runBenchmark?: RunBenchmarkFn
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
  const abortController = new AbortController()
  const timeout = setTimeout(() => abortController.abort(), 10_000)

  try {
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${apiToken}` },
      signal: abortController.signal,
    })
    if (!response.ok || !response.body) return []

    // Fly logs API is a streaming NDJSON endpoint that never closes.
    // Read lines until abort timeout fires.
    const messages: string[] = []
    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })

        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          if (!line.trim()) continue
          try {
            const entry: unknown = JSON.parse(line)
            if (isLogEntryWithMessage(entry)) {
              messages.push(entry.message)
            }
          } catch {
            messages.push(line)
          }
        }
      }
    } catch {
      // AbortError expected when timeout fires — return what we have
    }

    return messages
  } finally {
    clearTimeout(timeout)
  }
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

/**
 * Attempts to run a benchmark on the same Fly Machine.
 * Returns the stdout for parseBenchmarkOutput to parse.
 * Returns empty string if the Go image doesn't support --benchmark yet.
 */
async function runBenchmarkOnMachine(opts: {
  readonly flyClient: FlyClient
  readonly flyConfig: FlyMachineConfig
  readonly flyApiToken: string
  readonly flyAppName: string
  readonly code: string
  readonly submissionId: string
  readonly milestoneId: string
  readonly referenceMainGo: string
  readonly referenceGoMod: string
  readonly benchmark: { readonly name: string; readonly workload?: { readonly type?: string; readonly numOperations?: number; readonly keySizeBytes?: number; readonly valueSizeBytes?: number } }
  readonly warmup: number
  readonly iterations: number
  readonly logger: Logger
}): Promise<string> {
  const { logger } = opts
  // The Go execution image --benchmark flag is a parallel workstream.
  // When the image supports it, this function will:
  // 1. Build a machine request with reference files and --benchmark CLI args
  // 2. Create the machine and wait for completion
  // 3. Fetch and return stdout
  // For now, return empty string — parseBenchmarkOutput handles empty input gracefully.
  logger.info({ submissionId: opts.submissionId, benchmarkName: opts.benchmark.name }, 'benchmark_execution_skipped_go_image_pending')
  return ''
}

export function createExecutionProcessor(
  deps: ExecutionProcessorDeps,
): (job: ExecutionJob) => Promise<void> {
  const { flyClient, flyConfig, db, eventPublisher, logger, flyApiToken, flyAppName, contentLoader } = deps
  const executeBenchmark = deps.runBenchmark ?? runBenchmarkOnMachine

  return async (job: ExecutionJob): Promise<void> => {
    const { submissionId, milestoneId, code, userId } = job.data
    let machineId: string | undefined
    const startTime = Date.now()
    let sequenceId = 1

    /** Shared helper: load criteria by slug → evaluate → publish SSE → return JSON string */
    async function evaluateAndPublishCriteria(
      slug: string | null,
      evaluateFn: (criteria: ReadonlyArray<AcceptanceCriterion>) => ReadonlyArray<CriterionResult>,
    ): Promise<string | null> {
      try {
        if (!slug) return null

        const criteria = await contentLoader.loadAcceptanceCriteria(slug)
        if (criteria.length === 0) return null

        const criteriaResults = evaluateFn(criteria)
        await eventPublisher.publish(submissionId, {
          type: 'criteria_results',
          results: criteriaResults,
          data: '',
          sequenceId: sequenceId++,
        })
        return JSON.stringify(criteriaResults)
      } catch (criteriaErr) {
        logger.warn({ err: criteriaErr instanceof Error ? criteriaErr : new Error(String(criteriaErr)), submissionId }, 'criteria_evaluation_failed')
        return null
      }
    }

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

      // Look up milestone slug once — used for benchmark + criteria phases
      let milestoneSlug: string | null = null
      try {
        const milestone = await db
          .selectFrom('milestones')
          .select('slug')
          .where('id', '=', milestoneId)
          .executeTakeFirst()
        milestoneSlug = milestone?.slug ?? null
      } catch {
        // milestone lookup failed — skip benchmark and criteria phases that need slug
      }

      // Benchmark phase — only for successful executions with benchmark config
      let benchmarkRunResult: BenchmarkRunResult | null = null
      if (!analysis.isUserError && milestoneSlug) {
        try {
          const benchmarkConfig = await contentLoader.loadBenchmarkConfig(milestoneSlug)
          if (benchmarkConfig && benchmarkConfig.benchmarks.length > 0) {
            // Load reference implementation files
            const contentBase = resolve(process.cwd(), '..', '..', 'content', 'milestones', milestoneSlug, 'reference-impl')
            let referenceMainGo: string | null = null
            let referenceGoMod: string | null = null
            try {
              referenceMainGo = await readFile(join(contentBase, 'main.go'), 'utf-8')
              referenceGoMod = await readFile(join(contentBase, 'go.mod'), 'utf-8')
            } catch (refErr) {
              logger.warn({ err: refErr instanceof Error ? refErr : new Error(String(refErr)), milestoneSlug }, 'reference_impl_not_found_skipping_benchmark')
            }

            if (referenceMainGo && referenceGoMod) {
              for (const benchmark of benchmarkConfig.benchmarks) {
                const warmup = benchmark.warmupIterations ?? 2
                const iterations = benchmark.measuredIterations ?? 10
                const totalIterations = warmup + iterations

                await eventPublisher.publish(submissionId, {
                  type: 'benchmark_progress',
                  phase: 'benchmarking',
                  iteration: 0,
                  total: totalIterations,
                  data: `Starting benchmark: ${benchmark.name}`,
                  sequenceId: sequenceId++,
                })

                // Execute benchmark on the same Fly Machine with reference files.
                // The Go execution image --benchmark flag is a parallel workstream.
                // When not available, parseBenchmarkOutput returns zeros (empty stdout).
                const benchmarkStdout = await executeBenchmark({
                  flyClient, flyConfig, flyApiToken, flyAppName,
                  code, submissionId, milestoneId,
                  referenceMainGo, referenceGoMod,
                  benchmark, warmup, iterations,
                  logger,
                })

                const result = parseBenchmarkOutput(benchmarkStdout, benchmark.name)
                const referenceVersion = benchmark.referenceVersion ?? 'unknown'

                if (result.rawUserTimings.length > 0) {
                  benchmarkRunResult = result

                  await eventPublisher.publish(submissionId, {
                    type: 'benchmark_result',
                    phase: 'benchmarking',
                    userMedian: result.userMedian,
                    referenceMedian: result.referenceMedian,
                    normalizedRatio: result.normalizedRatio,
                    opsPerSec: result.opsPerSec,
                    data: '',
                    sequenceId: sequenceId++,
                  })

                  await persistBenchmarkResult(db, {
                    submissionId,
                    userId,
                    milestoneId,
                    benchmarkName: benchmark.name,
                    result,
                    referenceVersion,
                  })
                } else {
                  logger.info({ submissionId, benchmarkName: benchmark.name }, 'benchmark_produced_no_results')
                }
              }
            }
          }
        } catch (benchErr) {
          // Benchmark failures should not fail the submission
          const errType = classifyBenchmarkError(benchErr)
          logger.warn({ err: benchErr instanceof Error ? benchErr : new Error(String(benchErr)), submissionId, errorType: errType }, 'benchmark_phase_failed')
        }
      }

      // Evaluate acceptance criteria (with optional benchmark result)
      const criteriaResultsJson = await evaluateAndPublishCriteria(milestoneSlug, (criteria) =>
        analysis.isUserError
          ? evaluateAllNotMet(criteria, analysis.compilationSucceeded ? 'Runtime error' : 'Compilation failed')
          : evaluateCriteria(criteria, executionResult, benchmarkRunResult),
      )

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
            ...(criteriaResultsJson ? { criteria_results: criteriaResultsJson } : {}),
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
            ...(criteriaResultsJson ? { criteria_results: criteriaResultsJson } : {}),
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

        // Evaluate criteria as all not-met for timeout — look up slug since we didn't reach the main path
        let timeoutSlug: string | null = null
        try {
          const ms = await db.selectFrom('milestones').select('slug').where('id', '=', milestoneId).executeTakeFirst()
          timeoutSlug = ms?.slug ?? null
        } catch { /* best-effort */ }
        const timeoutCriteriaJson = await evaluateAndPublishCriteria(timeoutSlug, (criteria) =>
          evaluateAllNotMet(criteria, 'Execution timed out'),
        )

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
            ...(timeoutCriteriaJson ? { criteria_results: timeoutCriteriaJson } : {}),
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
