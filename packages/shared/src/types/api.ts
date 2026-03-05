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

