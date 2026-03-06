import { Skeleton } from '@mycscompanion/ui/src/components/ui/skeleton'

function OverviewSkeleton(): React.ReactElement {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-4" data-testid="overview-skeleton">
      <div className="w-full max-w-2xl space-y-8">
        <div className="space-y-3">
          <Skeleton className="h-8 w-3/4" />
          <Skeleton className="h-5 w-full" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Skeleton className="h-28 w-full rounded-lg" />
          <Skeleton className="h-28 w-full rounded-lg" />
          <Skeleton className="h-28 w-full rounded-lg sm:col-span-2" />
        </div>
        <div className="flex justify-center">
          <Skeleton className="h-10 w-40 rounded-md" />
        </div>
      </div>
    </main>
  )
}

export { OverviewSkeleton }
