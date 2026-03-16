import { describe, it, expect, vi, afterAll, afterEach, beforeEach } from 'vitest'

// Mock firebase module
const mockGetIdToken = vi.fn()
const mockCurrentUser = { getIdToken: mockGetIdToken }

vi.mock('./firebase', () => ({
  auth: { currentUser: mockCurrentUser },
}))

// Import after mock
const { apiFetch, ApiError } = await import('./api-fetch')

// Mock global fetch
const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

const mockHeaders = { get: () => null }

// Mock window.location — save original for cleanup
const originalLocationDescriptor = Object.getOwnPropertyDescriptor(window, 'location')
const mockLocation = { href: '' }
Object.defineProperty(window, 'location', {
  value: mockLocation,
  writable: true,
  configurable: true,
})

describe('apiFetch', () => {
  beforeEach(() => {
    mockFetch.mockReset()
    mockGetIdToken.mockReset()
    mockGetIdToken.mockResolvedValue('test-token')
    mockLocation.href = ''
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  afterAll(() => {
    if (originalLocationDescriptor) {
      Object.defineProperty(window, 'location', originalLocationDescriptor)
    }
  })

  it('should attach Bearer token to requests', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ data: 'test' }),
    })

    await apiFetch('/api/test')

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/test'),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer test-token',
        }),
      }),
    )
  })

  it('should retry with fresh token on 401 response', async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: false, status: 401, headers: mockHeaders, json: async () => ({ error: { code: 'UNAUTHORIZED', message: 'expired' } }) })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ data: 'success' }) })
    mockGetIdToken
      .mockResolvedValueOnce('old-token')
      .mockResolvedValueOnce('fresh-token')

    const result = await apiFetch<{ data: string }>('/api/test')

    expect(result).toEqual({ data: 'success' })
    expect(mockGetIdToken).toHaveBeenCalledWith(true) // force refresh
    expect(mockFetch).toHaveBeenCalledTimes(2)
  })

  it('should redirect to /sign-in on persistent 401', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 401,
      headers: mockHeaders,
      json: async () => ({ error: { code: 'UNAUTHORIZED', message: 'invalid' } }),
    })
    mockGetIdToken
      .mockResolvedValueOnce('old-token')
      .mockResolvedValueOnce('still-bad-token')

    await expect(apiFetch('/api/test')).rejects.toThrow(ApiError)
    expect(mockLocation.href).toBe('/sign-in')
  })

  it('should redirect to /sign-in when no current user', async () => {
    // Temporarily set currentUser to null
    const originalUser = (await import('./firebase')).auth.currentUser
    Object.defineProperty((await import('./firebase')).auth, 'currentUser', { value: null, writable: true })

    await expect(apiFetch('/api/test')).rejects.toThrow('Not authenticated')
    expect(mockLocation.href).toBe('/sign-in')

    // Restore
    Object.defineProperty((await import('./firebase')).auth, 'currentUser', { value: originalUser, writable: true })
  })

  it('should throw ApiError with correct properties on non-OK responses', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 422,
      headers: mockHeaders,
      json: async () => ({ error: { code: 'VALIDATION_ERROR', message: 'Invalid input' } }),
    })

    try {
      await apiFetch('/api/test')
      expect.fail('Should have thrown')
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError)
      if (!(err instanceof ApiError)) throw err
      expect(err.status).toBe(422)
      expect(err.code).toBe('VALIDATION_ERROR')
      expect(err.message).toBe('Invalid input')
    }
  })

  it('should handle non-JSON error responses gracefully', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      headers: mockHeaders,
      json: async () => { throw new Error('not json') },
    })

    try {
      await apiFetch('/api/test')
      expect.fail('Should have thrown')
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError)
      if (!(err instanceof ApiError)) throw err
      expect(err.status).toBe(500)
      expect(err.code).toBe('UNKNOWN')
      expect(err.message).toBe('Request failed')
    }
  })
})
