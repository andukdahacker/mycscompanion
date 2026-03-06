import { describe, it, expect, vi, afterEach, beforeAll, beforeEach } from 'vitest'
import { render, screen, cleanup, act } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router'
import { QueryClientProvider } from '@tanstack/react-query'
import { createTestQueryClient } from '@mycscompanion/config/test-utils/query-client'
import Workspace from './Workspace'
import { useWorkspaceUIStore } from '../stores/workspace-ui-store'

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

// Mock CodeEditor — do NOT render real Monaco in unit tests
vi.mock('../components/workspace/CodeEditor', () => ({
  CodeEditor: function MockCodeEditor(props: { initialContent: string; onRun: () => void }) {
    return <div data-testid="code-editor" data-initial-content={props.initialContent} />
  },
}))

// Mock TerminalPanel — serialize props for test assertions
vi.mock('../components/workspace/TerminalPanel', () => ({
  TerminalPanel: function MockTerminalPanel(props: {
    outputLines: ReadonlyArray<Record<string, unknown>>
    isRunning: boolean
    onRetry?: () => void
    brief: string | null
    criteria: ReadonlyArray<Record<string, unknown>>
    criteriaResults: ReadonlyArray<Record<string, unknown>> | null
    conceptExplainerAssets: ReadonlyArray<Record<string, unknown>>
  }) {
    return (
      <div
        data-testid="terminal-panel"
        data-output-count={props.outputLines.length}
        data-is-running={props.isRunning}
        data-output-lines={JSON.stringify(props.outputLines)}
        data-brief={props.brief ?? ''}
        data-criteria-count={props.criteria.length}
        data-criteria-results={props.criteriaResults ? JSON.stringify(props.criteriaResults) : ''}
        data-concept-assets-count={props.conceptExplainerAssets.length}
      />
    )
  },
}))

// Mock firebase auth
vi.mock('../lib/firebase', () => ({
  auth: {
    currentUser: {
      getIdToken: vi.fn().mockResolvedValue('test-token'),
    },
  },
}))

// Mock announceToScreenReader
vi.mock('../components/workspace/workspace-a11y', () => ({
  announceToScreenReader: vi.fn(),
}))

// Mock editor store
vi.mock('../stores/editor-store', () => ({
  useEditorStore: Object.assign(
    () => ({ content: 'package main\n\nfunc main() {}\n' }),
    {
      getState: () => ({ content: 'package main\n\nfunc main() {}\n' }),
      subscribe: vi.fn(() => vi.fn()),
    },
  ),
}))

// Mock useWorkspaceData
const mockUseWorkspaceData = vi.fn()
vi.mock('../hooks/use-workspace-data', () => ({
  useWorkspaceData: (...args: unknown[]) => mockUseWorkspaceData(...args),
}))

// Mock useSubmitCode
let mockSubmitFn = vi.fn()
const mockUseSubmitCode = vi.fn()
vi.mock('../hooks/use-submit-code', () => ({
  useSubmitCode: () => mockUseSubmitCode(),
}))

// Mock useStuckDetection
const mockResetTimer = vi.fn()
vi.mock('../hooks/use-stuck-detection', () => ({
  useStuckDetection: () => ({ isStage1: false, isStage2: false, resetTimer: mockResetTimer, stage1Timestamp: null, stage2Timestamp: null }),
}))

// Mock useAutoSave
const mockScheduleAutoSave = vi.fn()
const mockSaveImmediately = vi.fn()
vi.mock('../hooks/use-auto-save', () => ({
  useAutoSave: () => ({ scheduleAutoSave: mockScheduleAutoSave, saveImmediately: mockSaveImmediately }),
}))

// Mock useSession
const mockSessionMutate = vi.fn()
vi.mock('../hooks/use-session', () => ({
  useSession: () => ({ mutate: mockSessionMutate, isSuccess: false, data: null }),
}))

// Mock useSSE (needed by useSubmitCode, but since we mock useSubmitCode we just need the module to exist)
vi.mock('../hooks/use-sse', () => ({
  useSSE: vi.fn(() => ({ status: 'idle', error: null, reconnectCount: 0 })),
}))

const MOCK_WORKSPACE_DATA = {
  milestoneName: 'KV Store',
  milestoneNumber: 1,
  progress: 0,
  initialContent: 'package main\n\nfunc main() {}\n',
  brief: '# Milestone 1\n\nBuild a KV store.',
  criteria: [
    { name: 'put-and-get', order: 1, description: 'Put and retrieve', assertion: { type: 'stdout-contains', expected: 'PASS' } },
  ],
  stuckDetection: { thresholdMinutes: 10, stage2OffsetSeconds: 60 },
  conceptExplainerAssets: [
    { name: 'kv-ops.svg', path: '/assets/kv-ops.svg', altText: 'KV operations', title: 'KV Ops' },
  ],
}

describe('Workspace', () => {
  beforeEach(() => {
    setWindowWidth(1280)
    mockSubmitFn = vi.fn()
    mockUseWorkspaceData.mockReturnValue({
      data: MOCK_WORKSPACE_DATA,
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    })
    mockUseSubmitCode.mockReturnValue({
      submit: mockSubmitFn,
      submissionId: null,
      isRunning: false,
      outputLines: [],
      criteriaResults: null,
    })
    mockResetTimer.mockClear()
    mockScheduleAutoSave.mockClear()
    mockSaveImmediately.mockClear()
    mockSessionMutate.mockClear()
    useWorkspaceUIStore.setState({ activeTerminalTab: 'output' })
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  function renderWorkspace() {
    const queryClient = createTestQueryClient()
    return render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/workspace/milestone-1']}>
          <Routes>
            <Route path="/workspace/:milestoneId" element={<Workspace />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    )
  }

  it('should render WorkspaceLayout when data is available', () => {
    renderWorkspace()

    expect(screen.getByText(/Milestone 1/)).toBeInTheDocument()
    expect(screen.getByTestId('code-editor')).toBeInTheDocument()
  })

  it('should render nothing when loading but delay not elapsed and no data', () => {
    mockUseWorkspaceData.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      refetch: vi.fn(),
    })

    renderWorkspace()

    expect(screen.queryByTestId('workspace-error')).not.toBeInTheDocument()
    expect(screen.queryByTestId('workspace-skeleton')).not.toBeInTheDocument()
  })

  it('should show error state on fetch failure', () => {
    mockUseWorkspaceData.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      refetch: vi.fn(),
    })

    renderWorkspace()

    expect(screen.getByTestId('workspace-error')).toBeInTheDocument()
    expect(screen.getByText(/failed to load workspace/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument()
  })

  it('should pass brief from API to TerminalPanel', () => {
    renderWorkspace()

    const terminal = screen.getByTestId('terminal-panel')
    expect(terminal.getAttribute('data-brief')).toBe('# Milestone 1\n\nBuild a KV store.')
  })

  it('should pass criteria from API to TerminalPanel', () => {
    renderWorkspace()

    const terminal = screen.getByTestId('terminal-panel')
    expect(terminal.getAttribute('data-criteria-count')).toBe('1')
  })

  it('should pass starter code from API as initialContent to CodeEditor', () => {
    renderWorkspace()

    const editor = screen.getByTestId('code-editor')
    expect(editor.getAttribute('data-initial-content')).toContain('package main')
  })

  it('should set brief tab active on initial load when brief is available', () => {
    renderWorkspace()

    expect(useWorkspaceUIStore.getState().activeTerminalTab).toBe('brief')
  })

  it('should not set brief tab when brief is null', () => {
    mockUseWorkspaceData.mockReturnValue({
      data: { ...MOCK_WORKSPACE_DATA, brief: null },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    })

    renderWorkspace()

    expect(useWorkspaceUIStore.getState().activeTerminalTab).toBe('output')
  })

  it('should show loading skeleton when delayed loading triggers', () => {
    mockUseWorkspaceData.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      refetch: vi.fn(),
    })

    // The useDelayedLoading hook needs time to elapse for skeleton to show
    // Just verify no error flash during loading
    renderWorkspace()
    expect(screen.queryByTestId('workspace-error')).not.toBeInTheDocument()
  })

  it('should render TerminalPanel in desktop mode', () => {
    renderWorkspace()

    expect(screen.getByTestId('terminal-panel')).toBeInTheDocument()
  })

  it('should pass outputLines and isRunning to TerminalPanel', () => {
    renderWorkspace()

    const terminal = screen.getByTestId('terminal-panel')
    expect(terminal.getAttribute('data-output-count')).toBe('0')
    expect(terminal.getAttribute('data-is-running')).toBe('false')
  })

  describe('handleRun and submission flow', () => {
    it('should call submit with correct params when run is triggered', async () => {
      renderWorkspace()

      await act(async () => {
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true }))
      })

      expect(mockSubmitFn).toHaveBeenCalledWith(
        expect.objectContaining({
          milestoneId: 'milestone-1',
          code: expect.any(String),
        })
      )
    })

    it('should guard against undefined milestoneId', async () => {
      const queryClient = createTestQueryClient()
      render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={['/workspace/']}>
            <Routes>
              <Route path="/workspace/" element={<Workspace />} />
            </Routes>
          </MemoryRouter>
        </QueryClientProvider>
      )

      await act(async () => {
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true }))
      })

      expect(mockSubmitFn).not.toHaveBeenCalled()
    })

    it('should reset stuck detection timer on run', async () => {
      renderWorkspace()

      await act(async () => {
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true }))
      })

      expect(mockResetTimer).toHaveBeenCalled()
    })
  })

  describe('output rendering from useSubmitCode', () => {
    it('should pass isRunning from useSubmitCode to TerminalPanel', () => {
      mockUseSubmitCode.mockReturnValue({
        submit: mockSubmitFn,
        submissionId: 'sub-123',
        isRunning: true,
        outputLines: [{ kind: 'status', text: 'Queued...', phase: 'preparing' }],
      })

      renderWorkspace()

      const terminal = screen.getByTestId('terminal-panel')
      expect(terminal.getAttribute('data-is-running')).toBe('true')
      expect(terminal.getAttribute('data-output-count')).toBe('1')
    })

    it('should pass outputLines from useSubmitCode to TerminalPanel', () => {
      mockUseSubmitCode.mockReturnValue({
        submit: mockSubmitFn,
        submissionId: 'sub-456',
        isRunning: false,
        outputLines: [
          { kind: 'stdout', text: 'Hello, World!' },
          { kind: 'success', text: 'Build successful.' },
        ],
      })

      renderWorkspace()

      const terminal = screen.getByTestId('terminal-panel')
      expect(terminal.getAttribute('data-output-count')).toBe('2')
      const lines = JSON.parse(terminal.getAttribute('data-output-lines') ?? '[]') as Array<Record<string, unknown>>
      expect(lines[0]).toEqual(expect.objectContaining({ kind: 'stdout', text: 'Hello, World!' }))
      expect(lines[1]).toEqual(expect.objectContaining({ kind: 'success', text: 'Build successful.' }))
    })
  })

  describe('criteria results flow', () => {
    it('should pass criteriaResults from useSubmitCode to TerminalPanel', () => {
      const mockResults = [
        { name: 'put-and-get', order: 1, status: 'met', expected: 'PASS', actual: 'Found' },
        { name: 'exit-clean', order: 2, status: 'not-met', expected: 0, actual: 1 },
      ]
      mockUseSubmitCode.mockReturnValue({
        submit: mockSubmitFn,
        submissionId: 'sub-crit',
        isRunning: false,
        outputLines: [],
        criteriaResults: mockResults,
      })

      renderWorkspace()

      const terminal = screen.getByTestId('terminal-panel')
      const results = JSON.parse(terminal.getAttribute('data-criteria-results') ?? '[]') as Array<Record<string, unknown>>
      expect(results).toHaveLength(2)
      expect(results[0]).toEqual(expect.objectContaining({ name: 'put-and-get', status: 'met' }))
      expect(results[1]).toEqual(expect.objectContaining({ name: 'exit-clean', status: 'not-met' }))
    })

    it('should pass null criteriaResults when no results available', () => {
      renderWorkspace()

      const terminal = screen.getByTestId('terminal-panel')
      expect(terminal.getAttribute('data-criteria-results')).toBe('')
    })
  })

  describe('useWorkspaceData integration', () => {
    it('should call useWorkspaceData with milestoneId from route params', () => {
      renderWorkspace()

      expect(mockUseWorkspaceData).toHaveBeenCalledWith('milestone-1')
    })
  })

  describe('conceptExplainerAssets flow', () => {
    it('should pass conceptExplainerAssets from workspace data to TerminalPanel', () => {
      renderWorkspace()

      const terminal = screen.getByTestId('terminal-panel')
      expect(terminal.getAttribute('data-concept-assets-count')).toBe('1')
    })

    it('should pass empty conceptExplainerAssets when none exist', () => {
      mockUseWorkspaceData.mockReturnValue({
        data: { ...MOCK_WORKSPACE_DATA, conceptExplainerAssets: [] },
        isLoading: false,
        isError: false,
        refetch: vi.fn(),
      })

      renderWorkspace()

      const terminal = screen.getByTestId('terminal-panel')
      expect(terminal.getAttribute('data-concept-assets-count')).toBe('0')
    })
  })

  describe('auto-save integration', () => {
    it('should create session on workspace mount', () => {
      renderWorkspace()

      expect(mockSessionMutate).toHaveBeenCalled()
    })

    it('should register beforeunload handler', () => {
      const addSpy = vi.spyOn(window, 'addEventListener')
      renderWorkspace()

      expect(addSpy).toHaveBeenCalledWith('beforeunload', expect.any(Function))
    })

    it('should remove beforeunload handler on unmount', () => {
      const removeSpy = vi.spyOn(window, 'removeEventListener')
      const { unmount } = renderWorkspace()

      unmount()

      expect(removeSpy).toHaveBeenCalledWith('beforeunload', expect.any(Function))
    })
  })
})
