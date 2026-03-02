import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { vi, describe, it, expect, afterEach } from 'vitest'

const mockNavigate = vi.fn()
vi.mock('react-router', async () => {
  const actual = await vi.importActual('react-router')
  return { ...actual, useNavigate: () => mockNavigate }
})

const mockSignOut = vi.fn().mockResolvedValue(undefined)
vi.mock('../lib/firebase', () => ({
  signOut: () => mockSignOut(),
}))

const { NotReady } = await import('./NotReady')

describe('NotReady', () => {
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  function renderNotReady(): void {
    render(
      <MemoryRouter initialEntries={['/not-ready']}>
        <NotReady />
      </MemoryRouter>
    )
  }

  it('should render encouraging heading without rejection language', () => {
    renderNotReady()
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      /go might be new territory/i
    )
    // Verify no rejection language (full UX Tone Requirements list)
    const pageText = document.body.textContent ?? ''
    expect(pageText).not.toMatch(/\bfail(ed|ure)?\b/i)
    expect(pageText).not.toMatch(/\bincorrect\b/i)
    expect(pageText).not.toMatch(/\bwrong\b/i)
    expect(pageText).not.toMatch(/\bsorry\b/i)
    expect(pageText).not.toMatch(/\brejected\b/i)
    expect(pageText).not.toMatch(/\bdenied\b/i)
    expect(pageText).not.toMatch(/\btest\b/i)
    expect(pageText).not.toMatch(/\bexam\b/i)
    expect(pageText).not.toMatch(/\bquiz\b/i)
  })

  it('should render specific alternative learning resources with external links', () => {
    renderNotReady()
    const links = screen.getAllByRole('link')
    expect(links.length).toBeGreaterThanOrEqual(3)
    for (const link of links) {
      expect(link).toHaveAttribute('target', '_blank')
      expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'))
    }
  })

  it('should render A Tour of Go as first resource', () => {
    renderNotReady()
    expect(screen.getByRole('link', { name: /a tour of go/i })).toHaveAttribute(
      'href',
      'https://go.dev/tour/'
    )
  })

  it('should render bookmark/return message', () => {
    renderNotReady()
    expect(screen.getByText(/bookmark this page/i)).toBeInTheDocument()
    expect(screen.getByText(/come back anytime/i)).toBeInTheDocument()
  })

  it('should render sign out button with 44px minimum touch target', () => {
    renderNotReady()
    const signOutButton = screen.getByRole('button', { name: /sign out/i })
    expect(signOutButton).toBeInTheDocument()
    expect(signOutButton.className).toContain('min-h-11')
  })

  it('should sign out and navigate to /sign-in on sign out click', async () => {
    const user = userEvent.setup()
    renderNotReady()
    await user.click(screen.getByRole('button', { name: /sign out/i }))
    expect(mockSignOut).toHaveBeenCalledOnce()
    expect(mockNavigate).toHaveBeenCalledWith('/sign-in', { replace: true })
  })

  it('should navigate to /sign-in even when signOut fails', async () => {
    mockSignOut.mockRejectedValueOnce(new Error('Network error'))
    const user = userEvent.setup()
    renderNotReady()
    await user.click(screen.getByRole('button', { name: /sign out/i }))
    expect(mockNavigate).toHaveBeenCalledWith('/sign-in', { replace: true })
  })

  it('should disable sign out button while signing out', async () => {
    let resolveSignOut!: () => void
    mockSignOut.mockImplementationOnce(
      () => new Promise<void>((resolve) => { resolveSignOut = resolve })
    )
    const user = userEvent.setup()
    renderNotReady()
    const clickPromise = user.click(screen.getByRole('button', { name: /sign out/i }))
    const disabledButton = await screen.findByRole('button', { name: /signing out/i })
    expect(disabledButton).toBeDisabled()
    resolveSignOut()
    await clickPromise
  })

  it('should indicate external links open in new tab for screen readers', () => {
    renderNotReady()
    const srTexts = screen.getAllByText('(opens in new tab)')
    expect(srTexts.length).toBe(4)
    for (const el of srTexts) {
      expect(el.className).toContain('sr-only')
    }
  })

  it('should not render any email capture elements (FR32 deferred)', () => {
    renderNotReady()
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/email/i)).not.toBeInTheDocument()
  })

  it('should have accessible resources section with aria-labelledby', () => {
    renderNotReady()
    const heading = screen.getByText(/recommended starting points/i)
    expect(heading).toHaveAttribute('id', 'resources-heading')
    const section = heading.closest('section')
    expect(section).toHaveAttribute('aria-labelledby', 'resources-heading')
  })
})
