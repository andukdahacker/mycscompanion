import { useCallback } from 'react'
import { MessageCircle, RefreshCw } from 'lucide-react'
import { Button } from '@mycscompanion/ui/src/components/ui/button'
import { useWorkspaceUIStore } from '../../stores/workspace-ui-store'
import { useAutoScroll } from '../../hooks/use-auto-scroll'
import { useTutorStream } from '../../hooks/use-tutor-stream'
import { useTutorMessages } from '../../hooks/use-tutor-messages'
import { TutorMessage } from './TutorMessage'
import { TutorInput } from './TutorInput'

interface TutorPanelProps {
  readonly sessionId: string | null
  readonly readOnly?: boolean
  readonly interventionStreamingContent?: string
  readonly isInterventionStreaming?: boolean
}

function TutorPanel({ sessionId, readOnly = false, interventionStreamingContent, isInterventionStreaming }: TutorPanelProps): React.ReactElement {
  const tutorAvailable = useWorkspaceUIStore((s) => s.tutorAvailable)
  const tutorExpanded = useWorkspaceUIStore((s) => s.tutorExpanded)
  const setTutorAvailable = useWorkspaceUIStore((s) => s.setTutorAvailable)
  const setTutorExpanded = useWorkspaceUIStore((s) => s.setTutorExpanded)

  const { messages, addOptimisticMessage, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useTutorMessages(sessionId)

  const { sendMessage, isStreaming, streamingContent, error, clearError } = useTutorStream(sessionId)

  const scrollRef = useAutoScroll([messages, streamingContent, interventionStreamingContent])

  const handleSend = useCallback(
    (message: string) => {
      addOptimisticMessage(message)
      sendMessage(message)
    },
    [addOptimisticMessage, sendMessage],
  )

  const handleLoadMore = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) {
      fetchNextPage()
    }
  }, [hasNextPage, isFetchingNextPage, fetchNextPage])

  if (!tutorAvailable) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-4 text-center">
        <MessageCircle className="size-8 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">AI tutor temporarily unavailable</p>
        <Button variant="outline" size="sm" onClick={() => setTutorAvailable(true)}>
          <RefreshCw className="size-3.5" />
          Retry
        </Button>
      </div>
    )
  }

  if (!tutorExpanded) {
    return <></>
  }

  return (
    <div className="flex h-full flex-col" data-testid="tutor-chat">
      {/* Header */}
      <div className="flex items-center justify-between border-b px-3 py-2">
        <span className="text-sm font-medium">AI Tutor</span>
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={() => setTutorExpanded(false)}
          aria-label="Collapse tutor panel"
        >
          &times;
        </Button>
      </div>

      {/* Message area */}
      <div
        ref={scrollRef}
        role="log"
        aria-label="Tutor conversation"
        className="flex-1 overflow-y-auto p-3"
      >
        {hasNextPage && (
          <div className="mb-3 text-center">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleLoadMore}
              disabled={isFetchingNextPage}
            >
              {isFetchingNextPage ? 'Loading...' : 'Load older messages'}
            </Button>
          </div>
        )}

        {messages.map((msg) => (
          <TutorMessage key={msg.id} message={msg} />
        ))}

        {/* Intervention streaming takes priority over regular streaming */}
        {isInterventionStreaming && interventionStreamingContent ? (
          <TutorMessage
            message={{ id: 'intervention-streaming', role: 'assistant', content: '', model: null, createdAt: new Date().toISOString() }}
            isStreaming
            streamingContent={interventionStreamingContent}
          />
        ) : isStreaming && streamingContent ? (
          <TutorMessage
            message={{ id: 'streaming', role: 'assistant', content: '', model: null, createdAt: new Date().toISOString() }}
            isStreaming
            streamingContent={streamingContent}
          />
        ) : null}
      </div>

      {/* Input area — hidden in read-only mode */}
      {!readOnly && (
        <TutorInput
          onSend={handleSend}
          isStreaming={isStreaming || !!isInterventionStreaming}
          error={error}
          onClearError={clearError}
        />
      )}
    </div>
  )
}

export { TutorPanel }
export type { TutorPanelProps }
