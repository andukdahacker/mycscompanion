import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router'
import { QueryClientProvider } from '@tanstack/react-query'
import { createTestQueryClient } from '@mycscompanion/config/test-utils/query-client'
import type { QueryClient } from '@tanstack/react-query'
import type { MilestoneCompletionData } from '@mycscompanion/shared'

const mockApiFetch = vi.fn()
const mockNavigate = vi.fn()

vi.mock('../lib/api-fetch', () => ({
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
}))

vi.mock('react-router', async () => {
  const actual = await vi.importActual('react-router')
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  }
})

const MOCK_COMPLETION: MilestoneCompletionData = {
  milestoneId: 'ms-1',
  milestoneName: 'Simple Key-Value Store',
  milestoneNumber: 1,
  completedAt: '2026-03-05T10:00:00.000Z',
  criteriaResults: [
    { name: 'put-and-get', order: 1, status: 'met', expected: 'PASS', actual: 'PASS' },
    { name: 'delete-key', order: 2, status: 'met', expected: 'PASS', actual: 'PASS' },
  ],
  nextMilestone: {
    id: 'ms-2',
    title: 'Storage Engine',
    position: 2,
    briefExcerpt: 'Build a storage engine that persists data to disk.',
  },
}

const LAST_MILESTONE_COMPLETION: MilestoneCompletionData = {
  milestoneId: 'ms-last',
  milestoneName: 'Final Milestone',
  milestoneNumber: 10,
  completedAt: '2026-03-05T10:00:00.000Z',
  criteriaResults: [
    { name: 'final-test', order: 1, status: 'met', expected: 'PASS', actual: 'PASS' },
  ],
  nextMilestone: null,
}

describe('Completion', () => {
  let queryClient: QueryClient
  let Completion: React.ComponentType

  function renderCompletion(milestoneId: string = 'ms-1') {
    return render(
      <MemoryRouter initialEntries={[`/completion/${milestoneId}`]}>
        <QueryClientProvider client={queryClient}>
          <Routes>
            <Route path="/completion/:milestoneId" element={<Completion />} />
          </Routes>
        </QueryClientProvider>
      </MemoryRouter>
    )
  }

  const MOCK_TRAJECTORY = {
    dataPoints: [
      { milestoneId: 'ms-1', milestoneName: 'KV Store', milestoneNumber: 1, benchmarkName: 'sequential-inserts', bestOpsPerSec: 4200, bestNormalizedRatio: 0.4158, totalSubmissions: 2, achievedAt: '2026-01-01T00:00:00Z' },
    ],
  }

  beforeEach(async () => {
    queryClient = createTestQueryClient()
    mockApiFetch.mockReset()
    mockNavigate.mockReset()
    mockApiFetch.mockImplementation((url: string) => {
      if (url.includes('/benchmark-results/trajectory')) {
        return Promise.resolve(MOCK_TRAJECTORY)
      }
      return Promise.resolve(MOCK_COMPLETION)
    })
    const mod = await import('./Completion')
    Completion = mod.default
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('should render completion data with criteria summary', async () => {
    renderCompletion()

    expect(await screen.findByText(/Milestone 1: Simple Key-Value Store — Complete/)).toBeDefined()
    expect(screen.getByText('put-and-get')).toBeDefined()
    expect(screen.getByText('delete-key')).toBeDefined()
  })

  it('should render next milestone preview', async () => {
    renderCompletion()

    expect(await screen.findByText('Storage Engine')).toBeDefined()
    expect(screen.getByText(/Build a storage engine/)).toBeDefined()
  })

  it('should render "Continue to Next Milestone" button', async () => {
    renderCompletion()

    const button = await screen.findByRole('button', { name: /continue to next milestone/i })
    expect(button).toBeDefined()
  })

  it('should show "Track Complete" and "Return to Overview" for last milestone', async () => {
    mockApiFetch.mockImplementation((url: string) => {
      if (url.includes('/benchmark-results/trajectory')) {
        return Promise.resolve(MOCK_TRAJECTORY)
      }
      return Promise.resolve(LAST_MILESTONE_COMPLETION)
    })
    renderCompletion('ms-last')

    expect(await screen.findByText('Track Complete')).toBeDefined()
    expect(screen.getByRole('button', { name: /return to overview/i })).toBeDefined()
  })

  it('should navigate to overview when Return to Overview is clicked', async () => {
    mockApiFetch.mockImplementation((url: string) => {
      if (url.includes('/benchmark-results/trajectory')) {
        return Promise.resolve(MOCK_TRAJECTORY)
      }
      return Promise.resolve(LAST_MILESTONE_COMPLETION)
    })
    renderCompletion('ms-last')

    const button = await screen.findByRole('button', { name: /return to overview/i })
    await userEvent.click(button)

    expect(mockNavigate).toHaveBeenCalledWith('/overview', { replace: true })
  })

  it('should render TrajectoryChart when trajectory data is available', async () => {
    renderCompletion()

    await screen.findByText(/Simple Key-Value Store — Complete/)
    // The chart should render with the trajectory data
    expect(await screen.findByRole('img', { name: /benchmark trajectory/i })).toBeDefined()
  })

  it('should show loading skeleton while trajectory data loads', async () => {
    mockApiFetch.mockImplementation((url: string) => {
      if (url.includes('/benchmark-results/trajectory')) {
        return new Promise(() => {}) // never resolves
      }
      return Promise.resolve(MOCK_COMPLETION)
    })
    renderCompletion()

    await screen.findByText(/Simple Key-Value Store — Complete/)
    // Should show loading skeleton (animate-pulse)
    const section = screen.getByLabelText('Performance trajectory')
    expect(section.querySelector('.animate-pulse')).not.toBeNull()
  })

  it('should show error state when trajectory API fails', async () => {
    mockApiFetch.mockImplementation((url: string) => {
      if (url.includes('/benchmark-results/trajectory')) {
        return Promise.reject(new Error('Network error'))
      }
      return Promise.resolve(MOCK_COMPLETION)
    })
    renderCompletion()

    expect(await screen.findByText(/Unable to load trajectory data/)).toBeDefined()
  })

  it('should show empty state when no trajectory data', async () => {
    mockApiFetch.mockImplementation((url: string) => {
      if (url.includes('/benchmark-results/trajectory')) {
        return Promise.resolve({ dataPoints: [] })
      }
      return Promise.resolve(MOCK_COMPLETION)
    })
    renderCompletion()

    expect(await screen.findByText(/Run benchmarks to see your performance trajectory/)).toBeDefined()
  })

  it('should pass currentMilestoneNumber to TrajectoryChart with glow effect', async () => {
    renderCompletion()

    await screen.findByText(/Simple Key-Value Store — Complete/)
    const point = await screen.findByTestId('trajectory-point-1')
    // Current milestone should have larger radius and glow filter
    expect(point.getAttribute('r')).toBe('6')
    expect(point.getAttribute('filter')).toMatch(/url\(#glow/)
  })

  it('should show loading skeleton initially', () => {
    mockApiFetch.mockReturnValue(new Promise(() => {})) // never resolves
    renderCompletion()

    expect(screen.getByTestId('completion-skeleton')).toBeDefined()
  })

  it('should show error state with retry button', async () => {
    mockApiFetch.mockRejectedValue(new Error('Network error'))
    renderCompletion()

    expect(await screen.findByText(/Failed to load completion data/)).toBeDefined()
    expect(screen.getByRole('button', { name: /retry/i })).toBeDefined()
  })

  it('should not contain celebration elements or red colors', async () => {
    renderCompletion()

    await screen.findByText(/Simple Key-Value Store — Complete/)

    const container = document.body
    expect(container.textContent).not.toContain('Congratulations')
    expect(container.textContent).not.toContain('Great job')
    expect(container.textContent).not.toContain('Well done')
    expect(container.innerHTML).not.toContain('text-destructive')
    expect(container.innerHTML).not.toContain('confetti')
  })

  it('should have aria-live announcement for screen readers', async () => {
    renderCompletion()

    await screen.findByText(/Simple Key-Value Store — Complete/)

    const announcement = screen.getByText(/Milestone 1 complete\. All criteria met\./)
    expect(announcement.getAttribute('aria-live')).toBe('assertive')
  })

  it('should navigate to overview when Continue button is clicked', async () => {
    renderCompletion()

    const button = await screen.findByRole('button', { name: /continue to next milestone/i })
    await userEvent.click(button)

    expect(mockNavigate).toHaveBeenCalledWith('/overview', { replace: true })
  })

  it('should pass animate prop to TrajectoryChart', async () => {
    renderCompletion()

    await screen.findByText(/Simple Key-Value Store — Complete/)
    const svg = await screen.findByRole('img', { name: /benchmark trajectory/i })
    // When animate is true and motion not reduced, style tag with keyframes should exist
    const style = svg.querySelector('style')
    expect(style).not.toBeNull()
    expect(style?.textContent).toContain('drawLine')
  })

  it('should render benchmark summary when trajectory data contains current milestone', async () => {
    renderCompletion()

    await screen.findByText(/Simple Key-Value Store — Complete/)
    const section = await screen.findByLabelText('Benchmark summary')
    expect(section).toBeDefined()
    expect(section.textContent).toContain('4,200 ops/sec')
    expect(section.textContent).toContain('0.42x ref')
    expect(section.textContent).toContain('2')
  })

  it('should not render benchmark summary when no trajectory data for current milestone', async () => {
    mockApiFetch.mockImplementation((url: string) => {
      if (url.includes('/benchmark-results/trajectory')) {
        return Promise.resolve({ dataPoints: [
          { milestoneId: 'ms-2', milestoneName: 'Other', milestoneNumber: 2, benchmarkName: 'test', bestOpsPerSec: 100, bestNormalizedRatio: 0.1, totalSubmissions: 1, achievedAt: '2026-01-01T00:00:00Z' },
        ] })
      }
      return Promise.resolve(MOCK_COMPLETION)
    })
    renderCompletion()

    await screen.findByText(/Simple Key-Value Store — Complete/)
    // Wait a tick for trajectory to load
    await screen.findByRole('img', { name: /benchmark trajectory/i })
    expect(screen.queryByLabelText('Benchmark summary')).toBeNull()
  })
})
