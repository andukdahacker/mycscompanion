import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { MessageCircle, RefreshCw, Loader2 } from 'lucide-react'
import { Button } from '@mycscompanion/ui/src/components/ui/button'
import type { ConceptExplainerAsset } from '@mycscompanion/shared'
import { useWorkspaceUIStore } from '../../stores/workspace-ui-store'
import { useAutoScroll } from '../../hooks/use-auto-scroll'
import { useTutorStream } from '../../hooks/use-tutor-stream'
import { useTutorMessages } from '../../hooks/use-tutor-messages'
import { useTutorRecovery } from '../../hooks/use-tutor-recovery'
import { auth } from '../../lib/firebase'
import { API_URL } from '../../lib/api-fetch'
import { TutorMessage } from './TutorMessage'
import { TutorInput } from './TutorInput'

interface TutorPanelProps {
  readonly sessionId: string | null
  readonly readOnly?: boolean
  readonly interventionStreamingContent?: string
  readonly isInterventionStreaming?: boolean
  readonly conceptExplainerAssets?: readonly ConceptExplainerAsset[]
}

function TutorPanel({ sessionId, readOnly = false, interventionStreamingContent, isInterventionStreaming, conceptExplainerAssets }: TutorPanelProps): React.ReactElement {
  const tutorAvailable = useWorkspaceUIStore((s) => s.tutorAvailable)
  const tutorExpanded = useWorkspaceUIStore((s) => s.tutorExpanded)
  const setTutorExpanded = useWorkspaceUIStore((s) => s.setTutorExpanded)

  const explainerAssetsMap = useMemo(() => {
    if (!conceptExplainerAssets || conceptExplainerAssets.length === 0) return undefined
    const map: Record<string, ConceptExplainerAsset> = {}
    for (const asset of conceptExplainerAssets) {
      map[asset.name] = asset
    }
    return map
  }, [conceptExplainerAssets])

  const [showRecoveryNotice, setShowRecoveryNotice] = useState(false)
  const prevAvailableRef = useRef(tutorAvailable)

  // Auto-recovery probe
  useTutorRecovery(tutorAvailable)

  // Show recovery notice when tutor comes back
  useEffect(() => {
    if (!prevAvailableRef.current && tutorAvailable) {
      setShowRecoveryNotice(true)
      const timer = setTimeout(() => setShowRecoveryNotice(false), 3000)
      return () => clearTimeout(timer)
    }
    prevAvailableRef.current = tutorAvailable
  }, [tutorAvailable])

  const { messages, addOptimisticMessage, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useTutorMessages(sessionId)

  const { sendMessage, isStreaming, streamingContent, error, clearError } = useTutorStream(sessionId, explainerAssetsMap)

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
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground/70">
          <Loader2 className="size-3 animate-spin" />
          Retrying automatically...
        </p>
        <Button variant="outline" size="sm" onClick={async () => {
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
            // Probe failed — tutor still unavailable
          }
        }}>
          <RefreshCw className="size-3.5" />
          Retry now
        </Button>
      </div>
    )
  }

  if (!tutorExpanded) {
    return <></>
  }

  return (
    <div className="flex h-full flex-col" data-testid="tutor-chat">
      {/* Recovery notice */}
      {showRecoveryNotice && (
        <div className="border-b bg-green-50 px-3 py-1.5 text-center text-xs text-green-700 dark:bg-green-950/30 dark:text-green-400">
          Tutor is back
        </div>
      )}

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
          <TutorMessage key={msg.id} message={msg} conceptExplainerAssets={explainerAssetsMap} />
        ))}

        {/* Intervention streaming takes priority over regular streaming */}
        {isInterventionStreaming && interventionStreamingContent ? (
          <TutorMessage
            message={{ id: 'intervention-streaming', role: 'assistant', content: '', model: null, createdAt: new Date().toISOString() }}
            isStreaming
            streamingContent={interventionStreamingContent}
            conceptExplainerAssets={explainerAssetsMap}
          />
        ) : isStreaming && streamingContent ? (
          <TutorMessage
            message={{ id: 'streaming', role: 'assistant', content: '', model: null, createdAt: new Date().toISOString() }}
            isStreaming
            streamingContent={streamingContent}
            conceptExplainerAssets={explainerAssetsMap}
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
