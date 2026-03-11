import { useEffect, useRef } from 'react'
import { auth } from '../lib/firebase'
import { API_URL } from '../lib/api-fetch'
import { useWorkspaceUIStore } from '../stores/workspace-ui-store'

const PROBE_INTERVAL_MS = 30_000

function useTutorRecovery(tutorAvailable: boolean): void {
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (tutorAvailable) {
      // Clear probe when tutor is available
      if (intervalRef.current !== null) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
      return
    }

    // Start probing when tutor is unavailable
    const probe = async (): Promise<void> => {
      try {
        const user = auth.currentUser
        if (!user) return

        const token = await user.getIdToken()
        const response = await fetch(`${API_URL}/api/tutor/health`, {
          headers: { Authorization: `Bearer ${token}` },
        })

        if (!response.ok) return

        const data: unknown = await response.json()
        if (typeof data === 'object' && data !== null && 'available' in data && (data as { available: boolean }).available) {
          useWorkspaceUIStore.getState().setTutorAvailable(true)
        }
      } catch {
        // Silently ignore probe failures
      }
    }

    // Immediate first probe, then interval
    probe()
    intervalRef.current = setInterval(probe, PROBE_INTERVAL_MS)

    return () => {
      if (intervalRef.current !== null) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }
  }, [tutorAvailable])
}

export { useTutorRecovery }
