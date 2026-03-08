import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '../lib/api-fetch'
import type { TrackProgressData } from '@mycscompanion/shared'

function useTrackProgress() {
  return useQuery<TrackProgressData>({
    queryKey: ['progress', 'track-progress'],
    queryFn: () => apiFetch<TrackProgressData>('/api/progress/track-progress'),
    staleTime: 5 * 60 * 1000,
  })
}

export { useTrackProgress }
