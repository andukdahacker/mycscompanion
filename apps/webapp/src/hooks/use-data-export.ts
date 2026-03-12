import { useState, useCallback, useRef, useEffect } from 'react'
import { apiFetch, API_URL } from '../lib/api-fetch'
import { auth } from '../lib/firebase'
import type { DataExportResponse, DataExportStatusResponse } from '@mycscompanion/shared'

type ExportState = {
  readonly status: 'idle' | 'processing' | 'completed' | 'failed'
  readonly error: string | null
}

const MAX_POLL_DURATION_MS = 120_000 // 2 minutes

function useDataExport() {
  const [state, setState] = useState<ExportState>({ status: 'idle', error: null })
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const pollStartRef = useRef<number>(0)

  const stopPolling = useCallback(() => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current)
      pollIntervalRef.current = null
    }
  }, [])

  // Cleanup on unmount
  useEffect(() => stopPolling, [stopPolling])

  const startPolling = useCallback(() => {
    stopPolling() // Clear any existing interval to prevent leaks
    pollStartRef.current = Date.now()
    pollIntervalRef.current = setInterval(async () => {
      if (Date.now() - pollStartRef.current > MAX_POLL_DURATION_MS) {
        stopPolling()
        setState({ status: 'failed', error: 'Export is taking too long. Please try again later.' })
        return
      }
      try {
        const status = await apiFetch<DataExportStatusResponse>('/api/account/export/status')
        if (status.status === 'completed') {
          stopPolling()
          setState({ status: 'completed', error: null })
        } else if (status.status === 'failed') {
          stopPolling()
          setState({ status: 'failed', error: 'Export failed. Please try again.' })
        }
      } catch {
        stopPolling()
        setState({ status: 'failed', error: 'Failed to check export status.' })
      }
    }, 2000)
  }, [stopPolling])

  // Check for existing export on mount
  useEffect(() => {
    async function checkExistingExport() {
      try {
        const status = await apiFetch<DataExportStatusResponse>('/api/account/export/status')
        if (status.status === 'completed') {
          setState({ status: 'completed', error: null })
        } else if (status.status === 'processing') {
          setState({ status: 'processing', error: null })
          startPolling()
        }
      } catch {
        // No existing export — stay idle
      }
    }
    void checkExistingExport()
  }, [startPolling])

  const triggerExport = useCallback(async () => {
    setState({ status: 'processing', error: null })
    try {
      await apiFetch<DataExportResponse>('/api/account/export', { method: 'POST' })
      startPolling()
    } catch {
      setState({ status: 'failed', error: 'Failed to start export.' })
    }
  }, [startPolling])

  const downloadExport = useCallback(async () => {
    try {
      const user = auth.currentUser
      if (!user) throw new Error('Not authenticated')
      const token = await user.getIdToken()
      const response = await fetch(`${API_URL}/api/account/export/download`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!response.ok) throw new Error('Download failed')
      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `mycscompanion-export-${new Date().toISOString().split('T')[0]}.json`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch {
      setState({ status: 'failed', error: 'Failed to download export.' })
    }
  }, [])

  return { state, triggerExport, downloadExport }
}

export { useDataExport }
