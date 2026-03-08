import { Skeleton } from '@mycscompanion/ui/src/components/ui/skeleton'

function OverviewSkeleton(): React.ReactElement {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-4" data-testid="overview-skeleton">
      <div className="w-full max-w-2xl space-y-8">
        <div className="space-y-2">
          <Skeleton className="h-8 w-3/4" />
          <Skeleton className="h-4 w-1/3" />
        </div>
        <div className="flex items-baseline gap-6">
          <div className="space-y-1">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-4 w-20" />
          </div>
          <div className="space-y-1">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-4 w-8" />
          </div>
          <div className="space-y-1">
            <Skeleton className="h-3 w-10" />
            <Skeleton className="h-4 w-24" />
          </div>
        </div>
        <div className="flex justify-center">
          <Skeleton className="h-10 w-40 rounded-md" />
        </div>
      </div>
    </main>
  )
}

export { OverviewSkeleton }
