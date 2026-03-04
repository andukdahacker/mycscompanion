/**
 * Execution package — Fly Machine config, SSE event types, and orchestration.
 */

// Config
export { DEFAULT_FLY_MACHINE_CONFIG, getExecutionImageRef } from './fly-config.js'

// Event types
export type { ExecutionEvent, ExecutionPhase, ExecutionStatus } from './events.js'

// Fly API types
export type {
  FlyCreateMachineRequest,
  FlyMachineResponse,
  FlyMachineState,
  FlyWaitState,
  FlyGuestConfig,
  FlyInitConfig,
  FlyRestartConfig,
  FlyFileConfig,
  FlyServiceConfig,
  FlyMachineRequestConfig,
  FlyMachineEvent,
} from './fly-api-types.js'

// Client
export { FlyClient, FlyApiError } from './fly-client.js'
export type { FlyClientOptions } from './fly-client.js'

// Request builder
export { buildMachineRequest, MAX_CODE_SIZE_BYTES } from './machine-request-builder.js'
export type { BuildMachineRequestOptions } from './machine-request-builder.js'

// Orchestrator
export { executeCode } from './execute.js'
export type { ExecuteCodeOptions } from './execute.js'

// Shared config types
export type CpuKind = 'shared' | 'performance'
export type RestartPolicy = 'no' | 'always' | 'on-failure'

/** Fly Machine configuration for code execution environments. */
export type FlyMachineConfig = Readonly<{
  image: string
  cpuKind: CpuKind
  cpus: number
  memoryMb: number
  timeoutSeconds: number
  autoDestroy: boolean
  restartPolicy: RestartPolicy
  region?: string
}>
