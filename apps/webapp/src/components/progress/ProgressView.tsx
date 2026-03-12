import { Link } from 'react-router'
import { useTrackProgress } from '../../hooks/use-track-progress'
import { MilestoneProgressItem } from './MilestoneProgressItem'
import { ProgressSkeleton } from './ProgressSkeleton'

function ProgressView(): React.ReactElement {
  const { data, isLoading, error, refetch } = useTrackProgress()

  if (isLoading) return <ProgressSkeleton />

  if (error || !data) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background p-4">
        <div className="text-center space-y-4">
          <p className="text-muted-foreground">Something went wrong loading your progress.</p>
          <button
            onClick={() => refetch()}
            className="text-sm font-medium text-primary hover:underline"
          >
            Try again
          </button>
        </div>
      </main>
    )
  }

  return (
    <main className="flex min-h-screen justify-center bg-background p-4 pt-12" aria-label="Track progress">
      <div className="w-full max-w-2xl space-y-6">
        <div className="flex items-center justify-between">
          <Link
            to="/overview"
            className="text-sm text-muted-foreground hover:underline"
          >
            ← Back to overview
          </Link>
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
            {data.trackName}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {data.completedCount} of {data.totalCount} milestones completed
          </p>
        </section>

        <div className="space-y-4" role="list" aria-label="Milestones">
          {data.milestones.map((milestone) => (
            <div key={milestone.id} role="listitem">
              <MilestoneProgressItem milestone={milestone} />
            </div>
          ))}
        </div>
      </div>
    </main>
  )
}

export { ProgressView }
