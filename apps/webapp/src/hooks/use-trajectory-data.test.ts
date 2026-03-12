import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, it, expect, vi } from 'vitest'
import { createElement } from 'react'
import type { ReactNode } from 'react'
import { QueryClientProvider } from '@tanstack/react-query'
import { createTestQueryClient } from '@mycscompanion/config/test-utils/query-client'

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

import { useTrajectoryData } from './use-trajectory-data'

afterEach(() => {
  mockApiFetch.mockReset()
  vi.restoreAllMocks()
})

describe('useTrajectoryData', () => {
  function wrapper({ children }: { readonly children: ReactNode }) {
    const queryClient = createTestQueryClient()
    return createElement(QueryClientProvider, { client: queryClient }, children)
  }

  it('should return empty dataPoints when API returns no data', async () => {
    mockApiFetch.mockResolvedValue({ dataPoints: [] })

    const { result } = renderHook(() => useTrajectoryData(), { wrapper })

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.dataPoints).toEqual([])
    expect(result.current.error).toBeNull()
  })

  it('should return empty dataPoints and set error when API call fails', async () => {
    mockApiFetch.mockRejectedValue(new Error('Network error'))

    const { result } = renderHook(() => useTrajectoryData(), { wrapper })

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.dataPoints).toEqual([])
    expect(result.current.error).toBeInstanceOf(Error)
  })

  it('should return data points sorted by milestone number', async () => {
    mockApiFetch.mockResolvedValue({
      dataPoints: [
        { milestoneId: 'ms-1', milestoneName: 'KV Store', milestoneNumber: 1, benchmarkName: 'sequential-inserts', bestOpsPerSec: 4200, bestNormalizedRatio: 0.4158, totalSubmissions: 2, achievedAt: '2026-01-01T00:00:00Z' },
        { milestoneId: 'ms-2', milestoneName: 'B-Tree', milestoneNumber: 2, benchmarkName: 'range-scan', bestOpsPerSec: 8100, bestNormalizedRatio: 0.8020, totalSubmissions: 1, achievedAt: '2026-01-02T00:00:00Z' },
      ],
    })

    const { result } = renderHook(() => useTrajectoryData(), { wrapper })

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.dataPoints).toHaveLength(2)
    expect(result.current.dataPoints[0].milestoneNumber).toBe(1)
    expect(result.current.dataPoints[1].milestoneNumber).toBe(2)
  })

  it('should use query key ["benchmark", "trajectory"]', async () => {
    mockApiFetch.mockResolvedValue({ dataPoints: [] })

    const { result } = renderHook(() => useTrajectoryData(), { wrapper })

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(mockApiFetch).toHaveBeenCalledWith('/api/execution/benchmark-results/trajectory')
  })
})
