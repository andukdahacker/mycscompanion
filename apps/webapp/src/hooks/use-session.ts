import { useMutation } from '@tanstack/react-query'
import { apiFetch } from '../lib/api-fetch'

function useSession(milestoneId: string) {
  return useMutation({
    mutationFn: () =>
      apiFetch<{ session: { id: string; startedAt: string }; created: boolean }>(
        '/api/progress/sessions',
        {
          method: 'POST',
          body: JSON.stringify({ milestoneId }),
        }
      ),
  })
}

export { useSession }
