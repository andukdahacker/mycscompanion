/** Fly Machine state — matches Fly Machines API states */
export type FlyMachineState =
  | 'created'
  | 'starting'
  | 'started'
  | 'stopping'
  | 'stopped'
  | 'suspended'
  | 'failed'
  | 'destroying'
  | 'destroyed'
  | 'replacing'
  | 'replaced'

/** Subset of states the Fly wait endpoint accepts */
export type FlyWaitState = 'started' | 'stopped' | 'suspended' | 'destroyed'

/** Guest configuration — snake_case matching Fly API contract */
export type FlyGuestConfig = Readonly<{
  cpu_kind: string
  cpus: number
  memory_mb: number
}>

/** Init configuration for machine startup */
export type FlyInitConfig = Readonly<{
  exec: readonly string[]
}>

/** Restart policy configuration */
export type FlyRestartConfig = Readonly<{
  policy: string
}>

/** File injection configuration */
export type FlyFileConfig = Readonly<{
  guest_path: string
  raw_value: string
}>

/** Service configuration */
export type FlyServiceConfig = Readonly<Record<string, unknown>>

/** Machine configuration — snake_case matching Fly API contract */
export type FlyMachineRequestConfig = Readonly<{
  image: string
  auto_destroy: boolean
  guest: FlyGuestConfig
  init: FlyInitConfig
  restart: FlyRestartConfig
  services: readonly FlyServiceConfig[]
  files: readonly FlyFileConfig[]
  env?: Readonly<Record<string, string>>
  processes?: readonly Record<string, unknown>[]
  metadata?: Readonly<Record<string, string>>
}>

/** Create machine request body */
export type FlyCreateMachineRequest = Readonly<{
  name?: string
  region?: string
  config: FlyMachineRequestConfig
}>

/** Machine event from Fly API */
export type FlyMachineEvent = Readonly<{
  type: string
  status: string
  timestamp: number
}>

/** Machine response from Fly API */
export type FlyMachineResponse = Readonly<{
  id: string
  name: string
  state: FlyMachineState
  region: string
  instance_id: string
  private_ip: string
  created_at: string
  updated_at: string
  config: FlyMachineRequestConfig
  events: readonly FlyMachineEvent[]
}>
