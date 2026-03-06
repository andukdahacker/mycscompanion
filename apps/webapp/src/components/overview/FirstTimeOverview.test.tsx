import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import type { OverviewMilestoneInfo } from '@mycscompanion/shared'

const mockNavigate = vi.fn()

vi.mock('react-router', async () => {
  const actual = await vi.importActual('react-router')
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  }
})

const MOCK_MILESTONE: OverviewMilestoneInfo = {
  id: 'ms-1',
  slug: '01-kv-store',
  title: 'Simple Key-Value Store',
  position: 1,
  briefExcerpt: 'Build a simple key-value store from scratch.',
  csConceptLabel: null,
}

describe('FirstTimeOverview', () => {
  let FirstTimeOverview: React.ComponentType<{ readonly milestone: OverviewMilestoneInfo }>

  beforeEach(async () => {
    mockNavigate.mockReset()
    const mod = await import('./FirstTimeOverview')
    FirstTimeOverview = mod.FirstTimeOverview
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  function renderComponent(milestone: OverviewMilestoneInfo = MOCK_MILESTONE) {
    return render(
      <MemoryRouter>
        <FirstTimeOverview milestone={milestone} />
      </MemoryRouter>
    )
  }

  it('should render introduction text', () => {
    renderComponent()

    expect(screen.getByText(/building a database from scratch/)).toBeDefined()
    expect(screen.getByText(/understand how PostgreSQL, Redis, and SQLite work/)).toBeDefined()
  })

  it('should render milestone title and brief excerpt', () => {
    renderComponent()

    expect(screen.getByText('Simple Key-Value Store')).toBeDefined()
    expect(screen.getByText('Build a simple key-value store from scratch.')).toBeDefined()
  })

  it('should render hook text', () => {
    renderComponent()

    expect(screen.getByText(/Start with a key-value store/)).toBeDefined()
  })

  it('should render "Start Building" button that navigates to workspace', async () => {
    renderComponent()

    const button = screen.getByRole('button', { name: /start building/i })
    expect(button).toBeDefined()

    await userEvent.click(button)
    expect(mockNavigate).toHaveBeenCalledWith('/workspace/ms-1')
  })

  it('should not show progress stats', () => {
    renderComponent()

    const bodyText = document.body.textContent ?? ''
    expect(bodyText).not.toContain('criteria met')
    expect(bodyText).not.toContain('Benchmark')
    expect(bodyText).not.toContain('progress')
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
    expect(buttons[0]?.textContent).toContain('Start Building')
  })

  it('should have semantic heading structure', () => {
    renderComponent()

    const h1 = document.querySelector('h1')
    expect(h1).not.toBeNull()
    expect(h1?.textContent).toContain('building a database from scratch')
  })

  it('should have main element', () => {
    renderComponent()

    const main = document.querySelector('main')
    expect(main).not.toBeNull()
  })
})
