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

import { useAccountProfile } from './use-account-profile'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('useAccountProfile', () => {
  function wrapper({ children }: { readonly children: ReactNode }) {
    const queryClient = createTestQueryClient()
    return createElement(QueryClientProvider, { client: queryClient }, children)
  }

  it('should return profile data on success', async () => {
    const profileData = {
      id: 'test-uid',
      email: 'test@example.com',
      displayName: 'Test User',
      role: 'backend-engineer',
      experienceLevel: '3-to-5',
      primaryLanguage: 'go',
      onboardingCompletedAt: '2026-02-28T00:00:00.000Z',
      skillFloorPassed: true,
      skillFloorCompletedAt: '2026-02-28T00:00:00.000Z',
      createdAt: '2026-02-28T00:00:00.000Z',
      updatedAt: '2026-02-28T00:00:00.000Z',
    }

    mockApiFetch.mockResolvedValue(profileData)

    const { result } = renderHook(() => useAccountProfile(), { wrapper })

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.data).toEqual(profileData)
    expect(mockApiFetch).toHaveBeenCalledWith('/api/account/profile')
  })

  it('should return error state when API fails', async () => {
    mockApiFetch.mockRejectedValue(new Error('Network error'))

    const { result } = renderHook(() => useAccountProfile(), { wrapper })

    await waitFor(() => {
      expect(result.current.isError).toBe(true)
    })

    expect(result.current.data).toBeUndefined()
  })
})
