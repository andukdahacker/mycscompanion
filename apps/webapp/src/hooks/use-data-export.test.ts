import { renderHook, act } from '@testing-library/react'
import { afterEach, describe, it, expect, vi, beforeEach } from 'vitest'

const mockApiFetch = vi.fn()
vi.mock('../lib/api-fetch', () => ({
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
  API_URL: 'http://localhost:3001',
}))

const mockGetIdToken = vi.fn().mockResolvedValue('mock-token')
vi.mock('../lib/firebase', () => ({
  auth: {
    currentUser: {
      getIdToken: () => mockGetIdToken(),
    },
  },
}))

import { useDataExport } from './use-data-export'

beforeEach(() => {
  vi.useFakeTimers()
  // Default: no existing export on mount
  mockApiFetch.mockResolvedValue({ status: 'none', exportId: null, createdAt: null, completedAt: null })
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('useDataExport', () => {
  it('should start in idle state after mount check finds no export', async () => {
    const { result } = renderHook(() => useDataExport())

    await act(async () => {
      await vi.runAllTimersAsync()
    })

    expect(result.current.state.status).toBe('idle')
  })

  it('should POST to /api/account/export and start polling on triggerExport', async () => {
    mockApiFetch
      .mockResolvedValueOnce({ status: 'none' }) // mount check
      .mockResolvedValueOnce({ exportId: 'exp-1', status: 'processing' }) // POST trigger
      .mockResolvedValueOnce({ status: 'processing', exportId: 'exp-1' }) // first poll
      .mockResolvedValueOnce({ status: 'completed', exportId: 'exp-1' }) // second poll

    const { result } = renderHook(() => useDataExport())

    await act(async () => {
      await vi.runAllTimersAsync()
    })

    await act(async () => {
      await result.current.triggerExport()
    })

    expect(result.current.state.status).toBe('processing')
    expect(mockApiFetch).toHaveBeenCalledWith('/api/account/export', { method: 'POST' })

    // Advance to first poll
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000)
    })

    // Advance to second poll — completed
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000)
    })

    expect(result.current.state.status).toBe('completed')
  })

  it('should update state to completed when status response shows completed', async () => {
    mockApiFetch
      .mockResolvedValueOnce({ status: 'none' }) // mount check
      .mockResolvedValueOnce({ exportId: 'exp-1', status: 'processing' }) // POST
      .mockResolvedValueOnce({ status: 'completed', exportId: 'exp-1' }) // poll

    const { result } = renderHook(() => useDataExport())

    await act(async () => {
      await vi.runAllTimersAsync()
    })

    await act(async () => {
      await result.current.triggerExport()
    })

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000)
    })

    expect(result.current.state.status).toBe('completed')
  })

  it('should update state to failed on error', async () => {
    mockApiFetch
      .mockResolvedValueOnce({ status: 'none' }) // mount check
      .mockRejectedValueOnce(new Error('Network error')) // POST fails

    const { result } = renderHook(() => useDataExport())

    await act(async () => {
      await vi.runAllTimersAsync()
    })

    await act(async () => {
      await result.current.triggerExport()
    })

    expect(result.current.state.status).toBe('failed')
    expect(result.current.state.error).toBe('Failed to start export.')
  })

  it('should stop polling on unmount', async () => {
    mockApiFetch
      .mockResolvedValueOnce({ status: 'none' }) // mount check
      .mockResolvedValueOnce({ exportId: 'exp-1', status: 'processing' }) // POST
      .mockResolvedValue({ status: 'processing', exportId: 'exp-1' }) // polls

    const { result, unmount } = renderHook(() => useDataExport())

    await act(async () => {
      await vi.runAllTimersAsync()
    })

    await act(async () => {
      await result.current.triggerExport()
    })

    const callCountBefore = mockApiFetch.mock.calls.length

    unmount()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10000)
    })

    // No additional calls after unmount
    expect(mockApiFetch.mock.calls.length).toBe(callCountBefore)
  })

  it('should timeout polling after 2 minutes', async () => {
    mockApiFetch
      .mockResolvedValueOnce({ status: 'none' }) // mount check
      .mockResolvedValueOnce({ exportId: 'exp-1', status: 'processing' }) // POST
      .mockResolvedValue({ status: 'processing', exportId: 'exp-1' }) // all polls return processing

    const { result } = renderHook(() => useDataExport())

    await act(async () => {
      await vi.runAllTimersAsync()
    })

    await act(async () => {
      await result.current.triggerExport()
    })

    // Advance past the 2-minute timeout
    await act(async () => {
      await vi.advanceTimersByTimeAsync(122_000)
    })

    expect(result.current.state.status).toBe('failed')
    expect(result.current.state.error).toBe('Export is taking too long. Please try again later.')
  })

  it('should trigger file download via Blob on downloadExport', async () => {
    const mockBlob = new Blob(['{}'], { type: 'application/json' })
    const mockCreateObjectURL = vi.fn().mockReturnValue('blob:mock-url')
    const mockRevokeObjectURL = vi.fn()
    globalThis.URL.createObjectURL = mockCreateObjectURL
    globalThis.URL.revokeObjectURL = mockRevokeObjectURL

    const mockClick = vi.fn()
    const originalCreateElement = document.createElement.bind(document)
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      if (tag === 'a') {
        return {
          href: '',
          download: '',
          click: mockClick,
        } as unknown as HTMLAnchorElement
      }
      return originalCreateElement(tag)
    })
    const mockAppendChild = vi.spyOn(document.body, 'appendChild').mockImplementation((node) => node)
    const mockRemoveChild = vi.spyOn(document.body, 'removeChild').mockImplementation((node) => node)

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      blob: () => Promise.resolve(mockBlob),
    })

    mockApiFetch.mockResolvedValueOnce({ status: 'none' }) // mount check

    const { result } = renderHook(() => useDataExport())

    await act(async () => {
      await vi.runAllTimersAsync()
    })

    await act(async () => {
      await result.current.downloadExport()
    })

    expect(globalThis.fetch).toHaveBeenCalledWith(
      'http://localhost:3001/api/account/export/download',
      expect.objectContaining({
        headers: { Authorization: 'Bearer mock-token' },
      })
    )
    expect(mockCreateObjectURL).toHaveBeenCalledWith(mockBlob)
    expect(mockClick).toHaveBeenCalled()
    expect(mockRevokeObjectURL).toHaveBeenCalledWith('blob:mock-url')

    mockAppendChild.mockRestore()
    mockRemoveChild.mockRestore()
  })
})
