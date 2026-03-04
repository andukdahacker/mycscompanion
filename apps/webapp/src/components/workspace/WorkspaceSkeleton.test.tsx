import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { WorkspaceSkeleton } from './WorkspaceSkeleton'

describe('WorkspaceSkeleton', () => {
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('should render without crashing', () => {
    render(<WorkspaceSkeleton />)

    expect(screen.getByTestId('workspace-skeleton')).toBeInTheDocument()
  })

  it('should contain skeleton elements with animate-pulse', () => {
    render(<WorkspaceSkeleton />)

    const skeletons = screen.getAllByTestId('workspace-skeleton').length
    expect(skeletons).toBeGreaterThanOrEqual(1)

    const container = screen.getByTestId('workspace-skeleton')
    const pulsingElements = container.querySelectorAll('[data-slot="skeleton"]')
    expect(pulsingElements.length).toBeGreaterThanOrEqual(3)
  })

  it('should have skeleton areas for editor, terminal, and tutor panels', () => {
    render(<WorkspaceSkeleton />)

    expect(screen.getByTestId('skeleton-editor')).toBeInTheDocument()
    expect(screen.getByTestId('skeleton-terminal')).toBeInTheDocument()
    expect(screen.getByTestId('skeleton-tutor')).toBeInTheDocument()
  })
})
