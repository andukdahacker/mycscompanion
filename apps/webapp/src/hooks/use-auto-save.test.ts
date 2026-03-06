import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { renderHook, act, cleanup } from '@testing-library/react'
import { QueryClientProvider } from '@tanstack/react-query'
import { createTestQueryClient } from '@mycscompanion/config/test-utils/query-client'
import { useAutoSave, AUTO_SAVE_DEBOUNCE_MS } from './use-auto-save'
import { createElement } from 'react'

vi.mock('../lib/api-fetch', () => ({
  apiFetch: vi.fn().mockResolvedValue({ snapshotId: 'snap-1' }),
}))

vi.mock('../lib/firebase', () => ({
  auth: {
    currentUser: {
      getIdToken: vi.fn().mockResolvedValue('test-token'),
    },
  },
}))

import { apiFetch } from '../lib/api-fetch'

const mockApiFetch = vi.mocked(apiFetch)

function createWrapper() {
  const queryClient = createTestQueryClient()
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return createElement(QueryClientProvider, { client: queryClient }, children)
  }
}

describe('useAutoSave', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    mockApiFetch.mockClear()
    mockApiFetch.mockResolvedValue({ snapshotId: 'snap-1' })
  })

  afterEach(() => {
    cleanup()
    vi.runOnlyPendingTimers()
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('should debounce saves to 30 seconds', async () => {
    const { result } = renderHook(
      () => useAutoSave({ milestoneId: 'ms-1', enabled: true }),
      { wrapper: createWrapper() }
    )

    act(() => {
      result.current.scheduleAutoSave('code v1')
    })

    expect(mockApiFetch).not.toHaveBeenCalled()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(AUTO_SAVE_DEBOUNCE_MS)
    })

    expect(mockApiFetch).toHaveBeenCalledWith('/api/progress/save', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ milestoneId: 'ms-1', code: 'code v1' }),
    }))
  })

  it('should only trigger one save after rapid content changes', async () => {
    const { result } = renderHook(
      () => useAutoSave({ milestoneId: 'ms-1', enabled: true }),
      { wrapper: createWrapper() }
    )

    // Schedule v1, then wait less than debounce, reschedule v2, reschedule v3
    act(() => { result.current.scheduleAutoSave('code v1') })
    act(() => { result.current.scheduleAutoSave('code v2') })
    act(() => { result.current.scheduleAutoSave('code v3') })

    expect(mockApiFetch).not.toHaveBeenCalled()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(AUTO_SAVE_DEBOUNCE_MS)
    })

    expect(mockApiFetch).toHaveBeenCalledTimes(1)
    expect(mockApiFetch).toHaveBeenCalledWith('/api/progress/save', expect.objectContaining({
      body: JSON.stringify({ milestoneId: 'ms-1', code: 'code v3' }),
    }))
  })

  it('should save immediately without waiting for debounce', async () => {
    const { result } = renderHook(
      () => useAutoSave({ milestoneId: 'ms-1', enabled: true }),
      { wrapper: createWrapper() }
    )

    await act(async () => {
      result.current.saveImmediately('immediate code')
    })

    expect(mockApiFetch).toHaveBeenCalledWith('/api/progress/save', expect.objectContaining({
      body: JSON.stringify({ milestoneId: 'ms-1', code: 'immediate code' }),
    }))
  })

  it('should not save when code has not changed from last save', async () => {
    const { result } = renderHook(
      () => useAutoSave({ milestoneId: 'ms-1', enabled: true }),
      { wrapper: createWrapper() }
    )

    // First save
    await act(async () => {
      result.current.saveImmediately('same code')
    })

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10)
    })

    mockApiFetch.mockClear()

    // Second save with same code — should be skipped
    await act(async () => {
      result.current.saveImmediately('same code')
    })

    expect(mockApiFetch).not.toHaveBeenCalled()
  })

  it('should retry on failure with exponential backoff', async () => {
    mockApiFetch
      .mockRejectedValueOnce(new Error('Network error'))
      .mockResolvedValue({ snapshotId: 'snap-2' })

    const { result } = renderHook(
      () => useAutoSave({ milestoneId: 'ms-1', enabled: true }),
      { wrapper: createWrapper() }
    )

    await act(async () => {
      result.current.saveImmediately('retry code')
    })

    await act(async () => {
      await vi.advanceTimersByTimeAsync(100)
    })

    // First retry at 1s
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000)
    })

    expect(mockApiFetch).toHaveBeenCalledTimes(2)
  })

  it('should stop retrying after MAX_RETRIES', async () => {
    mockApiFetch.mockRejectedValue(new Error('Network error'))

    const { result } = renderHook(
      () => useAutoSave({ milestoneId: 'ms-1', enabled: true }),
      { wrapper: createWrapper() }
    )

    await act(async () => {
      result.current.saveImmediately('fail code')
    })

    // Advance through all retries: 1s + 2s + 4s = 7s
    for (let i = 0; i < 10; i++) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1000)
      })
    }

    // 1 initial + 3 retries = 4 total
    expect(mockApiFetch.mock.calls.length).toBeLessThanOrEqual(4)
  })

  it('should cleanup timer on unmount', async () => {
    const { result, unmount } = renderHook(
      () => useAutoSave({ milestoneId: 'ms-1', enabled: true }),
      { wrapper: createWrapper() }
    )

    act(() => {
      result.current.scheduleAutoSave('unmount code')
    })

    unmount()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(AUTO_SAVE_DEBOUNCE_MS)
    })

    expect(mockApiFetch).not.toHaveBeenCalled()
  })

  it('should do nothing when enabled is false', async () => {
    const { result } = renderHook(
      () => useAutoSave({ milestoneId: 'ms-1', enabled: false }),
      { wrapper: createWrapper() }
    )

    act(() => {
      result.current.scheduleAutoSave('disabled code')
    })

    await act(async () => {
      await vi.advanceTimersByTimeAsync(AUTO_SAVE_DEBOUNCE_MS)
    })

    expect(mockApiFetch).not.toHaveBeenCalled()

    await act(async () => {
      result.current.saveImmediately('disabled immediate')
    })

    expect(mockApiFetch).not.toHaveBeenCalled()
  })
})
