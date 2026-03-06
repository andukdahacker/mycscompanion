import { Button } from '@mycscompanion/ui/src/components/ui/button'

interface OverviewErrorProps {
  readonly onRetry: () => void
}

function OverviewError({ onRetry }: OverviewErrorProps): React.ReactElement {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-background text-foreground">
      <p className="mb-4 text-muted-foreground">Failed to load overview.</p>
      <Button variant="outline" onClick={onRetry}>
        Retry
      </Button>
    </main>
  )
}

export { OverviewError }
