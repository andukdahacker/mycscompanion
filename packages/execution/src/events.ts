/** Execution lifecycle phase — which stage of the pipeline is active */
export type ExecutionPhase = 'preparing' | 'compiling' | 'testing' | 'benchmarking'

/** Canonical submission status — source of truth for the submission_status DB enum (Story 3.3) */
export type ExecutionStatus = 'queued' | 'running' | 'completed' | 'failed'

/** Discriminated union for SSE events from the execution pipeline.
 *  Event type names use snake_case per SSE naming convention. */
export type ExecutionEvent =
  | Readonly<{ type: 'queued'; submissionId: string }>
  | Readonly<{ type: 'compile_output'; phase: 'compiling'; data: string; sequenceId: number }>
  | Readonly<{ type: 'compile_error'; phase: 'compiling'; data: string; sequenceId: number }>
  | Readonly<{ type: 'test_output'; phase: 'testing'; data: string; sequenceId: number }>
  | Readonly<{
      type: 'test_result'
      phase: 'testing'
      passed: boolean
      details: string
      data: string
      sequenceId: number
    }>
  | Readonly<{
      type: 'benchmark_progress'
      phase: 'benchmarking'
      iteration: number
      total: number
      data: string
      sequenceId: number
    }>
  | Readonly<{
      type: 'benchmark_result'
      phase: 'benchmarking'
      userMedian: number
      referenceMedian: number
      normalizedRatio: number
      data: string
      sequenceId: number
    }>
  | Readonly<{ type: 'output'; phase: ExecutionPhase; data: string; sequenceId: number }>
  | Readonly<{ type: 'complete'; phase: ExecutionPhase; data: string; sequenceId: number }>
  | Readonly<{
      type: 'error'
      phase: ExecutionPhase
      message: string
      isUserError: boolean
      data: string
      sequenceId: number
    }>
  | Readonly<{
      type: 'timeout'
      phase: ExecutionPhase
      timeoutSeconds: number
      data: string
      sequenceId: number
    }>
  | Readonly<{ type: 'heartbeat' }>
