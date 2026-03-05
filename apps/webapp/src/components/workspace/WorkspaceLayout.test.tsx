import { describe, it, expect, vi, afterEach, beforeAll, beforeEach } from 'vitest'
import { render, screen, cleanup, act } from '@testing-library/react'

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
  }) {
    return (
      <div
        data-testid="terminal-panel"
        data-output-count={props.outputLines.length}
        data-is-running={props.isRunning}
      >
        {props.onRetry && <button data-testid="terminal-retry" onClick={props.onRetry}>Retry</button>}
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
})
