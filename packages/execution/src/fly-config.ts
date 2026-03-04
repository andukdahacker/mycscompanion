import type { FlyMachineConfig } from './index.js'

const FLY_REGISTRY_IMAGE = 'registry.fly.io/mcc-execution:latest' as const

/** Reads MCC_EXECUTION_IMAGE env var with fallback to Fly registry.
 *  Local dev: set MCC_EXECUTION_IMAGE=mcc-execution:local */
export const getExecutionImageRef = (): string =>
  process.env.MCC_EXECUTION_IMAGE ?? FLY_REGISTRY_IMAGE

export const DEFAULT_FLY_MACHINE_CONFIG = {
  image: FLY_REGISTRY_IMAGE,
  cpuKind: 'shared',
  cpus: 1,
  memoryMb: 256,
  timeoutSeconds: 60,
  autoDestroy: true,
  restartPolicy: 'no',
} as const satisfies FlyMachineConfig
