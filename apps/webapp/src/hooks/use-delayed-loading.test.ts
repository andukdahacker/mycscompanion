import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { renderHook, act, cleanup } from '@testing-library/react'
import { useDelayedLoading } from './use-delayed-loading'

describe('useDelayedLoading', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it('should return false initially when loading is true', () => {
    const { result } = renderHook(() => useDelayedLoading(true))

    expect(result.current).toBe(false)
  })

  it('should return true after 500ms delay when loading stays true', () => {
    const { result } = renderHook(() => useDelayedLoading(true))

    act(() => {
      vi.advanceTimersByTime(500)
    })

    expect(result.current).toBe(true)
  })

  it('should not show loading if loading becomes false before delay', () => {
    const { result, rerender } = renderHook(
      ({ isLoading }) => useDelayedLoading(isLoading),
      { initialProps: { isLoading: true } }
    )

    act(() => {
      vi.advanceTimersByTime(300)
    })

    expect(result.current).toBe(false)

    rerender({ isLoading: false })

    act(() => {
      vi.advanceTimersByTime(500)
    })

    expect(result.current).toBe(false)
  })

  it('should return false when loading is false', () => {
    const { result } = renderHook(() => useDelayedLoading(false))

    expect(result.current).toBe(false)
  })

  it('should support custom delay value', () => {
    const { result } = renderHook(() => useDelayedLoading(true, 1000))

    act(() => {
      vi.advanceTimersByTime(500)
    })

    expect(result.current).toBe(false)

    act(() => {
      vi.advanceTimersByTime(500)
    })

    expect(result.current).toBe(true)
  })

  it('should clean up timer on unmount', () => {
    const { unmount } = renderHook(() => useDelayedLoading(true))

    unmount()

    // Should not throw after unmount
    act(() => {
      vi.advanceTimersByTime(500)
    })
  })
})
