import type { AnthropicService, AnthropicMessageStream, TutorRequestParams } from './anthropic.js'

export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN'

export type CircuitBreakerOptions = {
  readonly failureThreshold: number
  readonly resetTimeoutMs: number
  readonly halfOpenMaxAttempts: number
  readonly maxResetTimeoutMs: number
}

const DEFAULT_OPTIONS: CircuitBreakerOptions = {
  failureThreshold: 3,
  resetTimeoutMs: 30_000,
  halfOpenMaxAttempts: 1,
  maxResetTimeoutMs: 300_000,
}

export class CircuitOpenError extends Error {
  readonly retryAfterMs: number

  constructor(retryAfterMs: number) {
    super('Circuit breaker is OPEN — requests are failing fast')
    this.name = 'CircuitOpenError'
    this.retryAfterMs = retryAfterMs
  }
}

export interface CircuitBreaker {
  readonly state: CircuitState
  readonly consecutiveFailures: number
  assertClosed(): void
  recordSuccess(): void
  recordFailure(): void
  retryAfterSeconds(): number | null
}

class CircuitBreakerStreamWrapper implements AnthropicMessageStream {
  private readonly stream: AnthropicMessageStream
  private readonly cb: CircuitBreaker
  private recorded = false

  constructor(stream: AnthropicMessageStream, cb: CircuitBreaker) {
    this.stream = stream
    this.cb = cb
  }

  private recordOnce(success: boolean): void {
    if (this.recorded) return
    this.recorded = true
    if (success) this.cb.recordSuccess()
    else this.cb.recordFailure()
  }

  on(event: 'text', handler: (textDelta: string, textSnapshot: string) => void): AnthropicMessageStream
  on(event: 'finalMessage', handler: (message: { content: Array<{ type: string; text?: string }>; model: string; usage: { input_tokens: number; output_tokens: number; cache_creation_input_tokens?: number; cache_read_input_tokens?: number } }) => void): AnthropicMessageStream
  on(event: 'error', handler: (error: Error) => void): AnthropicMessageStream
  on(event: string, handler: (...args: never[]) => void): AnthropicMessageStream {
    if (event === 'text') {
      this.stream.on('text', handler as (textDelta: string, textSnapshot: string) => void)
    } else if (event === 'finalMessage') {
      this.stream.on('finalMessage', (message) => {
        this.recordOnce(true)
        ;(handler as (m: typeof message) => void)(message)
      })
    } else if (event === 'error') {
      this.stream.on('error', (error) => {
        this.recordOnce(false)
        ;(handler as (e: Error) => void)(error)
      })
    }
    return this
  }
}

export function withCircuitBreaker(
  service: AnthropicService,
  cb: CircuitBreaker
): AnthropicService {
  return {
    async createTutorResponse(params: TutorRequestParams) {
      cb.assertClosed()
      try {
        const result = await service.createTutorResponse(params)
        cb.recordSuccess()
        return result
      } catch (error) {
        cb.recordFailure()
        throw error
      }
    },

    createStreamingTutorResponse(params: TutorRequestParams): AnthropicMessageStream {
      cb.assertClosed()
      const stream = service.createStreamingTutorResponse(params)
      return new CircuitBreakerStreamWrapper(stream, cb)
    },
  }
}

export function createCircuitBreaker(
  opts?: Partial<CircuitBreakerOptions>
): CircuitBreaker {
  const options = { ...DEFAULT_OPTIONS, ...opts }

  let state: CircuitState = 'CLOSED'
  let consecutiveFailures = 0
  let lastFailureTime = 0
  let currentResetTimeoutMs = options.resetTimeoutMs
  let halfOpenAttempts = 0

  function transitionToOpen(): void {
    state = 'OPEN'
    lastFailureTime = Date.now()
  }

  function transitionToClosed(): void {
    state = 'CLOSED'
    consecutiveFailures = 0
    currentResetTimeoutMs = options.resetTimeoutMs
    halfOpenAttempts = 0
  }

  function shouldTransitionToHalfOpen(): boolean {
    if (state !== 'OPEN') return false
    return Date.now() - lastFailureTime >= currentResetTimeoutMs
  }

  function retryAfterMs(): number {
    if (state !== 'OPEN') return 0
    const elapsed = Date.now() - lastFailureTime
    return Math.max(0, currentResetTimeoutMs - elapsed)
  }

  return {
    get state() {
      if (shouldTransitionToHalfOpen()) {
        state = 'HALF_OPEN'
        halfOpenAttempts = 0
      }
      return state
    },

    get consecutiveFailures() {
      return consecutiveFailures
    },

    assertClosed() {
      if (shouldTransitionToHalfOpen()) {
        state = 'HALF_OPEN'
        halfOpenAttempts = 0
      }

      if (state === 'OPEN') {
        throw new CircuitOpenError(retryAfterMs())
      }

      if (state === 'HALF_OPEN' && halfOpenAttempts >= options.halfOpenMaxAttempts) {
        throw new CircuitOpenError(retryAfterMs())
      }

      if (state === 'HALF_OPEN') {
        halfOpenAttempts++
      }
    },

    recordSuccess() {
      if (state === 'HALF_OPEN') {
        transitionToClosed()
      } else {
        consecutiveFailures = 0
      }
    },

    recordFailure() {
      consecutiveFailures++

      if (state === 'HALF_OPEN') {
        currentResetTimeoutMs = Math.min(
          currentResetTimeoutMs * 2,
          options.maxResetTimeoutMs
        )
        transitionToOpen()
        return
      }

      if (consecutiveFailures >= options.failureThreshold) {
        transitionToOpen()
      }
    },

    retryAfterSeconds() {
      if (state !== 'OPEN') return null
      return Math.ceil(retryAfterMs() / 1000)
    },
  }
}
