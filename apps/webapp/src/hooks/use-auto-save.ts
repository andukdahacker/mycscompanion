import { useCallback, useEffect, useRef } from 'react'
import { useMutation } from '@tanstack/react-query'
import { apiFetch } from '../lib/api-fetch'

interface UseAutoSaveOptions {
  readonly milestoneId: string
  readonly enabled: boolean
}

const AUTO_SAVE_DEBOUNCE_MS = 30_000 // 30 seconds
const MAX_RETRIES = 3
const RETRY_BASE_DELAY_MS = 1_000

function useAutoSave({ milestoneId, enabled }: UseAutoSaveOptions) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastSavedCodeRef = useRef<string | null>(null)
  const retryCountRef = useRef(0)

  const mutation = useMutation({
    mutationFn: (code: string) =>
      apiFetch<{ snapshotId: string }>('/api/progress/save', {
        method: 'POST',
        body: JSON.stringify({ milestoneId, code }),
        keepalive: true,
      }),
    onSuccess: (_data, code) => {
      lastSavedCodeRef.current = code
      retryCountRef.current = 0
    },
    onError: (_error, code) => {
      if (retryCountRef.current < MAX_RETRIES) {
        retryCountRef.current += 1
        const delay = RETRY_BASE_DELAY_MS * Math.pow(2, retryCountRef.current - 1)
        retryTimerRef.current = setTimeout(() => {
          mutation.mutate(code)
        }, delay)
      }
    },
  })

  const scheduleAutoSave = useCallback(
    (code: string) => {
      if (!enabled) return

      if (timerRef.current) {
        clearTimeout(timerRef.current)
      }

      timerRef.current = setTimeout(() => {
        if (code !== lastSavedCodeRef.current) {
          retryCountRef.current = 0
          mutation.mutate(code)
        }
      }, AUTO_SAVE_DEBOUNCE_MS)
    },
    [enabled, milestoneId] // eslint-disable-line react-hooks/exhaustive-deps
  )

  const saveImmediately = useCallback(
    (code: string) => {
      if (!enabled) return
      if (timerRef.current) {
        clearTimeout(timerRef.current)
      }
      if (code !== lastSavedCodeRef.current) {
        retryCountRef.current = 0
        mutation.mutate(code)
      }
    },
    [enabled, milestoneId] // eslint-disable-line react-hooks/exhaustive-deps
  )

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current)
      }
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current)
      }
    }
  }, [])

  return { scheduleAutoSave, saveImmediately }
}

export { useAutoSave, AUTO_SAVE_DEBOUNCE_MS }
