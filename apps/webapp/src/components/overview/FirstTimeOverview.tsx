import { useNavigate, Link } from 'react-router'
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
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">mycscompanion</span>
          <Link
            to="/settings"
            className="text-sm text-muted-foreground hover:text-foreground hover:underline"
            aria-label="Account settings"
          >
            Settings
          </Link>
        </div>
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

        <div className="flex flex-col items-center gap-3">
          <Button size="lg" onClick={handleStart}>
            Start Building
          </Button>
          <Link to="/progress" className="text-sm text-muted-foreground hover:underline">
            View all milestones
          </Link>
        </div>
      </div>
    </main>
  )
}

export { FirstTimeOverview }
