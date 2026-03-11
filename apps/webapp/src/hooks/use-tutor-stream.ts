import { useCallback, useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { InfiniteData } from '@tanstack/react-query'
import type {
  TutorStreamEvent,
  TutorConversationMessage,
  ConceptExplainerAsset,
} from '@mycscompanion/shared'
import { auth } from '../lib/firebase'
import { API_URL } from '../lib/api-fetch'
import { useWorkspaceUIStore } from '../stores/workspace-ui-store'
import { announceToScreenReader } from '../components/workspace/workspace-a11y'
import { parseSSEStream } from '../lib/parse-sse-stream'
import { stripExplainerRefsForA11y } from '../lib/parse-explainer-refs'

interface MessagesPage {
  readonly messages: ReadonlyArray<TutorConversationMessage>
  readonly nextCursor: string | null
}

interface TutorHookError {
  readonly type: 'error'
  readonly code: string
  readonly message: string
  readonly retryAfter?: number
}

interface UseTutorStreamResult {
  readonly sendMessage: (message: string) => void
  readonly isStreaming: boolean
  readonly streamingContent: string
  readonly error: TutorHookError | null
  readonly clearError: () => void
}

function parseErrorBody(body: unknown, fallback: string): string {
  if (typeof body !== 'object' || body === null || !('error' in body)) return fallback
  const error = body.error
  if (typeof error !== 'object' || error === null || !('message' in error)) return fallback
  const { message } = error
  return typeof message === 'string' ? message : fallback
}

function useTutorStream(
  sessionId: string | null,
  explainerAssetsMap?: Readonly<Record<string, ConceptExplainerAsset>>
): UseTutorStreamResult {
  const queryClient = useQueryClient()
  const [isStreaming, setIsStreaming] = useState(false)
  const [streamingContent, setStreamingContent] = useState('')
  const [error, setError] = useState<TutorHookError | null>(null)
  const abortControllerRef = useRef<AbortController | null>(null)
  const isStreamingRef = useRef(false)
  const assetsMapRef = useRef(explainerAssetsMap)
  assetsMapRef.current = explainerAssetsMap

  const clearError = useCallback(() => {
    setError(null)
  }, [])

  const sendMessage = useCallback(
    (message: string) => {
      if (!sessionId || isStreamingRef.current) return

      const trimmed = message.trim()
      if (!trimmed || trimmed.length > 2000) return

      isStreamingRef.current = true
      setIsStreaming(true)
      setStreamingContent('')
      setError(null)

      // Abort any previous in-flight request
      abortControllerRef.current?.abort()
      const abortController = new AbortController()
      abortControllerRef.current = abortController

      let accumulated = ''

      const run = async (): Promise<void> => {
        const user = auth.currentUser
        if (!user) {
          window.location.href = '/sign-in'
          return
        }

        const token = await user.getIdToken()

        let response: Response
        try {
          response = await fetch(`${API_URL}/api/tutor/${sessionId}/stream`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
              Accept: 'text/event-stream',
            },
            body: JSON.stringify({ message: trimmed }),
            signal: abortController.signal,
          })
        } catch (err: unknown) {
          if (err instanceof DOMException && err.name === 'AbortError') return
          setError({ type: 'error', code: 'NETWORK_ERROR', message: 'Network error' })
          isStreamingRef.current = false
          setIsStreaming(false)
          return
        }

        // Handle HTTP-level errors (before SSE starts)
        if (!response.ok) {
          isStreamingRef.current = false
          setIsStreaming(false)

          if (response.status === 401) {
            window.location.href = '/sign-in'
            return
          }

          if (response.status === 429) {
            const retryAfterHeader = response.headers.get('retry-after')
            const retryAfter = retryAfterHeader ? parseInt(retryAfterHeader, 10) || undefined : undefined
            const body: unknown = await response.json().catch(() => ({}))
            setError({
              type: 'error',
              code: 'RATE_LIMITED',
              message: parseErrorBody(body, 'Too many requests'),
              retryAfter,
            })
            return
          }

          const body: unknown = await response.json().catch(() => ({}))
          setError({ type: 'error', code: 'REQUEST_ERROR', message: parseErrorBody(body, 'Request failed') })
          return
        }

        // Parse SSE stream
        if (!response.body) {
          setError({ type: 'error', code: 'NETWORK_ERROR', message: 'Empty response body' })
          isStreamingRef.current = false
          setIsStreaming(false)
          return
        }

        try {
          for await (const event of parseSSEStream<TutorStreamEvent>(response.body)) {
            switch (event.type) {
              case 'text_delta':
                accumulated += event.delta
                setStreamingContent(accumulated)
                break

              case 'message_complete': {
                setStreamingContent('')
                isStreamingRef.current = false
                setIsStreaming(false)

                // Insert assistant message into TanStack Query cache
                const newMessage: TutorConversationMessage = {
                  id: event.id,
                  role: 'assistant',
                  content: event.content,
                  model: event.model,
                  createdAt: new Date().toISOString(),
                }

                queryClient.setQueryData<InfiniteData<MessagesPage>>(
                  ['tutor', 'messages', sessionId],
                  (old) => {
                    if (!old) return old
                    const lastPage = old.pages[old.pages.length - 1]
                    if (!lastPage) return old
                    const updatedPage: MessagesPage = {
                      messages: [...lastPage.messages, newMessage],
                      nextCursor: lastPage.nextCursor,
                    }
                    return {
                      ...old,
                      pages: [...old.pages.slice(0, -1), updatedPage],
                    }
                  },
                )

                // Announce to screen reader (strip explainer refs for readable text)
                announceToScreenReader(stripExplainerRefsForA11y(event.content, assetsMapRef.current))
                break
              }

              case 'error':
                setError({ type: event.type, code: event.code, message: event.message })
                isStreamingRef.current = false
                setIsStreaming(false)

                if (event.code === 'TUTOR_UNAVAILABLE') {
                  useWorkspaceUIStore.getState().setTutorAvailable(false)
                }
                break
            }
          }
        } catch (err: unknown) {
          if (err instanceof DOMException && err.name === 'AbortError') return
          isStreamingRef.current = false
          setIsStreaming(false)
        }

        // If stream ended without message_complete, clean up
        if (isStreamingRef.current) {
          isStreamingRef.current = false
          setIsStreaming(false)
        }
      }

      run()
    },
    [sessionId, queryClient],
  )

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort()
    }
  }, [])

  return { sendMessage, isStreaming, streamingContent, error, clearError }
}

export { useTutorStream }
export type { UseTutorStreamResult, MessagesPage, TutorHookError }
