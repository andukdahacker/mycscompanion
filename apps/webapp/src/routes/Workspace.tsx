import { useCallback } from 'react'
import { useParams } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { Button } from '@mycscompanion/ui/src/components/ui/button'
import { WorkspaceLayout } from '../components/workspace/WorkspaceLayout'
import { WorkspaceSkeleton } from '../components/workspace/WorkspaceSkeleton'
import { useDelayedLoading } from '../hooks/use-delayed-loading'

// Placeholder mock data — real API comes in Epic 4
const MOCK_WORKSPACE_DATA = {
  milestoneName: 'KV Store',
  milestoneNumber: 1,
  progress: 0,
} as const

function Workspace(): React.ReactElement {
  const { milestoneId } = useParams<{ milestoneId: string }>()

  // Placeholder query — real API (GET /api/workspace/:milestoneId) comes in Epic 4
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['workspace', 'get', milestoneId],
    queryFn: () => Promise.resolve(MOCK_WORKSPACE_DATA),
    staleTime: 5 * 60 * 1000,
  })

  const showLoading = useDelayedLoading(isLoading)

  // Placeholder handlers — wired to real submission API in Story 3.7
  const handleRun = useCallback(() => {
    // No-op until Story 3.7
  }, [])

  const handleBenchmark = useCallback(() => {
    // No-op until Epic 7
  }, [])

  if (showLoading) {
    return <WorkspaceSkeleton />
  }

  if (isError || !data) {
    return (
      <div data-testid="workspace-error" className="flex h-screen flex-col items-center justify-center gap-3 bg-background text-center">
        <p className="text-lg font-medium text-destructive">Failed to load workspace</p>
        <p className="text-sm text-muted-foreground">Something went wrong loading milestone data.</p>
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          Retry
        </Button>
      </div>
    )
  }

  return (
    <WorkspaceLayout
      milestoneName={data.milestoneName}
      milestoneNumber={data.milestoneNumber}
      progress={data.progress}
      onRun={handleRun}
      onBenchmark={handleBenchmark}
    />
  )
}

// eslint-disable-next-line no-restricted-syntax -- Default export required for React.lazy()
export default Workspace
