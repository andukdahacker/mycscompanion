import { useCallback, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router'
import { useMutation } from '@tanstack/react-query'
import type { CompleteMilestoneResponse } from '@mycscompanion/shared'
import { Button } from '@mycscompanion/ui/src/components/ui/button'
import { WorkspaceLayout } from '../components/workspace/WorkspaceLayout'
import { WorkspaceSkeleton } from '../components/workspace/WorkspaceSkeleton'
import { useDelayedLoading } from '../hooks/use-delayed-loading'
import { useWorkspaceData } from '../hooks/use-workspace-data'
import { useSubmitCode } from '../hooks/use-submit-code'
import { useStuckDetection } from '../hooks/use-stuck-detection'
import { apiFetch } from '../lib/api-fetch'
import { useEditorStore } from '../stores/editor-store'
import { useWorkspaceUIStore } from '../stores/workspace-ui-store'

function Workspace(): React.ReactElement | null {
  const { milestoneId } = useParams<{ milestoneId: string }>()

  const { data, isLoading, isError, refetch } = useWorkspaceData(milestoneId)
  const showLoading = useDelayedLoading(isLoading)

  const navigate = useNavigate()
  const { submit, submissionId, isRunning, outputLines, criteriaResults, allCriteriaMet } = useSubmitCode()

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

  const completeMutation = useMutation({
    mutationKey: ['completion', 'complete'],
    mutationFn: ({ mId, sId }: { mId: string; sId: string }) =>
      apiFetch<CompleteMilestoneResponse>(`/api/completion/${mId}/complete`, {
        method: 'POST',
        body: JSON.stringify({ submissionId: sId }),
      }),
    onSuccess: () => {
      if (milestoneId) {
        navigate(`/completion/${milestoneId}`)
      }
    },
  })

  const handleCompleteMilestone = useCallback(() => {
    if (!milestoneId || !submissionId) return
    completeMutation.mutate({ mId: milestoneId, sId: submissionId })
  }, [milestoneId, submissionId, completeMutation])

  // Content-before-tools: show brief tab on initial load so user reads brief while Monaco lazy-loads
  const briefShownRef = useRef(false)
  useEffect(() => {
    if (data?.brief && !briefShownRef.current) {
      briefShownRef.current = true
      useWorkspaceUIStore.getState().setActiveTerminalTab('brief')
    }
  }, [data?.brief])

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

  const criteria = data.criteria ?? []
  const progress = criteriaResults && criteria.length > 0
    ? Math.round((criteriaResults.filter((r) => r.status === 'met').length / criteria.length) * 100)
    : 0

  return (
    <WorkspaceLayout
      milestoneName={data.milestoneName}
      milestoneNumber={data.milestoneNumber}
      progress={progress}
      initialContent={data.initialContent}
      onRun={handleRun}
      onBenchmark={handleBenchmark}
      outputLines={outputLines}
      isRunning={isRunning}
      onRetry={handleRun}
      brief={data.brief}
      criteria={criteria}
      criteriaResults={criteriaResults}
      allCriteriaMet={allCriteriaMet}
      onCompleteMilestone={handleCompleteMilestone}
    />
  )
}

// eslint-disable-next-line no-restricted-syntax -- Default export required for React.lazy()
export default Workspace
