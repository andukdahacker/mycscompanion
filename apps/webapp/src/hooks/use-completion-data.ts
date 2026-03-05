import { useQuery } from '@tanstack/react-query'
import type { MilestoneCompletionData } from '@mycscompanion/shared'
import { apiFetch } from '../lib/api-fetch'

function useCompletionData(milestoneId: string | undefined) {
  return useQuery({
    queryKey: ['completion', 'get', milestoneId],
    queryFn: () => apiFetch<MilestoneCompletionData>(`/api/completion/${milestoneId}`),
    staleTime: 5 * 60 * 1000,
    enabled: !!milestoneId,
  })
}

export { useCompletionData }
