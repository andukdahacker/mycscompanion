/**
 * Execution service configuration.
 * Reads URL and secret from environment variables.
 */

const DEFAULT_TIMEOUT_SECONDS = 30
const MAX_TIMEOUT_SECONDS = 120

export type ExecutionServiceConfig = Readonly<{
  url: string
  secret: string
  defaultTimeoutSeconds: number
  maxTimeoutSeconds: number
}>

export const executionServiceConfig: ExecutionServiceConfig = {
  url: process.env.MCC_EXECUTION_URL ?? '',
  secret: process.env.MCC_EXECUTION_SECRET ?? '',
  defaultTimeoutSeconds: DEFAULT_TIMEOUT_SECONDS,
  maxTimeoutSeconds: MAX_TIMEOUT_SECONDS,
}
