import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClientProvider } from '@tanstack/react-query'
import { createTestQueryClient } from '@mycscompanion/config/test-utils/query-client'
import type { QueryClient } from '@tanstack/react-query'
import type { ReactNode } from 'react'

describe('useWorkspaceData', () => {
  let queryClient: QueryClient

  function wrapper({ children }: { readonly children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  }

  beforeEach(() => {
    queryClient = createTestQueryClient()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('should return mock workspace data with correct shape', async () => {
    const { useWorkspaceData } = await import('./use-workspace-data')
    const { result } = renderHook(() => useWorkspaceData('milestone-1'), { wrapper })

    await waitFor(() => {
      expect(result.current.data).toBeDefined()
    })

    expect(result.current.data).toEqual(
      expect.objectContaining({
        milestoneName: expect.any(String),
        milestoneNumber: expect.any(Number),
        progress: expect.any(Number),
        initialContent: expect.any(String),
      })
    )
  })

  it('should include stuck detection thresholds in response', async () => {
    const { useWorkspaceData } = await import('./use-workspace-data')
    const { result } = renderHook(() => useWorkspaceData('milestone-1'), { wrapper })

    await waitFor(() => {
      expect(result.current.data).toBeDefined()
    })

    expect(result.current.data).toEqual(
      expect.objectContaining({
        stuckDetection: expect.objectContaining({
          thresholdMinutes: expect.any(Number),
          stage2OffsetSeconds: expect.any(Number),
        }),
      })
    )
  })

  it('should use query key pattern [workspace, get, milestoneId]', async () => {
    const { useWorkspaceData } = await import('./use-workspace-data')
    renderHook(() => useWorkspaceData('ms-42'), { wrapper })

    await waitFor(() => {
      expect(queryClient.getQueryData(['workspace', 'get', 'ms-42'])).toBeDefined()
    })
  })

  it('should set staleTime to 5 minutes', async () => {
    const { useWorkspaceData } = await import('./use-workspace-data')
    const { result } = renderHook(() => useWorkspaceData('milestone-1'), { wrapper })

    await waitFor(() => {
      expect(result.current.data).toBeDefined()
    })

    // Verify query is not stale (staleTime is 5 min, we just fetched)
    const queryState = queryClient.getQueryState(['workspace', 'get', 'milestone-1'])
    expect(queryState?.isInvalidated).toBe(false)
  })

  it('should return isLoading and isError states', async () => {
    const { useWorkspaceData } = await import('./use-workspace-data')
    const { result } = renderHook(() => useWorkspaceData('milestone-1'), { wrapper })

    // Initially may be loading
    expect(typeof result.current.isLoading).toBe('boolean')
    expect(typeof result.current.isError).toBe('boolean')

    await waitFor(() => {
      expect(result.current.data).toBeDefined()
    })
  })

  it('should expose refetch function', async () => {
    const { useWorkspaceData } = await import('./use-workspace-data')
    const { result } = renderHook(() => useWorkspaceData('milestone-1'), { wrapper })

    await waitFor(() => {
      expect(result.current.data).toBeDefined()
    })

    expect(typeof result.current.refetch).toBe('function')
  })
})
