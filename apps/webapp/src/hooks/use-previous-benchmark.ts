import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '../lib/api-fetch'

interface PreviousBenchmarkResponse {
  readonly id: string
  readonly submissionId: string
  readonly benchmarkName: string
  readonly opsPerSec: number
  readonly normalizedRatio: number
  readonly userMedian: number
  readonly referenceMedian: number
  readonly p50LatencyUs: number | null
  readonly p99LatencyUs: number | null
  readonly referenceVersion: string
  readonly createdAt: string
}

interface UsePreviousBenchmarkResult {
  readonly previousOpsPerSec: number | null
  readonly isLoading: boolean
}

function usePreviousBenchmark(milestoneId: string | undefined): UsePreviousBenchmarkResult {
  const { data, isLoading } = useQuery({
    queryKey: ['benchmark', 'previous', milestoneId],
    queryFn: () =>
      apiFetch<PreviousBenchmarkResponse>(
        `/api/execution/benchmark-results/latest/${milestoneId}`,
      ),
    enabled: !!milestoneId,
    staleTime: 5 * 60_000,
    retry: false,
  })

  return {
    previousOpsPerSec: data?.opsPerSec ?? null,
    isLoading,
  }
}

export { usePreviousBenchmark }
export type { UsePreviousBenchmarkResult }
