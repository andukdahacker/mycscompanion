import { http, HttpResponse } from 'msw'

/** Fly Machine state type matching the Fly Machines API */
export type MockFlyMachineState =
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

export interface MockFlyMachineOptions {
  readonly id?: string
  readonly name?: string
  readonly state?: MockFlyMachineState
  readonly region?: string
  readonly instanceId?: string
  readonly privateIp?: string
  readonly image?: string
}

/** Creates a realistic Fly Machine response object for testing.
 *  Returns Record<string, unknown> instead of FlyMachineResponse to avoid
 *  circular dependency (config → execution). Structure matches FlyMachineResponse. */
export function createMockFlyMachineResponse(
  options: MockFlyMachineOptions = {},
): Record<string, unknown> {
  const {
    id = 'mach_test123456',
    name = 'mcc-exec-test',
    state = 'created',
    region = 'iad',
    instanceId = 'inst_test789',
    privateIp = 'fdaa::1',
    image = 'registry.fly.io/mcc-execution:latest',
  } = options

  return {
    id,
    name,
    state,
    region,
    instance_id: instanceId,
    private_ip: privateIp,
    created_at: '2026-03-01T00:00:00Z',
    updated_at: '2026-03-01T00:00:00Z',
    config: {
      image,
      auto_destroy: true,
      guest: { cpu_kind: 'shared', cpus: 1, memory_mb: 256 },
      init: {
        exec: [
          'sh',
          '-c',
          'ulimit -u 64 && go build -o main . 2>&1 && ./main 2>&1',
        ],
      },
      restart: { policy: 'no' },
      services: [],
      files: [],
      metadata: {},
    },
    events: [
      {
        type: 'launch',
        status: state,
        timestamp: Date.now(),
      },
    ],
  }
}

export interface SetupFlyApiHandlersOptions {
  /** Base URL for Fly API (default: https://api.machines.dev) */
  readonly baseUrl?: string
  /** App name (default: mcc-execution) */
  readonly appName?: string
  /** Override machine state transitions */
  readonly machineState?: MockFlyMachineState
  /** Override create response */
  readonly onCreateMachine?: (
    request: Record<string, unknown>,
  ) => Record<string, unknown> | null
  /** Override wait response — return specific state */
  readonly waitState?: MockFlyMachineState
  /** Simulate error on specific endpoints */
  readonly errorOn?: {
    readonly create?: { readonly status: number; readonly message: string }
    readonly wait?: { readonly status: number; readonly message: string }
    readonly stop?: { readonly status: number; readonly message: string }
    readonly destroy?: { readonly status: number; readonly message: string }
    readonly get?: { readonly status: number; readonly message: string }
  }
}

/** Creates canonical msw handlers for the Fly Machines API.
 *  Import in test files and pass to `setupServer(...handlers)`. */
export function setupFlyApiHandlers(
  options: SetupFlyApiHandlersOptions = {},
): ReturnType<typeof http.post | typeof http.get | typeof http.delete>[] {
  const baseUrl = options.baseUrl ?? 'https://api.machines.dev'
  const appName = options.appName ?? 'mcc-execution'
  const basePath = `${baseUrl}/v1/apps/${appName}/machines`

  let currentMachine = createMockFlyMachineResponse({
    state: options.machineState ?? 'created',
  })

  return [
    // POST /v1/apps/{app}/machines — Create Machine
    http.post(basePath, async ({ request }) => {
      if (options.errorOn?.create) {
        return HttpResponse.json(
          { error: options.errorOn.create.message },
          { status: options.errorOn.create.status },
        )
      }

      const body = (await request.json()) as Record<string, unknown>

      if (options.onCreateMachine) {
        const override = options.onCreateMachine(body)
        if (override) {
          currentMachine = override
          return HttpResponse.json(currentMachine, { status: 200 })
        }
      }

      currentMachine = createMockFlyMachineResponse({ state: 'created' })
      return HttpResponse.json(currentMachine, { status: 200 })
    }),

    // GET /v1/apps/{app}/machines/{id}/wait — Wait for state
    http.get(`${basePath}/:machineId/wait`, ({ request }) => {
      if (options.errorOn?.wait) {
        return HttpResponse.json(
          { error: options.errorOn.wait.message },
          { status: options.errorOn.wait.status },
        )
      }

      const url = new URL(request.url)
      const targetState =
        (url.searchParams.get('state') as MockFlyMachineState) ?? 'started'
      const resolvedState = options.waitState ?? targetState

      currentMachine = {
        ...currentMachine,
        state: resolvedState,
        updated_at: new Date().toISOString(),
      }
      return HttpResponse.json(currentMachine)
    }),

    // GET /v1/apps/{app}/machines/{id} — Get Machine
    http.get(`${basePath}/:machineId`, ({ params }) => {
      if (options.errorOn?.get) {
        return HttpResponse.json(
          { error: options.errorOn.get.message },
          { status: options.errorOn.get.status },
        )
      }

      const machineId = params.machineId as string
      return HttpResponse.json({
        ...currentMachine,
        id: machineId,
      })
    }),

    // POST /v1/apps/{app}/machines/{id}/stop — Stop Machine
    http.post(`${basePath}/:machineId/stop`, () => {
      if (options.errorOn?.stop) {
        return HttpResponse.json(
          { error: options.errorOn.stop.message },
          { status: options.errorOn.stop.status },
        )
      }

      currentMachine = {
        ...currentMachine,
        state: 'stopped',
        updated_at: new Date().toISOString(),
      }
      return HttpResponse.json(currentMachine)
    }),

    // DELETE /v1/apps/{app}/machines/{id} — Destroy Machine
    http.delete(`${basePath}/:machineId`, () => {
      if (options.errorOn?.destroy) {
        return HttpResponse.json(
          { error: options.errorOn.destroy.message },
          { status: options.errorOn.destroy.status },
        )
      }

      return new HttpResponse(null, { status: 200 })
    }),
  ]
}
