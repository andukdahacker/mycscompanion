import { useCallback, useEffect } from 'react'
import { useParams } from 'react-router'
import { Button } from '@mycscompanion/ui/src/components/ui/button'
import { WorkspaceLayout } from '../components/workspace/WorkspaceLayout'
import { WorkspaceSkeleton } from '../components/workspace/WorkspaceSkeleton'
import { useDelayedLoading } from '../hooks/use-delayed-loading'
import { useWorkspaceData } from '../hooks/use-workspace-data'
import { useSubmitCode } from '../hooks/use-submit-code'
import { useStuckDetection } from '../hooks/use-stuck-detection'
import { useEditorStore } from '../stores/editor-store'

function Workspace(): React.ReactElement | null {
  const { milestoneId } = useParams<{ milestoneId: string }>()

  const { data, isLoading, isError, refetch } = useWorkspaceData(milestoneId)
  const showLoading = useDelayedLoading(isLoading)

  const { submit, isRunning, outputLines } = useSubmitCode()

  const stuckDetectionConfig = data?.stuckDetection ?? { thresholdMinutes: 10, stage2OffsetSeconds: 60 }
  const { resetTimer } = useStuckDetection(stuckDetectionConfig)

  // Reset stuck detection on editor content changes (character insert/delete/paste)
  useEffect(() => {
    const unsubscribe = useEditorStore.subscribe(
      (state, prevState) => {
        if (state.content !== prevState.content) {
          resetTimer()
        }
      },
    )
    return unsubscribe
  }, [resetTimer])

  const handleRun = useCallback(() => {
    if (!milestoneId) return
    const code = useEditorStore.getState().content
    resetTimer()
    submit({ milestoneId, code })
  }, [milestoneId, resetTimer, submit])

  const handleBenchmark = useCallback(() => {
    // No-op until Epic 7
    resetTimer()
  }, [resetTimer])

  if (showLoading) {
    return <WorkspaceSkeleton />
  }

  // During the delayed-loading window (first 500ms), render nothing to prevent error flash
  if (isLoading) {
    return null
  }

  if (isError || !data) {
    return (
      <div data-testid="workspace-error" className="flex h-screen flex-col items-center justify-center gap-3 bg-background text-center">
        <p className="text-lg font-medium text-destructive">Failed to load workspace</p>
        <p className="text-sm text-muted-foreground">Something went wrong loading milestone data.</p>
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          Retry
        </Button>
      </div>
    )
  }

  return (
    <WorkspaceLayout
      milestoneName={data.milestoneName}
      milestoneNumber={data.milestoneNumber}
      progress={data.progress}
      initialContent={data.initialContent}
      onRun={handleRun}
      onBenchmark={handleBenchmark}
      outputLines={outputLines}
      isRunning={isRunning}
      onRetry={handleRun}
    />
  )
}

// eslint-disable-next-line no-restricted-syntax -- Default export required for React.lazy()
export default Workspace
