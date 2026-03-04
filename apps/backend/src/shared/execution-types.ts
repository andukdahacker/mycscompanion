export type ExecutionResult = {
  readonly exitCode: number | null
  readonly output: string
  readonly machineId: string
  readonly durationMs: number
  readonly compilationSucceeded: boolean
}
