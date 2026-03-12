import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { TestProviders } from '@mycscompanion/config/test-utils/providers'
import type { UserProfile } from '@mycscompanion/shared'

const mockNavigate = vi.fn()

vi.mock('react-router', async () => {
  const actual = await vi.importActual('react-router')
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  }
})

const mockSignOut = vi.fn()
vi.mock('../lib/firebase', () => ({
  signOut: () => mockSignOut(),
}))

const mockUseAccountProfile = vi.fn()
vi.mock('../hooks/use-account-profile', () => ({
  useAccountProfile: () => mockUseAccountProfile(),
}))

const MOCK_PROFILE: UserProfile = {
  id: 'test-uid',
  email: 'test@example.com',
  displayName: 'Test User',
  role: 'backend-engineer',
  experienceLevel: '3-to-5',
  primaryLanguage: 'go',
  onboardingCompletedAt: '2026-02-28T00:00:00.000Z',
  skillFloorPassed: true,
  skillFloorCompletedAt: '2026-02-28T00:00:00.000Z',
  createdAt: '2026-02-28T00:00:00.000Z',
  updatedAt: '2026-02-28T00:00:00.000Z',
}

// Dynamic import after mocks
let AccountSettings: React.ComponentType<Record<string, never>>

beforeEach(async () => {
  mockNavigate.mockReset()
  mockSignOut.mockReset()
  mockUseAccountProfile.mockReset()
  const mod = await import('./AccountSettings')
  AccountSettings = mod.default
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

function renderComponent() {
  return render(
    <MemoryRouter>
      <TestProviders>
        <AccountSettings />
      </TestProviders>
    </MemoryRouter>,
  )
}

describe('AccountSettings', () => {
  describe('when profile loads successfully', () => {
    beforeEach(() => {
      mockUseAccountProfile.mockReturnValue({
        data: MOCK_PROFILE,
        isLoading: false,
        isError: false,
        refetch: vi.fn(),
      })
    })

    it('should render display name when present', () => {
      renderComponent()
      expect(screen.getByText('Test User')).toBeTruthy()
    })

    it('should render email address', () => {
      renderComponent()
      expect(screen.getByText('test@example.com')).toBeTruthy()
    })

    it('should render formatted role label', () => {
      renderComponent()
      expect(screen.getByText('Backend Engineer')).toBeTruthy()
    })

    it('should render formatted experience level', () => {
      renderComponent()
      expect(screen.getByText('3-5 years')).toBeTruthy()
    })

    it('should render formatted primary language', () => {
      renderComponent()
      expect(screen.getByText('Go')).toBeTruthy()
    })

    it('should display "Not set" for null profile fields', () => {
      mockUseAccountProfile.mockReturnValue({
        data: { ...MOCK_PROFILE, displayName: null, role: null, experienceLevel: null, primaryLanguage: null },
        isLoading: false,
        isError: false,
        refetch: vi.fn(),
      })
      renderComponent()

      const notSetElements = screen.getAllByText('Not set')
      expect(notSetElements.length).toBe(4)
    })

    it('should render back link to /overview', () => {
      renderComponent()
      const backLink = screen.getByText('Back to overview')
      expect(backLink.closest('a')?.getAttribute('href')).toBe('/overview')
    })
  })

  describe('when loading', () => {
    it('should render AccountSettingsSkeleton', () => {
      mockUseAccountProfile.mockReturnValue({
        data: undefined,
        isLoading: true,
        isError: false,
        refetch: vi.fn(),
      })
      const { container } = renderComponent()
      const pulseElements = container.querySelectorAll('.animate-pulse')
      expect(pulseElements.length).toBeGreaterThan(0)
    })
  })

  describe('when profile fails to load', () => {
    it('should render error state with retry button', () => {
      const mockRefetch = vi.fn()
      mockUseAccountProfile.mockReturnValue({
        data: undefined,
        isLoading: false,
        isError: true,
        refetch: mockRefetch,
      })
      renderComponent()

      expect(screen.getByText('Failed to load profile data.')).toBeTruthy()
      expect(screen.getByText('Retry')).toBeTruthy()
    })
  })

  describe('sign out', () => {
    beforeEach(() => {
      mockUseAccountProfile.mockReturnValue({
        data: MOCK_PROFILE,
        isLoading: false,
        isError: false,
        refetch: vi.fn(),
      })
    })

    it('should call signOut and navigate to /sign-in', async () => {
      mockSignOut.mockResolvedValue(undefined)
      renderComponent()

      const signOutButton = screen.getByText('Sign Out')
      await userEvent.click(signOutButton)

      expect(mockSignOut).toHaveBeenCalled()
      expect(mockNavigate).toHaveBeenCalledWith('/sign-in', { replace: true })
    })

    it('should disable button and show "Signing out..." while in progress', async () => {
      let resolveSignOut: () => void
      mockSignOut.mockReturnValue(
        new Promise<void>((resolve) => {
          resolveSignOut = resolve
        }),
      )
      renderComponent()

      const signOutButton = screen.getByText('Sign Out')
      await userEvent.click(signOutButton)

      expect(screen.getByText('Signing out\u2026')).toBeTruthy()

      resolveSignOut!()
    })

    it('should navigate to /sign-in even when signOut fails', async () => {
      mockSignOut.mockRejectedValue(new Error('Sign-out failed'))
      renderComponent()

      const signOutButton = screen.getByText('Sign Out')
      await userEvent.click(signOutButton)

      expect(mockNavigate).toHaveBeenCalledWith('/sign-in', { replace: true })
    })
  })

  describe('placeholder actions', () => {
    beforeEach(() => {
      mockUseAccountProfile.mockReturnValue({
        data: MOCK_PROFILE,
        isLoading: false,
        isError: false,
        refetch: vi.fn(),
      })
    })

    it('should render disabled "Export My Data" button', () => {
      renderComponent()
      const button = screen.getByText('Export My Data (Coming soon)')
      expect(button.closest('button')?.disabled).toBe(true)
    })

    it('should render disabled "Delete Account" button', () => {
      renderComponent()
      const button = screen.getByText('Delete Account (Coming soon)')
      expect(button.closest('button')?.disabled).toBe(true)
    })

    it('should render disabled "Privacy Policy" link', () => {
      renderComponent()
      const button = screen.getByText('Privacy Policy (Coming soon)')
      expect(button.closest('button')?.disabled).toBe(true)
    })

    it('should render disabled theme toggle placeholder', () => {
      renderComponent()
      const button = screen.getByText('Theme (Coming soon)')
      expect(button.closest('button')?.disabled).toBe(true)
    })
  })
})
