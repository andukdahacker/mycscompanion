import { Skeleton } from '@mycscompanion/ui/src/components/ui/skeleton'

function ProgressSkeleton(): React.ReactElement {
  return (
    <main className="flex min-h-screen justify-center bg-background p-4 pt-12" data-testid="progress-skeleton">
      <div className="w-full max-w-2xl space-y-6">
        {/* Back link */}
        <Skeleton className="h-4 w-28" />
        {/* Heading */}
        <div className="space-y-2">
          <Skeleton className="h-8 w-2/3" />
          <Skeleton className="h-4 w-1/3" />
        </div>
        {/* Milestone rows */}
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="rounded-lg border border-border p-4">
            <div className="flex items-start gap-4">
              <Skeleton className="h-8 w-8 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-5 w-1/2" />
                <Skeleton className="h-4 w-3/4" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </main>
  )
}

export { ProgressSkeleton }
