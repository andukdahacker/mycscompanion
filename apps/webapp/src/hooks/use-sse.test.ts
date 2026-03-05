import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { renderHook, act, cleanup } from '@testing-library/react'
import type { ExecutionEvent } from '@mycscompanion/execution'
import { useSSE } from './use-sse'

// Mock firebase auth
vi.mock('../lib/firebase', () => ({
  auth: {
    currentUser: {
      getIdToken: vi.fn().mockResolvedValue('test-token-123'),
    },
  },
}))

function createSSEStream(events: Array<{ event?: string; data: string; id?: string }>): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  let index = 0
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (index < events.length) {
        const e = events[index]!
        let chunk = ''
        if (e.event) chunk += `event: ${e.event}\n`
        chunk += `data: ${e.data}\n`
        if (e.id) chunk += `id: ${e.id}\n`
        chunk += '\n'
        controller.enqueue(encoder.encode(chunk))
        index++
      } else {
        controller.close()
      }
    },
  })
}

function mockFetch(stream: ReadableStream<Uint8Array>, status = 200): typeof fetch {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    body: stream,
    headers: new Headers({ 'content-type': 'text/event-stream' }),
  })
}

describe('useSSE', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it('should start with idle status when url is null', () => {
    const { result } = renderHook(() => useSSE({ url: null }))

    expect(result.current.status).toBe('idle')
    expect(result.current.error).toBeNull()
    expect(result.current.reconnectCount).toBe(0)
  })

  it('should not connect when url is null', () => {
    const fetchFn = vi.fn()
    renderHook(() => useSSE({ url: null, fetchFn }))

    expect(fetchFn).not.toHaveBeenCalled()
  })

  it('should connect when url is provided and transition to connected', async () => {
    const queuedEvent: ExecutionEvent = { type: 'queued', submissionId: 'sub-1' }
    const completeEvent: ExecutionEvent = { type: 'complete', phase: 'compiling', data: '', sequenceId: 2 }
    const stream = createSSEStream([
      { event: 'queued', data: JSON.stringify(queuedEvent), id: '0' },
      { event: 'complete', data: JSON.stringify(completeEvent), id: '2' },
    ])
    const fetchFn = mockFetch(stream)
    const onEvent = vi.fn()

    const { result } = renderHook(() => useSSE({ url: '/test/stream', onEvent, fetchFn }))

    // Wait for async operations
    await act(async () => {
      await vi.runAllTimersAsync()
    })

    expect(fetchFn).toHaveBeenCalledWith(
      '/test/stream',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer test-token-123',
        }),
      })
    )
    expect(onEvent).toHaveBeenCalledWith(queuedEvent)
    expect(onEvent).toHaveBeenCalledWith(completeEvent)
    expect(result.current.status).toBe('closed')
  })

  it('should parse SSE events and call onEvent with typed ExecutionEvent', async () => {
    const event: ExecutionEvent = { type: 'compile_output', phase: 'compiling', data: 'main.go:5:2: error', sequenceId: 1 }
    const terminalEvent: ExecutionEvent = { type: 'complete', phase: 'compiling', data: '', sequenceId: 2 }
    const stream = createSSEStream([
      { event: 'compile_output', data: JSON.stringify(event), id: '1' },
      { event: 'complete', data: JSON.stringify(terminalEvent), id: '2' },
    ])
    const fetchFn = mockFetch(stream)
    const onEvent = vi.fn()

    renderHook(() => useSSE({ url: '/test/stream', onEvent, fetchFn }))

    await act(async () => {
      await vi.runAllTimersAsync()
    })

    expect(onEvent).toHaveBeenCalledTimes(2)
    expect(onEvent).toHaveBeenNthCalledWith(1, event)
  })

  it('should close on terminal events (complete, error, timeout)', async () => {
    const completeEvent: ExecutionEvent = { type: 'complete', phase: 'compiling', data: '', sequenceId: 1 }
    const stream = createSSEStream([
      { event: 'complete', data: JSON.stringify(completeEvent), id: '1' },
    ])
    const fetchFn = mockFetch(stream)

    const { result } = renderHook(() => useSSE({ url: '/test/stream', fetchFn }))

    await act(async () => {
      await vi.runAllTimersAsync()
    })

    expect(result.current.status).toBe('closed')
  })

  it('should clean up on unmount', async () => {
    const abortSpy = vi.spyOn(AbortController.prototype, 'abort')
    const stream = createSSEStream([])
    const fetchFn = mockFetch(stream)

    const { unmount } = renderHook(() => useSSE({ url: '/test/stream', fetchFn }))

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10)
    })

    unmount()

    expect(abortSpy).toHaveBeenCalled()
  })

  it('should skip SSE comment lines (heartbeat)', async () => {
    const encoder = new TextEncoder()
    let sent = false
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (!sent) {
          sent = true
          // Heartbeat comment followed by a real event and terminal
          controller.enqueue(encoder.encode(': heartbeat\n\n'))
          controller.enqueue(encoder.encode('event: complete\ndata: {"type":"complete","phase":"compiling","data":"","sequenceId":1}\nid: 1\n\n'))
        } else {
          controller.close()
        }
      },
    })
    const fetchFn = mockFetch(stream)
    const onEvent = vi.fn()

    renderHook(() => useSSE({ url: '/test/stream', onEvent, fetchFn }))

    await act(async () => {
      await vi.runAllTimersAsync()
    })

    // Only the real event, not the heartbeat
    expect(onEvent).toHaveBeenCalledTimes(1)
    expect(onEvent).toHaveBeenCalledWith(expect.objectContaining({ type: 'complete' }))
  })

  it('should increment reconnectCount on connection errors', async () => {
    const fetchFn = vi.fn().mockRejectedValue(new Error('Network error'))
    const onEvent = vi.fn()

    const { result } = renderHook(() => useSSE({ url: '/test/stream', onEvent, fetchFn }))

    // First attempt fails
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100)
    })

    // Wait for backoff (1s) and second attempt
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1100)
    })

    expect(result.current.reconnectCount).toBeGreaterThanOrEqual(1)
    expect(result.current.status).toBe('connecting')
  })
})
