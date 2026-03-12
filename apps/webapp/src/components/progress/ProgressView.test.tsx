import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { QueryClientProvider } from '@tanstack/react-query'
import { createTestQueryClient } from '@mycscompanion/config/test-utils/query-client'
import type { TrackProgressData, MilestoneProgressInfo } from '@mycscompanion/shared'

const mockTrackData: TrackProgressData = {
  trackName: 'Build Your Own Database',
  trackSlug: 'build-your-own-database',
  completedCount: 1,
  totalCount: 3,
  milestones: [
    {
      id: 'ms-1',
      slug: '01-kv-store',
      title: 'Simple Key-Value Store',
      position: 1,
      description: 'Build a basic KV store',
      status: 'completed',
      criteriaMet: 5,
      criteriaTotal: 5,
      completedAt: '2026-03-01T00:00:00Z',
      lastBenchmark: null,
    },
    {
      id: 'ms-2',
      slug: '02-storage-engine',
      title: 'Storage Engine',
      position: 2,
      description: 'Add persistent storage',
      status: 'in-progress',
      criteriaMet: 2,
      criteriaTotal: 5,
      completedAt: null,
      lastBenchmark: null,
    },
    {
      id: 'ms-3',
      slug: '03-query-parser',
      title: 'Query Parser',
      position: 3,
      description: 'Parse SQL queries',
      status: 'upcoming',
      criteriaMet: null,
      criteriaTotal: null,
      completedAt: null,
      lastBenchmark: null,
    },
  ],
}

vi.mock('../../hooks/use-track-progress', () => ({
  useTrackProgress: vi.fn(),
}))

describe('ProgressView', () => {
  let ProgressView: React.ComponentType
  let mockUseTrackProgress: ReturnType<typeof vi.fn>

  beforeEach(async () => {
    const hookMod = await import('../../hooks/use-track-progress')
    mockUseTrackProgress = vi.mocked(hookMod.useTrackProgress)
    const mod = await import('./ProgressView')
    ProgressView = mod.ProgressView
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  function renderComponent() {
    const queryClient = createTestQueryClient()
    return render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <ProgressView />
        </MemoryRouter>
      </QueryClientProvider>
    )
  }

  it('should show loading skeleton when data is loading', () => {
    mockUseTrackProgress.mockReturnValue({ data: undefined, isLoading: true, error: null, refetch: vi.fn() })
    renderComponent()
    expect(screen.getByTestId('progress-skeleton')).toBeInTheDocument()
  })

  it('should show error state when request fails', () => {
    mockUseTrackProgress.mockReturnValue({ data: undefined, isLoading: false, error: new Error('fail'), refetch: vi.fn() })
    renderComponent()
    expect(screen.getByText('Something went wrong loading your progress.')).toBeInTheDocument()
    expect(screen.getByText('Try again')).toBeInTheDocument()
  })

  it('should render track name as heading', () => {
    mockUseTrackProgress.mockReturnValue({ data: mockTrackData, isLoading: false, error: null, refetch: vi.fn() })
    renderComponent()
    expect(screen.getByText('Build Your Own Database')).toBeInTheDocument()
  })

  it('should show progress summary subtitle', () => {
    mockUseTrackProgress.mockReturnValue({ data: mockTrackData, isLoading: false, error: null, refetch: vi.fn() })
    renderComponent()
    expect(screen.getByText('1 of 3 milestones completed')).toBeInTheDocument()
  })

  it('should render all milestones in order', () => {
    mockUseTrackProgress.mockReturnValue({ data: mockTrackData, isLoading: false, error: null, refetch: vi.fn() })
    renderComponent()
    const milestones = screen.getAllByRole('region')
    expect(milestones).toHaveLength(3)
    expect(milestones[0]).toHaveAttribute('aria-label', 'Milestone 1: Simple Key-Value Store')
    expect(milestones[1]).toHaveAttribute('aria-label', 'Milestone 2: Storage Engine')
    expect(milestones[2]).toHaveAttribute('aria-label', 'Milestone 3: Query Parser')
  })

  it('should have "Back to overview" link', () => {
    mockUseTrackProgress.mockReturnValue({ data: mockTrackData, isLoading: false, error: null, refetch: vi.fn() })
    renderComponent()
    const backLink = screen.getByText('← Back to overview')
    expect(backLink.getAttribute('href')).toBe('/overview')
  })

  it('should have aria-label "Track progress" on main element', () => {
    mockUseTrackProgress.mockReturnValue({ data: mockTrackData, isLoading: false, error: null, refetch: vi.fn() })
    renderComponent()
    expect(screen.getByRole('main', { name: 'Track progress' })).toBeInTheDocument()
  })

  it('should not contain temporal framing language', () => {
    mockUseTrackProgress.mockReturnValue({ data: mockTrackData, isLoading: false, error: null, refetch: vi.fn() })
    const { container } = renderComponent()
    const text = container.textContent ?? ''
    expect(text).not.toMatch(/\bago\b/)
    expect(text).not.toMatch(/days since/)
    expect(text).not.toMatch(/welcome back/i)
  })

  it('should not contain gamification language', () => {
    mockUseTrackProgress.mockReturnValue({ data: mockTrackData, isLoading: false, error: null, refetch: vi.fn() })
    const { container } = renderComponent()
    const text = container.textContent ?? ''
    expect(text).not.toMatch(/\bXP\b/)
    expect(text).not.toMatch(/badge/i)
    expect(text).not.toMatch(/streak/i)
  })

  it('should render empty-state correctly for first-time user', () => {
    const firstTimeData: TrackProgressData = {
      ...mockTrackData,
      completedCount: 0,
      milestones: mockTrackData.milestones.map((m, i) => ({
        ...m,
        status: (i === 0 ? 'in-progress' : 'upcoming') as MilestoneProgressInfo['status'],
        criteriaMet: null,
        criteriaTotal: null,
        completedAt: null,
      })),
    }
    mockUseTrackProgress.mockReturnValue({ data: firstTimeData, isLoading: false, error: null, refetch: vi.fn() })
    renderComponent()

    // Same layout as populated view
    expect(screen.getByText('Build Your Own Database')).toBeInTheDocument()
    expect(screen.getByText('0 of 3 milestones completed')).toBeInTheDocument()
    expect(screen.getAllByRole('region')).toHaveLength(3)

    // First milestone has "Start Building" link
    expect(screen.getByText('Start Building')).toBeInTheDocument()
  })

  it('should have milestone list with role="list"', () => {
    mockUseTrackProgress.mockReturnValue({ data: mockTrackData, isLoading: false, error: null, refetch: vi.fn() })
    renderComponent()
    expect(screen.getByRole('list', { name: 'Milestones' })).toBeInTheDocument()
  })

  it('should render settings link pointing to /settings', () => {
    mockUseTrackProgress.mockReturnValue({ data: mockTrackData, isLoading: false, error: null, refetch: vi.fn() })
    renderComponent()

    const link = screen.getByText('Settings')
    expect(link.closest('a')?.getAttribute('href')).toBe('/settings')
  })
})
