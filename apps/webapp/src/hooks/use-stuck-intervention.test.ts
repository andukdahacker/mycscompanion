import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useStuckIntervention } from './use-stuck-intervention'

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
}))

// Mock workspace store
const mockSetTutorAvailable = vi.fn()
let mockTutorAvailable = true
vi.mock('../stores/workspace-ui-store', () => ({
  useWorkspaceUIStore: Object.assign(
    () => ({}),
    {
      getState: () => ({
        setTutorAvailable: mockSetTutorAvailable,
        tutorAvailable: mockTutorAvailable,
      }),
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

describe('useStuckIntervention', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch')
    mockSetQueryData.mockClear()
    mockAnnounce.mockClear()
    mockSetTutorAvailable.mockClear()
    mockTutorAvailable = true
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('should send POST with timeStuckMinutes', async () => {
    const body = createSSEResponse([
      { type: 'message_complete', id: 'msg-1', model: 'haiku', content: 'Need help?' },
    ])
    fetchSpy.mockResolvedValueOnce(new Response(body, { status: 200 }))

    const { result } = renderHook(() => useStuckIntervention('session-1'))

    await act(async () => {
      result.current.triggerIntervention(5)
    })

    await act(async () => {
      await new Promise((r) => setTimeout(r, 50))
    })

    expect(fetchSpy).toHaveBeenCalledWith(
      'http://localhost:3001/api/tutor/session-1/stuck-intervention',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ timeStuckMinutes: 5 }),
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
          Authorization: 'Bearer test-token',
          Accept: 'text/event-stream',
        }),
      }),
    )
  })

  it('should insert synthetic user message into query cache', async () => {
    const body = createSSEResponse([
      { type: 'message_complete', id: 'msg-1', model: 'haiku', content: 'Hint' },
    ])
    fetchSpy.mockResolvedValueOnce(new Response(body, { status: 200 }))

    const { result } = renderHook(() => useStuckIntervention('session-1'))

    await act(async () => {
      result.current.triggerIntervention(10)
    })

    await act(async () => {
      await new Promise((r) => setTimeout(r, 50))
    })

    // First setQueryData call is for synthetic user message, second for assistant message
    expect(mockSetQueryData).toHaveBeenCalledWith(
      ['tutor', 'messages', 'session-1'],
      expect.any(Function),
    )

    // Verify the synthetic message updater works correctly
    const firstCall = mockSetQueryData.mock.calls[0] as [string[], (old: unknown) => unknown]
    const updater = firstCall[1]
    const mockOld = {
      pages: [{ messages: [], nextCursor: null }],
      pageParams: [null],
    }
    const updated = updater(mockOld) as { pages: Array<{ messages: Array<{ role: string; content: string }> }> }
    expect(updated.pages[0].messages).toHaveLength(1)
    expect(updated.pages[0].messages[0].role).toBe('user')
    expect(updated.pages[0].messages[0].content).toContain('stuck')
  })

  it('should parse SSE events and insert assistant message on complete', async () => {
    const body = createSSEResponse([
      { type: 'text_delta', delta: 'Hint ' },
      { type: 'text_delta', delta: 'text' },
      { type: 'message_complete', id: 'msg-2', model: 'haiku', content: 'Hint text' },
    ])
    fetchSpy.mockResolvedValueOnce(new Response(body, { status: 200 }))

    const { result } = renderHook(() => useStuckIntervention('session-1'))

    await act(async () => {
      result.current.triggerIntervention(5)
    })

    await act(async () => {
      await new Promise((r) => setTimeout(r, 50))
    })

    // Should have called setQueryData for both synthetic user message and assistant message
    expect(mockSetQueryData).toHaveBeenCalledTimes(2)

    // Second call is for the assistant message_complete
    const secondCall = mockSetQueryData.mock.calls[1] as [string[], (old: unknown) => unknown]
    const updater = secondCall[1]
    const mockOld = {
      pages: [{ messages: [{ role: 'user', content: 'stuck' }], nextCursor: null }],
      pageParams: [null],
    }
    const updated = updater(mockOld) as { pages: Array<{ messages: Array<{ role: string; content: string; id: string }> }> }
    expect(updated.pages[0].messages).toHaveLength(2)
    expect(updated.pages[0].messages[1].role).toBe('assistant')
    expect(updated.pages[0].messages[1].content).toBe('Hint text')
    expect(updated.pages[0].messages[1].id).toBe('msg-2')

    expect(mockAnnounce).toHaveBeenCalledWith('Hint text')
    expect(result.current.isInterventionStreaming).toBe(false)
  })

  it('should silently handle errors without UI error state', async () => {
    fetchSpy.mockRejectedValueOnce(new Error('Network failure'))

    const { result } = renderHook(() => useStuckIntervention('session-1'))

    await act(async () => {
      result.current.triggerIntervention(5)
    })

    await act(async () => {
      await new Promise((r) => setTimeout(r, 50))
    })

    // No error state exposed — hook just resets streaming
    expect(result.current.isInterventionStreaming).toBe(false)
    expect(result.current.interventionStreamingContent).toBe('')
  })

  it('should prevent concurrent interventions', async () => {
    // Long-running stream
    const body = new ReadableStream({
      start() {
        // Never closes
      },
    })
    fetchSpy.mockResolvedValue(new Response(body, { status: 200 }))

    const { result } = renderHook(() => useStuckIntervention('session-1'))

    await act(async () => {
      result.current.triggerIntervention(5)
    })

    expect(result.current.isInterventionStreaming).toBe(true)

    // Second trigger should be ignored
    await act(async () => {
      result.current.triggerIntervention(10)
    })

    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })

  it('should abort on cleanup', async () => {
    const abortSpy = vi.spyOn(AbortController.prototype, 'abort')

    const body = new ReadableStream({
      start() {
        // Never closes
      },
    })
    fetchSpy.mockResolvedValueOnce(new Response(body, { status: 200 }))

    const { result, unmount } = renderHook(() => useStuckIntervention('session-1'))

    await act(async () => {
      result.current.triggerIntervention(5)
    })

    unmount()

    expect(abortSpy).toHaveBeenCalled()
  })

  it('should set tutorAvailable=false on TUTOR_UNAVAILABLE error from SSE event', async () => {
    const body = createSSEResponse([
      { type: 'error', code: 'TUTOR_UNAVAILABLE', message: 'Tutor is unavailable' },
    ])
    fetchSpy.mockResolvedValueOnce(new Response(body, { status: 200 }))

    const { result } = renderHook(() => useStuckIntervention('session-1'))

    await act(async () => {
      result.current.triggerIntervention(5)
    })

    await act(async () => {
      await new Promise((r) => setTimeout(r, 50))
    })

    expect(mockSetTutorAvailable).toHaveBeenCalledWith(false)
    expect(result.current.isInterventionStreaming).toBe(false)
  })

  it('should not fire API call when tutorAvailable is false', async () => {
    mockTutorAvailable = false

    const { result } = renderHook(() => useStuckIntervention('session-1'))

    await act(async () => {
      result.current.triggerIntervention(5)
    })

    await act(async () => {
      await new Promise((r) => setTimeout(r, 50))
    })

    expect(fetchSpy).not.toHaveBeenCalled()
    expect(result.current.isInterventionStreaming).toBe(false)
  })

  it('should set tutorAvailable=false on 503 TUTOR_UNAVAILABLE HTTP response', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ error: { code: 'TUTOR_UNAVAILABLE', message: 'Unavailable' } }),
        { status: 503, headers: { 'content-type': 'application/json' } },
      ),
    )

    const { result } = renderHook(() => useStuckIntervention('session-1'))

    await act(async () => {
      result.current.triggerIntervention(5)
    })

    await act(async () => {
      await new Promise((r) => setTimeout(r, 50))
    })

    expect(mockSetTutorAvailable).toHaveBeenCalledWith(false)
    expect(result.current.isInterventionStreaming).toBe(false)
  })
})
