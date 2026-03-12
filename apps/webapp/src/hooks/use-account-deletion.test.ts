import { renderHook, act } from '@testing-library/react'
import { afterEach, describe, it, expect, vi, beforeEach } from 'vitest'

const mockApiFetch = vi.fn()
vi.mock('../lib/api-fetch', () => ({
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
}))

const mockSignOut = vi.fn()
vi.mock('../lib/firebase', () => ({
  signOut: (...args: unknown[]) => mockSignOut(...args),
}))

const mockNavigate = vi.fn()
vi.mock('react-router', () => ({
  useNavigate: () => mockNavigate,
}))

import { useAccountDeletion } from './use-account-deletion'

beforeEach(() => {
  mockApiFetch.mockResolvedValue({ message: 'Account deleted successfully' })
  mockSignOut.mockResolvedValue(undefined)
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('useAccountDeletion', () => {
  it('should start in idle state', () => {
    const { result } = renderHook(() => useAccountDeletion())
    expect(result.current.state).toEqual({ status: 'idle', error: null })
  })

  it('should call DELETE /api/account/delete', async () => {
    const { result } = renderHook(() => useAccountDeletion())

    await act(async () => {
      await result.current.deleteAccount()
    })

    expect(mockApiFetch).toHaveBeenCalledWith('/api/account/delete', { method: 'DELETE' })
  })

  it('should call signOut after successful deletion', async () => {
    const { result } = renderHook(() => useAccountDeletion())

    await act(async () => {
      await result.current.deleteAccount()
    })

    expect(mockSignOut).toHaveBeenCalled()
  })

  it('should navigate to /sign-in after successful deletion', async () => {
    const { result } = renderHook(() => useAccountDeletion())

    await act(async () => {
      await result.current.deleteAccount()
    })

    expect(mockNavigate).toHaveBeenCalledWith('/sign-in', { replace: true })
  })

  it('should navigate to /sign-in even if signOut fails after deletion', async () => {
    mockSignOut.mockRejectedValueOnce(new Error('Sign out failed'))

    const { result } = renderHook(() => useAccountDeletion())

    await act(async () => {
      await result.current.deleteAccount()
    })

    expect(mockNavigate).toHaveBeenCalledWith('/sign-in', { replace: true })
  })

  it('should set status to failed on API error', async () => {
    mockApiFetch.mockRejectedValueOnce(new Error('Network error'))

    const { result } = renderHook(() => useAccountDeletion())

    await act(async () => {
      await result.current.deleteAccount()
    })

    expect(result.current.state.status).toBe('failed')
    expect(result.current.state.error).toBe('Account deletion failed. Please try again.')
  })

  it('should clear error state on reset', async () => {
    mockApiFetch.mockRejectedValueOnce(new Error('Network error'))

    const { result } = renderHook(() => useAccountDeletion())

    await act(async () => {
      await result.current.deleteAccount()
    })
    expect(result.current.state.status).toBe('failed')

    act(() => {
      result.current.reset()
    })
    expect(result.current.state).toEqual({ status: 'idle', error: null })
  })

  it('should set status to deleting during API call', async () => {
    let resolveApiFetch: (value: unknown) => void
    mockApiFetch.mockReturnValueOnce(new Promise((resolve) => { resolveApiFetch = resolve }))

    const { result } = renderHook(() => useAccountDeletion())

    // Start deletion but don't await
    let deletePromise: Promise<void>
    act(() => {
      deletePromise = result.current.deleteAccount()
    })

    expect(result.current.state.status).toBe('deleting')

    // Resolve the API call
    await act(async () => {
      resolveApiFetch!({ message: 'Account deleted successfully' })
      await deletePromise!
    })
  })
})
