import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router'
import { useMutation } from '@tanstack/react-query'
import type { CompleteMilestoneResponse, ConceptExplainerAsset } from '@mycscompanion/shared'
import { Button } from '@mycscompanion/ui/src/components/ui/button'
import { WorkspaceLayout } from '../components/workspace/WorkspaceLayout'
import { WorkspaceSkeleton } from '../components/workspace/WorkspaceSkeleton'
import { useDelayedLoading } from '../hooks/use-delayed-loading'
import { useWorkspaceData } from '../hooks/use-workspace-data'
import { useSubmitCode } from '../hooks/use-submit-code'
import { useStuckDetection } from '../hooks/use-stuck-detection'
import { useAutoSave } from '../hooks/use-auto-save'
import { useStuckIntervention } from '../hooks/use-stuck-intervention'
import { usePreviousBenchmark } from '../hooks/use-previous-benchmark'
import { useSession } from '../hooks/use-session'
import { apiFetch } from '../lib/api-fetch'
import { endSession } from '../lib/end-session'
import { useEditorStore } from '../stores/editor-store'
import { useWorkspaceUIStore } from '../stores/workspace-ui-store'

function Workspace(): React.ReactElement | null {
  const { milestoneId } = useParams<{ milestoneId: string }>()

  const { data, isLoading, isError, refetch } = useWorkspaceData(milestoneId)
  const showLoading = useDelayedLoading(isLoading)

  const navigate = useNavigate()
  const { submit, submissionId, isRunning, outputLines, criteriaResults, allCriteriaMet, isBenchmarking, benchmarkResult } = useSubmitCode()
  const { previousOpsPerSec } = usePreviousBenchmark(milestoneId)

  const stuckDetectionConfig = data?.stuckDetection ?? { thresholdMinutes: 10, stage2OffsetSeconds: 60 }
  const { resetTimer, isStage1, isStage2, stage1Timestamp } = useStuckDetection(stuckDetectionConfig)

  const { scheduleAutoSave, saveImmediately } = useAutoSave({
    milestoneId: milestoneId ?? '',
    enabled: !!milestoneId,
  })

  // Create or retrieve session on workspace mount (fire-and-forget)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const sessionIdRef = useRef<string | null>(null)
  const sessionMutation = useSession(milestoneId ?? '')
  useEffect(() => {
    if (milestoneId) {
      sessionMutation.mutate(undefined, {
        onSuccess: (data) => {
          sessionIdRef.current = data.session.id
          setSessionId(data.session.id)
        },
      })
    }
  }, [milestoneId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Reset stuck detection and schedule auto-save on editor content changes
  const currentCodeRef = useRef(useEditorStore.getState().content)
  useEffect(() => {
    const unsubscribe = useEditorStore.subscribe(
      (state, prevState) => {
        if (state.content !== prevState.content) {
          resetTimer()
          scheduleAutoSave(state.content)
          currentCodeRef.current = state.content
        }
      },
    )
    return unsubscribe
  }, [resetTimer, scheduleAutoSave])

  // beforeunload — best-effort last-chance save + session end
  useEffect(() => {
    const handleBeforeUnload = () => {
      saveImmediately(currentCodeRef.current)
      endSession(sessionIdRef.current)
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [saveImmediately])

  // End session when Workspace unmounts (route change, sign-out, etc.)
  // beforeunload only fires on tab/browser close — NOT on SPA navigation.
  useEffect(() => {
    return () => {
      endSession(sessionIdRef.current)
    }
  }, [])

  // Build explainer assets map for screen reader announcements
  const explainerAssetsMap = useMemo(() => {
    if (!data?.conceptExplainerAssets || data.conceptExplainerAssets.length === 0) return undefined
    const map: Record<string, ConceptExplainerAsset> = {}
    for (const asset of data.conceptExplainerAssets) {
      map[asset.name] = asset
    }
    return map
  }, [data?.conceptExplainerAssets])

  // Stuck intervention hook
  const { triggerIntervention, isInterventionStreaming, interventionStreamingContent } = useStuckIntervention(sessionId, explainerAssetsMap)

  // Stage 2 auto-expand: expand tutor panel when Stage 2 triggers (AC: #2, #7)
  const tutorAvailable = useWorkspaceUIStore((s) => s.tutorAvailable)
  const setTutorExpanded = useWorkspaceUIStore((s) => s.setTutorExpanded)
  const tutorExpanded = useWorkspaceUIStore((s) => s.tutorExpanded)

  const stage2TriggeredRef = useRef(false)

  useEffect(() => {
    if (isStage2 && tutorAvailable && !stage2TriggeredRef.current) {
      stage2TriggeredRef.current = true
      setTutorExpanded(true)

      const minutesStuck = stage1Timestamp
        ? Math.round((Date.now() - stage1Timestamp) / 60_000) + stuckDetectionConfig.thresholdMinutes
        : stuckDetectionConfig.thresholdMinutes

      triggerIntervention(minutesStuck)
    }
  }, [isStage2, tutorAvailable, setTutorExpanded, triggerIntervention, stage1Timestamp, stuckDetectionConfig.thresholdMinutes])

  // Reset stuck detection on tutor dismiss (AC: #5)
  useEffect(() => {
    if (!tutorExpanded && (isStage1 || isStage2)) {
      stage2TriggeredRef.current = false
      resetTimer()
    }
  }, [tutorExpanded, isStage1, isStage2, resetTimer])

  const handleRun = useCallback(() => {
    if (!milestoneId) return
    const code = useEditorStore.getState().content
    resetTimer()
    submit({ milestoneId, code })
  }, [milestoneId, resetTimer, submit])

  const handleBenchmark = useCallback(() => {
    if (!milestoneId) return
    const code = useEditorStore.getState().content
    resetTimer()
    submit({ milestoneId, code })
  }, [milestoneId, resetTimer, submit])

  const handleResetToScaffold = useCallback(() => {
    if (!data?.starterCode) return
    useEditorStore.getState().triggerReset(data.starterCode)
  }, [data?.starterCode])

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

  // Use live criteria results if available (from current session submission),
  // otherwise fall back to restored criteria from last session's submission
  const effectiveCriteriaResults = criteriaResults ?? data?.restoredCriteria ?? null
  const effectiveSubmissionId = submissionId ?? data?.restoredSubmissionId ?? null
  const effectiveAllCriteriaMet = allCriteriaMet || (
    effectiveCriteriaResults !== null
    && effectiveCriteriaResults.length > 0
    && effectiveCriteriaResults.every((r) => r.status === 'met')
  )

  const handleCompleteMilestone = useCallback(() => {
    if (!milestoneId || !effectiveSubmissionId) return
    completeMutation.mutate({ mId: milestoneId, sId: effectiveSubmissionId })
  }, [milestoneId, effectiveSubmissionId, completeMutation])

  // Content-before-tools: show brief tab on initial load so user reads brief while Monaco lazy-loads
  // BUT if restored criteria exist, show criteria tab so user sees their progress
  const initialTabSetRef = useRef(false)
  useEffect(() => {
    if (!data || initialTabSetRef.current) return
    initialTabSetRef.current = true
    if (data.restoredCriteria && data.restoredCriteria.length > 0) {
      useWorkspaceUIStore.getState().setActiveTerminalTab('criteria')
    } else if (data.brief) {
      useWorkspaceUIStore.getState().setActiveTerminalTab('brief')
    }
  }, [data])

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
  const progress = effectiveCriteriaResults && criteria.length > 0
    ? Math.round((effectiveCriteriaResults.filter((r) => r.status === 'met').length / criteria.length) * 100)
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
      criteriaResults={effectiveCriteriaResults}
      allCriteriaMet={effectiveAllCriteriaMet}
      onCompleteMilestone={handleCompleteMilestone}
      conceptExplainerAssets={data.conceptExplainerAssets}
      benchmarkResult={benchmarkResult}
      isBenchmarking={isBenchmarking}
      previousBenchmarkOpsPerSec={previousOpsPerSec}
      milestoneId={milestoneId}
      sessionId={sessionId}
      isStage1={isStage1}
      interventionStreamingContent={interventionStreamingContent}
      isInterventionStreaming={isInterventionStreaming}
      onResetToScaffold={handleResetToScaffold}
    />
  )
}

// eslint-disable-next-line no-restricted-syntax -- Default export required for React.lazy()
export default Workspace
