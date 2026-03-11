import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { TutorExplainerCard } from './TutorExplainerCard'

// Mock the dialog component to avoid portal issues in tests
vi.mock('@mycscompanion/ui/src/components/ui/dialog', () => ({
  Dialog: ({ children, open }: { children: React.ReactNode; open: boolean }) =>
    open ? <div data-testid="dialog">{children}</div> : null,
  DialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

describe('TutorExplainerCard', () => {
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('should render with correct title, alt text, and image path', () => {
    render(
      <TutorExplainerCard
        asset={{
          name: 'kv-store-operations.svg',
          path: '/assets/milestones/01-kv-store/kv-store-operations.svg',
          title: 'Key-Value Store Operations',
          altText: 'Diagram showing PUT, GET, and DELETE operations',
        }}
      />,
    )

    expect(screen.getByText('Key-Value Store Operations')).toBeInTheDocument()
    expect(screen.getByText('View diagram')).toBeInTheDocument()

    const img = screen.getByRole('img')
    expect(img).toHaveAttribute('alt', 'Diagram showing PUT, GET, and DELETE operations')
    expect(img).toHaveAttribute('src', '/assets/milestones/01-kv-store/kv-store-operations.svg')
    expect(img).toHaveAttribute('loading', 'lazy')
  })

  it('should open dialog when clicked', () => {
    render(
      <TutorExplainerCard
        asset={{
          name: 'kv-store-operations.svg',
          path: '/assets/milestones/01-kv-store/kv-store-operations.svg',
          title: 'Key-Value Store Operations',
          altText: 'Diagram showing operations',
        }}
      />,
    )

    expect(screen.queryByTestId('dialog')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /view diagram/i }))

    expect(screen.getByTestId('dialog')).toBeInTheDocument()
  })

  it('should use asset name as title fallback when title is null', () => {
    render(
      <TutorExplainerCard
        asset={{
          name: 'kv-store-operations.svg',
          path: '/assets/milestones/01-kv-store/kv-store-operations.svg',
          title: null,
          altText: null,
        }}
      />,
    )

    expect(screen.getByText('kv-store-operations.svg')).toBeInTheDocument()
  })
})
