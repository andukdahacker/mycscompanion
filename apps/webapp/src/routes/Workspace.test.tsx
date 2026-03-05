import { describe, it, expect, vi, afterEach, beforeAll, beforeEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { QueryClientProvider } from '@tanstack/react-query'
import { createTestQueryClient } from '@mycscompanion/config/test-utils/query-client'
import Workspace from './Workspace'

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

// Mock useQuery to control loading/error states
const mockUseQuery = vi.fn()
vi.mock('@tanstack/react-query', async () => {
  const actual = await vi.importActual('@tanstack/react-query')
  return {
    ...actual,
    useQuery: (...args: unknown[]) => mockUseQuery(...args),
  }
})

describe('Workspace', () => {
  beforeEach(() => {
    setWindowWidth(1280)
    mockUseQuery.mockReturnValue({
      data: { milestoneName: 'KV Store', milestoneNumber: 1, progress: 0, initialContent: 'package main\n\nfunc main() {}\n' },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    })
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
          <Workspace />
        </MemoryRouter>
      </QueryClientProvider>
    )
  }

  it('should render WorkspaceLayout when data is available', () => {
    renderWorkspace()

    expect(screen.getByText(/Milestone 1/)).toBeInTheDocument()
    expect(screen.getByTestId('code-editor')).toBeInTheDocument()
  })

  it('should fall through to error state when loading but delay not elapsed and no data', () => {
    mockUseQuery.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      refetch: vi.fn(),
    })

    // useDelayedLoading returns false initially (loading hasn't exceeded 500ms).
    // With showLoading=false and data=undefined, component falls through to the
    // !data check and renders error state. Delayed loading behavior is tested
    // in use-delayed-loading.test.ts.
    renderWorkspace()

    expect(screen.getByTestId('workspace-error')).toBeInTheDocument()
  })

  it('should show error state on fetch failure', () => {
    mockUseQuery.mockReturnValue({
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

  it('should pass initialContent to WorkspaceLayout', () => {
    renderWorkspace()

    const editor = screen.getByTestId('code-editor')
    expect(editor.getAttribute('data-initial-content')).toContain('package main')
  })

  it('should render terminal placeholder in desktop mode', () => {
    renderWorkspace()

    expect(screen.getByTestId('terminal-placeholder')).toBeInTheDocument()
  })
})
