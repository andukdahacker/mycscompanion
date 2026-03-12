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

const mockUseDataExport = vi.fn()
vi.mock('../hooks/use-data-export', () => ({
  useDataExport: () => mockUseDataExport(),
}))

const mockUseAccountDeletion = vi.fn()
vi.mock('../hooks/use-account-deletion', () => ({
  useAccountDeletion: () => mockUseAccountDeletion(),
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
  mockUseDataExport.mockReset()
  mockUseAccountDeletion.mockReset()
  mockUseDataExport.mockReturnValue({
    state: { status: 'idle', error: null },
    triggerExport: vi.fn(),
    downloadExport: vi.fn(),
  })
  mockUseAccountDeletion.mockReturnValue({
    state: { status: 'idle', error: null },
    deleteAccount: vi.fn(),
    reset: vi.fn(),
  })
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

    it('should render enabled "Delete Account" button', () => {
      renderComponent()
      const button = screen.getByText('Delete Account')
      expect(button.closest('button')?.disabled).toBeFalsy()
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

  describe('data export', () => {
    beforeEach(() => {
      mockUseAccountProfile.mockReturnValue({
        data: MOCK_PROFILE,
        isLoading: false,
        isError: false,
        refetch: vi.fn(),
      })
    })

    it('should render "Export My Data" button in idle state', () => {
      mockUseDataExport.mockReturnValue({
        state: { status: 'idle', error: null },
        triggerExport: vi.fn(),
        downloadExport: vi.fn(),
      })
      renderComponent()
      const button = screen.getByText('Export My Data')
      expect(button.closest('button')?.disabled).toBeFalsy()
    })

    it('should show "Preparing Export..." when processing', () => {
      mockUseDataExport.mockReturnValue({
        state: { status: 'processing', error: null },
        triggerExport: vi.fn(),
        downloadExport: vi.fn(),
      })
      renderComponent()
      const button = screen.getByText('Preparing Export...')
      expect(button.closest('button')?.disabled).toBe(true)
    })

    it('should show "Download Export" button when completed', () => {
      mockUseDataExport.mockReturnValue({
        state: { status: 'completed', error: null },
        triggerExport: vi.fn(),
        downloadExport: vi.fn(),
      })
      renderComponent()
      const button = screen.getByText('Download Export')
      expect(button.closest('button')?.disabled).toBeFalsy()
    })

    it('should show error message and retry button when failed', () => {
      mockUseDataExport.mockReturnValue({
        state: { status: 'failed', error: 'Export failed. Please try again.' },
        triggerExport: vi.fn(),
        downloadExport: vi.fn(),
      })
      renderComponent()
      expect(screen.getByText('Export failed. Please try again.')).toBeTruthy()
      expect(screen.getByText('Retry Export')).toBeTruthy()
    })

    it('should call triggerExport when export button clicked', async () => {
      const mockTrigger = vi.fn()
      mockUseDataExport.mockReturnValue({
        state: { status: 'idle', error: null },
        triggerExport: mockTrigger,
        downloadExport: vi.fn(),
      })
      renderComponent()
      await userEvent.click(screen.getByText('Export My Data'))
      expect(mockTrigger).toHaveBeenCalled()
    })

    it('should call downloadExport when download button clicked', async () => {
      const mockDownload = vi.fn()
      mockUseDataExport.mockReturnValue({
        state: { status: 'completed', error: null },
        triggerExport: vi.fn(),
        downloadExport: mockDownload,
      })
      renderComponent()
      await userEvent.click(screen.getByText('Download Export'))
      expect(mockDownload).toHaveBeenCalled()
    })
  })

  describe('account deletion', () => {
    beforeEach(() => {
      mockUseAccountProfile.mockReturnValue({
        data: MOCK_PROFILE,
        isLoading: false,
        isError: false,
        refetch: vi.fn(),
      })
    })

    it('should open delete dialog when Delete Account button is clicked', async () => {
      renderComponent()
      await userEvent.click(screen.getByText('Delete Account'))
      expect(screen.getByRole('alertdialog')).toBeTruthy()
    })

    it('should call deleteAccount when dialog confirm is clicked', async () => {
      const mockDelete = vi.fn()
      mockUseAccountDeletion.mockReturnValue({
        state: { status: 'idle', error: null },
        deleteAccount: mockDelete,
        reset: vi.fn(),
      })
      renderComponent()
      await userEvent.click(screen.getByText('Delete Account'))
      await userEvent.click(screen.getByRole('button', { name: 'Delete My Account' }))
      expect(mockDelete).toHaveBeenCalled()
    })

    it('should show error message when deletion fails', () => {
      mockUseAccountDeletion.mockReturnValue({
        state: { status: 'failed', error: 'Account deletion failed. Please try again.' },
        deleteAccount: vi.fn(),
        reset: vi.fn(),
      })
      renderComponent()
      expect(screen.getByText('Account deletion failed. Please try again.')).toBeTruthy()
    })

    it('should close dialog when Cancel is clicked', async () => {
      renderComponent()
      await userEvent.click(screen.getByText('Delete Account'))
      expect(screen.getByRole('alertdialog')).toBeTruthy()

      await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
      expect(screen.queryByRole('alertdialog')).toBeNull()
    })

    it('should reset deletion state when dialog is closed', async () => {
      const mockReset = vi.fn()
      mockUseAccountDeletion.mockReturnValue({
        state: { status: 'idle', error: null },
        deleteAccount: vi.fn(),
        reset: mockReset,
      })
      renderComponent()
      await userEvent.click(screen.getByText('Delete Account'))
      await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))

      expect(mockReset).toHaveBeenCalled()
    })

    it('should show "Deleting…" in dialog when deletion in progress', async () => {
      mockUseAccountDeletion.mockReturnValue({
        state: { status: 'deleting', error: null },
        deleteAccount: vi.fn(),
        reset: vi.fn(),
      })
      renderComponent()
      await userEvent.click(screen.getByText('Delete Account'))
      expect(screen.getByText('Deleting\u2026')).toBeTruthy()
    })
  })
})
