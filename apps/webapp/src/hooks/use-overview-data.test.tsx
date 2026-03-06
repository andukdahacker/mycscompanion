import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClientProvider } from '@tanstack/react-query'
import { createTestQueryClient } from '@mycscompanion/config/test-utils/query-client'
import type { QueryClient } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import type { OverviewData } from '@mycscompanion/shared'

const mockApiFetch = vi.fn()

vi.mock('../lib/api-fetch', () => ({
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
}))

const MOCK_OVERVIEW: OverviewData = {
  variant: 'first-time',
  milestone: {
    id: 'ms-1',
    slug: '01-kv-store',
    title: 'Simple Key-Value Store',
    position: 1,
    briefExcerpt: 'Build a simple key-value store...',
    csConceptLabel: null,
  },
  criteriaProgress: null,
  sessionSummary: null,
  lastBenchmark: null,
  benchmarkTrend: null,
}

describe('useOverviewData', () => {
  let queryClient: QueryClient

  function wrapper({ children }: { readonly children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  }

  beforeEach(() => {
    queryClient = createTestQueryClient()
    mockApiFetch.mockReset()
    mockApiFetch.mockResolvedValue(MOCK_OVERVIEW)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('should call apiFetch with correct overview endpoint', async () => {
    const { useOverviewData } = await import('./use-overview-data')
    renderHook(() => useOverviewData(), { wrapper })

    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenCalledWith('/api/progress/overview')
    })
  })

  it('should return overview data on success', async () => {
    const { useOverviewData } = await import('./use-overview-data')
    const { result } = renderHook(() => useOverviewData(), { wrapper })

    await waitFor(() => {
      expect(result.current.data).toBeDefined()
    })

    expect(result.current.data?.variant).toBe('first-time')
    expect(result.current.data?.milestone.id).toBe('ms-1')
    expect(result.current.data?.milestone.title).toBe('Simple Key-Value Store')
  })

  it('should start in loading state', async () => {
    mockApiFetch.mockReturnValue(new Promise(() => {}))
    const { useOverviewData } = await import('./use-overview-data')
    const { result } = renderHook(() => useOverviewData(), { wrapper })

    expect(result.current.isLoading).toBe(true)
    expect(result.current.data).toBeUndefined()
  })

  it('should set error state on fetch failure', async () => {
    mockApiFetch.mockRejectedValue(new Error('Network error'))
    const { useOverviewData } = await import('./use-overview-data')
    const { result } = renderHook(() => useOverviewData(), { wrapper })

    await waitFor(() => {
      expect(result.current.isError).toBe(true)
    })
  })

  it('should use query key pattern [progress, overview]', async () => {
    const { useOverviewData } = await import('./use-overview-data')
    renderHook(() => useOverviewData(), { wrapper })

    await waitFor(() => {
      expect(queryClient.getQueryData(['progress', 'overview'])).toBeDefined()
    })
  })
})
