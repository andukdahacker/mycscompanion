import { useNavigate } from 'react-router'
import { Button } from '@mycscompanion/ui/src/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@mycscompanion/ui/src/components/ui/card'
import type { OverviewData } from '@mycscompanion/shared'

interface MilestoneStartOverviewProps {
  readonly data: OverviewData
}

function MilestoneStartOverview({ data }: MilestoneStartOverviewProps): React.ReactElement {
  const navigate = useNavigate()
  const { milestone, criteriaProgress } = data

  const progressPercent = criteriaProgress && criteriaProgress.total > 0
    ? Math.round((criteriaProgress.met / criteriaProgress.total) * 100)
    : 0

  function handleContinue(): void {
    navigate(`/workspace/${milestone.id}`)
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
          {criteriaProgress ? (
            <p className="mt-2 text-sm text-muted-foreground">
              {criteriaProgress.met} of {criteriaProgress.total} criteria met — {progressPercent}%
            </p>
          ) : null}
        </section>

        <div className="grid gap-4 sm:grid-cols-2">
          <section aria-label="Benchmark">
            <Card className="border-dashed">
              <CardHeader>
                <CardTitle className="text-sm font-medium">Benchmark</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl text-muted-foreground">—</p>
              </CardContent>
            </Card>
          </section>

          <section aria-label="Next step">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium">Next Step</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-foreground">{nextStepText()}</p>
              </CardContent>
            </Card>
          </section>

          <section aria-label="Context" className="sm:col-span-2">
            {data.sessionSummary ? (
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm font-medium">Context</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-foreground">{data.sessionSummary}</p>
                </CardContent>
              </Card>
            ) : (
              <Card className="border-dashed">
                <CardHeader>
                  <CardTitle className="text-sm font-medium">Context</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl text-muted-foreground">—</p>
                </CardContent>
              </Card>
            )}
          </section>
        </div>

        <div className="flex justify-center">
          <Button size="lg" onClick={handleContinue}>
            Continue Building
          </Button>
        </div>
      </div>
    </main>
  )
}

export { MilestoneStartOverview }
