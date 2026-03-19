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

const MAX_CODE_SIZE_BYTES = 128 * 1024 // 128KB — defense in depth (Go server also validates)

/** Narrow job interface — only properties actually used by the processor */
export interface ExecutionJob {
  readonly data: ExecutionJobData
}

/** Signature for the benchmark execution function — injectable for testing */
export type RunBenchmarkFn = (opts: {
  readonly executionClient: ExecutionServiceClient
  readonly userFiles: Record<string, string>
  readonly referenceFiles: Record<string, string>
  readonly submissionId: string
  readonly milestoneId: string
  readonly benchmark: { readonly name: string; readonly workload?: { readonly type?: string; readonly numOperations?: number; readonly keySizeBytes?: number; readonly valueSizeBytes?: number } }
  readonly logger: Logger
}) => Promise<{ readonly userStdout: string; readonly refStdout: string }>

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
 * Runs a benchmark via the execution service using two sequential /execute calls
 * (user files + reference files). Each binary's internal benchmark (warmup +
 * 10 measured iterations) is the measurement layer.
 *
 * Returns stdout from both calls for parseBenchmarkOutput() to parse.
 */
export async function runBenchmarkOnService(opts: {
  readonly executionClient: ExecutionServiceClient
  readonly userFiles: Record<string, string>
  readonly referenceFiles: Record<string, string>
  readonly submissionId: string
  readonly milestoneId: string
  readonly benchmark: { readonly name: string; readonly workload?: { readonly type?: string; readonly numOperations?: number; readonly keySizeBytes?: number; readonly valueSizeBytes?: number } }
  readonly logger: Logger
}): Promise<{ readonly userStdout: string; readonly refStdout: string }> {
  const { executionClient, userFiles, referenceFiles, benchmark, logger } = opts
  const timeoutSeconds = 60

  const benchArgs = ['benchmark']

  // Base64-encode all files for the Go server
  function encodeFiles(files: Record<string, string>): Record<string, string> {
    const encoded: Record<string, string> = {}
    for (const [name, content] of Object.entries(files)) {
      encoded[name] = Buffer.from(content).toString('base64')
    }
    return encoded
  }

  logger.info({ submissionId: opts.submissionId, benchmarkName: benchmark.name }, 'benchmark_execution_starting')

  // User execution
  const userResponse = await executionClient.execute({
    files: encodeFiles(userFiles),
    args: benchArgs,
    timeoutSeconds,
  })

  const userStdout = (!userResponse.timedOut && userResponse.exitCode === 0) ? userResponse.stdout : ''
  if (userResponse.timedOut || userResponse.exitCode !== 0) {
    logger.warn({ submissionId: opts.submissionId, benchmarkName: benchmark.name, target: 'user', exitCode: userResponse.exitCode, timedOut: userResponse.timedOut }, 'benchmark_user_execution_failed')
  }

  // Reference execution
  const refResponse = await executionClient.execute({
    files: encodeFiles(referenceFiles),
    args: benchArgs,
    timeoutSeconds,
  })

  const refStdout = (!refResponse.timedOut && refResponse.exitCode === 0) ? refResponse.stdout : ''
  if (refResponse.timedOut || refResponse.exitCode !== 0) {
    logger.warn({ submissionId: opts.submissionId, benchmarkName: benchmark.name, target: 'reference', exitCode: refResponse.exitCode, timedOut: refResponse.timedOut }, 'benchmark_ref_execution_failed')
  }

  return { userStdout, refStdout }
}

export function createExecutionProcessor(
  deps: ExecutionProcessorDeps,
): (job: ExecutionJob) => Promise<void> {
  const { executionClient, db, eventPublisher, logger, contentLoader, defaultTimeoutSeconds } = deps
  const executeBenchmark = deps.runBenchmark ?? runBenchmarkOnService

  return async (job: ExecutionJob): Promise<void> => {
    const { submissionId, milestoneId, userId } = job.data
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

      // Early-branch: determine if multi-file or single-file submission
      const submittedFiles = job.data.files ?? null
      const isMultiFile = submittedFiles !== null
      const code = job.data.code

      // Validate code size (defense in depth — Go server also validates)
      if (isMultiFile) {
        const totalSize = Object.values(submittedFiles).reduce((sum, content) => sum + Buffer.byteLength(content, 'utf8'), 0)
        if (totalSize > MAX_CODE_SIZE_BYTES) {
          await eventPublisher.publish(submissionId, {
            type: 'error',
            phase: 'preparing',
            message: 'Code exceeds maximum size limit (128KB)',
            isUserError: true,
            data: '',
            sequenceId: sequenceId++,
          })
          await db
            .updateTable('submissions')
            .set({ status: 'failed', error_message: 'Code exceeds maximum size limit (128KB)', updated_at: new Date() })
            .where('id', '=', submissionId)
            .execute()
          await eventPublisher.setLogTTL(submissionId, 300)
          return
        }
      } else if (code) {
        const codeBytes = Buffer.byteLength(code, 'utf8')
        if (codeBytes > MAX_CODE_SIZE_BYTES) {
          await eventPublisher.publish(submissionId, {
            type: 'error',
            phase: 'preparing',
            message: 'Code exceeds maximum size limit (128KB)',
            isUserError: true,
            data: '',
            sequenceId: sequenceId++,
          })
          await db
            .updateTable('submissions')
            .set({ status: 'failed', error_message: 'Code exceeds maximum size limit (128KB)', updated_at: new Date() })
            .where('id', '=', submissionId)
            .execute()
          await eventPublisher.setLogTTL(submissionId, 300)
          return
        }
      } else {
        // Neither code nor files — should not happen
        logger.error({ submissionId }, 'submission_has_neither_code_nor_files')
        await db
          .updateTable('submissions')
          .set({ status: 'failed', error_message: 'No code or files provided', updated_at: new Date() })
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

      // Assemble files and call execution service
      const timeoutSeconds = defaultTimeoutSeconds
      let response: Awaited<ReturnType<typeof executionClient.execute>>

      if (isMultiFile) {
        // Multi-file path: merge editable files from submission with read-only starter files
        let allFiles: Record<string, string> = {}
        if (milestoneSlug) {
          const starterFiles = await contentLoader.loadStarterFiles(milestoneSlug)
          if (starterFiles) {
            allFiles = { ...starterFiles }
          }
        }
        // Learner's editable files override starter files by filename
        Object.assign(allFiles, submittedFiles)

        // Base64-encode each file for the Go server
        const encodedFiles: Record<string, string> = {}
        for (const [name, content] of Object.entries(allFiles)) {
          encodedFiles[name] = Buffer.from(content).toString('base64')
        }

        response = await executionClient.execute({
          files: encodedFiles,
          args: commandArgs ? [commandArgs] : [],
          timeoutSeconds,
        })
      } else {
        // Single-file path (M1 backward compat)
        const base64Code = Buffer.from(code ?? '').toString('base64')
        response = await executionClient.execute({
          code: base64Code,
          args: commandArgs ? [commandArgs] : [],
          timeoutSeconds,
        })
      }

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
            const referenceFiles = await contentLoader.loadReferenceFiles(milestoneSlug)

            if (referenceFiles) {
              // Assemble user files for benchmark
              let userFiles: Record<string, string>
              if (isMultiFile) {
                userFiles = {}
                const starterFiles = await contentLoader.loadStarterFiles(milestoneSlug)
                if (starterFiles) {
                  Object.assign(userFiles, starterFiles)
                }
                Object.assign(userFiles, submittedFiles)
              } else {
                userFiles = { 'main.go': code ?? '' }
              }

              for (const benchmark of benchmarkConfig.benchmarks) {
                await eventPublisher.publish(submissionId, {
                  type: 'benchmark_progress',
                  phase: 'benchmarking',
                  iteration: 0,
                  total: 1,
                  data: `Starting benchmark: ${benchmark.name}`,
                  sequenceId: sequenceId++,
                })

                const { userStdout, refStdout } = await executeBenchmark({
                  executionClient,
                  userFiles, referenceFiles,
                  submissionId, milestoneId,
                  benchmark,
                  logger,
                })

                // Parse and compute normalized ratio from the two-call results
                const userResult = parseBenchmarkOutput(userStdout, benchmark.name)
                const refResult = parseBenchmarkOutput(refStdout, benchmark.name)
                const referenceVersion = benchmark.referenceVersion ?? 'unknown'

                if (userResult.rawUserTimings.length > 0) {
                  // Override reference values from the ref call
                  const normalizedRatio = refResult.opsPerSec > 0
                    ? Math.round((userResult.opsPerSec / refResult.opsPerSec) * 10000) / 10000
                    : 0
                  const merged: BenchmarkRunResult = {
                    ...userResult,
                    referenceMedian: refResult.opsPerSec,
                    normalizedRatio,
                  }
                  benchmarkRunResult = merged

                  await eventPublisher.publish(submissionId, {
                    type: 'benchmark_result',
                    phase: 'benchmarking',
                    userMedian: merged.userMedian,
                    referenceMedian: merged.referenceMedian,
                    normalizedRatio: merged.normalizedRatio,
                    opsPerSec: merged.opsPerSec,
                    data: '',
                    sequenceId: sequenceId++,
                  })

                  await persistBenchmarkResult(db, {
                    submissionId,
                    userId,
                    milestoneId,
                    benchmarkName: benchmark.name,
                    result: merged,
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
