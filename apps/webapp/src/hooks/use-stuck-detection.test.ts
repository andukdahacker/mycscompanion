import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useStuckDetection } from './use-stuck-detection'

describe('useStuckDetection', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('should start with both stages inactive', () => {
    const { result } = renderHook(() =>
      useStuckDetection({ thresholdMinutes: 10, stage2OffsetSeconds: 60 }),
    )

    expect(result.current.isStage1).toBe(false)
    expect(result.current.isStage2).toBe(false)
    expect(result.current.stage1Timestamp).toBeNull()
    expect(result.current.stage2Timestamp).toBeNull()
  })

  it('should trigger stage 1 after threshold minutes', () => {
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))
    const { result } = renderHook(() =>
      useStuckDetection({ thresholdMinutes: 10, stage2OffsetSeconds: 60 }),
    )

    act(() => {
      vi.advanceTimersByTime(10 * 60 * 1000)
    })

    expect(result.current.isStage1).toBe(true)
    expect(result.current.stage1Timestamp).not.toBeNull()
    expect(result.current.isStage2).toBe(false)
  })

  it('should trigger stage 2 at threshold + 60 seconds (NOT threshold x 1.5)', () => {
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))
    const { result } = renderHook(() =>
      useStuckDetection({ thresholdMinutes: 10, stage2OffsetSeconds: 60 }),
    )

    // Stage 1 at 10 min
    act(() => {
      vi.advanceTimersByTime(10 * 60 * 1000)
    })
    expect(result.current.isStage1).toBe(true)
    expect(result.current.isStage2).toBe(false)

    // Stage 2 at threshold + 60s
    act(() => {
      vi.advanceTimersByTime(60 * 1000)
    })
    expect(result.current.isStage2).toBe(true)
    expect(result.current.stage2Timestamp).not.toBeNull()
  })

  it('should reset timer on resetTimer() call', () => {
    const { result } = renderHook(() =>
      useStuckDetection({ thresholdMinutes: 10, stage2OffsetSeconds: 60 }),
    )

    // Advance 9 minutes (just before threshold)
    act(() => {
      vi.advanceTimersByTime(9 * 60 * 1000)
    })
    expect(result.current.isStage1).toBe(false)

    // Reset
    act(() => {
      result.current.resetTimer()
    })

    // Advance another 9 minutes (would have triggered at 10 if not reset)
    act(() => {
      vi.advanceTimersByTime(9 * 60 * 1000)
    })
    expect(result.current.isStage1).toBe(false)

    // 10 minutes from reset triggers stage 1
    act(() => {
      vi.advanceTimersByTime(1 * 60 * 1000)
    })
    expect(result.current.isStage1).toBe(true)
  })

  it('should reset timer and clear stages when resetTimer is called after stage 1', () => {
    const { result } = renderHook(() =>
      useStuckDetection({ thresholdMinutes: 10, stage2OffsetSeconds: 60 }),
    )

    act(() => {
      vi.advanceTimersByTime(10 * 60 * 1000)
    })
    expect(result.current.isStage1).toBe(true)

    act(() => {
      result.current.resetTimer()
    })

    expect(result.current.isStage1).toBe(false)
    expect(result.current.isStage2).toBe(false)
    expect(result.current.stage1Timestamp).toBeNull()
    expect(result.current.stage2Timestamp).toBeNull()
  })

  it('should work with different threshold values (M3 = 7 min)', () => {
    const { result } = renderHook(() =>
      useStuckDetection({ thresholdMinutes: 7, stage2OffsetSeconds: 60 }),
    )

    act(() => {
      vi.advanceTimersByTime(7 * 60 * 1000)
    })
    expect(result.current.isStage1).toBe(true)

    act(() => {
      vi.advanceTimersByTime(60 * 1000)
    })
    expect(result.current.isStage2).toBe(true)
  })

  it('should not trigger stages before threshold', () => {
    const { result } = renderHook(() =>
      useStuckDetection({ thresholdMinutes: 10, stage2OffsetSeconds: 60 }),
    )

    act(() => {
      vi.advanceTimersByTime(9 * 60 * 1000 + 59 * 1000)
    })

    expect(result.current.isStage1).toBe(false)
    expect(result.current.isStage2).toBe(false)
  })

  it('should clean up interval on unmount', () => {
    const { unmount } = renderHook(() =>
      useStuckDetection({ thresholdMinutes: 10, stage2OffsetSeconds: 60 }),
    )

    const clearIntervalSpy = vi.spyOn(globalThis, 'clearInterval')
    unmount()
    expect(clearIntervalSpy).toHaveBeenCalled()
  })

  it('should expose resetTimer as a stable callback callable externally', () => {
    const { result, rerender } = renderHook(() =>
      useStuckDetection({ thresholdMinutes: 10, stage2OffsetSeconds: 60 }),
    )

    const firstResetTimer = result.current.resetTimer
    rerender()
    expect(result.current.resetTimer).toBe(firstResetTimer)
  })
})
