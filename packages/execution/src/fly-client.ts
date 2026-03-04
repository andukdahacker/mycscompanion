import type {
  FlyCreateMachineRequest,
  FlyMachineResponse,
  FlyWaitState,
} from './fly-api-types.js'

export interface FlyClientOptions {
  readonly apiToken: string
  readonly appName: string
  readonly baseUrl?: string
}

/** Typed error for Fly Machines API failures.
 *  `isRetryable` is true for 429, 503, and network errors.
 *  Story 3.3's worker uses `isRetryable` for BullMQ retry decisions. */
export class FlyApiError extends Error {
  readonly status: number
  readonly machineId: string | undefined
  readonly isRetryable: boolean
  readonly retryAfter: number | undefined

  constructor(options: {
    message: string
    status: number
    machineId?: string
    isRetryable: boolean
    retryAfter?: number
  }) {
    super(options.message)
    this.name = 'FlyApiError'
    this.status = options.status
    this.machineId = options.machineId
    this.isRetryable = options.isRetryable
    this.retryAfter = options.retryAfter
  }
}

/** Stateless, concurrency-safe HTTP client for Fly Machines REST API.
 *  Uses Node.js built-in fetch (Node 20+). Safe to share across concurrent orchestrations. */
export class FlyClient {
  readonly baseUrl: string
  private readonly apiToken: string
  private readonly appName: string

  constructor(options: FlyClientOptions) {
    this.apiToken = options.apiToken
    this.appName = options.appName
    this.baseUrl = options.baseUrl ?? 'https://api.machines.dev'
  }

  private get machinesPath(): string {
    return `${this.baseUrl}/v1/apps/${this.appName}/machines`
  }

  private get headers(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.apiToken}`,
      'Content-Type': 'application/json',
    }
  }

  private async handleErrorResponse(
    response: Response,
    machineId?: string,
  ): Promise<never> {
    const isRetryable =
      response.status === 429 || response.status === 503

    let message = `Fly API error: ${response.status}`
    let retryAfter: number | undefined

    try {
      const body: unknown = await response.json()
      if (
        typeof body === 'object' &&
        body !== null &&
        'error' in body &&
        typeof body.error === 'string'
      ) {
        message = body.error
      }
    } catch {
      // Response body not parseable — use status-based message
    }

    if (response.status === 429) {
      const retryHeader = response.headers.get('Retry-After')
      if (retryHeader) {
        retryAfter = parseInt(retryHeader, 10)
      }
    }

    throw new FlyApiError({
      message,
      status: response.status,
      machineId,
      isRetryable,
      retryAfter,
    })
  }

  private async handleJsonResponse<T>(
    response: Response,
    machineId?: string,
  ): Promise<T> {
    if (!response.ok) {
      await this.handleErrorResponse(response, machineId)
    }
    // response.json() returns unknown — cast at external API boundary is unavoidable
    // without a schema validator. This is the only remaining `as` in the package.
    return await response.json() as T
  }

  private async handleVoidResponse(
    response: Response,
    machineId?: string,
  ): Promise<void> {
    if (!response.ok) {
      await this.handleErrorResponse(response, machineId)
    }
  }

  /** POST /v1/apps/{app}/machines — Create a new machine */
  async createMachine(
    request: FlyCreateMachineRequest,
  ): Promise<FlyMachineResponse> {
    const response = await fetch(this.machinesPath, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify(request),
    })
    return this.handleJsonResponse<FlyMachineResponse>(response)
  }

  /** GET /v1/apps/{app}/machines/{id}/wait?state={state} — Wait for machine state */
  async waitForState(
    machineId: string,
    state: FlyWaitState,
    options?: { instanceId?: string; timeoutSeconds?: number },
  ): Promise<FlyMachineResponse> {
    const params = new URLSearchParams({ state })
    if (options?.instanceId) {
      params.set('instance_id', options.instanceId)
    }
    if (options?.timeoutSeconds) {
      params.set('timeout', String(options.timeoutSeconds))
    }

    const response = await fetch(
      `${this.machinesPath}/${machineId}/wait?${params.toString()}`,
      { method: 'GET', headers: this.headers },
    )
    return this.handleJsonResponse<FlyMachineResponse>(response, machineId)
  }

  /** GET /v1/apps/{app}/machines/{id} — Get machine details */
  async getMachine(machineId: string): Promise<FlyMachineResponse> {
    const response = await fetch(`${this.machinesPath}/${machineId}`, {
      method: 'GET',
      headers: this.headers,
    })
    return this.handleJsonResponse<FlyMachineResponse>(response, machineId)
  }

  /** POST /v1/apps/{app}/machines/{id}/stop — Stop a machine */
  async stopMachine(machineId: string, signal?: string): Promise<void> {
    const body = signal ? JSON.stringify({ signal }) : undefined
    const response = await fetch(`${this.machinesPath}/${machineId}/stop`, {
      method: 'POST',
      headers: this.headers,
      body,
    })
    await this.handleVoidResponse(response, machineId)
  }

  /** DELETE /v1/apps/{app}/machines/{id} — Destroy a machine */
  async destroyMachine(machineId: string, force?: boolean): Promise<void> {
    const params = force ? '?force=true' : ''
    const response = await fetch(
      `${this.machinesPath}/${machineId}${params}`,
      { method: 'DELETE', headers: this.headers },
    )
    await this.handleVoidResponse(response, machineId)
  }
}
