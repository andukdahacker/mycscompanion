import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '../lib/api-fetch'
import type { OverviewData } from '@mycscompanion/shared'

function useOverviewData() {
  return useQuery<OverviewData>({
    queryKey: ['progress', 'overview'],
    queryFn: () => apiFetch<OverviewData>('/api/progress/overview'),
    staleTime: 5 * 60 * 1000,
  })
}

export { useOverviewData }
