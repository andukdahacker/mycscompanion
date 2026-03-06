import { useQuery } from '@tanstack/react-query'
import type { MilestoneContent, AcceptanceCriterion, ConceptExplainerAsset } from '@mycscompanion/shared'
import { apiFetch } from '../lib/api-fetch'

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
  readonly criteria: ReadonlyArray<AcceptanceCriterion>
  readonly stuckDetection: StuckDetectionConfig
  readonly conceptExplainerAssets: readonly ConceptExplainerAsset[]
}

const DEFAULT_GO_TEMPLATE = `package main

import "fmt"

func main() {
\tfmt.Println("Hello, World!")
}
`

// Uses curriculum endpoint directly until Epic 5 introduces the combined workspace endpoint.
// Query key is kept stable so downstream cache consumers don't need changes.
function useWorkspaceData(milestoneId: string | undefined) {
  return useQuery({
    queryKey: ['workspace', 'get', milestoneId],
    queryFn: async (): Promise<WorkspaceData> => {
      const content = await apiFetch<MilestoneContent>(
        `/api/curriculum/milestones/${milestoneId}`
      )
      return {
        milestoneName: content.title,
        milestoneNumber: content.position,
        progress: 0, // Hardcoded until Epic 5
        initialContent: content.starterCode || DEFAULT_GO_TEMPLATE,
        brief: content.brief,
        criteria: content.acceptanceCriteria,
        stuckDetection: { thresholdMinutes: 10, stage2OffsetSeconds: 60 }, // Hardcoded until Epic 6
        conceptExplainerAssets: content.conceptExplainerAssets,
      }
    },
    staleTime: 5 * 60 * 1000,
    enabled: !!milestoneId,
  })
}

export { useWorkspaceData }
export type { WorkspaceData, StuckDetectionConfig }
