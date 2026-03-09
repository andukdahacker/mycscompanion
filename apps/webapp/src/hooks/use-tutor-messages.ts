import { useCallback, useMemo } from 'react'
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query'
import type { FetchNextPageOptions, InfiniteData, InfiniteQueryObserverResult } from '@tanstack/react-query'
import type { TutorConversationMessage } from '@mycscompanion/shared'
import { apiFetch } from '../lib/api-fetch'
import type { MessagesPage } from './use-tutor-stream'

interface UseTutorMessagesResult {
  readonly messages: ReadonlyArray<TutorConversationMessage>
  readonly addOptimisticMessage: (content: string) => void
  readonly fetchNextPage: (options?: FetchNextPageOptions) => Promise<InfiniteQueryObserverResult>
  readonly hasNextPage: boolean
  readonly isFetchingNextPage: boolean
}

function useTutorMessages(sessionId: string | null): UseTutorMessagesResult {
  const queryClient = useQueryClient()

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
    queryKey: ['tutor', 'messages', sessionId],
    queryFn: ({ pageParam }) =>
      apiFetch<MessagesPage>(
        `/api/tutor/${sessionId}/messages${pageParam ? `?afterCursor=${pageParam}` : ''}`,
      ),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    staleTime: 5 * 60 * 1000,
    enabled: !!sessionId,
  })

  const messages = useMemo(() => {
    if (!data) return []
    return data.pages.flatMap((page) => page.messages)
  }, [data])

  const addOptimisticMessage = useCallback(
    (content: string) => {
      if (!sessionId) return
      const tempMessage: TutorConversationMessage = {
        id: `temp-${crypto.randomUUID()}`,
        role: 'user',
        content,
        model: null,
        createdAt: new Date().toISOString(),
      }

      queryClient.setQueryData<InfiniteData<MessagesPage>>(
        ['tutor', 'messages', sessionId],
        (old) => {
          if (!old) {
            return {
              pages: [{ messages: [tempMessage], nextCursor: null }],
              pageParams: [undefined],
            }
          }
          const lastPage = old.pages[old.pages.length - 1]
          if (!lastPage) return old
          const updatedPage: MessagesPage = {
            messages: [...lastPage.messages, tempMessage],
            nextCursor: lastPage.nextCursor,
          }
          return {
            ...old,
            pages: [...old.pages.slice(0, -1), updatedPage],
          }
        },
      )
    },
    [sessionId, queryClient],
  )

  return {
    messages,
    addOptimisticMessage,
    fetchNextPage,
    hasNextPage: hasNextPage ?? false,
    isFetchingNextPage,
  }
}

export { useTutorMessages }
export type { UseTutorMessagesResult }
