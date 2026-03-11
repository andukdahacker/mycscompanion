import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, it, expect, vi } from 'vitest'
import { createElement } from 'react'
import type { ReactNode } from 'react'
import { QueryClientProvider } from '@tanstack/react-query'
import { createTestQueryClient } from '@mycscompanion/config/test-utils/query-client'

const mockApiFetch = vi.fn()
vi.mock('../lib/api-fetch', () => ({
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
}))

import { useHistoricalBenchmarks } from './use-historical-benchmarks'

afterEach(() => {
  mockApiFetch.mockReset()
  vi.restoreAllMocks()
})

describe('useHistoricalBenchmarks', () => {
  function wrapper({ children }: { readonly children: ReactNode }) {
    const queryClient = createTestQueryClient()
    return createElement(QueryClientProvider, { client: queryClient }, children)
  }

  it('should return empty entries when no data', async () => {
    mockApiFetch.mockResolvedValue({ results: [], nextCursor: null, totalCount: 0 })

    const { result } = renderHook(() => useHistoricalBenchmarks('ms-1'), { wrapper })

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.entries).toEqual([])
    expect(result.current.totalCount).toBe(0)
  })

  it('should flatten pages into single entries array', async () => {
    mockApiFetch.mockResolvedValue({
      results: [
        {
          id: 'r1',
          submissionId: 's1',
          benchmarkName: 'sequential-inserts',
          opsPerSec: 8000,
          normalizedRatio: 0.79,
          userMedian: 8000,
          referenceMedian: 10100,
          p50LatencyUs: 120,
          p99LatencyUs: 445,
          referenceVersion: 'v1',
          createdAt: '2026-03-01T00:00:00Z',
        },
        {
          id: 'r2',
          submissionId: 's2',
          benchmarkName: 'sequential-inserts',
          opsPerSec: 9000,
          normalizedRatio: 0.89,
          userMedian: 9000,
          referenceMedian: 10100,
          p50LatencyUs: 110,
          p99LatencyUs: 420,
          referenceVersion: 'v1',
          createdAt: '2026-03-02T00:00:00Z',
        },
      ],
      nextCursor: null,
      totalCount: 2,
    })

    const { result } = renderHook(() => useHistoricalBenchmarks('ms-1'), { wrapper })

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.entries).toHaveLength(2)
    expect(result.current.entries[0].submissionNumber).toBe(1)
    expect(result.current.entries[1].submissionNumber).toBe(2)
    expect(result.current.entries[0].opsPerSec).toBe(8000)
    expect(result.current.entries[1].opsPerSec).toBe(9000)
  })

  it('should have hasNextPage true when nextCursor is non-null', async () => {
    mockApiFetch.mockResolvedValue({
      results: [
        {
          id: 'r1',
          submissionId: 's1',
          benchmarkName: 'sequential-inserts',
          opsPerSec: 8000,
          normalizedRatio: 0.79,
          userMedian: 8000,
          referenceMedian: 10100,
          p50LatencyUs: null,
          p99LatencyUs: null,
          referenceVersion: 'v1',
          createdAt: '2026-03-01T00:00:00Z',
        },
      ],
      nextCursor: 'cursor-abc',
      totalCount: 5,
    })

    const { result } = renderHook(() => useHistoricalBenchmarks('ms-1'), { wrapper })

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.hasNextPage).toBe(true)
  })

  it('should be disabled when milestoneId is undefined', () => {
    const { result } = renderHook(() => useHistoricalBenchmarks(undefined), { wrapper })

    expect(result.current.isLoading).toBe(false)
    expect(result.current.entries).toEqual([])
    expect(mockApiFetch).not.toHaveBeenCalled()
  })
})
