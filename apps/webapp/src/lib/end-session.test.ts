import { describe, it, expect, afterEach, vi } from 'vitest'
import { endSession } from './end-session'

vi.mock('./api-fetch', () => ({
  apiFetch: vi.fn(),
}))

import { apiFetch } from './api-fetch'

const mockApiFetch = vi.mocked(apiFetch)

afterEach(() => {
  vi.restoreAllMocks()
  mockApiFetch.mockClear()
})

describe('endSession', () => {
  it('should call correct endpoint with sessionId', () => {
    mockApiFetch.mockResolvedValue(undefined)

    endSession('sess-123')

    expect(mockApiFetch).toHaveBeenCalledWith('/api/progress/sessions/end', {
      method: 'POST',
      body: JSON.stringify({ sessionId: 'sess-123' }),
      keepalive: true,
    })
  })

  it('should use keepalive: true', () => {
    mockApiFetch.mockResolvedValue(undefined)

    endSession('sess-456')

    expect(mockApiFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ keepalive: true }),
    )
  })

  it('should be no-op when sessionId is null', () => {
    endSession(null)

    expect(mockApiFetch).not.toHaveBeenCalled()
  })

  it('should catch errors silently', async () => {
    mockApiFetch.mockRejectedValue(new Error('Network error'))

    // Should not throw
    endSession('sess-789')

    // Wait for the promise to settle
    await new Promise((resolve) => setTimeout(resolve, 10))

    // If we get here without an unhandled rejection, the test passes
    expect(mockApiFetch).toHaveBeenCalled()
  })
})
