import { useCallback, useEffect, useRef } from 'react'
import { useMutation } from '@tanstack/react-query'
import { apiFetch } from '../lib/api-fetch'
import { useEditorStore } from '../stores/editor-store'

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
  const lastSavedHashRef = useRef<string | null>(null)
  const retryCountRef = useRef(0)

  const mutation = useMutation({
    mutationFn: (payload: { code?: string; files?: Record<string, string> }) =>
      apiFetch<{ snapshotId: string }>('/api/progress/save', {
        method: 'POST',
        body: JSON.stringify({ milestoneId, ...payload }),
        keepalive: true,
      }),
    onSuccess: (_data, payload) => {
      lastSavedHashRef.current = payload.files
        ? JSON.stringify(payload.files)
        : (payload.code ?? null)
      retryCountRef.current = 0
    },
    onError: (_error, payload) => {
      if (retryCountRef.current < MAX_RETRIES) {
        retryCountRef.current += 1
        const delay = RETRY_BASE_DELAY_MS * Math.pow(2, retryCountRef.current - 1)
        retryTimerRef.current = setTimeout(() => {
          mutation.mutate(payload)
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
        const storeState = useEditorStore.getState()
        const isMultiFileNow = storeState.editableFiles.length > 0
        if (isMultiFileNow) {
          const editableSnapshot = storeState.getEditableFilesSnapshot()
          const hash = JSON.stringify(editableSnapshot)
          if (hash !== lastSavedHashRef.current) {
            retryCountRef.current = 0
            mutation.mutate({ files: editableSnapshot })
          }
        } else {
          if (code !== lastSavedHashRef.current) {
            retryCountRef.current = 0
            mutation.mutate({ code })
          }
        }
      }, AUTO_SAVE_DEBOUNCE_MS)
    },
    [enabled, milestoneId],
  )

  const saveImmediately = useCallback(
    (code: string) => {
      if (!enabled) return
      if (timerRef.current) {
        clearTimeout(timerRef.current)
      }
      const storeState = useEditorStore.getState()
      const isMultiFileNow = storeState.editableFiles.length > 0
      if (isMultiFileNow) {
        const editableSnapshot = storeState.getEditableFilesSnapshot()
        const hash = JSON.stringify(editableSnapshot)
        if (hash !== lastSavedHashRef.current) {
          retryCountRef.current = 0
          mutation.mutate({ files: editableSnapshot })
        }
      } else {
        if (code !== lastSavedHashRef.current) {
          retryCountRef.current = 0
          mutation.mutate({ code })
        }
      }
    },
    [enabled, milestoneId],
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
