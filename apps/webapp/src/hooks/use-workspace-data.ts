import { useQuery } from '@tanstack/react-query'
import type { MilestoneContent, AcceptanceCriterion, ConceptExplainerAsset, ResumeData, CriterionResult } from '@mycscompanion/shared'
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
  readonly restoredCriteria: ReadonlyArray<CriterionResult> | null
  readonly restoredSubmissionId: string | null
}

const DEFAULT_GO_TEMPLATE = `package main

import "fmt"

func main() {
\tfmt.Println("Hello, World!")
}
`

// Parallel fetch: curriculum content + resume data for session restoration.
// Query key is kept stable so downstream cache consumers don't need changes.
function useWorkspaceData(milestoneId: string | undefined) {
  return useQuery({
    queryKey: ['workspace', 'get', milestoneId],
    queryFn: async (): Promise<WorkspaceData> => {
      const [content, resumeData] = await Promise.all([
        apiFetch<MilestoneContent>(`/api/curriculum/milestones/${milestoneId}`),
        apiFetch<ResumeData>(`/api/progress/resume/${milestoneId}`),
      ])

      // Use snapshot code if available, otherwise fall back to starter code
      const initialContent = resumeData.latestSnapshot?.code
        ?? content.starterCode
        ?? DEFAULT_GO_TEMPLATE

      return {
        milestoneName: content.title,
        milestoneNumber: content.position,
        progress: 0, // Computed from criteria in Workspace.tsx
        initialContent,
        brief: content.brief,
        criteria: content.acceptanceCriteria,
        stuckDetection: { thresholdMinutes: 10, stage2OffsetSeconds: 60 }, // Hardcoded until Epic 6
        conceptExplainerAssets: content.conceptExplainerAssets,
        restoredCriteria: resumeData.lastSubmissionCriteria,
        restoredSubmissionId: resumeData.lastSubmissionId,
      }
    },
    staleTime: 5 * 60 * 1000,
    enabled: !!milestoneId,
  })
}

export { useWorkspaceData }
export type { WorkspaceData, StuckDetectionConfig }
