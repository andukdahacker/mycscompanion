import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { QueryClientProvider } from '@tanstack/react-query'
import { createTestQueryClient } from '@mycscompanion/config/test-utils/query-client'
import type { QueryClient } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { MemoryRouter } from 'react-router'

const mockApiFetch = vi.fn()
const mockNavigate = vi.fn()

vi.mock('../lib/api-fetch', () => ({
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
}))

vi.mock('react-router', async () => {
  const actual = await vi.importActual('react-router')
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  }
})

describe('useCompleteMilestone', () => {
  let queryClient: QueryClient

  function wrapper({ children }: { readonly children: ReactNode }) {
    return (
      <MemoryRouter>
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      </MemoryRouter>
    )
  }

  beforeEach(() => {
    queryClient = createTestQueryClient()
    mockApiFetch.mockReset()
    mockNavigate.mockReset()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('should call POST endpoint with milestoneId and submissionId', async () => {
    mockApiFetch.mockResolvedValue({ nextMilestoneId: 'ms-2' })

    const { useCompleteMilestone } = await import('./use-complete-milestone')
    const { result } = renderHook(() => useCompleteMilestone(), { wrapper })

    act(() => {
      result.current.mutate({ milestoneId: 'ms-1', submissionId: 'sub-1' })
    })

    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenCalledWith(
        '/api/completion/ms-1/complete',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ submissionId: 'sub-1' }),
        })
      )
    })
  })

  it('should navigate to next workspace on success', async () => {
    mockApiFetch.mockResolvedValue({ nextMilestoneId: 'ms-2' })

    const { useCompleteMilestone } = await import('./use-complete-milestone')
    const { result } = renderHook(() => useCompleteMilestone(), { wrapper })

    act(() => {
      result.current.mutate({ milestoneId: 'ms-1', submissionId: 'sub-1' })
    })

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/workspace/ms-2', { replace: true })
    })
  })

  it('should not navigate when nextMilestoneId is null (last milestone)', async () => {
    mockApiFetch.mockResolvedValue({ nextMilestoneId: null })

    const { useCompleteMilestone } = await import('./use-complete-milestone')
    const { result } = renderHook(() => useCompleteMilestone(), { wrapper })

    act(() => {
      result.current.mutate({ milestoneId: 'ms-last', submissionId: 'sub-1' })
    })

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })

    expect(mockNavigate).not.toHaveBeenCalled()
  })
})
