/**
 * Shared API request/response types for mycscompanion.
 */

import type { UserRole, ExperienceLevel, PrimaryLanguage } from './domain.js'
import type { CriterionResult } from './curriculum.js'

export interface OnboardingRequest {
  readonly email: string
  readonly displayName?: string | null
  readonly role: UserRole
  readonly experienceLevel: ExperienceLevel
  readonly primaryLanguage: PrimaryLanguage
}

export interface UserProfile {
  readonly id: string
  readonly email: string
  readonly displayName: string | null
  readonly role: UserRole | null
  readonly experienceLevel: ExperienceLevel | null
  readonly primaryLanguage: PrimaryLanguage | null
  readonly onboardingCompletedAt: string | null
  readonly skillFloorPassed: boolean | null
  readonly skillFloorCompletedAt: string | null
  readonly createdAt: string
  readonly updatedAt: string
}

export interface SkillAssessmentRequest {
  readonly passed: boolean
}

// --- Milestone Completion ---

export interface NextMilestonePreview {
  readonly id: string
  readonly title: string
  readonly position: number
  readonly briefExcerpt: string
}

export interface MilestoneCompletionData {
  readonly milestoneId: string
  readonly milestoneName: string
  readonly milestoneNumber: number
  readonly completedAt: string
  readonly criteriaResults: ReadonlyArray<CriterionResult>
  readonly nextMilestone: NextMilestonePreview | null
}

export interface CompleteMilestoneRequest {
  readonly submissionId: string
}

export interface CompleteMilestoneResponse {
  readonly nextMilestoneId: string | null
}

// --- Session Resume ---

export interface ResumeData {
  readonly latestSnapshot: {
    readonly id: string
    readonly code: string
    readonly createdAt: string
  } | null
  readonly lastSubmissionId: string | null
  readonly lastSubmissionCriteria: ReadonlyArray<CriterionResult> | null
}

// --- Contextual Overview ---

export type OverviewVariant = 'first-time' | 'milestone-start'

export interface OverviewMilestoneInfo {
  readonly id: string
  readonly slug: string
  readonly title: string
  readonly position: number
  readonly briefExcerpt: string
  readonly csConceptLabel: string | null
}

export interface OverviewCriteriaProgress {
  readonly met: number
  readonly total: number
  readonly nextCriterionName: string | null
}

export interface OverviewData {
  readonly variant: OverviewVariant
  readonly milestone: OverviewMilestoneInfo
  readonly criteriaProgress: OverviewCriteriaProgress | null  // null for first-time
  readonly sessionSummary: string | null    // Placeholder — populated by Epic 5
  readonly lastBenchmark: null              // Placeholder — populated by Epic 7
  readonly benchmarkTrend: null             // Placeholder — populated by Epic 7
}

// --- Track Progress ---

export type MilestoneStatus = 'completed' | 'in-progress' | 'upcoming'

export interface MilestoneProgressInfo {
  readonly id: string
  readonly slug: string
  readonly title: string
  readonly position: number
  readonly description: string
  readonly status: MilestoneStatus
  readonly criteriaMet: number | null      // null for upcoming
  readonly criteriaTotal: number | null    // null for upcoming
  readonly completedAt: string | null      // ISO 8601, null if not completed
  readonly lastBenchmark: null             // Placeholder — Epic 7
}

export interface TrackProgressData {
  readonly trackName: string
  readonly trackSlug: string
  readonly milestones: readonly MilestoneProgressInfo[]
  readonly completedCount: number
  readonly totalCount: number
}

// --- Tutor ---

export interface TutorMessageRequest {
  readonly message: string
}

export interface TutorMessageResponse {
  readonly id: string
  readonly role: 'assistant'
  readonly content: string
  readonly model: string
  readonly createdAt: string
}

export interface TutorConversationMessage {
  readonly id: string
  readonly role: 'user' | 'assistant'
  readonly content: string
  readonly model: string | null
  readonly createdAt: string
}

// --- Tutor SSE Streaming Events ---

export interface TutorStreamTextDelta {
  readonly type: 'text_delta'
  readonly delta: string
}

export interface TutorStreamMessageComplete {
  readonly type: 'message_complete'
  readonly id: string
  readonly model: string
  readonly content: string
}

export interface TutorStreamError {
  readonly type: 'error'
  readonly code: string
  readonly message: string
}

export type TutorStreamEvent = TutorStreamTextDelta | TutorStreamMessageComplete | TutorStreamError

