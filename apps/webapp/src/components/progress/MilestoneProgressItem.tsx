import { Link } from 'react-router'
import type { MilestoneProgressInfo } from '@mycscompanion/shared'

interface MilestoneProgressItemProps {
  readonly milestone: MilestoneProgressInfo
}

function MilestoneProgressItem({ milestone }: MilestoneProgressItemProps): React.ReactElement {
  const { status, position, title, description, criteriaMet, criteriaTotal, completedAt } = milestone

  return (
    <section
      aria-label={`Milestone ${position}: ${title}`}
      data-status={status}
      className={`rounded-lg border p-4 ${
        status === 'in-progress'
          ? 'border-primary bg-primary/5'
          : status === 'completed'
            ? 'border-border'
            : 'border-border opacity-70'
      }`}
    >
      <div className="flex items-start gap-4">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border text-sm font-semibold">
          {status === 'completed' ? (
            <span className="text-primary" aria-label="Completed">✓</span>
          ) : (
            <span className={status === 'in-progress' ? 'text-foreground' : 'text-muted-foreground'}>
              {position}
            </span>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <h3 className={`font-medium ${status === 'upcoming' ? 'text-muted-foreground' : 'text-foreground'}`}>
            {title}
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>

          {status !== 'upcoming' && criteriaMet !== null && criteriaTotal !== null ? (
            <div className="mt-2 flex items-baseline gap-4">
              <div>
                <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Criteria</span>
                <p className="text-sm font-semibold text-foreground">{criteriaMet}/{criteriaTotal} met</p>
              </div>
              <div>
                <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Benchmark</span>
                <p className="text-sm text-muted-foreground">—</p>
              </div>
            </div>
          ) : null}

          {status === 'completed' && completedAt ? (
            <p className="mt-2 text-xs text-muted-foreground" aria-label="Completion status">
              Completed
            </p>
          ) : null}

          {status === 'in-progress' ? (
            <Link
              to={`/workspace/${milestone.id}`}
              className="mt-3 inline-block text-sm font-medium text-primary hover:underline md:inline-block"
              data-testid="continue-building-link"
            >
              <span className="hidden md:inline">
                {criteriaMet !== null && criteriaMet > 0 ? 'Continue Building' : 'Start Building'}
              </span>
              <span className="inline text-muted-foreground md:hidden">
                Continue on desktop to build
              </span>
            </Link>
          ) : null}
        </div>
      </div>
    </section>
  )
}

export { MilestoneProgressItem }
