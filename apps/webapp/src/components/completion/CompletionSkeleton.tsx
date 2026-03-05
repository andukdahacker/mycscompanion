import { Skeleton } from '@mycscompanion/ui/src/components/ui/skeleton'

function CompletionSkeleton(): React.ReactElement {
  return (
    <div data-testid="completion-skeleton" className="flex min-h-screen flex-col items-center bg-background px-4 py-16">
      <div className="w-full max-w-2xl space-y-8">
        {/* Header */}
        <Skeleton className="mx-auto h-8 w-96" />

        {/* Criteria summary */}
        <div className="space-y-3">
          <Skeleton className="h-5 w-48" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
        </div>

        {/* Trajectory placeholder */}
        <Skeleton className="h-48 w-full" />

        {/* Next milestone preview */}
        <div className="space-y-3">
          <Skeleton className="h-5 w-36" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-2/3" />
        </div>

        {/* Button */}
        <Skeleton className="mx-auto h-10 w-64" />
      </div>
    </div>
  )
}

export { CompletionSkeleton }
