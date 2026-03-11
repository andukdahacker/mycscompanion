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

import { usePreviousBenchmark } from './use-previous-benchmark'

afterEach(() => {
  mockApiFetch.mockReset()
  vi.restoreAllMocks()
})

describe('usePreviousBenchmark', () => {
  function wrapper({ children }: { readonly children: ReactNode }) {
    const queryClient = createTestQueryClient()
    return createElement(QueryClientProvider, { client: queryClient }, children)
  }

  it('should return null when no previous benchmark exists (404)', async () => {
    mockApiFetch.mockRejectedValue(new Error('Not found'))

    const { result } = renderHook(() => usePreviousBenchmark('ms-1'), { wrapper })

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.previousOpsPerSec).toBeNull()
  })

  it('should return opsPerSec when previous benchmark exists', async () => {
    mockApiFetch.mockResolvedValue({ opsPerSec: 8200 })

    const { result } = renderHook(() => usePreviousBenchmark('ms-1'), { wrapper })

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.previousOpsPerSec).toBe(8200)
  })

  it('should not fetch when milestoneId is undefined', () => {
    const { result } = renderHook(() => usePreviousBenchmark(undefined), { wrapper })

    expect(result.current.isLoading).toBe(false)
    expect(result.current.previousOpsPerSec).toBeNull()
    expect(mockApiFetch).not.toHaveBeenCalled()
  })
})
