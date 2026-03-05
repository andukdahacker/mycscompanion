import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { TerminalPanel } from './TerminalPanel'
import type { OutputLine } from './TerminalPanel'
import { useWorkspaceUIStore } from '../../stores/workspace-ui-store'

// Mock ErrorPresentation to isolate TerminalPanel tests
vi.mock('./ErrorPresentation', () => ({
  ErrorPresentation: function MockErrorPresentation(props: {
    interpretation: string
    isUserError: boolean
    onRetry?: () => void
  }) {
    return (
      <div data-testid="error-presentation" data-user-error={props.isUserError}>
        {props.interpretation}
        {props.onRetry && <button onClick={props.onRetry}>Try again</button>}
      </div>
    )
  },
}))

describe('TerminalPanel', () => {
  beforeEach(() => {
    useWorkspaceUIStore.setState({
      activeTerminalTab: 'output',
    })
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('should render "Output" and "Criteria" tabs', () => {
    render(<TerminalPanel outputLines={[]} isRunning={false} />)

    expect(screen.getByRole('tab', { name: /output/i })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /criteria/i })).toBeInTheDocument()
  })

  it('should have Output tab active by default', () => {
    render(<TerminalPanel outputLines={[]} isRunning={false} />)

    const outputTab = screen.getByRole('tab', { name: /output/i })
    expect(outputTab).toHaveAttribute('aria-selected', 'true')
  })

  it('should switch to Criteria tab when clicked', () => {
    render(<TerminalPanel outputLines={[]} isRunning={false} />)

    const criteriaTab = screen.getByRole('tab', { name: /criteria/i })
    fireEvent.click(criteriaTab)

    expect(useWorkspaceUIStore.getState().activeTerminalTab).toBe('criteria')
  })

  it('should show placeholder text on Criteria tab', () => {
    useWorkspaceUIStore.setState({ activeTerminalTab: 'criteria' })
    render(<TerminalPanel outputLines={[]} isRunning={false} />)

    expect(screen.getByText(/acceptance criteria/i)).toBeInTheDocument()
  })

  it('should render stdout output lines correctly', () => {
    const lines: ReadonlyArray<OutputLine> = [
      { kind: 'stdout', text: 'Hello, World!' },
    ]
    render(<TerminalPanel outputLines={lines} isRunning={false} />)

    expect(screen.getByText('Hello, World!')).toBeInTheDocument()
  })

  it('should render stderr output lines correctly', () => {
    const lines: ReadonlyArray<OutputLine> = [
      { kind: 'stderr', text: 'warning: unused variable' },
    ]
    render(<TerminalPanel outputLines={lines} isRunning={false} />)

    expect(screen.getByText('warning: unused variable')).toBeInTheDocument()
  })

  it('should render status output lines correctly', () => {
    const lines: ReadonlyArray<OutputLine> = [
      { kind: 'status', text: 'Queued...', phase: 'preparing' },
    ]
    render(<TerminalPanel outputLines={lines} isRunning={false} />)

    expect(screen.getByText('Queued...')).toBeInTheDocument()
  })

  it('should have correct ARIA attributes on tabs', () => {
    render(<TerminalPanel outputLines={[]} isRunning={false} />)

    const tablist = screen.getByRole('tablist')
    expect(tablist).toBeInTheDocument()

    const outputTab = screen.getByRole('tab', { name: /output/i })
    expect(outputTab).toHaveAttribute('aria-selected', 'true')
    expect(outputTab).toHaveAttribute('tabindex', '0')

    const criteriaTab = screen.getByRole('tab', { name: /criteria/i })
    expect(criteriaTab).toHaveAttribute('aria-selected', 'false')
    expect(criteriaTab).toHaveAttribute('tabindex', '-1')
  })

  it('should support arrow key navigation to switch tabs', () => {
    render(<TerminalPanel outputLines={[]} isRunning={false} />)

    const outputTab = screen.getByRole('tab', { name: /output/i })
    fireEvent.keyDown(outputTab, { key: 'ArrowRight' })

    expect(useWorkspaceUIStore.getState().activeTerminalTab).toBe('criteria')
  })

  it('should have min-h-11 (44px) touch targets on tab buttons', () => {
    render(<TerminalPanel outputLines={[]} isRunning={false} />)

    const outputTab = screen.getByRole('tab', { name: /output/i })
    expect(outputTab.className).toContain('min-h-11')
  })

  it('should use JetBrains Mono font for terminal output', () => {
    const lines: ReadonlyArray<OutputLine> = [
      { kind: 'stdout', text: 'test output' },
    ]
    render(<TerminalPanel outputLines={lines} isRunning={false} />)

    const tabpanel = screen.getByRole('tabpanel')
    expect(tabpanel.className).toContain('font-mono')
  })

  it('should show blinking cursor when empty', () => {
    render(<TerminalPanel outputLines={[]} isRunning={false} />)

    expect(screen.getByText('$')).toBeInTheDocument()
  })

  it('should show "Compiling..." indicator when running with no output', () => {
    render(<TerminalPanel outputLines={[]} isRunning={true} />)

    expect(screen.getByText(/compiling/i)).toBeInTheDocument()
  })

  it('should render ErrorPresentation for error output lines with onRetry', () => {
    const onRetry = vi.fn()
    const lines: ReadonlyArray<OutputLine> = [
      { kind: 'error', interpretation: 'Something went wrong', rawOutput: 'raw error', isUserError: false },
    ]
    render(<TerminalPanel outputLines={lines} isRunning={false} onRetry={onRetry} />)

    const errorPresentation = screen.getByTestId('error-presentation')
    expect(errorPresentation).toBeInTheDocument()
    expect(screen.getByText('Something went wrong')).toBeInTheDocument()
  })

  it('should render success output lines with checkmark', () => {
    const lines: ReadonlyArray<OutputLine> = [
      { kind: 'success', text: 'Build successful.' },
    ]
    render(<TerminalPanel outputLines={lines} isRunning={false} />)

    expect(screen.getByText('Build successful.')).toBeInTheDocument()
  })
})
