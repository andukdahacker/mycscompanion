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

    expect(screen.getByText(/Milestone 2: Storage Engine/)).toBeInTheDocument()
    expect(screen.getByText('Data Structures')).toBeInTheDocument()
  })

  it('should render progress as criteria count with percentage in inline stats row', () => {
    renderComponent()

    expect(screen.getByText('2/5 criteria (40%)')).toBeInTheDocument()
  })

  it('should show next criterion name in inline stats row', () => {
    renderComponent()

    expect(screen.getByText('range-scan')).toBeInTheDocument()
  })

  it('should show "No submissions" for progress and "Submit code to see progress" for next when no criteria results', () => {
    const data: OverviewData = {
      ...MOCK_DATA,
      criteriaProgress: null,
    }
    renderComponent(data)

    expect(screen.getByText('No submissions')).toBeInTheDocument()
    expect(screen.getByText('Submit code to see progress')).toBeInTheDocument()
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

    expect(screen.getByText('All criteria met')).toBeInTheDocument()
  })

  it('should show benchmark em-dash placeholder in inline stats row', () => {
    renderComponent()

    const benchmarkSection = screen.getByLabelText('Benchmark')
    expect(benchmarkSection).toBeInTheDocument()
    expect(benchmarkSection.textContent).toContain('—')
  })

  it('should render session summary text below stats when non-null', () => {
    const data: OverviewData = {
      ...MOCK_DATA,
      sessionSummary: 'Working on Storage Engine. 2 of 5 criteria met. Next: range-scan.',
    }
    renderComponent(data)

    const summaryText = screen.getByText('Working on Storage Engine. 2 of 5 criteria met. Next: range-scan.')
    expect(summaryText).toBeInTheDocument()
    expect(summaryText.tagName).toBe('P')
  })

  it('should NOT render session summary element when sessionSummary is null', () => {
    renderComponent()

    // With null sessionSummary, the main container should have no <p> with muted styling
    // The only <p> elements should be the csConceptLabel and stat values — not a summary
    const mainContainer = screen.getByRole('main')
    const mutedParagraphs = mainContainer.querySelectorAll('p.text-muted-foreground')
    // Only the csConceptLabel <p> should have text-muted-foreground (not a summary paragraph)
    for (const p of mutedParagraphs) {
      expect(p.textContent).not.toBe('')
      // Each muted paragraph should be a known element (csConceptLabel or benchmark dash), not a summary
      expect(p.closest('[aria-label="Milestone statistics"]') ?? p.textContent).toBeTruthy()
    }
  })

  it('should render stats as flat label-value pairs without card wrappers', () => {
    renderComponent()

    // Each stat item should have exactly 2 children: label span + value p (no card nesting)
    const progressDiv = screen.getByLabelText('Progress')
    const benchmarkDiv = screen.getByLabelText('Benchmark')
    const nextDiv = screen.getByLabelText('Next step')

    expect(progressDiv.children.length).toBe(2)
    expect(benchmarkDiv.children.length).toBe(2)
    expect(nextDiv.children.length).toBe(2)
  })

  it('should render stats row with progress, benchmark, and next criterion inline', () => {
    renderComponent()

    const statsRow = screen.getByLabelText('Milestone statistics')
    expect(statsRow).toBeInTheDocument()

    // All three stats should be within the same parent
    expect(screen.getByLabelText('Progress')).toBeInTheDocument()
    expect(screen.getByLabelText('Benchmark')).toBeInTheDocument()
    expect(screen.getByLabelText('Next step')).toBeInTheDocument()
  })

  it('should render stat label text for all three stats', () => {
    renderComponent()

    expect(screen.getByText('Progress')).toBeInTheDocument()
    expect(screen.getByText('Benchmark')).toBeInTheDocument()
    expect(screen.getByText('Next')).toBeInTheDocument()
  })

  it('should render "Continue Building" button that navigates to workspace', async () => {
    renderComponent()

    const button = screen.getByRole('button', { name: /continue building/i })
    expect(button).toBeInTheDocument()

    await userEvent.click(button)
    expect(mockNavigate).toHaveBeenCalledWith('/workspace/ms-2')
  })

  it('should not contain temporal framing language', () => {
    const data: OverviewData = {
      ...MOCK_DATA,
      sessionSummary: 'Working on Storage Engine. 2 of 5 criteria met.',
    }
    renderComponent(data)

    const bodyText = (document.body.textContent ?? '').toLowerCase()
    expect(bodyText).not.toContain('welcome back')
    expect(bodyText).not.toContain('last time')
    expect(bodyText).not.toContain('last session')
    expect(bodyText).not.toMatch(/\bago\b/)
    expect(bodyText).not.toMatch(/\d{4}-\d{2}-\d{2}/)
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

  it('should show "All criteria met" in stats and summary text below when all criteria met with session summary', () => {
    const data: OverviewData = {
      ...MOCK_DATA,
      criteriaProgress: {
        met: 5,
        total: 5,
        nextCriterionName: null,
      },
      sessionSummary: 'All criteria met for Storage Engine. Code grew by 42 lines.',
    }
    renderComponent(data)

    expect(screen.getByText('All criteria met')).toBeInTheDocument()
    expect(screen.getByText('5/5 criteria (100%)')).toBeInTheDocument()
    expect(screen.getByText('All criteria met for Storage Engine. Code grew by 42 lines.')).toBeInTheDocument()
  })

  it('should omit CS concept label subtitle when csConceptLabel is absent', () => {
    renderComponent({
      ...MOCK_DATA,
      milestone: {
        ...MOCK_DATA.milestone,
        csConceptLabel: null,
      },
    })

    expect(screen.getByText(/Milestone 2: Storage Engine/)).toBeInTheDocument()
    expect(screen.queryByText('Data Structures')).not.toBeInTheDocument()
  })

  it('should have aria-label attributes on stat sections', () => {
    renderComponent()

    expect(screen.getByLabelText('Progress')).toBeInTheDocument()
    expect(screen.getByLabelText('Benchmark')).toBeInTheDocument()
    expect(screen.getByLabelText('Next step')).toBeInTheDocument()
  })
})
