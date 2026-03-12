import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '../lib/api-fetch'

interface TrajectoryDataPoint {
  readonly milestoneId: string
  readonly milestoneName: string
  readonly milestoneNumber: number
  readonly benchmarkName: string
  readonly bestOpsPerSec: number
  readonly bestNormalizedRatio: number
  readonly totalSubmissions: number
  readonly achievedAt: string
}

interface TrajectoryResponse {
  readonly dataPoints: ReadonlyArray<TrajectoryDataPoint>
}

interface UseTrajectoryDataResult {
  readonly dataPoints: ReadonlyArray<TrajectoryDataPoint>
  readonly isLoading: boolean
  readonly error: Error | null
}

function useTrajectoryData(): UseTrajectoryDataResult {
  const { data, isLoading, error } = useQuery({
    queryKey: ['benchmark', 'trajectory'],
    queryFn: () =>
      apiFetch<TrajectoryResponse>(
        '/api/execution/benchmark-results/trajectory',
      ),
    staleTime: 5 * 60_000,
    retry: false,
  })

  return {
    dataPoints: data?.dataPoints ?? [],
    isLoading,
    error: error ?? null,
  }
}

export { useTrajectoryData }
export type { TrajectoryDataPoint, UseTrajectoryDataResult }
