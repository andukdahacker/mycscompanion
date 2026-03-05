import { Minus } from 'lucide-react'
import { Button } from '@mycscompanion/ui/src/components/ui/button'
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from '@mycscompanion/ui/src/components/ui/collapsible'

interface ErrorPresentationProps {
  readonly interpretation: string
  readonly rawOutput: string
  readonly isUserError: boolean
  readonly onRetry?: () => void
}

function ErrorPresentation({ interpretation, rawOutput, isUserError, onRetry }: ErrorPresentationProps): React.ReactElement {
  if (!isUserError) {
    // Platform error — distinct visual treatment (error-surface bg, not red)
    return (
      <div className="rounded border border-border bg-error-surface p-3">
        <div className="flex items-start gap-2">
          <Minus className="mt-0.5 size-4 shrink-0 text-secondary-foreground" />
          <div>
            <p className="text-[13px] text-secondary-foreground">{interpretation}</p>
            {onRetry && (
              <Button variant="outline" size="sm" className="mt-2" onClick={onRetry}>
                Try again
              </Button>
            )}
          </div>
        </div>
      </div>
    )
  }

  // User-code error — two-tier presentation
  return (
    <div className="space-y-1">
      {/* Top tier: human-readable interpretation */}
      <div className="border-l-2 border-secondary-foreground bg-elevated px-3 py-2">
        <div className="flex items-start gap-2">
          <Minus className="mt-0.5 size-4 shrink-0 text-secondary-foreground" />
          <p className="text-[13px] text-foreground">{interpretation}</p>
        </div>
      </div>
      {/* Bottom tier: collapsible raw compiler output */}
      <Collapsible>
        <CollapsibleTrigger className="flex min-h-11 items-center gap-1 px-3 text-xs text-muted-foreground hover:text-foreground">
          Show/Hide raw compiler output
        </CollapsibleTrigger>
        <CollapsibleContent>
          <pre className="mx-3 overflow-x-auto rounded bg-background p-2 font-mono text-xs text-muted-foreground">
            {rawOutput}
          </pre>
        </CollapsibleContent>
      </Collapsible>
    </div>
  )
}

export { ErrorPresentation }
export type { ErrorPresentationProps }
