import { readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import type { Kysely } from 'kysely'
import type { Logger } from 'pino'
import type { DB, AcceptanceCriterion, CriterionResult } from '@mycscompanion/shared'
import {
  type ExecutionServiceClient,
  ExecutionServiceError,
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

const MAX_CODE_SIZE_BYTES = 64 * 1024 // 64KB — defense in depth (Go server also validates)

/** Narrow job interface — only properties actually used by the processor */
export interface ExecutionJob {
  readonly data: ExecutionJobData
}

/** Signature for the benchmark execution function — injectable for testing */
export type RunBenchmarkFn = (opts: {
  readonly executionClient: ExecutionServiceClient
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
  readonly executionClient: ExecutionServiceClient
  readonly db: Kysely<DB>
  readonly eventPublisher: EventPublisher
  readonly logger: Logger
  readonly contentLoader: ContentLoader
  readonly defaultTimeoutSeconds: number
  readonly runBenchmark?: RunBenchmarkFn
}

/**
 * Runs a benchmark via the execution service.
 * Returns stdout for parseBenchmarkOutput to parse.
 * Returns empty string — benchmark Go image support is a parallel workstream.
 */
async function runBenchmarkOnService(opts: {
  readonly executionClient: ExecutionServiceClient
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
  logger.info({ submissionId: opts.submissionId, benchmarkName: opts.benchmark.name }, 'benchmark_execution_skipped_go_image_pending')
  return ''
}

export function createExecutionProcessor(
  deps: ExecutionProcessorDeps,
): (job: ExecutionJob) => Promise<void> {
  const { executionClient, db, eventPublisher, logger, contentLoader, defaultTimeoutSeconds } = deps
  const executeBenchmark = deps.runBenchmark ?? runBenchmarkOnService

  return async (job: ExecutionJob): Promise<void> => {
    const { submissionId, milestoneId, code, userId } = job.data
    const startTime = Date.now()
    let sequenceId = 1

    /** Shared helper: evaluate pre-loaded criteria → publish SSE → return JSON string */
    async function evaluateAndPublishCriteria(
      criteria: ReadonlyArray<AcceptanceCriterion>,
      evaluateFn: (criteria: ReadonlyArray<AcceptanceCriterion>) => ReadonlyArray<CriterionResult>,
    ): Promise<string | null> {
      try {
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
        data: 'Preparing execution environment...',
        sequenceId: sequenceId++,
      })

      // Validate code size (defense in depth — Go server also validates)
      const codeBytes = Buffer.byteLength(code, 'utf8')
      if (codeBytes > MAX_CODE_SIZE_BYTES) {
        await eventPublisher.publish(submissionId, {
          type: 'error',
          phase: 'preparing',
          message: 'Code exceeds maximum size limit (64KB)',
          isUserError: true,
          data: '',
          sequenceId: sequenceId++,
        })
        await db
          .updateTable('submissions')
          .set({ status: 'failed', error_message: 'Code exceeds maximum size limit (64KB)', updated_at: new Date() })
          .where('id', '=', submissionId)
          .execute()
        await eventPublisher.setLogTTL(submissionId, 300)
        return
      }

      // Look up milestone slug — needed for criteria loading, benchmark, and evaluation
      let milestoneSlug: string | null = null
      try {
        const milestone = await db
          .selectFrom('milestones')
          .select('slug')
          .where('id', '=', milestoneId)
          .executeTakeFirst()
        milestoneSlug = milestone?.slug ?? null
      } catch {
        // milestone lookup failed — skip criteria/benchmark phases that need slug
      }

      // Load acceptance criteria before execution to extract commandArgs
      let preloadedCriteria: ReadonlyArray<AcceptanceCriterion> = []
      let commandArgs: string | undefined
      if (milestoneSlug) {
        try {
          preloadedCriteria = await contentLoader.loadAcceptanceCriteria(milestoneSlug)
          const distinctArgs = new Set(preloadedCriteria.map((c) => c.assertion.commandArgs).filter(Boolean))
          if (distinctArgs.size > 1) {
            logger.warn({ submissionId, milestoneSlug, commandArgs: [...distinctArgs] }, 'multiple_distinct_commandArgs_in_criteria')
          }
          const firstWithArgs = preloadedCriteria.find((c) => c.assertion.commandArgs)
          commandArgs = firstWithArgs?.assertion.commandArgs
        } catch (criteriaErr) {
          logger.warn({ err: criteriaErr instanceof Error ? criteriaErr : new Error(String(criteriaErr)), submissionId }, 'criteria_preload_failed')
        }
      }

      // Base64-encode user code and call the execution service
      const base64Code = Buffer.from(code).toString('base64')
      const timeoutSeconds = defaultTimeoutSeconds
      const response = await executionClient.execute({
        code: base64Code,
        args: commandArgs ? [commandArgs] : [],
        timeoutSeconds,
      })

      const durationMs = Date.now() - startTime

      // Check timeout first
      if (response.timedOut) {
        const timeoutCriteriaJson = await evaluateAndPublishCriteria(preloadedCriteria, (criteria) =>
          evaluateAllNotMet(criteria, 'Execution timed out'),
        )

        await eventPublisher.publish(submissionId, {
          type: 'timeout',
          phase: 'compiling',
          timeoutSeconds,
          data: `Execution timed out after ${timeoutSeconds}s`,
          sequenceId: sequenceId++,
        })

        const timeoutResult: ExecutionResult = {
          exitCode: response.exitCode,
          output: response.stdout,
          durationMs: Date.now() - startTime,
          compilationSucceeded: response.exitCode !== 2,
        }

        await db
          .updateTable('submissions')
          .set({
            status: 'failed',
            execution_result: JSON.stringify(timeoutResult),
            error_message: `Execution timed out after ${timeoutSeconds}s`,
            ...(timeoutCriteriaJson ? { criteria_results: timeoutCriteriaJson } : {}),
            updated_at: new Date(),
          })
          .where('id', '=', submissionId)
          .execute()

        await eventPublisher.setLogTTL(submissionId, 300)
        return
      }

      // Classify result: exitCode === 0 → success, === 2 → compilation error, other → runtime error
      const isCompilationError = response.exitCode === 2
      const isSuccess = response.exitCode === 0
      const isUserError = !isSuccess
      const compilationSucceeded = !isCompilationError

      // Publish output/error SSE events
      if (isCompilationError) {
        await eventPublisher.publish(submissionId, {
          type: 'compile_error',
          phase: 'compiling',
          data: response.stderr,
          sequenceId: sequenceId++,
        })
      } else if (isSuccess) {
        await eventPublisher.publish(submissionId, {
          type: 'output',
          phase: 'compiling',
          data: response.stdout,
          sequenceId: sequenceId++,
        })
      } else {
        // Runtime error (non-zero, non-2 exit code)
        await eventPublisher.publish(submissionId, {
          type: 'error',
          phase: 'compiling',
          message: 'Runtime error',
          isUserError: true,
          data: response.stderr,
          sequenceId: sequenceId++,
        })
      }

      const executionResult: ExecutionResult = {
        exitCode: response.exitCode,
        output: response.stdout,
        durationMs,
        compilationSucceeded,
      }

      // Benchmark phase — only for successful executions with benchmark config
      let benchmarkRunResult: BenchmarkRunResult | null = null
      if (!isUserError && milestoneSlug) {
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

                const benchmarkStdout = await executeBenchmark({
                  executionClient,
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
          const errType = classifyBenchmarkError(benchErr)
          logger.warn({ err: benchErr instanceof Error ? benchErr : new Error(String(benchErr)), submissionId, errorType: errType }, 'benchmark_phase_failed')
        }
      }

      // Evaluate acceptance criteria (using pre-loaded criteria)
      const criteriaResultsJson = await evaluateAndPublishCriteria(preloadedCriteria, (criteria) =>
        isUserError
          ? evaluateAllNotMet(criteria, compilationSucceeded ? 'Runtime error' : 'Compilation failed')
          : evaluateCriteria(criteria, executionResult, benchmarkRunResult),
      )

      if (isUserError) {
        await db
          .updateTable('submissions')
          .set({
            status: 'failed',
            execution_result: JSON.stringify(executionResult),
            error_message: compilationSucceeded ? 'Runtime error' : 'Compilation failed',
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
      // ExecutionServiceError — retryable (503/429) → reset to queued, re-throw for BullMQ
      if (err instanceof ExecutionServiceError && err.isRetryable) {
        logger.warn({ err, submissionId }, 'retryable_execution_service_error')
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
      logger.error({ err: errorObj, submissionId }, 'execution_processor_error')

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
    }
  }
}
