import { describe, it, expect, vi, afterEach, beforeAll, beforeEach } from 'vitest'
import { render, screen, cleanup, act } from '@testing-library/react'
import { WorkspaceLayout } from './WorkspaceLayout'
import { useWorkspaceUIStore } from '../../stores/workspace-ui-store'

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
    onRun: vi.fn(),
    onBenchmark: vi.fn(),
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

    it('should render editor placeholder', () => {
      render(<WorkspaceLayout {...defaultProps} />)

      expect(screen.getByTestId('editor-placeholder')).toBeInTheDocument()
    })

    it('should render terminal placeholder', () => {
      render(<WorkspaceLayout {...defaultProps} />)

      expect(screen.getByTestId('terminal-placeholder')).toBeInTheDocument()
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

      expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument()
    })
  })
})
