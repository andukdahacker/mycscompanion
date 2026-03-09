import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useTutorStream } from './use-tutor-stream'

// Mock firebase auth
vi.mock('../lib/firebase', () => ({
  auth: {
    currentUser: {
      getIdToken: vi.fn().mockResolvedValue('test-token'),
    },
  },
}))

// Mock api-fetch (only need API_URL)
vi.mock('../lib/api-fetch', () => ({
  API_URL: 'http://localhost:3001',
  apiFetch: vi.fn(),
  ApiError: class extends Error { status: number; code: string; constructor(s: number, c: string, m: string) { super(m); this.status = s; this.code = c } },
}))

// Mock workspace store
const mockSetTutorAvailable = vi.fn()
vi.mock('../stores/workspace-ui-store', () => ({
  useWorkspaceUIStore: Object.assign(
    () => ({}),
    {
      getState: () => ({ setTutorAvailable: mockSetTutorAvailable }),
    },
  ),
}))

// Mock announceToScreenReader
const mockAnnounce = vi.fn()
vi.mock('../components/workspace/workspace-a11y', () => ({
  announceToScreenReader: (...args: unknown[]) => mockAnnounce(...args),
}))

// Mock TanStack Query
const mockSetQueryData = vi.fn()
vi.mock('@tanstack/react-query', async () => {
  const actual = await vi.importActual<typeof import('@tanstack/react-query')>('@tanstack/react-query')
  return {
    ...actual,
    useQueryClient: () => ({ setQueryData: mockSetQueryData }),
  }
})

function createSSEResponse(events: Array<{ type: string; [key: string]: unknown }>): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  const chunks = events.map((e) => `data: ${JSON.stringify(e)}\n\n`)
  let index = 0

  return new ReadableStream({
    pull(controller) {
      if (index < chunks.length) {
        controller.enqueue(encoder.encode(chunks[index]))
        index++
      } else {
        controller.close()
      }
    },
  })
}

describe('useTutorStream', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch')
    mockSetQueryData.mockClear()
    mockAnnounce.mockClear()
    mockSetTutorAvailable.mockClear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('should parse SSE text_delta events and accumulate content', async () => {
    const body = createSSEResponse([
      { type: 'text_delta', delta: 'Hello ' },
      { type: 'text_delta', delta: 'world' },
      { type: 'message_complete', id: 'msg-1', model: 'haiku', content: 'Hello world' },
    ])

    fetchSpy.mockResolvedValueOnce(new Response(body, { status: 200 }))

    const { result } = renderHook(() => useTutorStream('session-1'))

    await act(async () => {
      result.current.sendMessage('test message')
    })

    // Wait for stream processing
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50))
    })

    // After message_complete, streamingContent should be cleared
    expect(result.current.isStreaming).toBe(false)
    expect(result.current.streamingContent).toBe('')
  })

  it('should handle message_complete event and update query cache', async () => {
    const body = createSSEResponse([
      { type: 'text_delta', delta: 'Answer' },
      { type: 'message_complete', id: 'msg-1', model: 'haiku', content: 'Answer' },
    ])

    fetchSpy.mockResolvedValueOnce(new Response(body, { status: 200 }))

    const { result } = renderHook(() => useTutorStream('session-1'))

    await act(async () => {
      result.current.sendMessage('question')
    })

    await act(async () => {
      await new Promise((r) => setTimeout(r, 50))
    })

    expect(mockSetQueryData).toHaveBeenCalledWith(
      ['tutor', 'messages', 'session-1'],
      expect.any(Function),
    )
    expect(mockAnnounce).toHaveBeenCalledWith('Answer')
  })

  it('should handle error events and set error state', async () => {
    const body = createSSEResponse([
      { type: 'error', code: 'CONTEXT_TOO_LONG', message: 'Context exceeded' },
    ])

    fetchSpy.mockResolvedValueOnce(new Response(body, { status: 200 }))

    const { result } = renderHook(() => useTutorStream('session-1'))

    await act(async () => {
      result.current.sendMessage('test')
    })

    await act(async () => {
      await new Promise((r) => setTimeout(r, 50))
    })

    expect(result.current.error).toEqual(
      expect.objectContaining({ code: 'CONTEXT_TOO_LONG', message: 'Context exceeded' }),
    )
    expect(result.current.isStreaming).toBe(false)
  })

  it('should handle HTTP 429 with retryAfter', async () => {
    fetchSpy.mockResolvedValueOnce(new Response(
      JSON.stringify({ error: { code: 'RATE_LIMITED', message: 'Too many requests' } }),
      {
        status: 429,
        headers: { 'retry-after': '30', 'content-type': 'application/json' },
      },
    ))

    const { result } = renderHook(() => useTutorStream('session-1'))

    await act(async () => {
      result.current.sendMessage('test')
    })

    await act(async () => {
      await new Promise((r) => setTimeout(r, 50))
    })

    expect(result.current.error).not.toBeNull()
    expect(result.current.error?.code).toBe('RATE_LIMITED')
    expect(result.current.error?.message).toBe('Too many requests')
    expect(result.current.error?.retryAfter).toBe(30)
    expect(result.current.isStreaming).toBe(false)
  })

  it('should abort fetch on cleanup', async () => {
    const abortSpy = vi.spyOn(AbortController.prototype, 'abort')

    // Never-ending stream
    const body = new ReadableStream({
      start() {
        // Never closes
      },
    })

    fetchSpy.mockResolvedValueOnce(new Response(body, { status: 200 }))

    const { result, unmount } = renderHook(() => useTutorStream('session-1'))

    await act(async () => {
      result.current.sendMessage('test')
    })

    unmount()

    expect(abortSpy).toHaveBeenCalled()
  })

  it('should prevent concurrent sends while streaming', async () => {
    // Long-running stream
    const body = new ReadableStream({
      start() {
        // Never closes
      },
    })

    fetchSpy.mockResolvedValue(new Response(body, { status: 200 }))

    const { result } = renderHook(() => useTutorStream('session-1'))

    await act(async () => {
      result.current.sendMessage('first message')
    })

    expect(result.current.isStreaming).toBe(true)

    // Second send should be blocked
    await act(async () => {
      result.current.sendMessage('second message')
    })

    // fetch should only have been called once
    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })

  it('should not send when sessionId is null', async () => {
    const { result } = renderHook(() => useTutorStream(null))

    await act(async () => {
      result.current.sendMessage('test')
    })

    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('should handle TUTOR_UNAVAILABLE error and update store', async () => {
    const body = createSSEResponse([
      { type: 'error', code: 'TUTOR_UNAVAILABLE', message: 'Tutor is unavailable' },
    ])

    fetchSpy.mockResolvedValueOnce(new Response(body, { status: 200 }))

    const { result } = renderHook(() => useTutorStream('session-1'))

    await act(async () => {
      result.current.sendMessage('test')
    })

    await act(async () => {
      await new Promise((r) => setTimeout(r, 50))
    })

    expect(mockSetTutorAvailable).toHaveBeenCalledWith(false)
  })
})
