import { useQuery } from '@tanstack/react-query'

interface StuckDetectionConfig {
  readonly thresholdMinutes: number
  readonly stage2OffsetSeconds: number
}

interface WorkspaceData {
  readonly milestoneName: string
  readonly milestoneNumber: number
  readonly progress: number
  readonly initialContent: string
  readonly brief: string | null
  readonly criteria: ReadonlyArray<string>
  readonly stuckDetection: StuckDetectionConfig
}

// Placeholder mock data — real API (GET /api/workspace/:milestoneId) comes in Epic 4
const MOCK_WORKSPACE_DATA: WorkspaceData = {
  milestoneName: 'KV Store',
  milestoneNumber: 1,
  progress: 0,
  initialContent: 'package main\n\nimport "fmt"\n\nfunc main() {\n\tfmt.Println("Hello, World!")\n}\n',
  brief: null,
  criteria: [],
  stuckDetection: {
    thresholdMinutes: 10,
    stage2OffsetSeconds: 60,
  },
}

function useWorkspaceData(milestoneId: string | undefined) {
  return useQuery({
    queryKey: ['workspace', 'get', milestoneId],
    queryFn: () => Promise.resolve(MOCK_WORKSPACE_DATA),
    staleTime: 5 * 60 * 1000,
    enabled: !!milestoneId,
  })
}

export { useWorkspaceData }
export type { WorkspaceData, StuckDetectionConfig }
