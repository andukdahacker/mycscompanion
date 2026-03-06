import { useOverviewData } from '../hooks/use-overview-data'
import { FirstTimeOverview } from '../components/overview/FirstTimeOverview'
import { MilestoneStartOverview } from '../components/overview/MilestoneStartOverview'
import { OverviewSkeleton } from '../components/overview/OverviewSkeleton'
import { OverviewError } from '../components/overview/OverviewError'

function Overview(): React.ReactElement {
  const { data, isLoading, error, refetch } = useOverviewData()

  if (isLoading) return <OverviewSkeleton />
  if (error || !data) return <OverviewError onRetry={() => refetch()} />

  if (data.variant === 'first-time') {
    return <FirstTimeOverview milestone={data.milestone} />
  }

  return <MilestoneStartOverview data={data} />
}

// Default export for React.lazy
export default Overview
