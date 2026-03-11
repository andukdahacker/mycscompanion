import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  createCircuitBreaker,
  withCircuitBreaker,
  CircuitOpenError,
} from './circuit-breaker.js'
import type { CircuitBreaker } from './circuit-breaker.js'
import type { AnthropicService, AnthropicMessageStream } from './anthropic.js'

function createMockStream(): AnthropicMessageStream {
  const handlers: Record<string, Array<(...args: never[]) => void>> = {}
  const stream: AnthropicMessageStream = {
    on(event: string, handler: (...args: never[]) => void) {
      if (!handlers[event]) handlers[event] = []
      handlers[event].push(handler)
      return stream
    },
  } as AnthropicMessageStream

  return Object.assign(stream, {
    emit(event: string, ...args: unknown[]) {
      for (const h of handlers[event] ?? []) {
        (h as (...a: unknown[]) => void)(...args)
      }
    },
  })
}

function createMockService(): AnthropicService & {
  createTutorResponseMock: ReturnType<typeof vi.fn>
  createStreamingTutorResponseMock: ReturnType<typeof vi.fn>
} {
  const createTutorResponseMock = vi.fn().mockResolvedValue({ content: 'test', model: 'test-model' })
  const createStreamingTutorResponseMock = vi.fn().mockReturnValue(createMockStream())
  return {
    createTutorResponse: createTutorResponseMock,
    createStreamingTutorResponse: createStreamingTutorResponseMock,
    createTutorResponseMock,
    createStreamingTutorResponseMock,
  }
}

const testParams = {
  systemPrompt: 'test',
  conversationHistory: [] as { role: 'user' | 'assistant'; content: string }[],
  context: { userMessage: 'hello', hasCompileErrors: false },
}

describe('CircuitBreaker', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('state transitions', () => {
    it('should start in CLOSED state', () => {
      const cb = createCircuitBreaker()
      expect(cb.state).toBe('CLOSED')
    })

    it('should transition CLOSED → OPEN after failureThreshold consecutive failures', () => {
      const cb = createCircuitBreaker({ failureThreshold: 3 })

      cb.recordFailure()
      cb.recordFailure()
      expect(cb.state).toBe('CLOSED')

      cb.recordFailure()
      expect(cb.state).toBe('OPEN')
    })

    it('should throw CircuitOpenError in OPEN state without calling service', () => {
      const cb = createCircuitBreaker({ failureThreshold: 1 })
      cb.recordFailure()

      expect(() => cb.assertClosed()).toThrow(CircuitOpenError)
    })

    it('should transition OPEN → HALF_OPEN after resetTimeoutMs', () => {
      const cb = createCircuitBreaker({ failureThreshold: 1, resetTimeoutMs: 30_000 })
      cb.recordFailure()
      expect(cb.state).toBe('OPEN')

      vi.advanceTimersByTime(30_000)
      expect(cb.state).toBe('HALF_OPEN')
    })

    it('should transition HALF_OPEN → CLOSED on success', () => {
      const cb = createCircuitBreaker({ failureThreshold: 1, resetTimeoutMs: 30_000 })
      cb.recordFailure()

      vi.advanceTimersByTime(30_000)
      expect(cb.state).toBe('HALF_OPEN')

      cb.assertClosed() // allows one request through
      cb.recordSuccess()
      expect(cb.state).toBe('CLOSED')
      expect(cb.consecutiveFailures).toBe(0)
    })

    it('should transition HALF_OPEN → OPEN on failure with exponential backoff', () => {
      const cb = createCircuitBreaker({
        failureThreshold: 1,
        resetTimeoutMs: 30_000,
        maxResetTimeoutMs: 300_000,
      })

      // First failure → OPEN
      cb.recordFailure()
      expect(cb.state).toBe('OPEN')

      // Wait for reset → HALF_OPEN
      vi.advanceTimersByTime(30_000)
      expect(cb.state).toBe('HALF_OPEN')

      // Attempt and fail → OPEN with doubled timeout (60s)
      cb.assertClosed()
      cb.recordFailure()
      expect(cb.state).toBe('OPEN')

      // Should NOT transition at 30s (old timeout)
      vi.advanceTimersByTime(30_000)
      expect(cb.state).toBe('OPEN')

      // Should transition at 60s (doubled)
      vi.advanceTimersByTime(30_000)
      expect(cb.state).toBe('HALF_OPEN')

      // Fail again → timeout doubles to 120s
      cb.assertClosed()
      cb.recordFailure()
      vi.advanceTimersByTime(120_000)
      expect(cb.state).toBe('HALF_OPEN')

      // Fail again → timeout doubles to 240s
      cb.assertClosed()
      cb.recordFailure()
      vi.advanceTimersByTime(240_000)
      expect(cb.state).toBe('HALF_OPEN')

      // Fail again → capped at 300s
      cb.assertClosed()
      cb.recordFailure()
      vi.advanceTimersByTime(300_000)
      expect(cb.state).toBe('HALF_OPEN')
    })

    it('should reset consecutiveFailures on success in CLOSED state', () => {
      const cb = createCircuitBreaker({ failureThreshold: 3 })
      cb.recordFailure()
      cb.recordFailure()
      expect(cb.consecutiveFailures).toBe(2)

      cb.recordSuccess()
      expect(cb.consecutiveFailures).toBe(0)
      expect(cb.state).toBe('CLOSED')
    })
  })

  describe('retryAfterSeconds', () => {
    it('should return null when CLOSED', () => {
      const cb = createCircuitBreaker()
      expect(cb.retryAfterSeconds()).toBeNull()
    })

    it('should return remaining seconds when OPEN', () => {
      const cb = createCircuitBreaker({ failureThreshold: 1, resetTimeoutMs: 30_000 })
      cb.recordFailure()

      vi.advanceTimersByTime(10_000)
      const retryAfter = cb.retryAfterSeconds()
      expect(retryAfter).toBe(20) // 30s - 10s elapsed = 20s
    })
  })
})

describe('withCircuitBreaker', () => {
  let cb: CircuitBreaker
  let mockService: ReturnType<typeof createMockService>

  beforeEach(() => {
    vi.useFakeTimers()
    cb = createCircuitBreaker({ failureThreshold: 2 })
    mockService = createMockService()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('createTutorResponse', () => {
    it('should record failure when request times out with AbortError', async () => {
      const abortError = new Error('Aborted')
      abortError.name = 'AbortError'
      mockService.createTutorResponseMock.mockRejectedValue(abortError)

      const wrapped = withCircuitBreaker(mockService, cb)
      await expect(wrapped.createTutorResponse(testParams)).rejects.toThrow('Aborted')
      expect(cb.consecutiveFailures).toBe(1)

      // Second timeout → still counts
      await expect(wrapped.createTutorResponse(testParams)).rejects.toThrow('Aborted')
      expect(cb.consecutiveFailures).toBe(2)
      expect(cb.state).toBe('OPEN')
    })

    it('should delegate to underlying service when CLOSED and record success', async () => {
      const wrapped = withCircuitBreaker(mockService, cb)
      const result = await wrapped.createTutorResponse(testParams)

      expect(result).toEqual({ content: 'test', model: 'test-model' })
      expect(mockService.createTutorResponseMock).toHaveBeenCalledOnce()
      expect(cb.consecutiveFailures).toBe(0)
    })

    it('should record failure on error and rethrow', async () => {
      mockService.createTutorResponseMock.mockRejectedValue(new Error('API error'))
      const wrapped = withCircuitBreaker(mockService, cb)

      await expect(wrapped.createTutorResponse(testParams)).rejects.toThrow('API error')
      expect(cb.consecutiveFailures).toBe(1)
    })

    it('should throw CircuitOpenError when OPEN without calling service', async () => {
      cb.recordFailure()
      cb.recordFailure()
      expect(cb.state).toBe('OPEN')

      const wrapped = withCircuitBreaker(mockService, cb)
      await expect(wrapped.createTutorResponse(testParams)).rejects.toThrow(CircuitOpenError)
      expect(mockService.createTutorResponseMock).not.toHaveBeenCalled()
    })
  })

  describe('createStreamingTutorResponse', () => {
    it('should delegate to underlying service when CLOSED', () => {
      const wrapped = withCircuitBreaker(mockService, cb)
      const stream = wrapped.createStreamingTutorResponse(testParams)

      expect(stream).toBeDefined()
      expect(mockService.createStreamingTutorResponseMock).toHaveBeenCalledOnce()
    })

    it('should record success on finalMessage', () => {
      const mockStream = createMockStream()
      mockService.createStreamingTutorResponseMock.mockReturnValue(mockStream)

      const wrapped = withCircuitBreaker(mockService, cb)
      const stream = wrapped.createStreamingTutorResponse(testParams)

      let handlerCalled = false
      stream.on('finalMessage', () => {
        handlerCalled = true
      })

      const emittable = mockStream as unknown as { emit: (event: string, ...args: unknown[]) => void }
      emittable.emit('finalMessage', {
        content: [{ type: 'text', text: 'hello' }],
        model: 'test-model',
        usage: { input_tokens: 10, output_tokens: 5 },
      })

      expect(handlerCalled).toBe(true)
      expect(cb.consecutiveFailures).toBe(0)
    })

    it('should record failure on stream error', () => {
      const mockStream = createMockStream()
      mockService.createStreamingTutorResponseMock.mockReturnValue(mockStream)

      const wrapped = withCircuitBreaker(mockService, cb)
      const stream = wrapped.createStreamingTutorResponse(testParams)

      let errorReceived = false
      stream.on('error', () => {
        errorReceived = true
      })

      const emittable = mockStream as unknown as { emit: (event: string, ...args: unknown[]) => void }
      emittable.emit('error', new Error('stream error'))

      expect(errorReceived).toBe(true)
      expect(cb.consecutiveFailures).toBe(1)
    })

    it('should throw CircuitOpenError when OPEN', () => {
      cb.recordFailure()
      cb.recordFailure()

      const wrapped = withCircuitBreaker(mockService, cb)
      expect(() => wrapped.createStreamingTutorResponse(testParams)).toThrow(CircuitOpenError)
      expect(mockService.createStreamingTutorResponseMock).not.toHaveBeenCalled()
    })
  })
})
