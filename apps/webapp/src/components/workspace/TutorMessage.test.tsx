import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { TutorMessage } from './TutorMessage'
import type { ConceptExplainerAsset } from '@mycscompanion/shared'

// Mock the dialog to avoid portal issues
vi.mock('@mycscompanion/ui/src/components/ui/dialog', () => ({
  Dialog: ({ children, open }: { children: React.ReactNode; open: boolean }) =>
    open ? <div data-testid="dialog">{children}</div> : null,
  DialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

const TEST_ASSETS: Readonly<Record<string, ConceptExplainerAsset>> = {
  'kv-store-operations.svg': {
    name: 'kv-store-operations.svg',
    path: '/assets/milestones/01-kv-store/kv-store-operations.svg',
    title: 'Key-Value Store Operations',
    altText: 'Diagram showing PUT, GET, and DELETE operations',
  },
}

function makeMessage(content: string) {
  return {
    id: 'msg-1',
    role: 'assistant' as const,
    content,
    model: null,
    createdAt: new Date().toISOString(),
  }
}

describe('TutorMessage', () => {
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('should render explainer card inline when message contains reference and asset exists', () => {
    render(
      <TutorMessage
        message={makeMessage('Look at this [explainer:kv-store-operations.svg] for clarity.')}
        conceptExplainerAssets={TEST_ASSETS}
      />,
    )

    expect(screen.getByText('Key-Value Store Operations')).toBeInTheDocument()
    expect(screen.getByText('View diagram')).toBeInTheDocument()
    expect(screen.getByText(/Look at this/)).toBeInTheDocument()
    expect(screen.getByText(/for clarity/)).toBeInTheDocument()
  })

  it('should render cleanly without card when reference does not match any asset', () => {
    render(
      <TutorMessage
        message={makeMessage('See [explainer:nonexistent.svg] here.')}
        conceptExplainerAssets={TEST_ASSETS}
      />,
    )

    // Should not crash, should not show card
    expect(screen.queryByText('View diagram')).not.toBeInTheDocument()
  })

  it('should render message normally when no assets map provided', () => {
    render(
      <TutorMessage
        message={makeMessage('Hello [explainer:kv-store-operations.svg] world')}
      />,
    )

    // No card rendered, text still shows
    expect(screen.queryByText('View diagram')).not.toBeInTheDocument()
  })

  it('should suppress partial explainer reference at end of streaming text', () => {
    render(
      <TutorMessage
        message={makeMessage('')}
        isStreaming
        streamingContent="Here is a diagram [explainer:kv-sto"
        conceptExplainerAssets={TEST_ASSETS}
      />,
    )

    // Should show text up to the `[` character
    expect(screen.getByText(/Here is a diagram/)).toBeInTheDocument()
    // Should not show broken reference
    expect(screen.queryByText(/kv-sto/)).not.toBeInTheDocument()
  })

  it('should render card when streaming text contains complete reference', () => {
    render(
      <TutorMessage
        message={makeMessage('')}
        isStreaming
        streamingContent="See [explainer:kv-store-operations.svg] for more."
        conceptExplainerAssets={TEST_ASSETS}
      />,
    )

    expect(screen.getByText('Key-Value Store Operations')).toBeInTheDocument()
  })
})
