import { apiFetch } from './api-fetch'

/**
 * Sends a session-end signal to the backend. Fire-and-forget.
 * Uses keepalive: true for beforeunload reliability.
 * Errors are swallowed — server heartbeat timeout is the fallback.
 */
function endSession(sessionId: string | null): void {
  if (!sessionId) return

  void (async () => {
    try {
      await apiFetch('/api/progress/sessions/end', {
        method: 'POST',
        body: JSON.stringify({ sessionId }),
        keepalive: true,
      })
    } catch {
      // Best-effort — server heartbeat timeout is the fallback
    }
  })()
}

export { endSession }
