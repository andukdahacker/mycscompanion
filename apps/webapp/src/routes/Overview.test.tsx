import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { QueryClientProvider } from '@tanstack/react-query'
import { createTestQueryClient } from '@mycscompanion/config/test-utils/query-client'
import type { QueryClient } from '@tanstack/react-query'
import type { OverviewData } from '@mycscompanion/shared'

const mockApiFetch = vi.fn()

vi.mock('../lib/api-fetch', () => ({
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
}))

const FIRST_TIME_DATA: OverviewData = {
  variant: 'first-time',
  milestone: {
    id: 'ms-1',
    slug: '01-kv-store',
    title: 'Simple Key-Value Store',
    position: 1,
    briefExcerpt: 'Build a simple key-value store.',
    csConceptLabel: null,
  },
  criteriaProgress: null,
  sessionSummary: null,
  lastBenchmark: null,
  benchmarkTrend: null,
}

const MILESTONE_START_DATA: OverviewData = {
  variant: 'milestone-start',
  milestone: {
    id: 'ms-2',
    slug: '02-storage-engine',
    title: 'Storage Engine',
    position: 2,
    briefExcerpt: 'Build a storage engine.',
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

describe('Overview', () => {
  let queryClient: QueryClient
  let Overview: React.ComponentType

  beforeEach(async () => {
    queryClient = createTestQueryClient()
    mockApiFetch.mockReset()
    const mod = await import('./Overview')
    Overview = mod.default
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  function renderOverview() {
    return render(
      <MemoryRouter>
        <QueryClientProvider client={queryClient}>
          <Overview />
        </QueryClientProvider>
      </MemoryRouter>
    )
  }

  it('should render FirstTimeOverview for first-time variant', async () => {
    mockApiFetch.mockResolvedValue(FIRST_TIME_DATA)
    renderOverview()

    expect(await screen.findByText(/building a database from scratch/)).toBeDefined()
    expect(screen.getByRole('button', { name: /start building/i })).toBeDefined()
  })

  it('should render MilestoneStartOverview for milestone-start variant', async () => {
    mockApiFetch.mockResolvedValue(MILESTONE_START_DATA)
    renderOverview()

    expect(await screen.findByText(/Milestone 2: Storage Engine/)).toBeDefined()
    expect(screen.getByRole('button', { name: /continue building/i })).toBeDefined()
  })

  it('should show skeleton during loading', () => {
    mockApiFetch.mockReturnValue(new Promise(() => {}))
    renderOverview()

    expect(screen.getByTestId('overview-skeleton')).toBeDefined()
  })

  it('should show error state with retry button on failure', async () => {
    mockApiFetch.mockRejectedValue(new Error('Network error'))
    renderOverview()

    expect(await screen.findByText(/Failed to load overview/)).toBeDefined()
    expect(screen.getByRole('button', { name: /retry/i })).toBeDefined()
  })
})
