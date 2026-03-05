import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { QueryClientProvider } from '@tanstack/react-query'
import { createTestQueryClient } from '@mycscompanion/config/test-utils/query-client'
import type { QueryClient } from '@tanstack/react-query'
import type { ExecutionEvent } from '@mycscompanion/execution'
import type { ReactNode } from 'react'

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

describe('useSubmitCode', () => {
  let queryClient: QueryClient

  function wrapper({ children }: { readonly children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  }

  beforeEach(() => {
    queryClient = createTestQueryClient()
    capturedSSEOptions = null
    mockApiFetch.mockReset()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('should start in idle state with no submission', async () => {
    const { useSubmitCode } = await import('./use-submit-code')
    const { result } = renderHook(() => useSubmitCode(), { wrapper })

    expect(result.current.submissionId).toBeNull()
    expect(result.current.isRunning).toBe(false)
    expect(result.current.outputLines).toEqual([])
  })

  it('should call apiFetch with POST and correct body on submit', async () => {
    mockApiFetch.mockResolvedValue({ submissionId: 'sub-123' })
    const { useSubmitCode } = await import('./use-submit-code')
    const { result } = renderHook(() => useSubmitCode(), { wrapper })

    await act(async () => {
      result.current.submit({ milestoneId: 'ms-1', code: 'package main' })
    })

    expect(mockApiFetch).toHaveBeenCalledWith('/api/execution/submit', {
      method: 'POST',
      body: JSON.stringify({ milestoneId: 'ms-1', code: 'package main' }),
    })
  })

  it('should set submissionId and isRunning on successful submit', async () => {
    mockApiFetch.mockResolvedValue({ submissionId: 'sub-456' })
    const { useSubmitCode } = await import('./use-submit-code')
    const { result } = renderHook(() => useSubmitCode(), { wrapper })

    await act(async () => {
      result.current.submit({ milestoneId: 'ms-1', code: 'package main' })
    })

    expect(result.current.submissionId).toBe('sub-456')
    expect(result.current.isRunning).toBe(true)
  })

  it('should construct SSE URL from submissionId', async () => {
    mockApiFetch.mockResolvedValue({ submissionId: 'sub-789' })
    const { useSubmitCode } = await import('./use-submit-code')
    const { result } = renderHook(() => useSubmitCode(), { wrapper })

    await act(async () => {
      result.current.submit({ milestoneId: 'ms-1', code: 'package main' })
    })

    expect(capturedSSEOptions?.url).toBe('http://localhost:3001/api/execution/sub-789/stream')
  })

  it('should update query cache when SSE events arrive', async () => {
    mockApiFetch.mockResolvedValue({ submissionId: 'sub-cache' })
    const { useSubmitCode } = await import('./use-submit-code')
    const { result } = renderHook(() => useSubmitCode(), { wrapper })

    await act(async () => {
      result.current.submit({ milestoneId: 'ms-1', code: 'package main' })
    })

    // Simulate SSE event via captured callback
    act(() => {
      capturedSSEOptions?.onEvent?.({
        type: 'compile_output',
        phase: 'compiling',
        data: 'compiling main.go',
        sequenceId: 1,
      })
    })

    // TanStack Query cache updates may require a waitFor for observer notification
    await waitFor(() => {
      expect(result.current.outputLines).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ kind: 'stdout', text: 'compiling main.go' }),
        ])
      )
    })

    // Verify the cache is the source of truth
    const cached = queryClient.getQueryData<ReadonlyArray<unknown>>(['execution', 'output', 'sub-cache'])
    expect(cached).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'stdout', text: 'compiling main.go' }),
      ])
    )
  })

  it('should finalize cache on complete event and set isRunning to false', async () => {
    mockApiFetch.mockResolvedValue({ submissionId: 'sub-fin' })
    const { useSubmitCode } = await import('./use-submit-code')
    const { result } = renderHook(() => useSubmitCode(), { wrapper })

    await act(async () => {
      result.current.submit({ milestoneId: 'ms-1', code: 'package main' })
    })

    act(() => {
      capturedSSEOptions?.onEvent?.({
        type: 'complete',
        phase: 'compiling',
        data: '',
        sequenceId: 1,
      })
    })

    await waitFor(() => {
      expect(result.current.isRunning).toBe(false)
      expect(result.current.outputLines).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ kind: 'success', text: 'Build successful.' }),
        ])
      )
    })
  })

  it('should finalize cache on error event and set isRunning to false', async () => {
    mockApiFetch.mockResolvedValue({ submissionId: 'sub-err' })
    const { useSubmitCode } = await import('./use-submit-code')
    const { result } = renderHook(() => useSubmitCode(), { wrapper })

    await act(async () => {
      result.current.submit({ milestoneId: 'ms-1', code: 'package main' })
    })

    act(() => {
      capturedSSEOptions?.onEvent?.({
        type: 'error',
        phase: 'compiling',
        message: 'compilation failed',
        isUserError: true,
        data: 'main.go:5:2: undefined: x',
        sequenceId: 1,
      })
    })

    await waitFor(() => {
      expect(result.current.isRunning).toBe(false)
      expect(result.current.outputLines).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ kind: 'error', isUserError: true }),
        ])
      )
    })
  })

  it('should finalize cache on timeout event and set isRunning to false', async () => {
    mockApiFetch.mockResolvedValue({ submissionId: 'sub-to' })
    const { useSubmitCode } = await import('./use-submit-code')
    const { result } = renderHook(() => useSubmitCode(), { wrapper })

    await act(async () => {
      result.current.submit({ milestoneId: 'ms-1', code: 'package main' })
    })

    act(() => {
      capturedSSEOptions?.onEvent?.({
        type: 'timeout',
        phase: 'compiling',
        timeoutSeconds: 30,
        data: '',
        sequenceId: 1,
      })
    })

    await waitFor(() => {
      expect(result.current.isRunning).toBe(false)
      expect(result.current.outputLines).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ kind: 'error', isUserError: true }),
        ])
      )
    })
  })

  it('should deduplicate SSE events by sequenceId', async () => {
    mockApiFetch.mockResolvedValue({ submissionId: 'sub-dedup' })
    const { useSubmitCode } = await import('./use-submit-code')
    const { result } = renderHook(() => useSubmitCode(), { wrapper })

    await act(async () => {
      result.current.submit({ milestoneId: 'ms-1', code: 'package main' })
    })

    // Send same sequenceId twice (reconnect replay scenario)
    act(() => {
      capturedSSEOptions?.onEvent?.({
        type: 'compile_output',
        phase: 'compiling',
        data: 'output line 1',
        sequenceId: 1,
      })
    })

    act(() => {
      capturedSSEOptions?.onEvent?.({
        type: 'compile_output',
        phase: 'compiling',
        data: 'output line 1',
        sequenceId: 1,
      })
    })

    await waitFor(() => {
      const stdoutLines = result.current.outputLines.filter((l) => l.kind === 'stdout')
      expect(stdoutLines).toHaveLength(1)
    })
  })

  it('should clear outputLines on new submission', async () => {
    mockApiFetch.mockResolvedValue({ submissionId: 'sub-clear-1' })
    const { useSubmitCode } = await import('./use-submit-code')
    const { result } = renderHook(() => useSubmitCode(), { wrapper })

    await act(async () => {
      result.current.submit({ milestoneId: 'ms-1', code: 'package main' })
    })

    act(() => {
      capturedSSEOptions?.onEvent?.({
        type: 'compile_output',
        phase: 'compiling',
        data: 'old output',
        sequenceId: 1,
      })
    })

    await waitFor(() => {
      expect(result.current.outputLines.length).toBeGreaterThan(0)
    })

    // Submit again
    mockApiFetch.mockResolvedValue({ submissionId: 'sub-clear-2' })
    await act(async () => {
      result.current.submit({ milestoneId: 'ms-1', code: 'package main' })
    })

    // Old lines should be cleared (new submission has its own cache entry)
    await waitFor(() => {
      const oldStdout = result.current.outputLines.filter(
        (l) => l.kind === 'stdout' && 'text' in l && l.text === 'old output'
      )
      expect(oldStdout).toHaveLength(0)
    })
  })

  it('should handle submit failure and show error output', async () => {
    const { ApiError } = await import('../lib/api-fetch')
    mockApiFetch.mockRejectedValue(new ApiError(429, 'RATE_LIMITED', 'Too many requests'))
    const { useSubmitCode } = await import('./use-submit-code')
    const { result } = renderHook(() => useSubmitCode(), { wrapper })

    await act(async () => {
      result.current.submit({ milestoneId: 'ms-1', code: 'package main' })
    })

    await waitFor(() => {
      expect(result.current.isRunning).toBe(false)
      expect(result.current.outputLines).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ kind: 'error', isUserError: false }),
        ])
      )
    })
  })
})
