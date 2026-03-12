import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PrivacyPolicy } from './PrivacyPolicy'

const mockUseAuth = vi.fn()
vi.mock('../hooks/use-auth', () => ({
  useAuth: () => mockUseAuth(),
}))

function renderComponent(): void {
  render(
    <MemoryRouter>
      <PrivacyPolicy />
    </MemoryRouter>,
  )
}

describe('PrivacyPolicy', () => {
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  describe('content rendering', () => {
    it('should render the Privacy Policy heading', () => {
      mockUseAuth.mockReturnValue({ user: null, loading: false })
      renderComponent()
      expect(screen.getByRole('heading', { name: /privacy policy/i, level: 1 })).toBeInTheDocument()
    })

    it('should render all required content sections', () => {
      mockUseAuth.mockReturnValue({ user: null, loading: false })
      renderComponent()
      const h2s = screen.getAllByRole('heading', { level: 2 })
      const h2Names = h2s.map((h) => h.textContent)
      expect(h2Names).toContain('Information We Collect')
      expect(h2Names).toContain('How We Use Your Information')
      expect(h2Names).toContain('Third-Party Services')
      expect(h2Names).toContain('Data Retention')
      expect(h2Names).toContain('Your Rights')
      expect(h2Names).toContain('Data Security')
      expect(h2Names).toContain('Cookies')
      expect(h2Names).toContain('Changes to This Policy')
      expect(h2Names).toContain('Contact Us')
    })

    it('should mention Firebase Auth as a third-party service', () => {
      mockUseAuth.mockReturnValue({ user: null, loading: false })
      renderComponent()
      const matches = screen.getAllByText(/firebase/i)
      expect(matches.length).toBeGreaterThanOrEqual(1)
    })

    it('should mention Anthropic as a third-party service', () => {
      mockUseAuth.mockReturnValue({ user: null, loading: false })
      renderComponent()
      const matches = screen.getAllByText(/anthropic/i)
      expect(matches.length).toBeGreaterThanOrEqual(1)
    })

    it('should mention Sentry as a third-party service', () => {
      mockUseAuth.mockReturnValue({ user: null, loading: false })
      renderComponent()
      const matches = screen.getAllByText(/sentry/i)
      expect(matches.length).toBeGreaterThanOrEqual(1)
    })

    it('should mention Fly.io as a third-party service', () => {
      mockUseAuth.mockReturnValue({ user: null, loading: false })
      renderComponent()
      const matches = screen.getAllByText(/fly\.io/i)
      expect(matches.length).toBeGreaterThanOrEqual(1)
    })

    it('should mention cookies policy', () => {
      mockUseAuth.mockReturnValue({ user: null, loading: false })
      renderComponent()
      expect(screen.getByRole('heading', { name: /cookies/i, level: 2 })).toBeDefined()
    })

    it('should mention data export rights', () => {
      mockUseAuth.mockReturnValue({ user: null, loading: false })
      renderComponent()
      const matches = screen.getAllByText(/export/i)
      expect(matches.length).toBeGreaterThanOrEqual(1)
    })

    it('should mention account deletion rights', () => {
      mockUseAuth.mockReturnValue({ user: null, loading: false })
      renderComponent()
      const matches = screen.getAllByText(/delet/i)
      expect(matches.length).toBeGreaterThanOrEqual(1)
    })
  })

  describe('navigation', () => {
    it('should show "Back to settings" link when user is authenticated', () => {
      mockUseAuth.mockReturnValue({ user: { uid: 'test-user' }, loading: false })
      renderComponent()
      const link = screen.getByRole('link', { name: /back to settings/i })
      expect(link).toBeInTheDocument()
      expect(link.getAttribute('href')).toBe('/settings')
    })

    it('should show "Back to sign up" link when user is not authenticated', () => {
      mockUseAuth.mockReturnValue({ user: null, loading: false })
      renderComponent()
      const link = screen.getByRole('link', { name: /back to sign up/i })
      expect(link).toBeInTheDocument()
      expect(link.getAttribute('href')).toBe('/sign-up')
    })

    it('should not show any back link while loading', () => {
      mockUseAuth.mockReturnValue({ user: null, loading: true })
      renderComponent()
      expect(screen.queryByRole('link', { name: /back to/i })).not.toBeInTheDocument()
    })
  })

  describe('heading hierarchy', () => {
    it('should have proper heading hierarchy', () => {
      mockUseAuth.mockReturnValue({ user: null, loading: false })
      renderComponent()
      const headings = screen.getAllByRole('heading')
      const h1 = headings.find((h) => h.tagName === 'H1')
      const h2s = headings.filter((h) => h.tagName === 'H2')
      expect(h1).toBeDefined()
      expect(h2s.length).toBeGreaterThanOrEqual(6)
      const allElements = Array.from(document.querySelectorAll('h1, h2'))
      expect(allElements[0]?.tagName).toBe('H1')
    })
  })
})
