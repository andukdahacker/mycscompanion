import { auth } from './firebase'

const API_URL = import.meta.env['VITE_API_URL'] ?? 'http://localhost:3001'

class ApiError extends Error {
  readonly status: number
  readonly code: string

  constructor(status: number, code: string, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
  }
}

/** Extract error code and message from an unknown response body via type narrowing */
function parseErrorBody(body: unknown): { code: string; message: string } {
  if (typeof body === 'object' && body !== null && 'error' in body) {
    const error: unknown = body.error
    if (typeof error === 'object' && error !== null && 'code' in error && 'message' in error) {
      return {
        code: typeof error.code === 'string' ? error.code : 'UNKNOWN',
        message: typeof error.message === 'string' ? error.message : 'Request failed',
      }
    }
  }
  return { code: 'UNKNOWN', message: 'Request failed' }
}

async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const user = auth.currentUser
  if (!user) {
    window.location.href = '/sign-in'
    throw new ApiError(401, 'UNAUTHORIZED', 'Not authenticated')
  }

  let token = await user.getIdToken()

  const doFetch = async (bearerToken: string): Promise<Response> => {
    return fetch(`${API_URL}${path}`, {
      ...options,
      headers: {
        ...(options.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        Authorization: `Bearer ${bearerToken}`,
        ...options.headers,
      },
    })
  }

  let response = await doFetch(token)

  // 401 → force token refresh → retry once → redirect to /sign-in
  if (response.status === 401) {
    try {
      token = await user.getIdToken(true) // force refresh
      response = await doFetch(token)
    } catch {
      window.location.href = '/sign-in'
      throw new ApiError(401, 'UNAUTHORIZED', 'Session expired')
    }

    if (response.status === 401) {
      window.location.href = '/sign-in'
      throw new ApiError(401, 'UNAUTHORIZED', 'Session expired')
    }
  }

  if (!response.ok) {
    const body: unknown = await response.json().catch(() => ({}))
    const { code, message } = parseErrorBody(body)
    throw new ApiError(response.status, code, message)
  }

  // Note: response.json() returns Promise<any> — this is the one unavoidable
  // assertion at the fetch boundary. Runtime validation happens in TanStack Query schemas.
  return response.json() as Promise<T>
}

export { apiFetch, ApiError, API_URL }
