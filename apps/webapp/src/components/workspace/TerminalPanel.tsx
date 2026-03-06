import { useRef } from 'react'
import { Check, Loader2 } from 'lucide-react'
import { ScrollArea } from '@mycscompanion/ui/src/components/ui/scroll-area'
import type { AcceptanceCriterion, ConceptExplainerAsset, CriterionResult } from '@mycscompanion/shared'
import { useWorkspaceUIStore } from '../../stores/workspace-ui-store'
import { useAutoScroll } from '../../hooks/use-auto-scroll'
import { ErrorPresentation } from './ErrorPresentation'
import { MilestoneBrief } from './MilestoneBrief'
import { ConceptExplainers } from './ConceptExplainers'

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
  readonly allCriteriaMet?: boolean
  readonly onCompleteMilestone?: () => void
  readonly conceptExplainerAssets: readonly ConceptExplainerAsset[]
}

const TAB_LABELS: Record<string, string> = {
  brief: 'Brief',
  diagrams: 'Diagrams',
  output: 'Output',
  criteria: 'Criteria',
}

function TerminalPanel({ outputLines, isRunning, onRetry, brief, criteria, criteriaResults, allCriteriaMet, onCompleteMilestone, conceptExplainerAssets }: TerminalPanelProps): React.ReactElement {
  const activeTab = useWorkspaceUIStore((s) => s.activeTerminalTab)
  const setActiveTab = useWorkspaceUIStore((s) => s.setActiveTerminalTab)
  const scrollRef = useAutoScroll([outputLines])
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([])

  const visibleTabs = conceptExplainerAssets.length > 0
    ? (['brief', 'diagrams', 'output', 'criteria'] as const)
    : (['brief', 'output', 'criteria'] as const)

  // If active tab is diagrams but no assets exist, fall back to brief
  const effectiveTab = activeTab === 'diagrams' && conceptExplainerAssets.length === 0
    ? 'brief'
    : activeTab

  function handleTabKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    const currentIndex = visibleTabs.indexOf(effectiveTab as typeof visibleTabs[number])
    let nextIndex = currentIndex

    switch (e.key) {
      case 'ArrowRight':
        nextIndex = (currentIndex + 1) % visibleTabs.length
        break
      case 'ArrowLeft':
        nextIndex = (currentIndex - 1 + visibleTabs.length) % visibleTabs.length
        break
      case 'Home':
        nextIndex = 0
        break
      case 'End':
        nextIndex = visibleTabs.length - 1
        break
      default:
        return
    }

    e.preventDefault()
    const tab = visibleTabs[nextIndex]
    if (tab) setActiveTab(tab)
    tabRefs.current[nextIndex]?.focus()
  }

  const panelId = 'terminal-tabpanel'

  return (
    <div className="flex h-full flex-col">
      {/* Tab bar */}
      <div role="tablist" aria-label="Terminal tabs" className="flex border-b" onKeyDown={handleTabKeyDown}>
        {visibleTabs.map((tab, i) => (
          <button
            key={tab}
            ref={(el) => { tabRefs.current[i] = el }}
            id={`terminal-tab-${tab}`}
            role="tab"
            aria-selected={effectiveTab === tab}
            aria-controls={panelId}
            tabIndex={effectiveTab === tab ? 0 : -1}
            className={`min-h-11 px-4 text-sm font-medium transition-colors ${
              effectiveTab === tab
                ? 'border-b-2 border-primary text-foreground'
                : 'text-muted-foreground hover:text-foreground'
            }`}
            onClick={() => setActiveTab(tab)}
          >
            {TAB_LABELS[tab]}
          </button>
        ))}
      </div>

      {/* Tab panel */}
      <div
        id={panelId}
        role="tabpanel"
        aria-labelledby={`terminal-tab-${effectiveTab}`}
        className="flex-1 bg-card font-mono text-sm"
      >
        {effectiveTab === 'brief' ? (
          brief ? (
            <MilestoneBrief brief={brief} />
          ) : (
            <div className="flex h-full items-center justify-center">
              <p className="text-muted-foreground">No brief available for this milestone</p>
            </div>
          )
        ) : effectiveTab === 'diagrams' ? (
          <ConceptExplainers assets={conceptExplainerAssets} />
        ) : effectiveTab === 'output' ? (
          <ScrollArea className="h-full" viewportRef={scrollRef}>
            <OutputContent outputLines={outputLines} isRunning={isRunning} onRetry={onRetry} />
          </ScrollArea>
        ) : (
          <CriteriaContent criteria={criteria} criteriaResults={criteriaResults} allCriteriaMet={allCriteriaMet} onCompleteMilestone={onCompleteMilestone} />
        )}
      </div>
    </div>
  )
}

function CriteriaContent({
  criteria,
  criteriaResults,
  allCriteriaMet,
  onCompleteMilestone,
}: {
  readonly criteria: ReadonlyArray<AcceptanceCriterion>
  readonly criteriaResults: ReadonlyArray<CriterionResult> | null
  readonly allCriteriaMet?: boolean
  readonly onCompleteMilestone?: () => void
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
        {allCriteriaMet && onCompleteMilestone ? (
          <div className="border-t p-3">
            <button
              type="button"
              className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onClick={onCompleteMilestone}
              aria-label="Complete milestone and advance to next"
            >
              Complete Milestone
            </button>
          </div>
        ) : null}
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
