import { useMemo } from 'react'
import { useInfiniteQuery } from '@tanstack/react-query'
import { apiFetch } from '../lib/api-fetch'

interface HistoricalBenchmarkEntry {
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
  readonly submissionNumber: number
}

interface HistoricalBenchmarkPage {
  readonly results: ReadonlyArray<Omit<HistoricalBenchmarkEntry, 'submissionNumber'>>
  readonly nextCursor: string | null
  readonly totalCount: number
}

interface UseHistoricalBenchmarksResult {
  readonly entries: ReadonlyArray<HistoricalBenchmarkEntry>
  readonly totalCount: number
  readonly isLoading: boolean
  readonly hasNextPage: boolean
  readonly fetchNextPage: () => void
  readonly isFetchingNextPage: boolean
}

function useHistoricalBenchmarks(milestoneId: string | undefined): UseHistoricalBenchmarksResult {
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading } = useInfiniteQuery({
    queryKey: ['benchmark', 'history', milestoneId],
    queryFn: ({ pageParam }) =>
      apiFetch<HistoricalBenchmarkPage>(
        `/api/execution/benchmark-results/history/${milestoneId}?pageSize=20${pageParam ? `&afterCursor=${pageParam}` : ''}`,
      ),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    staleTime: 5 * 60_000,
    enabled: !!milestoneId,
  })

  const entries = useMemo(() => {
    if (!data) return []
    return data.pages.flatMap((p) => p.results).map((entry, i) => ({
      ...entry,
      submissionNumber: i + 1,
    }))
  }, [data])

  const totalCount = data?.pages[data.pages.length - 1]?.totalCount ?? 0

  return {
    entries,
    totalCount,
    isLoading,
    hasNextPage: hasNextPage ?? false,
    fetchNextPage,
    isFetchingNextPage,
  }
}

export { useHistoricalBenchmarks }
export type { HistoricalBenchmarkEntry, HistoricalBenchmarkPage, UseHistoricalBenchmarksResult }
