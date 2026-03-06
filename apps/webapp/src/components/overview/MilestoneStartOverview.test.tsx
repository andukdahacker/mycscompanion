import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import type { OverviewData } from '@mycscompanion/shared'

const mockNavigate = vi.fn()

vi.mock('react-router', async () => {
  const actual = await vi.importActual('react-router')
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  }
})

const MOCK_DATA: OverviewData = {
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
    met: 2,
    total: 5,
    nextCriterionName: 'range-scan',
  },
  sessionSummary: null,
  lastBenchmark: null,
  benchmarkTrend: null,
}

describe('MilestoneStartOverview', () => {
  let MilestoneStartOverview: React.ComponentType<{ readonly data: OverviewData }>

  beforeEach(async () => {
    mockNavigate.mockReset()
    const mod = await import('./MilestoneStartOverview')
    MilestoneStartOverview = mod.MilestoneStartOverview
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  function renderComponent(data: OverviewData = MOCK_DATA) {
    return render(
      <MemoryRouter>
        <MilestoneStartOverview data={data} />
      </MemoryRouter>
    )
  }

  it('should render milestone title, position, and CS concept label', () => {
    renderComponent()

    expect(screen.getByText(/Milestone 2: Storage Engine/)).toBeDefined()
    expect(screen.getByText('Data Structures')).toBeDefined()
  })

  it('should render progress percentage from criteria counts', () => {
    renderComponent()

    expect(screen.getByText(/2 of 5 criteria met — 40%/)).toBeDefined()
  })

  it('should show next criterion name when available', () => {
    renderComponent()

    expect(screen.getByText('range-scan')).toBeDefined()
  })

  it('should show "Submit code to see progress" when no criteria results', () => {
    const data: OverviewData = {
      ...MOCK_DATA,
      criteriaProgress: null,
    }
    renderComponent(data)

    expect(screen.getByText('Submit code to see progress')).toBeDefined()
  })

  it('should show "All criteria met" when all criteria passed', () => {
    const data: OverviewData = {
      ...MOCK_DATA,
      criteriaProgress: {
        met: 5,
        total: 5,
        nextCriterionName: null,
      },
    }
    renderComponent(data)

    expect(screen.getByText('All criteria met')).toBeDefined()
  })

  it('should show placeholder for benchmark data', () => {
    renderComponent()

    expect(screen.getByText('Benchmark')).toBeDefined()
  })

  it('should show placeholder for session summary when null', () => {
    renderComponent()

    const contextHeadings = screen.getAllByText('Context')
    expect(contextHeadings.length).toBeGreaterThan(0)
  })

  it('should render session summary when non-null', () => {
    const data: OverviewData = {
      ...MOCK_DATA,
      sessionSummary: 'You were working on the range scan implementation.',
    }
    renderComponent(data)

    expect(screen.getByText('You were working on the range scan implementation.')).toBeDefined()
  })

  it('should render "Continue Building" button that navigates to workspace', async () => {
    renderComponent()

    const button = screen.getByRole('button', { name: /continue building/i })
    expect(button).toBeDefined()

    await userEvent.click(button)
    expect(mockNavigate).toHaveBeenCalledWith('/workspace/ms-2')
  })

  it('should not contain temporal framing language', () => {
    renderComponent()

    const bodyText = document.body.textContent ?? ''
    expect(bodyText).not.toContain('Welcome back')
    expect(bodyText).not.toContain('welcome back')
    expect(bodyText).not.toContain('last time')
    expect(bodyText).not.toContain('Last time')
  })

  it('should have exactly one primary action button', () => {
    renderComponent()

    const buttons = screen.getAllByRole('button')
    expect(buttons).toHaveLength(1)
    expect(buttons[0]?.textContent).toContain('Continue Building')
  })

  it('should have correct heading hierarchy', () => {
    renderComponent()

    const h1 = document.querySelector('h1')
    expect(h1).not.toBeNull()
    expect(h1?.textContent).toContain('Milestone 2: Storage Engine')
  })
})
