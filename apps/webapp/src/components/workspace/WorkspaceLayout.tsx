import { useCallback, useEffect } from 'react'
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
  usePanelRef,
} from '@mycscompanion/ui/src/components/ui/resizable'
import type { PanelSize } from '@mycscompanion/ui/src/components/ui/resizable'
import { Button } from '@mycscompanion/ui/src/components/ui/button'
import { MessageCircle, RefreshCw } from 'lucide-react'
import type { AcceptanceCriterion, CriterionResult } from '@mycscompanion/shared'
import { WorkspaceTopBar } from './WorkspaceTopBar'
import { CodeEditor } from './CodeEditor'
import { TerminalPanel } from './TerminalPanel'
import type { OutputLine } from './TerminalPanel'
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
}: WorkspaceLayoutProps): React.ReactElement {
  const breakpointMode = useWorkspaceUIStore((s) => s.breakpointMode)
  const setBreakpointMode = useWorkspaceUIStore((s) => s.setBreakpointMode)
  const tutorExpanded = useWorkspaceUIStore((s) => s.tutorExpanded)
  const tutorAvailable = useWorkspaceUIStore((s) => s.tutorAvailable)
  const setTutorExpanded = useWorkspaceUIStore((s) => s.setTutorExpanded)
  const toggleTutor = useWorkspaceUIStore((s) => s.toggleTutor)
  const setTutorAvailable = useWorkspaceUIStore((s) => s.setTutorAvailable)

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
    return <MobileLayout milestoneName={milestoneName} milestoneNumber={milestoneNumber} progress={progress} />
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
              <TerminalPanel outputLines={outputLines} isRunning={isRunning} onRetry={onRetry} brief={brief} criteria={criteria} criteriaResults={criteriaResults} />
            </ResizablePanel>
          </ResizablePanelGroup>

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
                <div className="flex items-center justify-between border-b p-3">
                  <span className="text-sm font-medium">AI Tutor</span>
                  <Button variant="ghost" size="icon-xs" onClick={() => setTutorExpanded(false)}>
                    &times;
                  </Button>
                </div>
                <TutorContent tutorAvailable={tutorAvailable} onRetry={() => setTutorAvailable(true)} />
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
              <TerminalPanel outputLines={outputLines} isRunning={isRunning} onRetry={onRetry} brief={brief} criteria={criteria} criteriaResults={criteriaResults} />
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
              <TutorContent tutorAvailable={tutorAvailable} onRetry={() => setTutorAvailable(true)} />
            ) : (
              <button
                className="flex h-full w-full items-center justify-center text-muted-foreground hover:text-foreground"
                onClick={() => setTutorExpanded(true)}
                aria-label="Expand tutor panel"
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

function TutorContent({
  tutorAvailable,
  onRetry,
}: {
  readonly tutorAvailable: boolean
  readonly onRetry: () => void
}): React.ReactElement {
  if (!tutorAvailable) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-4 text-center">
        <MessageCircle className="size-8 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">AI tutor temporarily unavailable</p>
        <Button variant="outline" size="sm" onClick={onRetry}>
          <RefreshCw className="size-3.5" />
          Retry
        </Button>
      </div>
    )
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center p-4 text-center text-muted-foreground">
      <MessageCircle className="mb-2 size-8" />
      <p className="text-sm">AI Tutor (Epic 6)</p>
    </div>
  )
}

export { WorkspaceLayout }
export type { WorkspaceLayoutProps }

function MobileLayout({
  milestoneName,
  milestoneNumber,
  progress,
}: {
  readonly milestoneName: string
  readonly milestoneNumber: number
  readonly progress: number
}): React.ReactElement {
  return (
    <div className="flex h-screen flex-col items-center justify-center bg-background p-6 text-center">
      <h2 className="mb-2 text-lg font-medium">
        Milestone {milestoneNumber}: {milestoneName}
      </h2>
      <p className="mb-4 text-2xl font-bold">{progress}%</p>
      <p className="text-muted-foreground">Continue on desktop to build</p>
    </div>
  )
}
