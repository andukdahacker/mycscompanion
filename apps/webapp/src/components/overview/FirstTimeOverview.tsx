import { useNavigate } from 'react-router'
import { Button } from '@mycscompanion/ui/src/components/ui/button'
import type { OverviewMilestoneInfo } from '@mycscompanion/shared'

interface FirstTimeOverviewProps {
  readonly milestone: OverviewMilestoneInfo
}

function FirstTimeOverview({ milestone }: FirstTimeOverviewProps): React.ReactElement {
  const navigate = useNavigate()

  function handleStart(): void {
    navigate(`/workspace/${milestone.id}`)
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-2xl space-y-8">
        <section>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            You&apos;re building a database from scratch.
          </h1>
          <p className="mt-3 text-muted-foreground">
            By the end, you&apos;ll understand how PostgreSQL, Redis, and SQLite work — because
            you&apos;ll have built your own.
          </p>
        </section>

        <section aria-label="First milestone">
          <div className="rounded-lg border border-border p-6">
            <h2 className="font-medium text-foreground">{milestone.title}</h2>
            <p className="mt-2 text-sm text-muted-foreground">{milestone.briefExcerpt}</p>
          </div>
          <p className="mt-4 text-sm text-muted-foreground">
            Start with a key-value store. Write the Get and Put methods. Run the benchmark.
          </p>
        </section>

        <div className="flex justify-center">
          <Button size="lg" onClick={handleStart}>
            Start Building
          </Button>
        </div>
      </div>
    </main>
  )
}

export { FirstTimeOverview }
