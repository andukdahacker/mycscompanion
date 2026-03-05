import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { TerminalPanel } from './TerminalPanel'
import type { OutputLine } from './TerminalPanel'
import { useWorkspaceUIStore } from '../../stores/workspace-ui-store'
import type { AcceptanceCriterion, CriterionResult } from '@mycscompanion/shared'

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

const DEFAULT_PROPS = {
  outputLines: [] as ReadonlyArray<OutputLine>,
  isRunning: false,
  brief: null,
  criteria: [] as ReadonlyArray<AcceptanceCriterion>,
  criteriaResults: null as ReadonlyArray<CriterionResult> | null,
}

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

  it('should render "Brief", "Output" and "Criteria" tabs', () => {
    render(<TerminalPanel {...DEFAULT_PROPS} />)

    expect(screen.getByRole('tab', { name: /brief/i })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /output/i })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /criteria/i })).toBeInTheDocument()
  })

  it('should have Output tab active by default', () => {
    render(<TerminalPanel {...DEFAULT_PROPS} />)

    const outputTab = screen.getByRole('tab', { name: /output/i })
    expect(outputTab).toHaveAttribute('aria-selected', 'true')
  })

  it('should switch to Criteria tab when clicked', () => {
    render(<TerminalPanel {...DEFAULT_PROPS} />)

    const criteriaTab = screen.getByRole('tab', { name: /criteria/i })
    fireEvent.click(criteriaTab)

    expect(useWorkspaceUIStore.getState().activeTerminalTab).toBe('criteria')
  })

  it('should switch to Brief tab when clicked', () => {
    render(<TerminalPanel {...DEFAULT_PROPS} />)

    const briefTab = screen.getByRole('tab', { name: /brief/i })
    fireEvent.click(briefTab)

    expect(useWorkspaceUIStore.getState().activeTerminalTab).toBe('brief')
  })

  it('should show placeholder text on Criteria tab when criteria is empty', () => {
    useWorkspaceUIStore.setState({ activeTerminalTab: 'criteria' })
    render(<TerminalPanel {...DEFAULT_PROPS} />)

    expect(screen.getByText(/no acceptance criteria defined/i)).toBeInTheDocument()
  })

  it('should render brief markdown content when brief tab is active', () => {
    useWorkspaceUIStore.setState({ activeTerminalTab: 'brief' })
    render(<TerminalPanel {...DEFAULT_PROPS} brief="# My Milestone Brief" />)

    expect(screen.getByText('My Milestone Brief')).toBeInTheDocument()
  })

  it('should show no brief message when brief is null on brief tab', () => {
    useWorkspaceUIStore.setState({ activeTerminalTab: 'brief' })
    render(<TerminalPanel {...DEFAULT_PROPS} brief={null} />)

    expect(screen.getByText(/no brief available/i)).toBeInTheDocument()
  })

  it('should render criteria list with names and descriptions', () => {
    useWorkspaceUIStore.setState({ activeTerminalTab: 'criteria' })
    const criteria: ReadonlyArray<AcceptanceCriterion> = [
      { name: 'put-and-get', order: 1, description: 'Put a key and retrieve it', assertion: { type: 'stdout-contains', expected: 'PASS' } },
      { name: 'exit-clean', order: 2, assertion: { type: 'exit-code-equals', expected: 0 } },
    ]
    render(<TerminalPanel {...DEFAULT_PROPS} criteria={criteria} />)

    expect(screen.getByText('put-and-get')).toBeInTheDocument()
    expect(screen.getByText('Put a key and retrieve it')).toBeInTheDocument()
    expect(screen.getByText('exit-clean')).toBeInTheDocument()
  })

  it('should render stdout output lines correctly', () => {
    const lines: ReadonlyArray<OutputLine> = [
      { kind: 'stdout', text: 'Hello, World!' },
    ]
    render(<TerminalPanel {...DEFAULT_PROPS} outputLines={lines} />)

    expect(screen.getByText('Hello, World!')).toBeInTheDocument()
  })

  it('should render stderr output lines correctly', () => {
    const lines: ReadonlyArray<OutputLine> = [
      { kind: 'stderr', text: 'warning: unused variable' },
    ]
    render(<TerminalPanel {...DEFAULT_PROPS} outputLines={lines} />)

    expect(screen.getByText('warning: unused variable')).toBeInTheDocument()
  })

  it('should render status output lines correctly', () => {
    const lines: ReadonlyArray<OutputLine> = [
      { kind: 'status', text: 'Queued...', phase: 'preparing' },
    ]
    render(<TerminalPanel {...DEFAULT_PROPS} outputLines={lines} />)

    expect(screen.getByText('Queued...')).toBeInTheDocument()
  })

  it('should have correct ARIA attributes on tabs', () => {
    render(<TerminalPanel {...DEFAULT_PROPS} />)

    const tablist = screen.getByRole('tablist')
    expect(tablist).toBeInTheDocument()

    const outputTab = screen.getByRole('tab', { name: /output/i })
    expect(outputTab).toHaveAttribute('aria-selected', 'true')
    expect(outputTab).toHaveAttribute('tabindex', '0')

    const criteriaTab = screen.getByRole('tab', { name: /criteria/i })
    expect(criteriaTab).toHaveAttribute('aria-selected', 'false')
    expect(criteriaTab).toHaveAttribute('tabindex', '-1')

    const briefTab = screen.getByRole('tab', { name: /brief/i })
    expect(briefTab).toHaveAttribute('aria-selected', 'false')
    expect(briefTab).toHaveAttribute('tabindex', '-1')
  })

  it('should support arrow key navigation across 3 tabs', () => {
    render(<TerminalPanel {...DEFAULT_PROPS} />)

    const outputTab = screen.getByRole('tab', { name: /output/i })

    // output -> criteria (ArrowRight)
    fireEvent.keyDown(outputTab, { key: 'ArrowRight' })
    expect(useWorkspaceUIStore.getState().activeTerminalTab).toBe('criteria')

    // criteria -> brief (ArrowRight wraps)
    const criteriaTab = screen.getByRole('tab', { name: /criteria/i })
    fireEvent.keyDown(criteriaTab, { key: 'ArrowRight' })
    expect(useWorkspaceUIStore.getState().activeTerminalTab).toBe('brief')

    // brief -> criteria (ArrowLeft wraps back)
    // Actually brief (index 0) ArrowLeft wraps to criteria (index 2)
    const briefTab = screen.getByRole('tab', { name: /brief/i })
    fireEvent.keyDown(briefTab, { key: 'ArrowLeft' })
    expect(useWorkspaceUIStore.getState().activeTerminalTab).toBe('criteria')
  })

  it('should have min-h-11 (44px) touch targets on tab buttons', () => {
    render(<TerminalPanel {...DEFAULT_PROPS} />)

    const outputTab = screen.getByRole('tab', { name: /output/i })
    expect(outputTab.className).toContain('min-h-11')
  })

  it('should use JetBrains Mono font for terminal output', () => {
    const lines: ReadonlyArray<OutputLine> = [
      { kind: 'stdout', text: 'test output' },
    ]
    render(<TerminalPanel {...DEFAULT_PROPS} outputLines={lines} />)

    const tabpanel = screen.getByRole('tabpanel')
    expect(tabpanel.className).toContain('font-mono')
  })

  it('should show blinking cursor when empty', () => {
    render(<TerminalPanel {...DEFAULT_PROPS} />)

    expect(screen.getByText('$')).toBeInTheDocument()
  })

  it('should show "Compiling..." indicator when running with no output', () => {
    render(<TerminalPanel {...DEFAULT_PROPS} isRunning={true} />)

    expect(screen.getByText(/compiling/i)).toBeInTheDocument()
  })

  it('should render ErrorPresentation for error output lines with onRetry', () => {
    const onRetry = vi.fn()
    const lines: ReadonlyArray<OutputLine> = [
      { kind: 'error', interpretation: 'Something went wrong', rawOutput: 'raw error', isUserError: false },
    ]
    render(<TerminalPanel {...DEFAULT_PROPS} outputLines={lines} onRetry={onRetry} />)

    const errorPresentation = screen.getByTestId('error-presentation')
    expect(errorPresentation).toBeInTheDocument()
    expect(screen.getByText('Something went wrong')).toBeInTheDocument()
  })

  it('should render success output lines with checkmark', () => {
    const lines: ReadonlyArray<OutputLine> = [
      { kind: 'success', text: 'Build successful.' },
    ]
    render(<TerminalPanel {...DEFAULT_PROPS} outputLines={lines} />)

    expect(screen.getByText('Build successful.')).toBeInTheDocument()
  })

  it('should show unevaluated criteria with dashes when criteriaResults is null', () => {
    useWorkspaceUIStore.setState({ activeTerminalTab: 'criteria' })
    const criteria: ReadonlyArray<AcceptanceCriterion> = [
      { name: 'put-and-get', order: 1, assertion: { type: 'stdout-contains', expected: 'PASS' } },
    ]
    render(<TerminalPanel {...DEFAULT_PROPS} criteria={criteria} criteriaResults={null} />)

    expect(screen.getByText('put-and-get')).toBeInTheDocument()
    // Should show dash, not check
    const listItem = screen.getByText('put-and-get').closest('li')
    expect(listItem?.textContent).not.toContain('MET')
  })

  it('should show MET criteria with green check', () => {
    useWorkspaceUIStore.setState({ activeTerminalTab: 'criteria' })
    const criteria: ReadonlyArray<AcceptanceCriterion> = [
      { name: 'put-and-get', order: 1, assertion: { type: 'stdout-contains', expected: 'PASS' } },
    ]
    const criteriaResults: ReadonlyArray<CriterionResult> = [
      { name: 'put-and-get', order: 1, status: 'met', expected: 'PASS', actual: 'Found' },
    ]
    render(<TerminalPanel {...DEFAULT_PROPS} criteria={criteria} criteriaResults={criteriaResults} />)

    expect(screen.getByText(/put-and-get: MET/)).toBeInTheDocument()
  })

  it('should show NOT MET criteria with gray dash and expected/actual', () => {
    useWorkspaceUIStore.setState({ activeTerminalTab: 'criteria' })
    const criteria: ReadonlyArray<AcceptanceCriterion> = [
      { name: 'put-and-get', order: 1, assertion: { type: 'stdout-contains', expected: 'PASS' }, errorHint: 'Check Put.' },
    ]
    const criteriaResults: ReadonlyArray<CriterionResult> = [
      { name: 'put-and-get', order: 1, status: 'not-met', expected: 'PASS', actual: 'Not found in output (first 200 chars): some code', errorHint: 'Check Put.' },
    ]
    render(<TerminalPanel {...DEFAULT_PROPS} criteria={criteria} criteriaResults={criteriaResults} />)

    expect(screen.getByText(/put-and-get: NOT MET/)).toBeInTheDocument()
    expect(screen.getByText(/Expected: "PASS"/)).toBeInTheDocument()
    expect(screen.getByText(/Actual: "Not found in output/)).toBeInTheDocument()
    expect(screen.getByText(/Hint: Check Put./)).toBeInTheDocument()
  })

  it('should sort criteria by order field', () => {
    useWorkspaceUIStore.setState({ activeTerminalTab: 'criteria' })
    const criteria: ReadonlyArray<AcceptanceCriterion> = [
      { name: 'b', order: 2, assertion: { type: 'stdout-contains', expected: 'B' } },
      { name: 'a', order: 1, assertion: { type: 'stdout-contains', expected: 'A' } },
    ]
    const criteriaResults: ReadonlyArray<CriterionResult> = [
      { name: 'b', order: 2, status: 'met', expected: 'B', actual: 'Found' },
      { name: 'a', order: 1, status: 'met', expected: 'A', actual: 'Found' },
    ]
    render(<TerminalPanel {...DEFAULT_PROPS} criteria={criteria} criteriaResults={criteriaResults} />)

    const list = screen.getByTestId('criteria-list')
    const items = list.querySelectorAll('li')
    expect(items[0]?.textContent).toContain('a: MET')
    expect(items[1]?.textContent).toContain('b: MET')
  })

  it('should not use red color classes in criteria output', () => {
    useWorkspaceUIStore.setState({ activeTerminalTab: 'criteria' })
    const criteriaResults: ReadonlyArray<CriterionResult> = [
      { name: 'test', order: 1, status: 'not-met', expected: 'PASS', actual: 'FAIL' },
    ]
    const criteria: ReadonlyArray<AcceptanceCriterion> = [
      { name: 'test', order: 1, assertion: { type: 'stdout-contains', expected: 'PASS' } },
    ]
    const { container } = render(<TerminalPanel {...DEFAULT_PROPS} criteria={criteria} criteriaResults={criteriaResults} />)

    // No red/destructive classes anywhere in criteria
    const allElements = container.querySelectorAll('*')
    allElements.forEach((el) => {
      expect(el.className).not.toContain('text-destructive')
    })
  })

  it('should have aria-live region on criteria list', () => {
    useWorkspaceUIStore.setState({ activeTerminalTab: 'criteria' })
    const criteria: ReadonlyArray<AcceptanceCriterion> = [
      { name: 'test', order: 1, assertion: { type: 'stdout-contains', expected: 'PASS' } },
    ]
    render(<TerminalPanel {...DEFAULT_PROPS} criteria={criteria} />)

    const list = screen.getByTestId('criteria-list')
    expect(list).toHaveAttribute('aria-live', 'polite')
  })
})
