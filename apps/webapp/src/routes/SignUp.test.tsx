import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, waitFor, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router'

const mockUseAuth = vi.fn()
vi.mock('../hooks/use-auth', () => ({
  useAuth: () => mockUseAuth(),
}))

const mockSignUpWithEmail = vi.fn()
const mockSignInWithGithub = vi.fn()
const mockMapFirebaseError = vi.fn()
vi.mock('../lib/firebase', () => ({
  signUpWithEmail: (...args: unknown[]) => mockSignUpWithEmail(...args),
  signInWithGithub: (...args: unknown[]) => mockSignInWithGithub(...args),
  mapFirebaseError: (...args: unknown[]) => mockMapFirebaseError(...args),
}))

const { SignUp } = await import('./SignUp')

function renderSignUp(): ReturnType<typeof render> {
  return render(
    <MemoryRouter initialEntries={['/sign-up']}>
      <Routes>
        <Route path="/sign-up" element={<SignUp />} />
        <Route path="/sign-in" element={<div>Sign In Page</div>} />
        <Route path="/overview" element={<div>Overview Page</div>} />
        <Route path="/onboarding" element={<div>Onboarding Page</div>} />
        <Route path="/privacy" element={<div>Privacy Page</div>} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('SignUp', () => {
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('should render email, password, and confirm password inputs', () => {
    mockUseAuth.mockReturnValue({ user: null, loading: false })
    renderSignUp()

    expect(screen.getByLabelText('Email')).toBeDefined()
    expect(screen.getByLabelText('Password')).toBeDefined()
    expect(screen.getByLabelText('Confirm password')).toBeDefined()
  })

  it('should render create account button and GitHub button', () => {
    mockUseAuth.mockReturnValue({ user: null, loading: false })
    renderSignUp()

    expect(screen.getByRole('button', { name: /^Create account$/ })).toBeDefined()
    expect(screen.getByRole('button', { name: /^Sign up with GitHub$/ })).toBeDefined()
  })

  it('should render sign in link pointing to /sign-in', () => {
    mockUseAuth.mockReturnValue({ user: null, loading: false })
    renderSignUp()

    const link = screen.getByRole('link', { name: /Sign in/ })
    expect(link).toBeDefined()
    expect(link.getAttribute('href')).toBe('/sign-in')
  })

  it('should show validation error for invalid email on blur', async () => {
    mockUseAuth.mockReturnValue({ user: null, loading: false })
    renderSignUp()

    const user = userEvent.setup()
    await user.type(screen.getByLabelText('Email'), 'notanemail')
    await user.tab()

    await waitFor(() => {
      expect(screen.getByText('Please enter a valid email address.')).toBeDefined()
    })
  })

  it('should show validation error for short password on blur', async () => {
    mockUseAuth.mockReturnValue({ user: null, loading: false })
    renderSignUp()

    const user = userEvent.setup()
    await user.type(screen.getByLabelText('Password'), 'short')
    await user.tab()

    await waitFor(() => {
      expect(screen.getByText('Password must be at least 8 characters.')).toBeDefined()
    })
  })

  it('should show validation error for mismatched passwords on blur', async () => {
    mockUseAuth.mockReturnValue({ user: null, loading: false })
    renderSignUp()

    const user = userEvent.setup()
    await user.type(screen.getByLabelText('Password'), 'password123')
    await user.type(screen.getByLabelText('Confirm password'), 'different123')
    await user.tab()

    await waitFor(() => {
      expect(screen.getByText('Passwords do not match.')).toBeDefined()
    })
  })

  it('should clear field error when user starts typing', async () => {
    mockUseAuth.mockReturnValue({ user: null, loading: false })
    renderSignUp()

    const user = userEvent.setup()
    await user.type(screen.getByLabelText('Email'), 'bad')
    await user.tab()

    await waitFor(() => {
      expect(screen.getByText('Please enter a valid email address.')).toBeDefined()
    })

    await user.type(screen.getByLabelText('Email'), 'test@example.com')

    await waitFor(() => {
      expect(screen.queryByText('Please enter a valid email address.')).toBeNull()
    })
  })

  it('should not submit if client-side validation fails', async () => {
    mockUseAuth.mockReturnValue({ user: null, loading: false })
    renderSignUp()

    const user = userEvent.setup()
    await user.type(screen.getByLabelText('Email'), 'notanemail')
    await user.type(screen.getByLabelText('Password'), 'short')
    await user.type(screen.getByLabelText('Confirm password'), 'different')
    await user.click(screen.getByRole('button', { name: /^Create account$/ }))

    expect(mockSignUpWithEmail).not.toHaveBeenCalled()
  })

  it('should navigate to /onboarding on successful email sign-up', async () => {
    mockUseAuth.mockReturnValue({ user: null, loading: false })
    mockSignUpWithEmail.mockResolvedValue({ user: { uid: 'new-uid' } })
    renderSignUp()

    const user = userEvent.setup()
    await user.type(screen.getByLabelText('Email'), 'new@example.com')
    await user.type(screen.getByLabelText('Password'), 'password123')
    await user.type(screen.getByLabelText('Confirm password'), 'password123')
    await user.click(screen.getByRole('button', { name: /^Create account$/ }))

    await waitFor(() => {
      expect(screen.getByText('Onboarding Page')).toBeDefined()
    })
    expect(mockSignUpWithEmail).toHaveBeenCalledWith('new@example.com', 'password123')
  })

  it('should display Firebase error message on auth failure', async () => {
    mockUseAuth.mockReturnValue({ user: null, loading: false })
    mockSignUpWithEmail.mockRejectedValue(new Error('auth error'))
    mockMapFirebaseError.mockReturnValue('An account with this email already exists. Try signing in.')
    renderSignUp()

    const user = userEvent.setup()
    await user.type(screen.getByLabelText('Email'), 'existing@example.com')
    await user.type(screen.getByLabelText('Password'), 'password123')
    await user.type(screen.getByLabelText('Confirm password'), 'password123')
    await user.click(screen.getByRole('button', { name: /^Create account$/ }))

    await waitFor(() => {
      expect(
        screen.getByText('An account with this email already exists. Try signing in.'),
      ).toBeDefined()
    })
  })

  it('should redirect to /overview if already authenticated', () => {
    mockUseAuth.mockReturnValue({ user: { uid: 'test-uid' }, loading: false })
    renderSignUp()

    expect(screen.getByText('Overview Page')).toBeDefined()
  })

  it('should navigate to /onboarding on GitHub sign-up for new user', async () => {
    mockUseAuth.mockReturnValue({ user: null, loading: false })
    mockSignInWithGithub.mockResolvedValue({ credential: {}, isNewUser: true })
    renderSignUp()

    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: /^Sign up with GitHub$/ }))

    await waitFor(() => {
      expect(screen.getByText('Onboarding Page')).toBeDefined()
    })
  })

  it('should navigate to /overview on GitHub sign-up for existing user', async () => {
    mockUseAuth.mockReturnValue({ user: null, loading: false })
    mockSignInWithGithub.mockResolvedValue({ credential: {}, isNewUser: false })
    renderSignUp()

    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: /^Sign up with GitHub$/ }))

    await waitFor(() => {
      expect(screen.getByText('Overview Page')).toBeDefined()
    })
  })

  it('should disable form during submission', async () => {
    mockUseAuth.mockReturnValue({ user: null, loading: false })
    let resolveSignUp: (value: unknown) => void
    mockSignUpWithEmail.mockReturnValue(
      new Promise((resolve) => {
        resolveSignUp = resolve
      }),
    )
    renderSignUp()

    const user = userEvent.setup()
    await user.type(screen.getByLabelText('Email'), 'test@example.com')
    await user.type(screen.getByLabelText('Password'), 'password123')
    await user.type(screen.getByLabelText('Confirm password'), 'password123')
    await user.click(screen.getByRole('button', { name: /^Create account$/ }))

    await waitFor(() => {
      expect(screen.getByText('Creating account...')).toBeDefined()
    })
    expect(screen.getByLabelText('Email').hasAttribute('disabled')).toBe(true)
    expect(screen.getByLabelText('Password').hasAttribute('disabled')).toBe(true)
    expect(screen.getByLabelText('Confirm password').hasAttribute('disabled')).toBe(true)

    resolveSignUp!({ user: { uid: 'new-uid' } })
  })

  it('should render privacy policy link', () => {
    mockUseAuth.mockReturnValue({ user: null, loading: false })
    renderSignUp()
    const link = screen.getByRole('link', { name: /privacy policy/i })
    expect(link.getAttribute('href')).toBe('/privacy')
  })

  it('should set aria-invalid on inputs with validation errors', async () => {
    mockUseAuth.mockReturnValue({ user: null, loading: false })
    renderSignUp()

    const user = userEvent.setup()
    await user.type(screen.getByLabelText('Email'), 'bad')
    await user.tab()

    await waitFor(() => {
      expect(screen.getByLabelText('Email').getAttribute('aria-invalid')).toBe('true')
    })
  })
})
