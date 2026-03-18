/**
 * Execution package — Execution service client, SSE event types, and benchmark runner.
 */

// Execution service client
export {
  ExecutionServiceClient,
  ExecutionServiceError,
} from './execution-service-client.js'
export type { ExecuteRequest, ExecuteResponse } from './execution-service-client.js'

// Execution service config
export { executionServiceConfig } from './fly-config.js'
export type { ExecutionServiceConfig } from './fly-config.js'

// Event types
export type { ExecutionEvent, ExecutionPhase, ExecutionStatus } from './events.js'

// Benchmark runner
export {
  computeMedian,
  parseBenchmarkOutput,
  classifyBenchmarkError,
} from './benchmark-runner.js'
export type { BenchmarkRunResult, BenchmarkErrorType } from './benchmark-runner.js'
