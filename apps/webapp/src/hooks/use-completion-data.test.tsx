import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClientProvider } from '@tanstack/react-query'
import { createTestQueryClient } from '@mycscompanion/config/test-utils/query-client'
import type { QueryClient } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import type { MilestoneCompletionData } from '@mycscompanion/shared'

const mockApiFetch = vi.fn()

vi.mock('../lib/api-fetch', () => ({
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
}))

const MOCK_COMPLETION: MilestoneCompletionData = {
  milestoneId: 'ms-1',
  milestoneName: 'Simple Key-Value Store',
  milestoneNumber: 1,
  completedAt: '2026-03-05T10:00:00.000Z',
  criteriaResults: [
    { name: 'put-and-get', order: 1, status: 'met', expected: 'PASS', actual: 'PASS' },
  ],
  nextMilestone: {
    id: 'ms-2',
    title: 'Storage Engine',
    position: 2,
    briefExcerpt: 'Build a storage engine...',
  },
}

describe('useCompletionData', () => {
  let queryClient: QueryClient

  function wrapper({ children }: { readonly children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  }

  beforeEach(() => {
    queryClient = createTestQueryClient()
    mockApiFetch.mockReset()
    mockApiFetch.mockResolvedValue(MOCK_COMPLETION)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('should call apiFetch with correct completion endpoint', async () => {
    const { useCompletionData } = await import('./use-completion-data')
    renderHook(() => useCompletionData('ms-1'), { wrapper })

    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenCalledWith('/api/completion/ms-1')
    })
  })

  it('should return completion data on success', async () => {
    const { useCompletionData } = await import('./use-completion-data')
    const { result } = renderHook(() => useCompletionData('ms-1'), { wrapper })

    await waitFor(() => {
      expect(result.current.data).toBeDefined()
    })

    expect(result.current.data?.milestoneId).toBe('ms-1')
    expect(result.current.data?.milestoneName).toBe('Simple Key-Value Store')
    expect(result.current.data?.nextMilestone?.id).toBe('ms-2')
  })

  it('should not fetch when milestoneId is undefined', async () => {
    const { useCompletionData } = await import('./use-completion-data')
    renderHook(() => useCompletionData(undefined), { wrapper })

    expect(mockApiFetch).not.toHaveBeenCalled()
  })

  it('should use query key pattern [completion, get, milestoneId]', async () => {
    const { useCompletionData } = await import('./use-completion-data')
    renderHook(() => useCompletionData('ms-1'), { wrapper })

    await waitFor(() => {
      expect(queryClient.getQueryData(['completion', 'get', 'ms-1'])).toBeDefined()
    })
  })
})
