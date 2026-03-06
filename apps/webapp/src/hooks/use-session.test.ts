import { describe, it, expect, vi, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { QueryClientProvider } from '@tanstack/react-query'
import { createTestQueryClient } from '@mycscompanion/config/test-utils/query-client'
import { useSession } from './use-session'
import { createElement } from 'react'

vi.mock('../lib/api-fetch', () => ({
  apiFetch: vi.fn().mockResolvedValue({ session: { id: 'sess-1', startedAt: '2026-03-06T00:00:00Z' }, created: true }),
}))

vi.mock('../lib/firebase', () => ({
  auth: {
    currentUser: {
      getIdToken: vi.fn().mockResolvedValue('test-token'),
    },
  },
}))

import { apiFetch } from '../lib/api-fetch'

const mockApiFetch = vi.mocked(apiFetch)

function createWrapper() {
  const queryClient = createTestQueryClient()
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return createElement(QueryClientProvider, { client: queryClient }, children)
  }
}

describe('useSession', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('should call correct endpoint when mutate is called', async () => {
    const { result } = renderHook(
      () => useSession('ms-1'),
      { wrapper: createWrapper() }
    )

    await act(async () => {
      result.current.mutate()
    })

    expect(mockApiFetch).toHaveBeenCalledWith('/api/progress/sessions', {
      method: 'POST',
      body: JSON.stringify({ milestoneId: 'ms-1' }),
    })
  })

  it('should return session data on success', async () => {
    const { result } = renderHook(
      () => useSession('ms-1'),
      { wrapper: createWrapper() }
    )

    await act(async () => {
      result.current.mutate()
    })

    // Wait for mutation to complete
    await vi.waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })

    expect(result.current.data?.session.id).toBe('sess-1')
    expect(result.current.data?.created).toBe(true)
  })
})
