import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { MilestoneBrief } from './MilestoneBrief'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('MilestoneBrief', () => {
  it('should render markdown heading content', () => {
    render(<MilestoneBrief brief="# Milestone 1: Key-Value Store" />)

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Milestone 1: Key-Value Store')
  })

  it('should render markdown paragraphs and lists', () => {
    const brief = `# Title

This is a paragraph.

- Item one
- Item two
`
    render(<MilestoneBrief brief={brief} />)

    expect(screen.getByText('This is a paragraph.')).toBeInTheDocument()
    expect(screen.getByText('Item one')).toBeInTheDocument()
    expect(screen.getByText('Item two')).toBeInTheDocument()
  })

  it('should apply prose width constraint', () => {
    render(<MilestoneBrief brief="# Test" />)

    const container = screen.getByTestId('milestone-brief')
    expect(container.className).toContain('max-w-prose')
  })

  it('should be wrapped in a scrollable container', () => {
    const longBrief = Array.from({ length: 50 }, (_, i) => `## Section ${i}\n\nContent for section ${i}.`).join('\n\n')

    const { container } = render(<MilestoneBrief brief={longBrief} />)

    // ScrollArea renders with data-radix-scroll-area-viewport
    const scrollViewport = container.querySelector('[data-radix-scroll-area-viewport]')
    expect(scrollViewport).toBeInTheDocument()
  })
})
