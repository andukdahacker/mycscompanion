import { useParams, useNavigate } from 'react-router'
import { useCompletionData } from '../hooks/use-completion-data'
import { useTrajectoryData } from '../hooks/use-trajectory-data'
import { CompletionSkeleton } from '../components/completion/CompletionSkeleton'
import { TrajectoryChart, TrajectoryDataTable } from '../components/overview/TrajectoryChart'
import type { CriterionResult } from '@mycscompanion/shared'

function Completion(): React.ReactElement {
  const { milestoneId } = useParams<{ milestoneId: string }>()
  const navigate = useNavigate()
  const { data, isLoading, isError, refetch } = useCompletionData(milestoneId)
  const { dataPoints: trajectoryDataPoints, isLoading: trajectoryLoading, error: trajectoryError } = useTrajectoryData()

  if (isLoading) {
    return <CompletionSkeleton />
  }

  if (isError || !data) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background text-foreground">
        <p className="mb-4 text-muted-foreground">Failed to load completion data.</p>
        <button
          type="button"
          className="rounded-md bg-primary px-4 py-2 text-primary-foreground"
          onClick={() => refetch()}
        >
          Retry
        </button>
      </div>
    )
  }

  const isLastMilestone = data.nextMilestone === null
  const currentMilestoneBenchmark = trajectoryDataPoints.find(
    (dp) => dp.milestoneNumber === data.milestoneNumber
  ) ?? null

  function handleContinue(): void {
    navigate('/overview', { replace: true })
  }

  return (
    <div className="flex min-h-screen flex-col items-center bg-background px-4 py-16 text-foreground">
      <div className="w-full max-w-2xl space-y-8">
        {/* Header */}
        <h1
          className="text-center text-2xl font-semibold tracking-tight"
          aria-live="polite"
        >
          Milestone {data.milestoneNumber}: {data.milestoneName} — Complete
        </h1>
        <p className="sr-only" aria-live="assertive">
          Milestone {data.milestoneNumber} complete. All criteria met.
        </p>

        {/* Criteria Summary */}
        <section aria-label="Criteria summary">
          <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-muted-foreground">
            Acceptance Criteria
          </h2>
          <ul className="space-y-2">
            {data.criteriaResults.map((criterion: CriterionResult) => (
              <li key={criterion.name} className="flex items-center gap-2 text-sm">
                <span className="text-success" aria-hidden="true">&#10003;</span>
                <span className="text-foreground">{criterion.name}</span>
                <span className="text-muted-foreground">— met</span>
              </li>
            ))}
          </ul>
        </section>

        {/* Benchmark Summary */}
        {currentMilestoneBenchmark ? (
          <section aria-label="Benchmark summary">
            <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-muted-foreground">
              Benchmark Performance
            </h2>
            <div className="flex items-baseline gap-6">
              <div>
                <span className="text-xs text-muted-foreground">Best</span>
                <p className="text-lg font-semibold text-foreground">
                  {new Intl.NumberFormat().format(currentMilestoneBenchmark.bestOpsPerSec)} ops/sec
                </p>
              </div>
              <div>
                <span className="text-xs text-muted-foreground">Ratio</span>
                <p className="text-sm font-semibold text-foreground">
                  {currentMilestoneBenchmark.bestNormalizedRatio.toFixed(2)}x ref
                </p>
              </div>
              <div>
                <span className="text-xs text-muted-foreground">Runs</span>
                <p className="text-sm font-semibold text-foreground">
                  {currentMilestoneBenchmark.totalSubmissions}
                </p>
              </div>
            </div>
          </section>
        ) : null}

        {/* Trajectory Chart */}
        <section aria-label="Performance trajectory">
          {trajectoryLoading ? (
            <div className="w-full rounded-lg border border-border p-4 lg:max-w-[400px] xl:max-w-[500px]">
              <div className="space-y-3">
                <div className="h-4 w-1/3 animate-pulse rounded bg-muted motion-reduce:animate-none" />
                <div className="h-[140px] animate-pulse rounded bg-muted motion-reduce:animate-none" />
              </div>
            </div>
          ) : trajectoryError && trajectoryDataPoints.length === 0 ? (
            <div className="w-full rounded-lg border border-border bg-card p-4 lg:max-w-[400px] xl:max-w-[500px]">
              <p className="text-sm text-muted-foreground">Unable to load trajectory data.</p>
            </div>
          ) : (
            <>
              <TrajectoryChart
                dataPoints={trajectoryDataPoints}
                currentMilestoneNumber={data.milestoneNumber}
                animate
              />
              {trajectoryDataPoints.length > 0 ? (
                <TrajectoryDataTable dataPoints={trajectoryDataPoints} />
              ) : null}
            </>
          )}
        </section>

        {/* Next Milestone Preview */}
        {isLastMilestone ? (
          <section aria-label="Track complete">
            <h2 className="mb-2 text-lg font-medium">Track Complete</h2>
            <p className="text-sm text-muted-foreground">
              You have completed all milestones in this track.
            </p>
          </section>
        ) : (
          <section aria-label="Next milestone preview">
            <h2 className="mb-2 text-sm font-medium uppercase tracking-wide text-muted-foreground">
              Next: Milestone {data.nextMilestone.position}
            </h2>
            <div className="rounded-lg border border-border p-4">
              <h3 className="mb-1 font-medium">{data.nextMilestone.title}</h3>
              <p className="text-sm text-muted-foreground">
                {data.nextMilestone.briefExcerpt}
              </p>
            </div>
          </section>
        )}

        {/* Action Button */}
        <div className="flex justify-center">
          <button
            type="button"
            className="rounded-md bg-primary px-6 py-3 font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            onClick={handleContinue}
            aria-label={isLastMilestone ? 'Return to overview' : 'Continue to next milestone'}
          >
            {isLastMilestone ? 'Return to Overview' : 'Continue to Next Milestone'}
          </button>
        </div>
      </div>

    </div>
  )
}

// Default export for React.lazy
export default Completion
