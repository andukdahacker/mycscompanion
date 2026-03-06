import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { ConceptExplainers } from './ConceptExplainers'
import type { ConceptExplainerAsset } from '@mycscompanion/shared'

// Mock ConceptExplainerDialog to isolate tests
vi.mock('./ConceptExplainerDialog', () => ({
  ConceptExplainerDialog: function MockDialog(props: {
    asset: ConceptExplainerAsset | null
    open: boolean
    onOpenChange: (open: boolean) => void
  }) {
    if (!props.open) return null
    return (
      <div data-testid="explainer-dialog" data-asset-name={props.asset?.name}>
        <button data-testid="dialog-close" onClick={() => props.onOpenChange(false)}>Close</button>
      </div>
    )
  },
}))

const MOCK_ASSETS: readonly ConceptExplainerAsset[] = [
  { name: 'kv-ops.svg', path: '/assets/milestones/01/kv-ops.svg', altText: 'KV operations diagram', title: 'KV Operations' },
  { name: 'flow.svg', path: '/assets/milestones/01/flow.svg', altText: null, title: null },
]

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('ConceptExplainers', () => {
  it('should render all provided SVG assets with correct src and alt text', () => {
    render(<ConceptExplainers assets={MOCK_ASSETS} />)

    const images = screen.getAllByRole('img')
    expect(images).toHaveLength(2)

    expect(images[0]).toHaveAttribute('src', '/assets/milestones/01/kv-ops.svg')
    expect(images[0]).toHaveAttribute('alt', 'KV operations diagram')

    expect(images[1]).toHaveAttribute('src', '/assets/milestones/01/flow.svg')
    expect(images[1]).toHaveAttribute('alt', 'flow.svg')
  })

  it('should fall back to filename for alt when altText is null', () => {
    const assets: readonly ConceptExplainerAsset[] = [
      { name: 'diagram.svg', path: '/assets/diagram.svg', altText: null, title: null },
    ]
    render(<ConceptExplainers assets={assets} />)

    const img = screen.getByRole('img')
    expect(img).toHaveAttribute('alt', 'diagram.svg')
  })

  it('should show title heading when title is provided', () => {
    render(<ConceptExplainers assets={MOCK_ASSETS} />)

    expect(screen.getByText('KV Operations')).toBeInTheDocument()
  })

  it('should not render title heading when title is null', () => {
    const assets: readonly ConceptExplainerAsset[] = [
      { name: 'test.svg', path: '/assets/test.svg', altText: 'Test', title: null },
    ]
    render(<ConceptExplainers assets={assets} />)

    expect(screen.queryByRole('heading')).not.toBeInTheDocument()
  })

  it('should return null when assets array is empty', () => {
    const { container } = render(<ConceptExplainers assets={[]} />)
    expect(container.innerHTML).toBe('')
  })

  it('should open expanded dialog on click', () => {
    render(<ConceptExplainers assets={MOCK_ASSETS} />)

    expect(screen.queryByTestId('explainer-dialog')).not.toBeInTheDocument()

    const buttons = screen.getAllByRole('button', { name: /expand/i })
    fireEvent.click(buttons[0]!)

    expect(screen.getByTestId('explainer-dialog')).toBeInTheDocument()
    expect(screen.getByTestId('explainer-dialog')).toHaveAttribute('data-asset-name', 'kv-ops.svg')
  })

  it('should have loading="lazy" attribute on images', () => {
    render(<ConceptExplainers assets={MOCK_ASSETS} />)

    const images = screen.getAllByRole('img')
    images.forEach((img) => {
      expect(img).toHaveAttribute('loading', 'lazy')
    })
  })

  it('should close dialog when onOpenChange is called with false', () => {
    render(<ConceptExplainers assets={MOCK_ASSETS} />)

    const buttons = screen.getAllByRole('button', { name: /expand/i })
    fireEvent.click(buttons[0]!)
    expect(screen.getByTestId('explainer-dialog')).toBeInTheDocument()

    fireEvent.click(screen.getByTestId('dialog-close'))
    expect(screen.queryByTestId('explainer-dialog')).not.toBeInTheDocument()
  })
})
