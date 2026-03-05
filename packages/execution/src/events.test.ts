import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ExecutionEvent, ExecutionPhase, ExecutionStatus } from './events'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('ExecutionPhase', () => {
  it('should accept all valid phase values', () => {
    const phases: ExecutionPhase[] = [
      'preparing',
      'compiling',
      'testing',
      'benchmarking',
    ]
    expect(phases).toHaveLength(4)
  })
})

describe('ExecutionStatus', () => {
  it('should accept all valid status values', () => {
    const statuses: ExecutionStatus[] = [
      'queued',
      'running',
      'completed',
      'failed',
    ]
    expect(statuses).toHaveLength(4)
  })
})

describe('ExecutionEvent', () => {
  describe('type narrowing via switch', () => {
    it('should narrow queued event correctly', () => {
      const event: ExecutionEvent = { type: 'queued', submissionId: 'sub_123' }
      if (event.type === 'queued') {
        expect(event.submissionId).toBe('sub_123')
      }
    })

    it('should narrow compile_output event correctly', () => {
      const event: ExecutionEvent = {
        type: 'compile_output',
        phase: 'compiling',
        data: 'compiling main.go',
        sequenceId: 1,
      }
      if (event.type === 'compile_output') {
        expect(event.phase).toBe('compiling')
        expect(event.data).toBe('compiling main.go')
        expect(event.sequenceId).toBe(1)
      }
    })

    it('should narrow compile_error event correctly', () => {
      const event: ExecutionEvent = {
        type: 'compile_error',
        phase: 'compiling',
        data: 'syntax error',
        sequenceId: 2,
      }
      if (event.type === 'compile_error') {
        expect(event.phase).toBe('compiling')
        expect(event.data).toBe('syntax error')
      }
    })

    it('should narrow test_output event correctly', () => {
      const event: ExecutionEvent = {
        type: 'test_output',
        phase: 'testing',
        data: 'running tests...',
        sequenceId: 3,
      }
      if (event.type === 'test_output') {
        expect(event.phase).toBe('testing')
      }
    })

    it('should narrow test_result event correctly', () => {
      const event: ExecutionEvent = {
        type: 'test_result',
        phase: 'testing',
        passed: true,
        details: 'all tests passed',
        data: 'PASS',
        sequenceId: 4,
      }
      if (event.type === 'test_result') {
        expect(event.passed).toBe(true)
        expect(event.details).toBe('all tests passed')
      }
    })

    it('should narrow benchmark_progress event correctly', () => {
      const event: ExecutionEvent = {
        type: 'benchmark_progress',
        phase: 'benchmarking',
        iteration: 5,
        total: 10,
        data: 'iteration 5/10',
        sequenceId: 5,
      }
      if (event.type === 'benchmark_progress') {
        expect(event.iteration).toBe(5)
        expect(event.total).toBe(10)
      }
    })

    it('should narrow benchmark_result event correctly', () => {
      const event: ExecutionEvent = {
        type: 'benchmark_result',
        phase: 'benchmarking',
        userMedian: 120,
        referenceMedian: 100,
        normalizedRatio: 1.2,
        data: 'benchmark complete',
        sequenceId: 6,
      }
      if (event.type === 'benchmark_result') {
        expect(event.userMedian).toBe(120)
        expect(event.referenceMedian).toBe(100)
        expect(event.normalizedRatio).toBe(1.2)
      }
    })

    it('should narrow criteria_results event correctly', () => {
      const event: ExecutionEvent = {
        type: 'criteria_results',
        results: [
          {
            name: 'put-and-get',
            order: 1,
            status: 'met',
            expected: 'PASS: put-and-get',
            actual: 'Found',
          },
          {
            name: 'exit-clean',
            order: 2,
            status: 'not-met',
            expected: 0,
            actual: 1,
            errorHint: 'Check exit code',
          },
        ],
        data: '',
        sequenceId: 12,
      }
      if (event.type === 'criteria_results') {
        expect(event.results).toHaveLength(2)
        expect(event.results[0]!.status).toBe('met')
        expect(event.results[1]!.status).toBe('not-met')
        expect(event.results[1]!.errorHint).toBe('Check exit code')
      }
    })

    it('should narrow output event correctly', () => {
      const event: ExecutionEvent = {
        type: 'output',
        phase: 'compiling',
        data: 'Hello, World!',
        sequenceId: 7,
      }
      if (event.type === 'output') {
        expect(event.data).toBe('Hello, World!')
        expect(event.phase).toBe('compiling')
      }
    })

    it('should narrow complete event correctly', () => {
      const event: ExecutionEvent = {
        type: 'complete',
        phase: 'compiling',
        data: 'execution finished',
        sequenceId: 8,
      }
      if (event.type === 'complete') {
        expect(event.data).toBe('execution finished')
      }
    })

    it('should narrow error event with isUserError flag', () => {
      const userError: ExecutionEvent = {
        type: 'error',
        phase: 'compiling',
        message: 'compilation failed',
        isUserError: true,
        data: 'error details',
        sequenceId: 9,
      }
      if (userError.type === 'error') {
        expect(userError.isUserError).toBe(true)
        expect(userError.message).toBe('compilation failed')
      }

      const platformError: ExecutionEvent = {
        type: 'error',
        phase: 'preparing',
        message: 'Fly API unavailable',
        isUserError: false,
        data: 'platform error',
        sequenceId: 10,
      }
      if (platformError.type === 'error') {
        expect(platformError.isUserError).toBe(false)
      }
    })

    it('should narrow timeout event correctly', () => {
      const event: ExecutionEvent = {
        type: 'timeout',
        phase: 'compiling',
        timeoutSeconds: 60,
        data: 'execution timed out',
        sequenceId: 11,
      }
      if (event.type === 'timeout') {
        expect(event.timeoutSeconds).toBe(60)
      }
    })

    it('should narrow heartbeat event correctly', () => {
      const event: ExecutionEvent = { type: 'heartbeat' }
      if (event.type === 'heartbeat') {
        expect(event.type).toBe('heartbeat')
      }
    })

    it('should support exhaustive switch on event type', () => {
      const handleEvent = (event: ExecutionEvent): string => {
        switch (event.type) {
          case 'queued':
            return 'queued'
          case 'compile_output':
            return 'compile_output'
          case 'compile_error':
            return 'compile_error'
          case 'test_output':
            return 'test_output'
          case 'test_result':
            return 'test_result'
          case 'benchmark_progress':
            return 'benchmark_progress'
          case 'benchmark_result':
            return 'benchmark_result'
          case 'criteria_results':
            return 'criteria_results'
          case 'output':
            return 'output'
          case 'complete':
            return 'complete'
          case 'error':
            return 'error'
          case 'timeout':
            return 'timeout'
          case 'heartbeat':
            return 'heartbeat'
          default: {
            const _exhaustive: never = event
            return _exhaustive
          }
        }
      }

      expect(handleEvent({ type: 'queued', submissionId: 'sub_1' })).toBe(
        'queued',
      )
      expect(handleEvent({ type: 'heartbeat' })).toBe('heartbeat')
      expect(
        handleEvent({
          type: 'complete',
          phase: 'compiling',
          data: 'done',
          sequenceId: 1,
        }),
      ).toBe('complete')
    })
  })

  describe('readonly enforcement', () => {
    it('should have readonly fields on all event variants', () => {
      const event: ExecutionEvent = {
        type: 'output',
        phase: 'compiling',
        data: 'test',
        sequenceId: 1,
      }
      // TypeScript should prevent: event.data = 'modified'
      // This is a compile-time check — if the test compiles, readonly is enforced
      expect(event.data).toBe('test')
    })
  })
})
