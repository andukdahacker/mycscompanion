import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '../lib/api-fetch'
import type { UserProfile } from '@mycscompanion/shared'

function useAccountProfile() {
  return useQuery<UserProfile>({
    queryKey: ['account', 'profile'],
    queryFn: () => apiFetch<UserProfile>('/api/account/profile'),
    staleTime: 5 * 60 * 1000, // 5 minutes — profile data rarely changes
  })
}

export { useAccountProfile }
