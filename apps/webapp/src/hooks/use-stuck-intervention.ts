import { useCallback, useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { InfiniteData } from '@tanstack/react-query'
import type { TutorStreamEvent, TutorConversationMessage, ConceptExplainerAsset } from '@mycscompanion/shared'
import { auth } from '../lib/firebase'
import { API_URL } from '../lib/api-fetch'
import { useWorkspaceUIStore } from '../stores/workspace-ui-store'
import { announceToScreenReader } from '../components/workspace/workspace-a11y'
import { parseSSEStream } from '../lib/parse-sse-stream'
import { stripExplainerRefsForA11y } from '../lib/parse-explainer-refs'
import type { MessagesPage } from './use-tutor-stream'

interface UseStuckInterventionResult {
  readonly triggerIntervention: (timeStuckMinutes: number) => void
  readonly isInterventionStreaming: boolean
  readonly interventionStreamingContent: string
}

function useStuckIntervention(
  sessionId: string | null,
  explainerAssetsMap?: Readonly<Record<string, ConceptExplainerAsset>>
): UseStuckInterventionResult {
  const queryClient = useQueryClient()
  const [isInterventionStreaming, setIsInterventionStreaming] = useState(false)
  const [interventionStreamingContent, setInterventionStreamingContent] = useState('')
  const abortControllerRef = useRef<AbortController | null>(null)
  const isStreamingRef = useRef(false)
  const assetsMapRef = useRef(explainerAssetsMap)
  assetsMapRef.current = explainerAssetsMap

  const triggerIntervention = useCallback(
    (timeStuckMinutes: number) => {
      if (!sessionId || isStreamingRef.current) return

      isStreamingRef.current = true
      setIsInterventionStreaming(true)
      setInterventionStreamingContent('')

      abortControllerRef.current?.abort()
      const abortController = new AbortController()
      abortControllerRef.current = abortController

      let accumulated = ''

      const run = async (): Promise<void> => {
        const user = auth.currentUser
        if (!user) return

        const token = await user.getIdToken()

        let response: Response
        try {
          response = await fetch(`${API_URL}/api/tutor/${sessionId}/stuck-intervention`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
              Accept: 'text/event-stream',
            },
            body: JSON.stringify({ timeStuckMinutes }),
            signal: abortController.signal,
          })
        } catch (err: unknown) {
          if (err instanceof DOMException && err.name === 'AbortError') return
          console.warn('Stuck intervention network error:', err)
          isStreamingRef.current = false
          setIsInterventionStreaming(false)
          setInterventionStreamingContent('')
          return
        }

        if (!response.ok) {
          isStreamingRef.current = false
          setIsInterventionStreaming(false)
          setInterventionStreamingContent('')

          if (response.status === 503) {
            const body: unknown = await response.json().catch(() => ({}))
            if (typeof body === 'object' && body !== null && 'error' in body) {
              const error = (body as { error: { code?: string } }).error
              if (error.code === 'TUTOR_UNAVAILABLE') {
                useWorkspaceUIStore.getState().setTutorAvailable(false)
              }
            }
          }
          return
        }

        if (!response.body) {
          isStreamingRef.current = false
          setIsInterventionStreaming(false)
          setInterventionStreamingContent('')
          return
        }

        // Insert synthetic user message into cache AFTER confirming response is OK
        const syntheticMessage: TutorConversationMessage = {
          id: `system-stuck-${crypto.randomUUID()}`,
          role: 'user',
          content: '[Tutor noticed you might be stuck and offered a hint]',
          model: null,
          createdAt: new Date().toISOString(),
        }

        queryClient.setQueryData<InfiniteData<MessagesPage>>(
          ['tutor', 'messages', sessionId],
          (old) => {
            if (!old) return old
            const lastPage = old.pages[old.pages.length - 1]
            if (!lastPage) return old
            const updatedPage: MessagesPage = {
              messages: [...lastPage.messages, syntheticMessage],
              nextCursor: lastPage.nextCursor,
            }
            return {
              ...old,
              pages: [...old.pages.slice(0, -1), updatedPage],
            }
          },
        )

        try {
          for await (const event of parseSSEStream<TutorStreamEvent>(response.body)) {
            switch (event.type) {
              case 'text_delta':
                accumulated += event.delta
                setInterventionStreamingContent(accumulated)
                break

              case 'message_complete': {
                setInterventionStreamingContent('')
                isStreamingRef.current = false
                setIsInterventionStreaming(false)

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

                announceToScreenReader(stripExplainerRefsForA11y(event.content, assetsMapRef.current))
                break
              }

              case 'error':
                isStreamingRef.current = false
                setIsInterventionStreaming(false)
                setInterventionStreamingContent('')

                if (event.code === 'TUTOR_UNAVAILABLE') {
                  useWorkspaceUIStore.getState().setTutorAvailable(false)
                }
                break
            }
          }
        } catch (err: unknown) {
          if (err instanceof DOMException && err.name === 'AbortError') return
          console.warn('Stuck intervention stream error:', err)
          isStreamingRef.current = false
          setIsInterventionStreaming(false)
          setInterventionStreamingContent('')
        }

        // Clean up if stream ended without message_complete
        if (isStreamingRef.current) {
          isStreamingRef.current = false
          setIsInterventionStreaming(false)
          setInterventionStreamingContent('')
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

  return { triggerIntervention, isInterventionStreaming, interventionStreamingContent }
}

export { useStuckIntervention }
export type { UseStuckInterventionResult }
