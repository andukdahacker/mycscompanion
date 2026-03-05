import { useRef } from 'react'
import { Check, Loader2 } from 'lucide-react'
import { ScrollArea } from '@mycscompanion/ui/src/components/ui/scroll-area'
import { useWorkspaceUIStore } from '../../stores/workspace-ui-store'
import { useAutoScroll } from '../../hooks/use-auto-scroll'
import { ErrorPresentation } from './ErrorPresentation'

type OutputLine =
  | { readonly kind: 'stdout'; readonly text: string }
  | { readonly kind: 'stderr'; readonly text: string }
  | { readonly kind: 'error'; readonly interpretation: string; readonly rawOutput: string; readonly isUserError: boolean }
  | { readonly kind: 'status'; readonly text: string; readonly phase: string }
  | { readonly kind: 'success'; readonly text: string }

interface TerminalPanelProps {
  readonly outputLines: ReadonlyArray<OutputLine>
  readonly isRunning: boolean
  readonly onRetry?: () => void
}

const TABS = ['output', 'criteria'] as const

function TerminalPanel({ outputLines, isRunning, onRetry }: TerminalPanelProps): React.ReactElement {
  const activeTab = useWorkspaceUIStore((s) => s.activeTerminalTab)
  const setActiveTab = useWorkspaceUIStore((s) => s.setActiveTerminalTab)
  const scrollRef = useAutoScroll([outputLines])
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([])

  function handleTabKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    const currentIndex = TABS.indexOf(activeTab)
    let nextIndex = currentIndex

    switch (e.key) {
      case 'ArrowRight':
        nextIndex = (currentIndex + 1) % TABS.length
        break
      case 'ArrowLeft':
        nextIndex = (currentIndex - 1 + TABS.length) % TABS.length
        break
      case 'Home':
        nextIndex = 0
        break
      case 'End':
        nextIndex = TABS.length - 1
        break
      default:
        return
    }

    e.preventDefault()
    const tab = TABS[nextIndex]
    if (tab) setActiveTab(tab)
    tabRefs.current[nextIndex]?.focus()
  }

  const outputTabId = 'terminal-tab-output'
  const criteriaTabId = 'terminal-tab-criteria'
  const panelId = 'terminal-tabpanel'

  return (
    <div className="flex h-full flex-col">
      {/* Tab bar */}
      <div role="tablist" aria-label="Terminal tabs" className="flex border-b" onKeyDown={handleTabKeyDown}>
        <button
          ref={(el) => { tabRefs.current[0] = el }}
          id={outputTabId}
          role="tab"
          aria-selected={activeTab === 'output'}
          aria-controls={panelId}
          tabIndex={activeTab === 'output' ? 0 : -1}
          className={`min-h-11 px-4 text-sm font-medium transition-colors ${
            activeTab === 'output'
              ? 'border-b-2 border-primary text-foreground'
              : 'text-muted-foreground hover:text-foreground'
          }`}
          onClick={() => setActiveTab('output')}
        >
          Output
        </button>
        <button
          ref={(el) => { tabRefs.current[1] = el }}
          id={criteriaTabId}
          role="tab"
          aria-selected={activeTab === 'criteria'}
          aria-controls={panelId}
          tabIndex={activeTab === 'criteria' ? 0 : -1}
          className={`min-h-11 px-4 text-sm font-medium transition-colors ${
            activeTab === 'criteria'
              ? 'border-b-2 border-primary text-foreground'
              : 'text-muted-foreground hover:text-foreground'
          }`}
          onClick={() => setActiveTab('criteria')}
        >
          Criteria
        </button>
      </div>

      {/* Tab panel */}
      <div
        id={panelId}
        role="tabpanel"
        aria-labelledby={activeTab === 'output' ? outputTabId : criteriaTabId}
        className="flex-1 bg-card font-mono text-sm"
      >
        {activeTab === 'output' ? (
          <ScrollArea className="h-full" viewportRef={scrollRef}>
            <OutputContent outputLines={outputLines} isRunning={isRunning} onRetry={onRetry} />
          </ScrollArea>
        ) : (
          <div className="flex h-full items-center justify-center">
            <p className="text-muted-foreground">Acceptance criteria will appear here after your first submission</p>
          </div>
        )}
      </div>
    </div>
  )
}

function OutputContent({
  outputLines,
  isRunning,
  onRetry,
}: {
  readonly outputLines: ReadonlyArray<OutputLine>
  readonly isRunning: boolean
  readonly onRetry?: () => void
}): React.ReactElement {
  if (isRunning && outputLines.length === 0) {
    return (
      <div className="flex items-center gap-2 p-3 text-secondary-foreground">
        <Loader2 className="size-4 animate-spin motion-reduce:animate-none" />
        <span>Compiling...</span>
      </div>
    )
  }

  if (outputLines.length === 0) {
    return (
      <div className="p-3 text-muted-foreground">
        <span className="animate-pulse">$</span>
      </div>
    )
  }

  return (
    <div className="space-y-1 p-3">
      {outputLines.map((line, i) => (
        <OutputLineRow key={i} line={line} onRetry={onRetry} />
      ))}
    </div>
  )
}

function OutputLineRow({
  line,
  onRetry,
}: {
  readonly line: OutputLine
  readonly onRetry?: () => void
}): React.ReactElement {
  switch (line.kind) {
    case 'stdout':
      return <pre className="whitespace-pre-wrap text-foreground">{line.text}</pre>
    case 'stderr':
      return <pre className="whitespace-pre-wrap text-secondary-foreground">{line.text}</pre>
    case 'status':
      return <p className="text-muted-foreground">{line.text}</p>
    case 'success':
      return (
        <p className="flex items-center gap-1 text-primary">
          <Check className="size-4" />
          {line.text}
        </p>
      )
    case 'error':
      return (
        <ErrorPresentation
          interpretation={line.interpretation}
          rawOutput={line.rawOutput}
          isUserError={line.isUserError}
          onRetry={line.isUserError ? undefined : onRetry}
        />
      )
  }
}

export { TerminalPanel }
export type { TerminalPanelProps, OutputLine }
