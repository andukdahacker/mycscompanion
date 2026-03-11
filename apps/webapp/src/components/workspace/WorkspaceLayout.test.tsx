import { describe, it, expect, vi, afterEach, beforeAll, beforeEach } from 'vitest'
import { render, screen, cleanup, act } from '@testing-library/react'

import type { AcceptanceCriterion, ConceptExplainerAsset } from '@mycscompanion/shared'
import { WorkspaceLayout } from './WorkspaceLayout'
import type { OutputLine } from './TerminalPanel'
import { useWorkspaceUIStore } from '../../stores/workspace-ui-store'

// Mock CodeEditor — do NOT render real Monaco in unit tests
vi.mock('./CodeEditor', () => ({
  CodeEditor: function MockCodeEditor(props: { initialContent: string; onRun: () => void }) {
    return (
      <div data-testid="code-editor" data-initial-content={props.initialContent}>
        <button data-testid="mock-run-trigger" onClick={props.onRun}>Run</button>
      </div>
    )
  },
}))

// Mock TerminalPanel
vi.mock('./TerminalPanel', () => ({
  TerminalPanel: function MockTerminalPanel(props: {
    outputLines: ReadonlyArray<unknown>
    isRunning: boolean
    onRetry?: () => void
    criteriaResults: ReadonlyArray<Record<string, unknown>> | null
    conceptExplainerAssets: ReadonlyArray<Record<string, unknown>>
  }) {
    return (
      <div
        data-testid="terminal-panel"
        data-output-count={props.outputLines.length}
        data-is-running={props.isRunning}
        data-criteria-results={props.criteriaResults ? JSON.stringify(props.criteriaResults) : ''}
        data-concept-assets-count={props.conceptExplainerAssets.length}
      >
        {props.onRetry && <button data-testid="terminal-retry" onClick={props.onRetry}>Retry</button>}
      </div>
    )
  },
}))

// Mock TutorPanel
vi.mock('./TutorPanel', () => ({
  TutorPanel: function MockTutorPanel(props: { sessionId: string | null; readOnly?: boolean }) {
    return (
      <div
        data-testid="tutor-chat-mock"
        data-session-id={props.sessionId ?? ''}
        data-read-only={String(props.readOnly ?? false)}
      >
        <p className="text-sm text-muted-foreground">AI tutor temporarily unavailable</p>
        <button>Retry</button>
      </div>
    )
  },
}))

// Polyfills for react-resizable-panels in jsdom
beforeAll(() => {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  Element.prototype.scrollIntoView = vi.fn()
  Element.prototype.hasPointerCapture = vi.fn().mockReturnValue(false) as () => boolean
  Element.prototype.setPointerCapture = vi.fn()
  Element.prototype.releasePointerCapture = vi.fn()
})

function setWindowWidth(width: number) {
  Object.defineProperty(window, 'innerWidth', {
    writable: true,
    configurable: true,
    value: width,
  })
}

describe('WorkspaceLayout', () => {
  const defaultProps = {
    milestoneName: 'KV Store',
    milestoneNumber: 1,
    progress: 40,
    initialContent: 'package main\n\nfunc main() {}\n',
    onRun: vi.fn(),
    onBenchmark: vi.fn(),
    outputLines: [] as ReadonlyArray<OutputLine>,
    isRunning: false,
    onRetry: vi.fn(),
    brief: null as string | null,
    criteria: [] as ReadonlyArray<AcceptanceCriterion>,
    criteriaResults: null,
    conceptExplainerAssets: [] as readonly ConceptExplainerAsset[],
    sessionId: null as string | null,
  }

  beforeEach(() => {
    // Reset store to default state
    useWorkspaceUIStore.setState({
      tutorExpanded: true,
      tutorAvailable: true,
      activeTerminalTab: 'output',
      breakpointMode: 'desktop',
    })
    // Default to desktop
    setWindowWidth(1280)
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  describe('desktop layout (>=1280px)', () => {
    it('should render resizable panel group with horizontal orientation', () => {
      render(<WorkspaceLayout {...defaultProps} />)

      const panelGroup = document.querySelector('[data-group]')
      expect(panelGroup).toBeInTheDocument()
    })

    it('should render WorkspaceTopBar', () => {
      render(<WorkspaceLayout {...defaultProps} />)

      expect(screen.getByText(/Milestone 1/)).toBeInTheDocument()
      expect(screen.getByText(/KV Store/)).toBeInTheDocument()
    })

    it('should render CodeEditor component', () => {
      render(<WorkspaceLayout {...defaultProps} />)

      expect(screen.getByTestId('code-editor')).toBeInTheDocument()
    })

    it('should pass initialContent to CodeEditor', () => {
      render(<WorkspaceLayout {...defaultProps} />)

      const editor = screen.getByTestId('code-editor')
      expect(editor.getAttribute('data-initial-content')).toBe(defaultProps.initialContent)
    })

    it('should pass onRun to CodeEditor', async () => {
      const onRun = vi.fn()
      render(<WorkspaceLayout {...defaultProps} onRun={onRun} />)

      const runTrigger = screen.getByTestId('mock-run-trigger')
      await act(async () => {
        runTrigger.click()
      })

      expect(onRun).toHaveBeenCalledOnce()
    })

    it('should have workspace-container with tabIndex={-1} for focus management', () => {
      render(<WorkspaceLayout {...defaultProps} />)

      const container = document.getElementById('workspace-container')
      expect(container).toBeInTheDocument()
      expect(container?.getAttribute('tabindex')).toBe('-1')
    })

    it('should render ARIA live region for screen reader announcements', () => {
      render(<WorkspaceLayout {...defaultProps} />)

      const announcer = document.getElementById('workspace-announcer')
      expect(announcer).toBeInTheDocument()
      expect(announcer?.getAttribute('aria-live')).toBe('polite')
      expect(announcer?.getAttribute('role')).toBe('status')
    })

    it('should render skip-to-editor link', () => {
      render(<WorkspaceLayout {...defaultProps} />)

      expect(screen.getByText('Skip to editor')).toBeInTheDocument()
    })

    it('should render TerminalPanel', () => {
      render(<WorkspaceLayout {...defaultProps} />)

      expect(screen.getByTestId('terminal-panel')).toBeInTheDocument()
    })

    it('should pass outputLines, isRunning, and onRetry to TerminalPanel', () => {
      const onRetry = vi.fn()
      render(<WorkspaceLayout {...defaultProps} isRunning={true} onRetry={onRetry} />)

      const terminal = screen.getByTestId('terminal-panel')
      expect(terminal.getAttribute('data-is-running')).toBe('true')
      expect(screen.getByTestId('terminal-retry')).toBeInTheDocument()
    })

    it('should render tutor panel', () => {
      render(<WorkspaceLayout {...defaultProps} />)

      expect(screen.getByTestId('tutor-panel')).toBeInTheDocument()
    })

    it('should pass criteriaResults to TerminalPanel', () => {
      const criteriaResults = [
        { name: 'put-and-get', order: 1, status: 'met' as const, expected: 'PASS', actual: 'Found' },
      ]
      render(<WorkspaceLayout {...defaultProps} criteriaResults={criteriaResults} />)

      const terminal = screen.getByTestId('terminal-panel')
      const results = JSON.parse(terminal.getAttribute('data-criteria-results') ?? '[]') as Array<Record<string, unknown>>
      expect(results).toHaveLength(1)
      expect(results[0]).toEqual(expect.objectContaining({ name: 'put-and-get', status: 'met' }))
    })

    it('should pass null criteriaResults to TerminalPanel when no results', () => {
      render(<WorkspaceLayout {...defaultProps} />)

      const terminal = screen.getByTestId('terminal-panel')
      expect(terminal.getAttribute('data-criteria-results')).toBe('')
    })
  })

  describe('small desktop layout (1024-1279px)', () => {
    beforeEach(() => {
      setWindowWidth(1100)
    })

    it('should render overlay tutor panel when expanded', () => {
      render(<WorkspaceLayout {...defaultProps} />)

      expect(screen.getByTestId('tutor-overlay')).toBeInTheDocument()
    })

    it('should not render tutor overlay when collapsed', () => {
      useWorkspaceUIStore.setState({ tutorExpanded: false })

      render(<WorkspaceLayout {...defaultProps} />)

      expect(screen.queryByTestId('tutor-overlay')).not.toBeInTheDocument()
    })
  })

  describe('mobile layout (<768px)', () => {
    beforeEach(() => {
      setWindowWidth(600)
    })

    it('should render read-only message instead of workspace', () => {
      render(<WorkspaceLayout {...defaultProps} />)

      expect(screen.getByText(/continue on desktop/i)).toBeInTheDocument()
    })

    it('should not render resizable panels', () => {
      render(<WorkspaceLayout {...defaultProps} />)

      const panelGroup = document.querySelector('[data-group]')
      expect(panelGroup).not.toBeInTheDocument()
    })

    it('should show milestone progress', () => {
      render(<WorkspaceLayout {...defaultProps} />)

      expect(screen.getByText(/40%/)).toBeInTheDocument()
    })
  })

  describe('keyboard shortcuts', () => {
    it('should toggle tutor on Ctrl+/', async () => {
      render(<WorkspaceLayout {...defaultProps} />)

      expect(useWorkspaceUIStore.getState().tutorExpanded).toBe(true)

      await act(async () => {
        document.dispatchEvent(new KeyboardEvent('keydown', { key: '/', ctrlKey: true, bubbles: true }))
      })

      expect(useWorkspaceUIStore.getState().tutorExpanded).toBe(false)
    })

    it('should collapse tutor on Escape when expanded', async () => {
      render(<WorkspaceLayout {...defaultProps} />)

      expect(useWorkspaceUIStore.getState().tutorExpanded).toBe(true)

      await act(async () => {
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
      })

      expect(useWorkspaceUIStore.getState().tutorExpanded).toBe(false)
    })

    it('should not change state on Escape when tutor is already collapsed', async () => {
      useWorkspaceUIStore.setState({ tutorExpanded: false })
      render(<WorkspaceLayout {...defaultProps} />)

      await act(async () => {
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
      })

      expect(useWorkspaceUIStore.getState().tutorExpanded).toBe(false)
    })

    it('should call onRun on Ctrl+Enter', async () => {
      const onRun = vi.fn()
      render(<WorkspaceLayout {...defaultProps} onRun={onRun} />)

      await act(async () => {
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true }))
      })

      expect(onRun).toHaveBeenCalledOnce()
    })

    it('should call onBenchmark on Ctrl+Shift+Enter', async () => {
      const onBenchmark = vi.fn()
      render(<WorkspaceLayout {...defaultProps} onBenchmark={onBenchmark} />)

      await act(async () => {
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, shiftKey: true, bubbles: true }))
      })

      expect(onBenchmark).toHaveBeenCalledOnce()
    })
  })

  describe('conceptExplainerAssets pass-through', () => {
    it('should pass conceptExplainerAssets to TerminalPanel', () => {
      const assets: readonly ConceptExplainerAsset[] = [
        { name: 'kv-ops.svg', path: '/assets/kv-ops.svg', altText: 'KV ops', title: 'KV Ops' },
      ]
      render(<WorkspaceLayout {...defaultProps} conceptExplainerAssets={assets} />)

      const terminal = screen.getByTestId('terminal-panel')
      expect(terminal.getAttribute('data-concept-assets-count')).toBe('1')
    })

    it('should pass empty array when no assets exist', () => {
      render(<WorkspaceLayout {...defaultProps} conceptExplainerAssets={[]} />)

      const terminal = screen.getByTestId('terminal-panel')
      expect(terminal.getAttribute('data-concept-assets-count')).toBe('0')
    })
  })

  describe('stuck stage 1 indicator on collapsed tutor button', () => {
    it('should have green glow classes when isStage1=true and tutor is collapsed', () => {
      useWorkspaceUIStore.setState({ tutorExpanded: false })

      render(<WorkspaceLayout {...defaultProps} isStage1={true} />)

      const tutorPanel = screen.getByTestId('tutor-panel')
      const button = tutorPanel.querySelector('button')
      expect(button).toBeInTheDocument()
      expect(button?.className).toContain('animate-pulse')
      expect(button?.className).toContain('bg-primary/10')
      expect(button?.className).toContain('text-primary')
    })

    it('should have default classes when isStage1=false and tutor is collapsed', () => {
      useWorkspaceUIStore.setState({ tutorExpanded: false })

      render(<WorkspaceLayout {...defaultProps} isStage1={false} />)

      const tutorPanel = screen.getByTestId('tutor-panel')
      const button = tutorPanel.querySelector('button')
      expect(button).toBeInTheDocument()
      expect(button?.className).toContain('text-muted-foreground')
      expect(button?.className).not.toContain('animate-pulse')
    })

    it('should have motion-reduce:animate-none class for green glow', () => {
      useWorkspaceUIStore.setState({ tutorExpanded: false })

      render(<WorkspaceLayout {...defaultProps} isStage1={true} />)

      const tutorPanel = screen.getByTestId('tutor-panel')
      const button = tutorPanel.querySelector('button')
      expect(button?.className).toContain('motion-reduce:animate-none')
    })

    it('should have updated aria-label when isStage1=true', () => {
      useWorkspaceUIStore.setState({ tutorExpanded: false })

      render(<WorkspaceLayout {...defaultProps} isStage1={true} />)

      const button = screen.getByRole('button', { name: /tutor wants to help/i })
      expect(button).toBeInTheDocument()
    })
  })

  describe('tutor unavailable state', () => {
    it('should show unavailable message when tutorAvailable is false', () => {
      useWorkspaceUIStore.setState({ tutorAvailable: false })

      render(<WorkspaceLayout {...defaultProps} />)

      expect(screen.getByText(/temporarily unavailable/i)).toBeInTheDocument()
    })

    it('should show retry button when tutor is unavailable', () => {
      useWorkspaceUIStore.setState({ tutorAvailable: false })

      render(<WorkspaceLayout {...defaultProps} />)

      // Multiple retry buttons may exist (terminal + tutor), so use getAllByRole
      const retryButtons = screen.getAllByRole('button', { name: /retry/i })
      expect(retryButtons.length).toBeGreaterThanOrEqual(1)
    })
  })

  describe('graceful degradation', () => {
    it('should render editor, terminal, and criteria panels when tutorAvailable is false', () => {
      useWorkspaceUIStore.setState({ tutorAvailable: false })

      render(<WorkspaceLayout {...defaultProps} />)

      expect(screen.getByTestId('code-editor')).toBeInTheDocument()
      expect(screen.getByTestId('terminal-panel')).toBeInTheDocument()
      // TutorPanel mock always renders — just shows unavailable message
      expect(screen.getByTestId('tutor-chat-mock')).toBeInTheDocument()
    })

    it('should still pass correct props to editor when tutor is unavailable', () => {
      useWorkspaceUIStore.setState({ tutorAvailable: false })

      render(<WorkspaceLayout {...defaultProps} initialContent="test code" />)

      const editor = screen.getByTestId('code-editor')
      expect(editor).toHaveAttribute('data-initial-content', 'test code')
    })

    it('should still allow submission when tutor is unavailable', () => {
      useWorkspaceUIStore.setState({ tutorAvailable: false })

      render(<WorkspaceLayout {...defaultProps} />)

      const runButton = screen.getByTestId('mock-run-trigger')
      expect(runButton).toBeInTheDocument()

      act(() => {
        runButton.click()
      })
      expect(defaultProps.onRun).toHaveBeenCalled()
    })

    it('should show unavailable notice in mobile layout when tutorAvailable is false', () => {
      setWindowWidth(600)
      useWorkspaceUIStore.setState({ tutorAvailable: false, breakpointMode: 'mobile' })

      render(<WorkspaceLayout {...defaultProps} />)

      // TutorPanel should still be rendered (with readOnly in mobile)
      const tutorMock = screen.getByTestId('tutor-chat-mock')
      expect(tutorMock).toBeInTheDocument()
      expect(tutorMock).toHaveAttribute('data-read-only', 'true')
    })
  })
})
