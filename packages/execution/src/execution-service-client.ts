/**
 * HTTP client for the persistent execution service (Go server).
 * Handles snake_case ↔ camelCase conversion at the boundary.
 */

export type ExecuteRequest = Readonly<{
  code: string       // base64-encoded Go source
  args: string[]
  timeoutSeconds: number
}>

export type ExecuteResponse = Readonly<{
  stdout: string
  stderr: string
  exitCode: number
  durationMs: number
  buildDurationMs: number
  runDurationMs: number
  timedOut: boolean
}>

export class ExecutionServiceError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'ExecutionServiceError'
    this.status = status
  }

  get isRetryable(): boolean {
    return this.status === 503 || this.status === 429
  }
}

export class ExecutionServiceClient {
  private readonly baseUrl: string
  private readonly secret: string

  constructor(baseUrl: string, secret: string) {
    this.baseUrl = baseUrl
    this.secret = secret
  }

  async execute(request: ExecuteRequest): Promise<ExecuteResponse> {
    const response = await fetch(`${this.baseUrl}/execute`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.secret}`,
      },
      body: JSON.stringify({
        code: request.code,
        args: request.args,
        timeout_seconds: request.timeoutSeconds,
      }),
    })

    if (!response.ok) {
      let errorMessage: string
      try {
        const body = await response.json() as { error: string }
        errorMessage = body.error
      } catch {
        // Non-JSON response (e.g., reverse proxy HTML error page)
        errorMessage = response.statusText || `HTTP ${response.status}`
      }
      throw new ExecutionServiceError(response.status, errorMessage)
    }

    const body = await response.json() as {
      stdout: string
      stderr: string
      exit_code: number
      duration_ms: number
      build_duration_ms: number
      run_duration_ms: number
      timed_out: boolean
    }

    return {
      stdout: body.stdout,
      stderr: body.stderr,
      exitCode: body.exit_code,
      durationMs: body.duration_ms,
      buildDurationMs: body.build_duration_ms,
      runDurationMs: body.run_duration_ms,
      timedOut: body.timed_out,
    }
  }
}
