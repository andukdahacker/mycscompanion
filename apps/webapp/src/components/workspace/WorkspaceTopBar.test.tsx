import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { WorkspaceTopBar } from './WorkspaceTopBar'

describe('WorkspaceTopBar', () => {
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  function renderTopBar(overrides?: Partial<React.ComponentProps<typeof WorkspaceTopBar>>) {
    const defaultProps = {
      milestoneName: 'B-Tree Indexing',
      milestoneNumber: 3,
      progress: 60,
      onRun: vi.fn(),
      onBenchmark: vi.fn(),
    }
    return { ...defaultProps, ...render(<WorkspaceTopBar {...defaultProps} {...overrides} />) }
  }

  it('should render milestone name and progress', () => {
    renderTopBar()

    expect(screen.getByText(/Milestone 3/)).toBeInTheDocument()
    expect(screen.getByText(/B-Tree Indexing/)).toBeInTheDocument()
    expect(screen.getByText(/60%/)).toBeInTheDocument()
  })

  it('should call onRun when Run button is clicked', async () => {
    const user = userEvent.setup()
    const onRun = vi.fn()
    renderTopBar({ onRun })

    await user.click(screen.getByRole('button', { name: /run/i }))

    expect(onRun).toHaveBeenCalledOnce()
  })

  it('should call onBenchmark when Benchmark button is clicked', async () => {
    const user = userEvent.setup()
    const onBenchmark = vi.fn()
    renderTopBar({ onBenchmark })

    await user.click(screen.getByRole('button', { name: /benchmark/i }))

    expect(onBenchmark).toHaveBeenCalledOnce()
  })

  it('should show keyboard shortcut hints on buttons', () => {
    renderTopBar()

    const runButton = screen.getByRole('button', { name: /run/i })
    const benchmarkButton = screen.getByRole('button', { name: /benchmark/i })

    expect(runButton).toHaveAttribute('title')
    expect(benchmarkButton).toHaveAttribute('title')
  })
})
