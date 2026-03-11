import { useCallback, useEffect } from 'react'
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
  usePanelRef,
} from '@mycscompanion/ui/src/components/ui/resizable'
import type { PanelSize } from '@mycscompanion/ui/src/components/ui/resizable'
import { MessageCircle } from 'lucide-react'
import { cn } from '@mycscompanion/ui/src/lib/utils'
import type { AcceptanceCriterion, ConceptExplainerAsset, CriterionResult } from '@mycscompanion/shared'
import { WorkspaceTopBar } from './WorkspaceTopBar'
import { CodeEditor } from './CodeEditor'
import { TerminalPanel } from './TerminalPanel'
import type { OutputLine } from './TerminalPanel'
import { TutorPanel } from './TutorPanel'
import { useWorkspaceUIStore } from '../../stores/workspace-ui-store'

interface WorkspaceLayoutProps {
  readonly milestoneName: string
  readonly milestoneNumber: number
  readonly progress: number
  readonly initialContent: string
  readonly onRun: () => void
  readonly onBenchmark: () => void
  readonly outputLines: ReadonlyArray<OutputLine>
  readonly isRunning: boolean
  readonly onRetry: () => void
  readonly brief: string | null
  readonly criteria: ReadonlyArray<AcceptanceCriterion>
  readonly criteriaResults: ReadonlyArray<CriterionResult> | null
  readonly allCriteriaMet?: boolean
  readonly onCompleteMilestone?: () => void
  readonly conceptExplainerAssets: readonly ConceptExplainerAsset[]
  readonly sessionId: string | null
  readonly isStage1?: boolean
  readonly interventionStreamingContent?: string
  readonly isInterventionStreaming?: boolean
}

function WorkspaceLayout({
  milestoneName,
  milestoneNumber,
  progress,
  initialContent,
  onRun,
  onBenchmark,
  outputLines,
  isRunning,
  onRetry,
  brief,
  criteria,
  criteriaResults,
  allCriteriaMet,
  onCompleteMilestone,
  conceptExplainerAssets,
  sessionId,
  isStage1,
  interventionStreamingContent,
  isInterventionStreaming,
}: WorkspaceLayoutProps): React.ReactElement {
  const breakpointMode = useWorkspaceUIStore((s) => s.breakpointMode)
  const setBreakpointMode = useWorkspaceUIStore((s) => s.setBreakpointMode)
  const tutorExpanded = useWorkspaceUIStore((s) => s.tutorExpanded)
  const setTutorExpanded = useWorkspaceUIStore((s) => s.setTutorExpanded)
  const toggleTutor = useWorkspaceUIStore((s) => s.toggleTutor)

  const tutorPanelRef = usePanelRef()

  // Breakpoint detection — read ONCE on mount
  useEffect(() => {
    const width = window.innerWidth
    if (width >= 1280) setBreakpointMode('desktop')
    else if (width >= 1024) setBreakpointMode('small-desktop')
    else setBreakpointMode('mobile')
  }, [setBreakpointMode])

  // Keyboard shortcuts
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const isModifier = e.metaKey || e.ctrlKey

      if (isModifier && e.key === '/') {
        e.preventDefault()
        toggleTutor()
        return
      }

      if (e.key === 'Escape' && tutorExpanded) {
        setTutorExpanded(false)
        // Move focus back to Monaco editor on collapse
        const editorTextarea = document.querySelector<HTMLTextAreaElement>('.monaco-editor textarea')
        if (editorTextarea) editorTextarea.focus()
        return
      }

      if (isModifier && e.shiftKey && e.key === 'Enter') {
        e.preventDefault()
        onBenchmark()
        return
      }

      if (isModifier && !e.shiftKey && e.key === 'Enter') {
        e.preventDefault()
        onRun()
        return
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [toggleTutor, tutorExpanded, setTutorExpanded, onRun, onBenchmark])

  // Sync imperative panel API with store
  useEffect(() => {
    if (breakpointMode !== 'desktop') return

    if (tutorExpanded) {
      tutorPanelRef.current?.expand()
    } else {
      tutorPanelRef.current?.collapse()
    }
  }, [tutorExpanded, tutorPanelRef, breakpointMode])

  const skipToEditor = useCallback((e: React.MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault()
    const editorTextarea = document.getElementById('code-editor-boundary')?.querySelector('textarea')
    if (editorTextarea) editorTextarea.focus()
  }, [])

  // Mobile layout
  if (breakpointMode === 'mobile') {
    return (
      <MobileLayout
        milestoneName={milestoneName}
        milestoneNumber={milestoneNumber}
        progress={progress}
        sessionId={sessionId}
        conceptExplainerAssets={conceptExplainerAssets}
      />
    )
  }

  const topBarProps = { milestoneName, milestoneNumber, progress, onRun, onBenchmark }

  // Small desktop layout (1024-1279px)
  if (breakpointMode === 'small-desktop') {
    return (
      <div id="workspace-container" tabIndex={-1} className="flex h-screen flex-col bg-background">
        <a href="#code-editor-boundary" className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:p-2 focus:bg-background focus:text-foreground" onClick={skipToEditor}>Skip to editor</a>
        <WorkspaceTopBar {...topBarProps} />
        <div className="relative flex-1">
          <ResizablePanelGroup orientation="vertical">
            <ResizablePanel defaultSize="70%" minSize="40%">
              <CodeEditor initialContent={initialContent} onRun={onRun} />
            </ResizablePanel>
            <ResizableHandle withHandle />
            <ResizablePanel defaultSize="30%" minSize="120px">
              <TerminalPanel outputLines={outputLines} isRunning={isRunning} onRetry={onRetry} brief={brief} criteria={criteria} criteriaResults={criteriaResults} allCriteriaMet={allCriteriaMet} onCompleteMilestone={onCompleteMilestone} conceptExplainerAssets={conceptExplainerAssets} />
            </ResizablePanel>
          </ResizablePanelGroup>

          {/* Stage 1 floating indicator — small desktop only */}
          {isStage1 && !tutorExpanded && (
            <button
              data-testid="stuck-indicator"
              className={cn(
                'fixed bottom-4 right-4 z-30 flex size-10 items-center justify-center rounded-full shadow-lg',
                'animate-pulse bg-primary/10 text-primary motion-reduce:animate-none'
              )}
              onClick={() => setTutorExpanded(true)}
              aria-label="Expand tutor panel - tutor wants to help"
            >
              <MessageCircle className="size-5" />
            </button>
          )}

          {/* Tutor overlay */}
          {tutorExpanded && (
            <>
              <div
                className="fixed inset-0 z-30"
                style={{ top: '48px' }}
                onPointerDown={() => setTutorExpanded(false)}
              />
              <div
                data-testid="tutor-overlay"
                className="fixed right-0 top-12 z-40 flex h-[calc(100vh-48px)] w-[300px] flex-col border-l bg-background shadow-lg"
              >
                <TutorPanel sessionId={sessionId} interventionStreamingContent={interventionStreamingContent} isInterventionStreaming={isInterventionStreaming} conceptExplainerAssets={conceptExplainerAssets} />
              </div>
            </>
          )}
        </div>
        <div id="workspace-announcer" aria-live="polite" role="status" className="sr-only" />
      </div>
    )
  }

  // Desktop layout (>=1280px)
  return (
    <div id="workspace-container" tabIndex={-1} className="flex h-screen flex-col bg-background">
      <a href="#code-editor-boundary" className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:p-2 focus:bg-background focus:text-foreground" onClick={skipToEditor}>Skip to editor</a>
      <WorkspaceTopBar {...topBarProps} />
      <ResizablePanelGroup orientation="horizontal" className="flex-1">
        {/* Left panel: editor + terminal */}
        <ResizablePanel defaultSize="70%" minSize="40%" maxSize="80%">
          <ResizablePanelGroup orientation="vertical">
            <ResizablePanel defaultSize="70%" minSize="40%">
              <CodeEditor initialContent={initialContent} onRun={onRun} />
            </ResizablePanel>
            <ResizableHandle withHandle />
            <ResizablePanel defaultSize="30%" minSize="120px">
              <TerminalPanel outputLines={outputLines} isRunning={isRunning} onRetry={onRetry} brief={brief} criteria={criteria} criteriaResults={criteriaResults} allCriteriaMet={allCriteriaMet} onCompleteMilestone={onCompleteMilestone} conceptExplainerAssets={conceptExplainerAssets} />
            </ResizablePanel>
          </ResizablePanelGroup>
        </ResizablePanel>

        <ResizableHandle withHandle />

        {/* Right panel: tutor (collapsible) */}
        <ResizablePanel
          panelRef={tutorPanelRef}
          collapsible={true}
          collapsedSize={32}
          defaultSize="30%"
          minSize="20%"
          maxSize="50%"
          onResize={(panelSize: PanelSize) => {
            const isCollapsed = panelSize.inPixels <= 32
            if (isCollapsed !== !tutorExpanded) {
              setTutorExpanded(!isCollapsed)
            }
          }}
        >
          <div data-testid="tutor-panel" className="flex h-full flex-col">
            {tutorExpanded ? (
              <TutorPanel sessionId={sessionId} interventionStreamingContent={interventionStreamingContent} isInterventionStreaming={isInterventionStreaming} conceptExplainerAssets={conceptExplainerAssets} />
            ) : (
              <button
                className={cn(
                  'flex h-full w-full items-center justify-center hover:text-foreground',
                  isStage1
                    ? 'animate-pulse bg-primary/10 text-primary motion-reduce:animate-none'
                    : 'text-muted-foreground'
                )}
                onClick={() => setTutorExpanded(true)}
                aria-label={isStage1 ? 'Expand tutor panel - tutor wants to help' : 'Expand tutor panel'}
              >
                <MessageCircle className="size-4" />
              </button>
            )}
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>
      <div id="workspace-announcer" aria-live="polite" role="status" className="sr-only" />
    </div>
  )
}

export { WorkspaceLayout }
export type { WorkspaceLayoutProps }

function MobileLayout({
  milestoneName,
  milestoneNumber,
  progress,
  sessionId,
  conceptExplainerAssets,
}: {
  readonly milestoneName: string
  readonly milestoneNumber: number
  readonly progress: number
  readonly sessionId: string | null
  readonly conceptExplainerAssets: readonly ConceptExplainerAsset[]
}): React.ReactElement {
  const tutorExpanded = useWorkspaceUIStore((s) => s.tutorExpanded)

  return (
    <div className="flex h-screen flex-col bg-background">
      <div className="flex flex-col items-center justify-center p-6 text-center">
        <h2 className="mb-2 text-lg font-medium">
          Milestone {milestoneNumber}: {milestoneName}
        </h2>
        <p className="mb-4 text-2xl font-bold">{progress}%</p>
        <p className="text-muted-foreground">Continue on desktop to build</p>
      </div>
      {/* Read-only tutor panel on mobile */}
      {tutorExpanded && (
        <div className="flex-1 border-t">
          <TutorPanel sessionId={sessionId} readOnly conceptExplainerAssets={conceptExplainerAssets} />
        </div>
      )}
      <div id="workspace-announcer" aria-live="polite" role="status" className="sr-only" />
    </div>
  )
}
