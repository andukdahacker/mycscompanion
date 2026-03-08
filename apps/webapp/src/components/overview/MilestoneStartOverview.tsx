import { useNavigate, Link } from 'react-router'
import { Button } from '@mycscompanion/ui/src/components/ui/button'
import type { OverviewData } from '@mycscompanion/shared'

interface MilestoneStartOverviewProps {
  readonly data: OverviewData
}

function MilestoneStartOverview({ data }: MilestoneStartOverviewProps): React.ReactElement {
  const navigate = useNavigate()
  const { milestone, criteriaProgress } = data

  function handleContinue(): void {
    navigate(`/workspace/${milestone.id}`)
  }

  function progressText(): string {
    if (!criteriaProgress) {
      return 'No submissions'
    }
    const percent = criteriaProgress.total > 0
      ? Math.round((criteriaProgress.met / criteriaProgress.total) * 100)
      : 0
    return `${criteriaProgress.met}/${criteriaProgress.total} criteria (${percent}%)`
  }

  function nextStepText(): string {
    if (!criteriaProgress) {
      return 'Submit code to see progress'
    }
    if (criteriaProgress.nextCriterionName) {
      return criteriaProgress.nextCriterionName
    }
    return 'All criteria met'
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-2xl space-y-8">
        <section>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Milestone {milestone.position}: {milestone.title}
          </h1>
          {milestone.csConceptLabel ? (
            <p className="mt-1 text-sm text-muted-foreground">{milestone.csConceptLabel}</p>
          ) : null}
        </section>

        <section aria-label="Milestone statistics" className="flex items-baseline gap-6">
          <div aria-label="Progress">
            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Progress</span>
            <p className="text-sm font-semibold text-foreground">{progressText()}</p>
          </div>

          <div aria-label="Benchmark">
            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Benchmark</span>
            <p className="text-sm text-muted-foreground">—</p>
          </div>

          <div aria-label="Next step">
            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Next</span>
            <p className="text-sm font-semibold text-foreground">{nextStepText()}</p>
          </div>
        </section>

        {data.sessionSummary ? (
          <p className="text-sm text-muted-foreground">{data.sessionSummary}</p>
        ) : null}

        <div className="flex flex-col items-center gap-3">
          <Button size="lg" onClick={handleContinue}>
            Continue Building
          </Button>
          <Link to="/progress" className="text-sm text-muted-foreground hover:underline">
            View all milestones
          </Link>
        </div>
      </div>
    </main>
  )
}

export { MilestoneStartOverview }
