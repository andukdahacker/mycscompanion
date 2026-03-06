import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { ConceptExplainerDialog } from './ConceptExplainerDialog'
import type { ConceptExplainerAsset } from '@mycscompanion/shared'

const MOCK_ASSET: ConceptExplainerAsset = {
  name: 'kv-ops.svg',
  path: '/assets/milestones/01/kv-ops.svg',
  altText: 'KV operations diagram',
  title: 'KV Operations',
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('ConceptExplainerDialog', () => {
  it('should render with correct SVG and aria-label', () => {
    render(<ConceptExplainerDialog asset={MOCK_ASSET} open={true} onOpenChange={vi.fn()} />)

    const img = screen.getByRole('img')
    expect(img).toHaveAttribute('src', '/assets/milestones/01/kv-ops.svg')
    expect(img).toHaveAttribute('alt', 'KV operations diagram')

    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveAttribute('aria-label', 'KV Operations')
  })

  it('should use altText as aria-label when title is null', () => {
    const asset: ConceptExplainerAsset = { ...MOCK_ASSET, title: null }
    render(<ConceptExplainerDialog asset={asset} open={true} onOpenChange={vi.fn()} />)

    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveAttribute('aria-label', 'KV operations diagram')
  })

  it('should use name as aria-label when both title and altText are null', () => {
    const asset: ConceptExplainerAsset = { ...MOCK_ASSET, title: null, altText: null }
    render(<ConceptExplainerDialog asset={asset} open={true} onOpenChange={vi.fn()} />)

    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveAttribute('aria-label', 'kv-ops.svg')
  })

  it('should call onOpenChange when close button is clicked', () => {
    const onOpenChange = vi.fn()
    render(<ConceptExplainerDialog asset={MOCK_ASSET} open={true} onOpenChange={onOpenChange} />)

    const closeButton = screen.getByRole('button', { name: /close/i })
    fireEvent.click(closeButton)

    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('should call onOpenChange when Escape key is pressed', () => {
    const onOpenChange = vi.fn()
    render(<ConceptExplainerDialog asset={MOCK_ASSET} open={true} onOpenChange={onOpenChange} />)

    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })

    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('should not render img when asset is null', () => {
    render(<ConceptExplainerDialog asset={null} open={true} onOpenChange={vi.fn()} />)

    expect(screen.queryByRole('img')).not.toBeInTheDocument()
  })
})
