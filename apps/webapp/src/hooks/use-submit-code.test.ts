import { renderHook, act, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest'
import type { QueryClient } from '@tanstack/react-query'
import { QueryClientProvider } from '@tanstack/react-query'
import { createTestQueryClient } from '@mycscompanion/config/test-utils/query-client'
import type { ExecutionEvent } from '@mycscompanion/execution'
import type { ReactNode } from 'react'
import { createElement } from 'react'

// Mock announceToScreenReader
const mockAnnounce = vi.fn()
vi.mock('../components/workspace/workspace-a11y', () => ({
  announceToScreenReader: (...args: unknown[]) => mockAnnounce(...args),
}))

// Mock apiFetch
const mockApiFetch = vi.fn()
vi.mock('../lib/api-fetch', () => ({
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
  ApiError: class extends Error {
    readonly status: number
    readonly code: string
    constructor(status: number, code: string, message: string) {
      super(message)
      this.name = 'ApiError'
      this.status = status
      this.code = code
    }
  },
  API_URL: 'http://localhost:3001',
}))

// Mock useSSE — capture options
let capturedSSEOptions: { url: string | null; onEvent?: (event: ExecutionEvent) => void } | null = null
vi.mock('./use-sse', () => ({
  useSSE: vi.fn((options: { url: string | null; onEvent?: (event: ExecutionEvent) => void }) => {
    capturedSSEOptions = options
    return { status: 'idle', error: null, reconnectCount: 0 }
  }),
}))

describe('useSubmitCode (benchmark)', () => {
  let queryClient: QueryClient

  function wrapper({ children }: { readonly children: ReactNode }) {
    return createElement(QueryClientProvider, { client: queryClient }, children)
  }

  beforeEach(() => {
    queryClient = createTestQueryClient()
    capturedSSEOptions = null
    mockApiFetch.mockReset()
    mockAnnounce.mockReset()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  async function submitAndCapture() {
    mockApiFetch.mockResolvedValue({ submissionId: 'sub-bench' })
    const { useSubmitCode } = await import('./use-submit-code')
    const hook = renderHook(() => useSubmitCode(), { wrapper })

    await act(async () => {
      hook.result.current.submit({ milestoneId: 'ms-1', code: 'package main' })
    })

    return { hook, onEvent: capturedSSEOptions!.onEvent! }
  }

  it('should store benchmark data in TanStack Query cache on benchmark_result event', async () => {
    const { onEvent } = await submitAndCapture()

    act(() => {
      onEvent({
        type: 'benchmark_result',
        phase: 'benchmarking',
        opsPerSec: 12400,
        normalizedRatio: 0.82,
        userMedian: 150,
        referenceMedian: 120,
        data: '',
        sequenceId: 1,
      })
    })

    const cached = queryClient.getQueryData(['execution', 'benchmark', 'sub-bench'])
    expect(cached).toEqual({
      opsPerSec: 12400,
      normalizedRatio: 0.82,
      userMedian: 150,
      referenceMedian: 120,
    })
  })

  it('should trigger screen reader announcement on benchmark_result', async () => {
    const { onEvent } = await submitAndCapture()

    act(() => {
      onEvent({
        type: 'benchmark_result',
        phase: 'benchmarking',
        opsPerSec: 12400,
        normalizedRatio: 0.82,
        userMedian: 150,
        referenceMedian: 120,
        data: '',
        sequenceId: 1,
      })
    })

    expect(mockAnnounce).toHaveBeenCalledWith(
      expect.stringContaining('12,400'),
    )
    expect(mockAnnounce).toHaveBeenCalledWith(
      expect.stringContaining('0.82x'),
    )
  })

  it('should set isBenchmarking to true during benchmark phase and false after completion', async () => {
    const { hook, onEvent } = await submitAndCapture()

    expect(hook.result.current.isBenchmarking).toBe(false)

    act(() => {
      onEvent({
        type: 'benchmark_progress',
        phase: 'benchmarking',
        iteration: 1,
        total: 10,
        data: '',
        sequenceId: 1,
      })
    })

    expect(hook.result.current.isBenchmarking).toBe(true)

    act(() => {
      onEvent({
        type: 'complete',
        phase: 'benchmarking',
        data: '',
        sequenceId: 2,
      })
    })

    await waitFor(() => {
      expect(hook.result.current.isBenchmarking).toBe(false)
    })
  })

  it('should invalidate history queries on benchmark_result event', async () => {
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')
    const { onEvent } = await submitAndCapture()

    act(() => {
      onEvent({
        type: 'benchmark_result',
        phase: 'benchmarking',
        opsPerSec: 12400,
        normalizedRatio: 0.82,
        userMedian: 150,
        referenceMedian: 120,
        data: '',
        sequenceId: 1,
      })
    })

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['benchmark', 'history'] })
  })

  it('should invalidate previous benchmark query on benchmark_result event', async () => {
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')
    const { onEvent } = await submitAndCapture()

    act(() => {
      onEvent({
        type: 'benchmark_result',
        phase: 'benchmarking',
        opsPerSec: 12400,
        normalizedRatio: 0.82,
        userMedian: 150,
        referenceMedian: 120,
        data: '',
        sequenceId: 1,
      })
    })

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['benchmark', 'previous'] })
  })

  it('should invalidate trajectory queries on benchmark_result event', async () => {
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')
    const { onEvent } = await submitAndCapture()

    act(() => {
      onEvent({
        type: 'benchmark_result',
        phase: 'benchmarking',
        opsPerSec: 12400,
        normalizedRatio: 0.82,
        userMedian: 150,
        referenceMedian: 120,
        data: '',
        sequenceId: 1,
      })
    })

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['benchmark', 'trajectory'] })
  })

  it('should invalidate overview queries on benchmark_result event', async () => {
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')
    const { onEvent } = await submitAndCapture()

    act(() => {
      onEvent({
        type: 'benchmark_result',
        phase: 'benchmarking',
        opsPerSec: 12400,
        normalizedRatio: 0.82,
        userMedian: 150,
        referenceMedian: 120,
        data: '',
        sequenceId: 1,
      })
    })

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['progress', 'overview'] })
  })

  it('should invalidate track-progress queries on benchmark_result event', async () => {
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')
    const { onEvent } = await submitAndCapture()

    act(() => {
      onEvent({
        type: 'benchmark_result',
        phase: 'benchmarking',
        opsPerSec: 12400,
        normalizedRatio: 0.82,
        userMedian: 150,
        referenceMedian: 120,
        data: '',
        sequenceId: 1,
      })
    })

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['progress', 'track-progress'] })
  })

  it('should reset benchmark cache on new submission', async () => {
    const { hook, onEvent } = await submitAndCapture()

    // Store benchmark result
    act(() => {
      onEvent({
        type: 'benchmark_result',
        phase: 'benchmarking',
        opsPerSec: 12400,
        normalizedRatio: 0.82,
        userMedian: 150,
        referenceMedian: 120,
        data: '',
        sequenceId: 1,
      })
    })

    expect(queryClient.getQueryData(['execution', 'benchmark', 'sub-bench'])).toBeDefined()

    // New submission
    mockApiFetch.mockResolvedValue({ submissionId: 'sub-bench-2' })
    await act(async () => {
      hook.result.current.submit({ milestoneId: 'ms-1', code: 'package main' })
    })

    // Old cache should be removed
    expect(queryClient.getQueryData(['execution', 'benchmark', 'sub-bench'])).toBeUndefined()
  })
})
