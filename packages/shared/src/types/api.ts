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
    readonly code: string | null
    readonly files: Record<string, string> | null
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

export interface OverviewBenchmarkData {
  readonly opsPerSec: number
  readonly normalizedRatio: number
  readonly trend: 'up' | 'down' | 'flat'
}

export interface OverviewData {
  readonly variant: OverviewVariant
  readonly milestone: OverviewMilestoneInfo
  readonly criteriaProgress: OverviewCriteriaProgress | null  // null for first-time
  readonly sessionSummary: string | null    // Placeholder — populated by Epic 5
  readonly lastBenchmark: OverviewBenchmarkData | null
}

// --- Track Progress ---

export type MilestoneStatus = 'completed' | 'in-progress' | 'upcoming'

export interface MilestoneProgressBenchmark {
  readonly bestOpsPerSec: number
}

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
  readonly lastBenchmark: MilestoneProgressBenchmark | null
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

// --- Stuck Intervention ---

export interface StuckInterventionRequest {
  readonly timeStuckMinutes: number
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

// --- Data Export ---

export type DataExportStatus = 'processing' | 'completed' | 'failed' | 'none'

export interface DataExportResponse {
  readonly exportId: string
  readonly status: DataExportStatus
  readonly message?: string
}

export interface DataExportStatusResponse {
  readonly exportId: string | null
  readonly status: DataExportStatus
  readonly createdAt: string | null
  readonly completedAt: string | null
}

export interface DataExportMetadata {
  readonly exportDate: string
  readonly userId: string
  readonly categoriesIncluded: readonly string[]
}

export interface DataExportData {
  readonly profile: Record<string, unknown>
  readonly sessions: readonly Record<string, unknown>[]
  readonly codeSnapshots: readonly Record<string, unknown>[]
  readonly submissions: readonly Record<string, unknown>[]
  readonly benchmarkResults: readonly Record<string, unknown>[]
  readonly tutorMessages: readonly Record<string, unknown>[]
  readonly sessionSummaries: readonly Record<string, unknown>[]
  readonly milestoneProgress: readonly Record<string, unknown>[]
}

export interface DataExportPayload {
  readonly metadata: DataExportMetadata
  readonly data: DataExportData
}

