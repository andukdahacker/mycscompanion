import { describe, it, expect } from 'vitest'
import type {
  NextMilestonePreview,
  MilestoneCompletionData,
  CompleteMilestoneRequest,
  CompleteMilestoneResponse,
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
