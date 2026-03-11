import { renderHook, act } from '@testing-library/react'
import { afterAll, afterEach, describe, it, expect, vi } from 'vitest'

vi.useFakeTimers()

import { useBenchmarkProgress } from './use-benchmark-progress'

afterEach(() => {
  vi.restoreAllMocks()
})

afterAll(() => {
  vi.useRealTimers()
})

describe('useBenchmarkProgress', () => {
  it('should return idle when isActive is false', () => {
    const { result } = renderHook(() => useBenchmarkProgress(false))

    expect(result.current.state).toBe('idle')
    expect(result.current.elapsedSeconds).toBe(0)
  })

  it('should transition through states at correct thresholds', () => {
    const { result } = renderHook(() => useBenchmarkProgress(true))

    // 0-2s: running
    expect(result.current.state).toBe('running')
    expect(result.current.elapsedSeconds).toBe(0)

    // At 1s: still running
    act(() => { vi.advanceTimersByTime(1000) })
    expect(result.current.state).toBe('running')
    expect(result.current.elapsedSeconds).toBe(1)

    // At 2s: elapsed
    act(() => { vi.advanceTimersByTime(1000) })
    expect(result.current.state).toBe('elapsed')
    expect(result.current.elapsedSeconds).toBe(2)

    // At 5s: context
    act(() => { vi.advanceTimersByTime(3000) })
    expect(result.current.state).toBe('context')
    expect(result.current.elapsedSeconds).toBe(5)

    // At 10s: extended
    act(() => { vi.advanceTimersByTime(5000) })
    expect(result.current.state).toBe('extended')
    expect(result.current.elapsedSeconds).toBe(10)

    // At 60s: timeout
    act(() => { vi.advanceTimersByTime(50000) })
    expect(result.current.state).toBe('timeout')
    expect(result.current.elapsedSeconds).toBe(60)
  })

  it('should reset elapsed time when isActive toggles false then true', () => {
    const { result, rerender } = renderHook(
      ({ isActive }: { isActive: boolean }) => useBenchmarkProgress(isActive),
      { initialProps: { isActive: true } },
    )

    act(() => { vi.advanceTimersByTime(5000) })
    expect(result.current.elapsedSeconds).toBe(5)

    // Toggle off
    rerender({ isActive: false })
    expect(result.current.state).toBe('idle')
    expect(result.current.elapsedSeconds).toBe(0)

    // Toggle back on
    rerender({ isActive: true })
    expect(result.current.state).toBe('running')
    expect(result.current.elapsedSeconds).toBe(0)
  })

  it('should stop at timeout state and not advance further', () => {
    const { result } = renderHook(() => useBenchmarkProgress(true))

    // Advance to timeout
    act(() => { vi.advanceTimersByTime(60000) })
    expect(result.current.state).toBe('timeout')
    expect(result.current.elapsedSeconds).toBe(60)

    // Advance more — should stay at timeout
    act(() => { vi.advanceTimersByTime(5000) })
    expect(result.current.state).toBe('timeout')
    expect(result.current.elapsedSeconds).toBe(60)
  })
})
