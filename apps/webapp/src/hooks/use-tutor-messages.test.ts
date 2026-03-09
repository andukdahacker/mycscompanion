import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { createElement } from 'react'
import { QueryClientProvider } from '@tanstack/react-query'
import { createTestQueryClient } from '@mycscompanion/config/test-utils'
import { useTutorMessages } from './use-tutor-messages'

// Mock firebase auth
vi.mock('../lib/firebase', () => ({
  auth: {
    currentUser: {
      getIdToken: vi.fn().mockResolvedValue('test-token'),
    },
  },
}))

// Mock apiFetch
const mockApiFetch = vi.fn()
vi.mock('../lib/api-fetch', () => ({
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
  API_URL: 'http://localhost:3001',
  ApiError: class extends Error { status: number; code: string; constructor(s: number, c: string, m: string) { super(m); this.status = s; this.code = c } },
}))

function createWrapper() {
  const queryClient = createTestQueryClient()
  return function Wrapper({ children }: { readonly children: ReactNode }) {
    return createElement(QueryClientProvider, { client: queryClient }, children)
  }
}

describe('useTutorMessages', () => {
  beforeEach(() => {
    mockApiFetch.mockClear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('should fetch initial message page on mount', async () => {
    mockApiFetch.mockResolvedValueOnce({
      messages: [
        { id: 'msg-1', role: 'user', content: 'Hello', model: null, createdAt: '2026-03-01T00:00:00Z' },
        { id: 'msg-2', role: 'assistant', content: 'Hi!', model: 'haiku', createdAt: '2026-03-01T00:00:01Z' },
      ],
      nextCursor: null,
    })

    const { result } = renderHook(() => useTutorMessages('session-1'), {
      wrapper: createWrapper(),
    })

    // Wait for query to resolve
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50))
    })

    expect(mockApiFetch).toHaveBeenCalledWith('/api/tutor/session-1/messages')
    expect(result.current.messages).toHaveLength(2)
    expect(result.current.messages[0]?.id).toBe('msg-1')
  })

  it('should add optimistic user message to cache', async () => {
    mockApiFetch.mockResolvedValueOnce({
      messages: [
        { id: 'msg-1', role: 'assistant', content: 'Welcome!', model: 'haiku', createdAt: '2026-03-01T00:00:00Z' },
      ],
      nextCursor: null,
    })

    const { result } = renderHook(() => useTutorMessages('session-1'), {
      wrapper: createWrapper(),
    })

    // Wait for initial fetch to populate cache
    await act(async () => {
      await new Promise((r) => setTimeout(r, 100))
    })

    expect(result.current.messages).toHaveLength(1)

    act(() => {
      result.current.addOptimisticMessage('My question')
    })

    await waitFor(() => {
      expect(result.current.messages).toHaveLength(2)
    })

    expect(result.current.messages[1]?.role).toBe('user')
    expect(result.current.messages[1]?.content).toBe('My question')
    expect(result.current.messages[1]?.id).toMatch(/^temp-/)
  })

  it('should paginate with cursor when scrolling to top', async () => {
    mockApiFetch.mockResolvedValueOnce({
      messages: [
        { id: 'msg-3', role: 'user', content: 'Recent', model: null, createdAt: '2026-03-01T00:02:00Z' },
      ],
      nextCursor: 'cursor-abc',
    })

    const { result } = renderHook(() => useTutorMessages('session-1'), {
      wrapper: createWrapper(),
    })

    await act(async () => {
      await new Promise((r) => setTimeout(r, 50))
    })

    expect(result.current.hasNextPage).toBe(true)

    // Fetch next page
    mockApiFetch.mockResolvedValueOnce({
      messages: [
        { id: 'msg-1', role: 'user', content: 'Old', model: null, createdAt: '2026-03-01T00:00:00Z' },
      ],
      nextCursor: null,
    })

    await act(async () => {
      await result.current.fetchNextPage()
    })

    await act(async () => {
      await new Promise((r) => setTimeout(r, 50))
    })

    expect(mockApiFetch).toHaveBeenCalledWith('/api/tutor/session-1/messages?afterCursor=cursor-abc')
    expect(result.current.messages).toHaveLength(2)
  })

  it('should not fetch when sessionId is null', async () => {
    renderHook(() => useTutorMessages(null), {
      wrapper: createWrapper(),
    })

    await act(async () => {
      await new Promise((r) => setTimeout(r, 50))
    })

    expect(mockApiFetch).not.toHaveBeenCalled()
  })
})
