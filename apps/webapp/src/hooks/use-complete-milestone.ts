import { useMutation } from '@tanstack/react-query'
import { useNavigate } from 'react-router'
import type { CompleteMilestoneResponse } from '@mycscompanion/shared'
import { apiFetch } from '../lib/api-fetch'

interface CompleteMilestoneParams {
  readonly milestoneId: string
  readonly submissionId: string
}

function useCompleteMilestone() {
  const navigate = useNavigate()
  return useMutation({
    mutationKey: ['completion', 'complete'],
    mutationFn: ({ milestoneId, submissionId }: CompleteMilestoneParams) =>
      apiFetch<CompleteMilestoneResponse>(`/api/completion/${milestoneId}/complete`, {
        method: 'POST',
        body: JSON.stringify({ submissionId }),
      }),
    onSuccess: (data) => {
      if (data.nextMilestoneId) {
        navigate(`/workspace/${data.nextMilestoneId}`, { replace: true })
      }
    },
  })
}

export { useCompleteMilestone }
export type { CompleteMilestoneParams }
