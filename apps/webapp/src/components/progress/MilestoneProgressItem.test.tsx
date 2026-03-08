import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import type { MilestoneProgressInfo } from '@mycscompanion/shared'

describe('MilestoneProgressItem', () => {
  let MilestoneProgressItem: React.ComponentType<{ readonly milestone: MilestoneProgressInfo }>

  beforeEach(async () => {
    const mod = await import('./MilestoneProgressItem')
    MilestoneProgressItem = mod.MilestoneProgressItem
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  function renderItem(overrides: Partial<MilestoneProgressInfo> = {}) {
    const milestone: MilestoneProgressInfo = {
      id: 'ms-1',
      slug: '01-kv-store',
      title: 'Simple Key-Value Store',
      position: 1,
      description: 'Build a basic KV store',
      status: 'upcoming',
      criteriaMet: null,
      criteriaTotal: null,
      completedAt: null,
      lastBenchmark: null,
      ...overrides,
    }
    return render(
      <MemoryRouter>
        <MilestoneProgressItem milestone={milestone} />
      </MemoryRouter>
    )
  }

  it('should render milestone title and description', () => {
    renderItem()
    expect(screen.getByText('Simple Key-Value Store')).toBeInTheDocument()
    expect(screen.getByText('Build a basic KV store')).toBeInTheDocument()
  })

  it('should have aria-label with milestone position and title', () => {
    renderItem()
    expect(screen.getByRole('region', { name: 'Milestone 1: Simple Key-Value Store' })).toBeInTheDocument()
  })

  it('should set data-status attribute to milestone status', () => {
    renderItem({ status: 'completed', criteriaMet: 3, criteriaTotal: 3, completedAt: '2026-03-01T00:00:00Z' })
    const section = screen.getByRole('region', { name: 'Milestone 1: Simple Key-Value Store' })
    expect(section.getAttribute('data-status')).toBe('completed')
  })

  it('should show criteria count for completed milestones', () => {
    renderItem({ status: 'completed', criteriaMet: 5, criteriaTotal: 5, completedAt: '2026-03-01T00:00:00Z' })
    expect(screen.getByText('5/5 met')).toBeInTheDocument()
  })

  it('should show criteria count for in-progress milestones', () => {
    renderItem({ status: 'in-progress', criteriaMet: 2, criteriaTotal: 5 })
    expect(screen.getByText('2/5 met')).toBeInTheDocument()
  })

  it('should not show criteria for upcoming milestones', () => {
    renderItem({ status: 'upcoming' })
    expect(screen.queryByText(/met$/)).not.toBeInTheDocument()
  })

  it('should show benchmark placeholder em-dash for non-upcoming milestones', () => {
    renderItem({ status: 'in-progress', criteriaMet: 1, criteriaTotal: 3 })
    expect(screen.getByText('—')).toBeInTheDocument()
  })

  it('should show "Continue Building" link for in-progress milestone with submissions', () => {
    renderItem({ status: 'in-progress', criteriaMet: 2, criteriaTotal: 5 })
    expect(screen.getByText('Continue Building')).toBeInTheDocument()
  })

  it('should show "Start Building" link for in-progress milestone with no submissions', () => {
    renderItem({ status: 'in-progress', criteriaMet: 0, criteriaTotal: 0 })
    expect(screen.getByText('Start Building')).toBeInTheDocument()
  })

  it('should show "Continue on desktop to build" for mobile view', () => {
    renderItem({ status: 'in-progress', criteriaMet: 1, criteriaTotal: 3 })
    expect(screen.getByText('Continue on desktop to build')).toBeInTheDocument()
  })

  it('should link to workspace for in-progress milestone', () => {
    renderItem({ id: 'ms-42', status: 'in-progress', criteriaMet: 1, criteriaTotal: 3 })
    const link = screen.getByTestId('continue-building-link')
    expect(link.getAttribute('href')).toBe('/workspace/ms-42')
  })

  it('should not contain temporal framing language', () => {
    const { container } = renderItem({ status: 'completed', criteriaMet: 3, criteriaTotal: 3, completedAt: '2026-03-01T00:00:00Z' })
    const text = container.textContent ?? ''
    expect(text).not.toMatch(/\bago\b/)
    expect(text).not.toMatch(/days since/)
    expect(text).not.toMatch(/welcome back/i)
  })

  it('should not contain gamification language', () => {
    const { container } = renderItem({ status: 'completed', criteriaMet: 3, criteriaTotal: 3, completedAt: '2026-03-01T00:00:00Z' })
    const text = container.textContent ?? ''
    expect(text).not.toMatch(/\bXP\b/)
    expect(text).not.toMatch(/badge/i)
    expect(text).not.toMatch(/streak/i)
    expect(text).not.toMatch(/level/i)
  })

  it('should show completion indicator for completed milestones', () => {
    renderItem({ status: 'completed', criteriaMet: 3, criteriaTotal: 3, completedAt: '2026-03-01T00:00:00Z' })
    expect(screen.getByText('Completed')).toBeInTheDocument()
  })
})
