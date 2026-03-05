import { useEffect, useRef, useState, useCallback } from 'react'
import type { ExecutionEvent } from '@mycscompanion/execution'
import { auth } from '../lib/firebase'

type SSEStatus = 'idle' | 'connecting' | 'connected' | 'error' | 'closed'

interface UseSSEOptions {
  readonly url: string | null
  readonly onEvent?: (event: ExecutionEvent) => void
  readonly fetchFn?: typeof fetch
}

interface UseSSEResult {
  readonly status: SSEStatus
  readonly error: string | null
  readonly reconnectCount: number
}

const TERMINAL_EVENTS = new Set(['complete', 'error', 'timeout'])
const MAX_BACKOFF_MS = 30_000

function useSSE(options: UseSSEOptions): UseSSEResult {
  const { url, fetchFn = fetch } = options
  const [status, setStatus] = useState<SSEStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const [reconnectCount, setReconnectCount] = useState(0)

  const onEventRef = useRef(options.onEvent)
  onEventRef.current = options.onEvent

  const lastEventIdRef = useRef<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const backoffRef = useRef(1000)

  const connect = useCallback(async (
    targetUrl: string,
    doFetch: typeof fetch,
    signal: AbortSignal,
  ) => {
    setStatus('connecting')
    setError(null)

    try {
      const token = await auth.currentUser?.getIdToken()
      const headers: Record<string, string> = {
        Authorization: `Bearer ${token}`,
        Accept: 'text/event-stream',
      }
      if (lastEventIdRef.current) {
        headers['Last-Event-ID'] = lastEventIdRef.current
      }

      const response = await doFetch(targetUrl, { headers, signal })

      if (!response.ok || !response.body) {
        throw new Error(`SSE connection failed: ${response.status}`)
      }

      setStatus('connected')
      backoffRef.current = 1000

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      for (;;) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })

        // Split on double newline for event boundaries
        const parts = buffer.split('\n\n')
        buffer = parts.pop() ?? ''

        for (const part of parts) {
          if (!part.trim()) continue

          // Skip comment-only blocks (heartbeat)
          const lines = part.split('\n')
          const nonCommentLines = lines.filter((l) => !l.startsWith(':'))
          if (nonCommentLines.length === 0) continue

          const dataLines: Array<string> = []
          let eventId = ''
          for (const line of lines) {
            if (line.startsWith(':')) continue
            if (line.startsWith('data: ')) dataLines.push(line.slice(6))
            else if (line.startsWith('data:')) dataLines.push(line.slice(5))
            else if (line.startsWith('id: ')) eventId = line.slice(4)
            else if (line.startsWith('id:')) eventId = line.slice(3)
          }
          const eventData = dataLines.join('\n')

          if (eventId) lastEventIdRef.current = eventId

          if (eventData) {
            try {
              const parsed = JSON.parse(eventData) as ExecutionEvent
              if (parsed.type) {
                onEventRef.current?.(parsed)

                if (TERMINAL_EVENTS.has(parsed.type)) {
                  reader.cancel()
                  setStatus('closed')
                  return
                }
              }
            } catch {
              // Skip malformed JSON — log would go here in production
            }
          }
        }
      }

      // Stream ended without terminal event — unexpected, reconnect
      if (!signal.aborted) {
        throw new Error('Stream ended unexpectedly')
      }
    } catch (err) {
      if (signal.aborted) return

      const message = err instanceof Error ? err.message : 'Connection failed'
      setError(message)
      setStatus('connecting')
      setReconnectCount((c) => c + 1)

      // Exponential backoff reconnect
      const delay = backoffRef.current
      backoffRef.current = Math.min(backoffRef.current * 2, MAX_BACKOFF_MS)

      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, delay)
        signal.addEventListener('abort', () => {
          clearTimeout(timer)
          resolve()
        })
      })

      if (!signal.aborted) {
        void connect(targetUrl, doFetch, signal)
      }
    }
  }, [])

  useEffect(() => {
    if (!url) {
      setStatus('idle')
      return
    }

    const controller = new AbortController()
    abortRef.current = controller
    lastEventIdRef.current = null
    backoffRef.current = 1000
    setReconnectCount(0)

    connect(url, fetchFn, controller.signal)

    return () => {
      controller.abort()
      abortRef.current = null
    }
  }, [url, fetchFn, connect])

  return { status, error, reconnectCount }
}

export { useSSE }
export type { UseSSEOptions, UseSSEResult, SSEStatus }
