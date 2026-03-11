import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useTutorRecovery } from './use-tutor-recovery'

// Mock firebase auth
vi.mock('../lib/firebase', () => ({
  auth: {
    currentUser: {
      getIdToken: vi.fn().mockResolvedValue('test-token'),
    },
  },
}))

// Mock api-fetch
vi.mock('../lib/api-fetch', () => ({
  API_URL: 'http://localhost:3001',
}))

// Mock workspace store
const mockSetTutorAvailable = vi.fn()
vi.mock('../stores/workspace-ui-store', () => ({
  useWorkspaceUIStore: Object.assign(
    () => ({}),
    {
      getState: () => ({ setTutorAvailable: mockSetTutorAvailable }),
    },
  ),
}))

describe('useTutorRecovery', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    vi.useFakeTimers()
    fetchSpy = vi.spyOn(globalThis, 'fetch')
    mockSetTutorAvailable.mockClear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it('should not poll when tutorAvailable is true', () => {
    renderHook(() => useTutorRecovery(true))

    vi.advanceTimersByTime(60_000)

    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('should probe immediately and then poll when tutorAvailable is false', async () => {
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify({ available: false, circuitState: 'OPEN' }), { status: 200 })
    )

    renderHook(() => useTutorRecovery(false))

    // Immediate probe fires without advancing timers
    await vi.advanceTimersByTimeAsync(0)
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    expect(fetchSpy).toHaveBeenCalledWith(
      'http://localhost:3001/api/tutor/health',
      expect.objectContaining({
        headers: { Authorization: 'Bearer test-token' },
      }),
    )

    // Second probe fires after interval
    await vi.advanceTimersByTimeAsync(30_000)
    expect(fetchSpy).toHaveBeenCalledTimes(2)
  })

  it('should set tutorAvailable to true on successful health check', async () => {
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify({ available: true, circuitState: 'CLOSED' }), { status: 200 })
    )

    renderHook(() => useTutorRecovery(false))

    // Immediate probe
    await vi.advanceTimersByTimeAsync(0)

    expect(mockSetTutorAvailable).toHaveBeenCalledWith(true)
  })

  it('should stop polling when tutorAvailable becomes true', async () => {
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify({ available: false }), { status: 200 })
    )

    const { rerender } = renderHook(
      ({ available }: { available: boolean }) => useTutorRecovery(available),
      { initialProps: { available: false } },
    )

    // Immediate probe + first interval poll
    await vi.advanceTimersByTimeAsync(30_000)
    expect(fetchSpy).toHaveBeenCalledTimes(2) // immediate + 1 interval

    // Simulate recovery
    rerender({ available: true })

    fetchSpy.mockClear()

    // No more polls
    await vi.advanceTimersByTimeAsync(60_000)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('should clean up interval on unmount', async () => {
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify({ available: false }), { status: 200 })
    )

    const { unmount } = renderHook(() => useTutorRecovery(false))

    // Let immediate probe fire
    await vi.advanceTimersByTimeAsync(0)

    unmount()
    fetchSpy.mockClear()

    // No more polls after unmount
    await vi.advanceTimersByTimeAsync(60_000)
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})
