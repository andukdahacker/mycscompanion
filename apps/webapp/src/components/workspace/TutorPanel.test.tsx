import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { QueryClientProvider } from '@tanstack/react-query'
import { createTestQueryClient } from '@mycscompanion/config/test-utils'
import { TutorPanel } from './TutorPanel'
import { useWorkspaceUIStore } from '../../stores/workspace-ui-store'

// Mock firebase auth
vi.mock('../../lib/firebase', () => ({
  auth: {
    currentUser: {
      getIdToken: vi.fn().mockResolvedValue('test-token'),
    },
  },
}))

// Mock announceToScreenReader
vi.mock('./workspace-a11y', () => ({
  announceToScreenReader: vi.fn(),
}))

// Mock dialog to avoid portal issues
vi.mock('@mycscompanion/ui/src/components/ui/dialog', () => ({
  Dialog: ({ children, open }: { children: React.ReactNode; open: boolean }) =>
    open ? <div data-testid="dialog">{children}</div> : null,
  DialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

// Mock useTutorMessages
const mockAddOptimisticMessage = vi.fn()
const mockFetchNextPage = vi.fn().mockResolvedValue({})
const mockUseTutorMessages = vi.fn()
vi.mock('../../hooks/use-tutor-messages', () => ({
  useTutorMessages: (...args: unknown[]) => mockUseTutorMessages(...args),
}))

// Mock useTutorStream
const mockSendMessage = vi.fn()
const mockClearError = vi.fn()
const mockUseTutorStream = vi.fn()
vi.mock('../../hooks/use-tutor-stream', () => ({
  useTutorStream: (...args: unknown[]) => mockUseTutorStream(...args),
}))

// Mock useTutorRecovery
vi.mock('../../hooks/use-tutor-recovery', () => ({
  useTutorRecovery: vi.fn(),
}))

function renderTutorPanel(props: { sessionId: string | null; readOnly?: boolean }) {
  const queryClient = createTestQueryClient()
  return render(
    <QueryClientProvider client={queryClient}>
      <TutorPanel {...props} />
    </QueryClientProvider>,
  )
}

describe('TutorPanel', () => {
  beforeEach(() => {
    useWorkspaceUIStore.setState({
      tutorExpanded: true,
      tutorAvailable: true,
      breakpointMode: 'desktop',
    })
    mockUseTutorMessages.mockReturnValue({
      messages: [],
      addOptimisticMessage: mockAddOptimisticMessage,
      fetchNextPage: mockFetchNextPage,
      hasNextPage: false,
      isFetchingNextPage: false,
    })
    mockUseTutorStream.mockReturnValue({
      sendMessage: mockSendMessage,
      isStreaming: false,
      streamingContent: '',
      error: null,
      clearError: mockClearError,
    })
    mockAddOptimisticMessage.mockClear()
    mockSendMessage.mockClear()
    mockClearError.mockClear()
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('should render chat input with correct placeholder when session is active', () => {
    renderTutorPanel({ sessionId: 'session-1' })

    const input = screen.getByPlaceholderText('Ask a question...')
    expect(input).toBeInTheDocument()
  })

  it('should render unavailable state with retry button when tutorAvailable is false', () => {
    useWorkspaceUIStore.setState({ tutorAvailable: false })

    renderTutorPanel({ sessionId: 'session-1' })

    expect(screen.getByText(/temporarily unavailable/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument()
  })

  it('should hide input in read-only mode (mobile)', () => {
    renderTutorPanel({ sessionId: 'session-1', readOnly: true })

    expect(screen.queryByPlaceholderText('Ask a question...')).not.toBeInTheDocument()
  })

  it('should disable input while streaming', () => {
    mockUseTutorStream.mockReturnValue({
      sendMessage: mockSendMessage,
      isStreaming: true,
      streamingContent: 'Thinking...',
      error: null,
      clearError: mockClearError,
    })

    renderTutorPanel({ sessionId: 'session-1' })

    const input = screen.getByPlaceholderText('Ask a question...')
    expect(input).toBeDisabled()
  })

  it('should render user and assistant messages with correct alignment', () => {
    mockUseTutorMessages.mockReturnValue({
      messages: [
        { id: 'msg-1', role: 'user', content: 'Hello', model: null, createdAt: new Date().toISOString() },
        { id: 'msg-2', role: 'assistant', content: 'Hi there!', model: 'haiku', createdAt: new Date().toISOString() },
      ],
      addOptimisticMessage: mockAddOptimisticMessage,
      fetchNextPage: mockFetchNextPage,
      hasNextPage: false,
      isFetchingNextPage: false,
    })

    renderTutorPanel({ sessionId: 'session-1' })

    expect(screen.getByText('Hello')).toBeInTheDocument()
    expect(screen.getByText('Hi there!')).toBeInTheDocument()

    // User message should be in a right-aligned container
    const userMsg = screen.getByText('Hello').closest('[role="listitem"]')
    expect(userMsg?.className).toContain('justify-end')

    // Assistant message should be left-aligned
    const assistantMsg = screen.getByText('Hi there!').closest('[role="listitem"]')
    expect(assistantMsg?.className).toContain('justify-start')
  })

  it('should show streaming content with cursor indicator during active stream', () => {
    mockUseTutorStream.mockReturnValue({
      sendMessage: mockSendMessage,
      isStreaming: true,
      streamingContent: 'Let me think about that...',
      error: null,
      clearError: mockClearError,
    })

    renderTutorPanel({ sessionId: 'session-1' })

    expect(screen.getByText('Let me think about that...')).toBeInTheDocument()
    // Should show blinking cursor (an element with animate-pulse)
    const cursor = document.querySelector('[aria-hidden="true"].animate-pulse')
    expect(cursor).toBeInTheDocument()
  })

  it('should render message area with role="log"', () => {
    renderTutorPanel({ sessionId: 'session-1' })

    expect(screen.getByRole('log')).toBeInTheDocument()
  })

  it('should render header with AI Tutor title', () => {
    renderTutorPanel({ sessionId: 'session-1' })

    expect(screen.getByText('AI Tutor')).toBeInTheDocument()
  })

  it('should render nothing visible when tutor is collapsed', () => {
    useWorkspaceUIStore.setState({ tutorExpanded: false })

    renderTutorPanel({ sessionId: 'session-1' })

    expect(screen.queryByPlaceholderText('Ask a question...')).not.toBeInTheDocument()
    expect(screen.queryByText('AI Tutor')).not.toBeInTheDocument()
  })

  it('should send message on Enter key press', () => {
    renderTutorPanel({ sessionId: 'session-1' })

    const input = screen.getByPlaceholderText('Ask a question...')
    fireEvent.change(input, { target: { value: 'How do I use maps?' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(mockAddOptimisticMessage).toHaveBeenCalledWith('How do I use maps?')
    expect(mockSendMessage).toHaveBeenCalledWith('How do I use maps?')
  })

  it('should pass concept explainer assets to message rendering', () => {
    mockUseTutorMessages.mockReturnValue({
      messages: [
        { id: 'msg-1', role: 'assistant', content: 'See [explainer:kv-store-operations.svg] here', model: 'haiku', createdAt: new Date().toISOString() },
      ],
      addOptimisticMessage: mockAddOptimisticMessage,
      fetchNextPage: mockFetchNextPage,
      hasNextPage: false,
      isFetchingNextPage: false,
    })

    const queryClient = createTestQueryClient()
    render(
      <QueryClientProvider client={queryClient}>
        <TutorPanel
          sessionId="session-1"
          conceptExplainerAssets={[
            { name: 'kv-store-operations.svg', path: '/assets/milestones/01-kv-store/kv-store-operations.svg', title: 'Key-Value Store Operations', altText: 'KV diagram' },
          ]}
        />
      </QueryClientProvider>,
    )

    expect(screen.getByText('Key-Value Store Operations')).toBeInTheDocument()
    expect(screen.getByText('View diagram')).toBeInTheDocument()
  })

  it('should show retrying automatically message when tutor is unavailable', () => {
    useWorkspaceUIStore.setState({ tutorAvailable: false })

    renderTutorPanel({ sessionId: 'session-1' })

    expect(screen.getByText(/retrying automatically/i)).toBeInTheDocument()
  })

  it('should show recovery message on availability transition', async () => {
    useWorkspaceUIStore.setState({ tutorAvailable: false })
    const { rerender } = render(
      <QueryClientProvider client={createTestQueryClient()}>
        <TutorPanel sessionId="session-1" />
      </QueryClientProvider>,
    )

    // Simulate recovery
    useWorkspaceUIStore.setState({ tutorAvailable: true })
    rerender(
      <QueryClientProvider client={createTestQueryClient()}>
        <TutorPanel sessionId="session-1" />
      </QueryClientProvider>,
    )

    expect(screen.getByText('Tutor is back')).toBeInTheDocument()
  })

  it('should not send empty or whitespace-only messages', () => {
    renderTutorPanel({ sessionId: 'session-1' })

    const input = screen.getByPlaceholderText('Ask a question...')
    fireEvent.change(input, { target: { value: '   ' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(mockAddOptimisticMessage).not.toHaveBeenCalled()
    expect(mockSendMessage).not.toHaveBeenCalled()
  })
})
