import { describe, it, expect } from 'vitest'
import type {
  NextMilestonePreview,
  MilestoneCompletionData,
  CompleteMilestoneRequest,
  CompleteMilestoneResponse,
  OverviewData,
  OverviewMilestoneInfo,
  OverviewCriteriaProgress,
  OverviewVariant,
} from './api.js'

describe('Milestone completion types', () => {
  it('should compile NextMilestonePreview with all fields', () => {
    const preview: NextMilestonePreview = {
      id: 'ms-2',
      title: 'Storage Engine',
      position: 2,
      briefExcerpt: 'Build a storage engine that persists data to disk...',
    }
    expect(preview.id).toBe('ms-2')
    expect(preview.position).toBe(2)
  })

  it('should compile MilestoneCompletionData with next milestone', () => {
    const data: MilestoneCompletionData = {
      milestoneId: 'ms-1',
      milestoneName: 'Simple Key-Value Store',
      milestoneNumber: 1,
      completedAt: '2026-03-05T10:00:00.000Z',
      criteriaResults: [
        { name: 'put-and-get', order: 1, status: 'met', expected: 'PASS', actual: 'PASS' },
      ],
      nextMilestone: {
        id: 'ms-2',
        title: 'Storage Engine',
        position: 2,
        briefExcerpt: 'Build a storage engine...',
      },
    }
    expect(data.milestoneId).toBe('ms-1')
    expect(data.nextMilestone).not.toBeNull()
  })

  it('should compile MilestoneCompletionData with null next milestone (last milestone)', () => {
    const data: MilestoneCompletionData = {
      milestoneId: 'ms-last',
      milestoneName: 'Final Milestone',
      milestoneNumber: 10,
      completedAt: '2026-03-05T10:00:00.000Z',
      criteriaResults: [],
      nextMilestone: null,
    }
    expect(data.nextMilestone).toBeNull()
  })

  it('should compile CompleteMilestoneRequest', () => {
    const request: CompleteMilestoneRequest = {
      submissionId: 'sub-123',
    }
    expect(request.submissionId).toBe('sub-123')
  })

  it('should compile CompleteMilestoneResponse with next milestone', () => {
    const response: CompleteMilestoneResponse = {
      nextMilestoneId: 'ms-2',
    }
    expect(response.nextMilestoneId).toBe('ms-2')
  })

  it('should compile CompleteMilestoneResponse with null (last milestone)', () => {
    const response: CompleteMilestoneResponse = {
      nextMilestoneId: null,
    }
    expect(response.nextMilestoneId).toBeNull()
  })
})

describe('Overview types', () => {
  it('should compile OverviewMilestoneInfo with all fields', () => {
    const milestone: OverviewMilestoneInfo = {
      id: 'ms-1',
      slug: '01-kv-store',
      title: 'Simple Key-Value Store',
      position: 1,
      briefExcerpt: 'Build a simple key-value store...',
      csConceptLabel: 'Systems Programming & I/O',
    }
    expect(milestone.id).toBe('ms-1')
    expect(milestone.csConceptLabel).toBe('Systems Programming & I/O')
  })

  it('should compile OverviewMilestoneInfo with null csConceptLabel', () => {
    const milestone: OverviewMilestoneInfo = {
      id: 'ms-1',
      slug: '01-kv-store',
      title: 'Simple Key-Value Store',
      position: 1,
      briefExcerpt: 'Build a simple key-value store...',
      csConceptLabel: null,
    }
    expect(milestone.csConceptLabel).toBeNull()
  })

  it('should compile OverviewCriteriaProgress', () => {
    const progress: OverviewCriteriaProgress = {
      met: 2,
      total: 5,
      nextCriterionName: 'delete-key',
    }
    expect(progress.met).toBe(2)
    expect(progress.nextCriterionName).toBe('delete-key')
  })

  it('should compile OverviewData with first-time variant', () => {
    const data: OverviewData = {
      variant: 'first-time',
      milestone: {
        id: 'ms-1',
        slug: '01-kv-store',
        title: 'Simple Key-Value Store',
        position: 1,
        briefExcerpt: 'Build a simple key-value store...',
        csConceptLabel: null,
      },
      criteriaProgress: null,
      sessionSummary: null,
      lastBenchmark: null,
      benchmarkTrend: null,
    }
    expect(data.variant).toBe('first-time')
    expect(data.criteriaProgress).toBeNull()
  })

  it('should compile OverviewData with milestone-start variant', () => {
    const data: OverviewData = {
      variant: 'milestone-start',
      milestone: {
        id: 'ms-2',
        slug: '02-storage-engine',
        title: 'Storage Engine',
        position: 2,
        briefExcerpt: 'Build a storage engine...',
        csConceptLabel: 'Data Structures',
      },
      criteriaProgress: {
        met: 3,
        total: 5,
        nextCriterionName: 'range-scan',
      },
      sessionSummary: null,
      lastBenchmark: null,
      benchmarkTrend: null,
    }
    expect(data.variant).toBe('milestone-start')
    expect(data.criteriaProgress?.met).toBe(3)
  })

  it('should accept valid OverviewVariant values', () => {
    const firstTime: OverviewVariant = 'first-time'
    const milestoneStart: OverviewVariant = 'milestone-start'
    expect(firstTime).toBe('first-time')
    expect(milestoneStart).toBe('milestone-start')
  })
})
