import { Skeleton } from '@mycscompanion/ui/src/components/ui/skeleton'

function WorkspaceSkeleton(): React.ReactElement {
  return (
    <div data-testid="workspace-skeleton" className="flex h-screen flex-col bg-background">
      {/* Top bar skeleton */}
      <div className="flex h-12 items-center justify-between border-b px-4">
        <Skeleton className="h-4 w-48" />
        <div className="flex gap-2">
          <Skeleton className="h-8 w-20" />
          <Skeleton className="h-8 w-24" />
        </div>
      </div>

      {/* Main content area */}
      <div className="flex flex-1">
        {/* Left panel (editor + terminal) */}
        <div className="flex flex-1 flex-col" style={{ width: '70%' }}>
          {/* Editor skeleton */}
          <div data-testid="skeleton-editor" className="flex-[7] p-4">
            <Skeleton className="mb-3 h-4 w-3/4" />
            <Skeleton className="mb-3 h-4 w-1/2" />
            <Skeleton className="mb-3 h-4 w-5/6" />
            <Skeleton className="mb-3 h-4 w-2/3" />
            <Skeleton className="mb-3 h-4 w-3/5" />
            <Skeleton className="h-4 w-1/4" />
          </div>

          {/* Terminal skeleton */}
          <div data-testid="skeleton-terminal" className="flex-[3] border-t p-4">
            <Skeleton className="mb-2 h-3 w-1/3" />
            <Skeleton className="mb-2 h-3 w-1/2" />
            <Skeleton className="h-3 w-2/5" />
          </div>
        </div>

        {/* Tutor panel skeleton */}
        <div data-testid="skeleton-tutor" className="border-l p-4" style={{ width: '30%' }}>
          <Skeleton className="mb-4 h-6 w-1/2" />
          <Skeleton className="mb-3 h-4 w-full" />
          <Skeleton className="mb-3 h-4 w-4/5" />
          <Skeleton className="h-4 w-3/4" />
        </div>
      </div>
    </div>
  )
}

export { WorkspaceSkeleton }
