import { useRef } from 'react'
import { Check, Loader2 } from 'lucide-react'
import { ScrollArea } from '@mycscompanion/ui/src/components/ui/scroll-area'
import type { AcceptanceCriterion, CriterionResult } from '@mycscompanion/shared'
import { useWorkspaceUIStore } from '../../stores/workspace-ui-store'
import { useAutoScroll } from '../../hooks/use-auto-scroll'
import { ErrorPresentation } from './ErrorPresentation'
import { MilestoneBrief } from './MilestoneBrief'

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
  readonly brief: string | null
  readonly criteria: ReadonlyArray<AcceptanceCriterion>
  readonly criteriaResults: ReadonlyArray<CriterionResult> | null
}

const TABS = ['brief', 'output', 'criteria'] as const

function TerminalPanel({ outputLines, isRunning, onRetry, brief, criteria, criteriaResults }: TerminalPanelProps): React.ReactElement {
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

  const briefTabId = 'terminal-tab-brief'
  const outputTabId = 'terminal-tab-output'
  const criteriaTabId = 'terminal-tab-criteria'
  const panelId = 'terminal-tabpanel'

  function getTabLabelId(): string {
    if (activeTab === 'brief') return briefTabId
    if (activeTab === 'output') return outputTabId
    return criteriaTabId
  }

  return (
    <div className="flex h-full flex-col">
      {/* Tab bar */}
      <div role="tablist" aria-label="Terminal tabs" className="flex border-b" onKeyDown={handleTabKeyDown}>
        <button
          ref={(el) => { tabRefs.current[0] = el }}
          id={briefTabId}
          role="tab"
          aria-selected={activeTab === 'brief'}
          aria-controls={panelId}
          tabIndex={activeTab === 'brief' ? 0 : -1}
          className={`min-h-11 px-4 text-sm font-medium transition-colors ${
            activeTab === 'brief'
              ? 'border-b-2 border-primary text-foreground'
              : 'text-muted-foreground hover:text-foreground'
          }`}
          onClick={() => setActiveTab('brief')}
        >
          Brief
        </button>
        <button
          ref={(el) => { tabRefs.current[1] = el }}
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
          ref={(el) => { tabRefs.current[2] = el }}
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
        aria-labelledby={getTabLabelId()}
        className="flex-1 bg-card font-mono text-sm"
      >
        {activeTab === 'brief' ? (
          brief ? (
            <MilestoneBrief brief={brief} />
          ) : (
            <div className="flex h-full items-center justify-center">
              <p className="text-muted-foreground">No brief available for this milestone</p>
            </div>
          )
        ) : activeTab === 'output' ? (
          <ScrollArea className="h-full" viewportRef={scrollRef}>
            <OutputContent outputLines={outputLines} isRunning={isRunning} onRetry={onRetry} />
          </ScrollArea>
        ) : (
          <CriteriaContent criteria={criteria} criteriaResults={criteriaResults} />
        )}
      </div>
    </div>
  )
}

function CriteriaContent({
  criteria,
  criteriaResults,
}: {
  readonly criteria: ReadonlyArray<AcceptanceCriterion>
  readonly criteriaResults: ReadonlyArray<CriterionResult> | null
}): React.ReactElement {
  if (criteria.length === 0) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-muted-foreground">No acceptance criteria defined for this milestone</p>
      </div>
    )
  }

  // Show evaluated results when available
  if (criteriaResults && criteriaResults.length > 0) {
    const sorted = [...criteriaResults].sort((a, b) => a.order - b.order)
    return (
      <ScrollArea className="h-full">
        <ul className="space-y-2 p-3" data-testid="criteria-list" aria-live="polite">
          {sorted.map((result) => (
            <li key={result.name} className="flex items-start gap-2">
              {result.status === 'met' ? (
                <Check className="mt-0.5 size-4 text-primary" aria-hidden="true" />
              ) : (
                <span className="mt-0.5 text-muted-foreground" aria-hidden="true">—</span>
              )}
              <div>
                <span className="font-medium text-foreground">
                  {result.name}: {result.status === 'met' ? 'MET' : 'NOT MET'}
                </span>
                <p className="text-sm text-muted-foreground">
                  Expected: {JSON.stringify(result.expected)}
                </p>
                {result.actual !== null ? (
                  <p className="text-sm text-muted-foreground">
                    Actual: {JSON.stringify(result.actual)}
                  </p>
                ) : null}
                {result.status === 'not-met' && result.errorHint ? (
                  <p className="text-sm text-muted-foreground">
                    Hint: {result.errorHint}
                  </p>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      </ScrollArea>
    )
  }

  // Unevaluated state — show criteria with gray dashes
  return (
    <ScrollArea className="h-full">
      <ul className="space-y-2 p-3" data-testid="criteria-list" aria-live="polite">
        {criteria.map((criterion) => (
          <li key={criterion.name} className="flex items-start gap-2 text-secondary-foreground">
            <span className="mt-0.5 text-muted-foreground" aria-hidden="true">—</span>
            <div>
              <span className="font-medium text-foreground">{criterion.name}</span>
              {criterion.description ? (
                <p className="text-sm text-muted-foreground">{criterion.description}</p>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </ScrollArea>
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
