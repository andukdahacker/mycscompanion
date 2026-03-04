import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type * as FirebaseAppModule from 'firebase/app'
import { FirebaseError } from 'firebase/app'

const mockSignInWithEmailAndPassword = vi.fn()
const mockCreateUserWithEmailAndPassword = vi.fn()
const mockSignInWithPopup = vi.fn()
const mockFirebaseSignOut = vi.fn()
const mockGetAdditionalUserInfo = vi.fn()

vi.mock('firebase/auth', () => ({
  getAuth: vi.fn(() => ({})),
  browserLocalPersistence: {},
  setPersistence: vi.fn(),
  GithubAuthProvider: vi.fn(),
  EmailAuthProvider: vi.fn(),
  signInWithEmailAndPassword: (...args: unknown[]) => mockSignInWithEmailAndPassword(...args),
  createUserWithEmailAndPassword: (...args: unknown[]) => mockCreateUserWithEmailAndPassword(...args),
  signInWithPopup: (...args: unknown[]) => mockSignInWithPopup(...args),
  signOut: (...args: unknown[]) => mockFirebaseSignOut(...args),
  getAdditionalUserInfo: (...args: unknown[]) => mockGetAdditionalUserInfo(...args),
}))

vi.mock('firebase/app', async () => {
  const actual = await vi.importActual<typeof FirebaseAppModule>('firebase/app')
  return {
    ...actual,
    initializeApp: vi.fn(() => ({})),
  }
})

describe('firebase auth actions', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('signInWithEmail', () => {
    it('should call signInWithEmailAndPassword and return credential', async () => {
      const mockCredential = { user: { uid: 'test-uid' } }
      mockSignInWithEmailAndPassword.mockResolvedValue(mockCredential)

      const { signInWithEmail } = await import('./firebase')
      const result = await signInWithEmail('test@example.com', 'password123')

      expect(mockSignInWithEmailAndPassword).toHaveBeenCalledWith(
        expect.anything(),
        'test@example.com',
        'password123',
      )
      expect(result).toBe(mockCredential)
    })

    it('should let Firebase errors propagate', async () => {
      const error = new FirebaseError('auth/invalid-credential', 'Invalid credential')
      mockSignInWithEmailAndPassword.mockRejectedValue(error)

      const { signInWithEmail } = await import('./firebase')

      await expect(signInWithEmail('test@example.com', 'wrong')).rejects.toThrow(error)
    })
  })

  describe('signUpWithEmail', () => {
    it('should call createUserWithEmailAndPassword and return credential', async () => {
      const mockCredential = { user: { uid: 'new-uid' } }
      mockCreateUserWithEmailAndPassword.mockResolvedValue(mockCredential)

      const { signUpWithEmail } = await import('./firebase')
      const result = await signUpWithEmail('new@example.com', 'password123')

      expect(mockCreateUserWithEmailAndPassword).toHaveBeenCalledWith(
        expect.anything(),
        'new@example.com',
        'password123',
      )
      expect(result).toBe(mockCredential)
    })
  })

  describe('signInWithGithub', () => {
    it('should call signInWithPopup and return credential with isNewUser flag', async () => {
      const mockCredential = { user: { uid: 'github-uid' } }
      mockSignInWithPopup.mockResolvedValue(mockCredential)
      mockGetAdditionalUserInfo.mockReturnValue({ isNewUser: true })

      const { signInWithGithub } = await import('./firebase')
      const result = await signInWithGithub()

      expect(mockSignInWithPopup).toHaveBeenCalled()
      expect(result).toEqual({ credential: mockCredential, isNewUser: true })
    })

    it('should default isNewUser to true when additionalUserInfo is null', async () => {
      const mockCredential = { user: { uid: 'github-uid' } }
      mockSignInWithPopup.mockResolvedValue(mockCredential)
      mockGetAdditionalUserInfo.mockReturnValue(null)

      const { signInWithGithub } = await import('./firebase')
      const result = await signInWithGithub()

      expect(result.isNewUser).toBe(true)
    })

    it('should return isNewUser false for existing GitHub users', async () => {
      const mockCredential = { user: { uid: 'github-uid' } }
      mockSignInWithPopup.mockResolvedValue(mockCredential)
      mockGetAdditionalUserInfo.mockReturnValue({ isNewUser: false })

      const { signInWithGithub } = await import('./firebase')
      const result = await signInWithGithub()

      expect(result.isNewUser).toBe(false)
    })
  })

  describe('signOut', () => {
    it('should call Firebase signOut', async () => {
      mockFirebaseSignOut.mockResolvedValue(undefined)

      const { signOut } = await import('./firebase')
      await signOut()

      expect(mockFirebaseSignOut).toHaveBeenCalled()
    })
  })

  describe('mapFirebaseError', () => {
    let mapFirebaseError: (error: unknown) => string | null

    beforeEach(async () => {
      const mod = await import('./firebase')
      mapFirebaseError = mod.mapFirebaseError
    })

    it('should map auth/invalid-credential to friendly message', () => {
      const error = new FirebaseError('auth/invalid-credential', 'msg')
      expect(mapFirebaseError(error)).toBe('Incorrect email or password. Try again.')
    })

    it('should map auth/user-not-found to same message as invalid-credential', () => {
      const error = new FirebaseError('auth/user-not-found', 'msg')
      expect(mapFirebaseError(error)).toBe('Incorrect email or password. Try again.')
    })

    it('should map auth/wrong-password to same message as invalid-credential', () => {
      const error = new FirebaseError('auth/wrong-password', 'msg')
      expect(mapFirebaseError(error)).toBe('Incorrect email or password. Try again.')
    })

    it('should map auth/email-already-in-use', () => {
      const error = new FirebaseError('auth/email-already-in-use', 'msg')
      expect(mapFirebaseError(error)).toBe(
        'An account with this email already exists. Try signing in.',
      )
    })

    it('should map auth/weak-password', () => {
      const error = new FirebaseError('auth/weak-password', 'msg')
      expect(mapFirebaseError(error)).toBe('Password is too weak. Use at least 6 characters.')
    })

    it('should map auth/invalid-email', () => {
      const error = new FirebaseError('auth/invalid-email', 'msg')
      expect(mapFirebaseError(error)).toBe('Please enter a valid email address.')
    })

    it('should map auth/too-many-requests', () => {
      const error = new FirebaseError('auth/too-many-requests', 'msg')
      expect(mapFirebaseError(error)).toBe('Too many attempts. Please try again later.')
    })

    it('should map auth/popup-blocked', () => {
      const error = new FirebaseError('auth/popup-blocked', 'msg')
      expect(mapFirebaseError(error)).toBe(
        'Popup was blocked. Please allow popups for this site and try again.',
      )
    })

    it('should return null for auth/popup-closed-by-user', () => {
      const error = new FirebaseError('auth/popup-closed-by-user', 'msg')
      expect(mapFirebaseError(error)).toBeNull()
    })

    it('should map auth/account-exists-with-different-credential', () => {
      const error = new FirebaseError('auth/account-exists-with-different-credential', 'msg')
      expect(mapFirebaseError(error)).toBe(
        'An account already exists with this email using a different sign-in method.',
      )
    })

    it('should return default message for unknown Firebase errors', () => {
      const error = new FirebaseError('auth/unknown-error', 'msg')
      expect(mapFirebaseError(error)).toBe('Something went wrong. Try again.')
    })

    it('should return default message for non-Firebase errors', () => {
      expect(mapFirebaseError(new Error('random'))).toBe('Something went wrong. Try again.')
    })

    it('should return default message for non-error values', () => {
      expect(mapFirebaseError('string error')).toBe('Something went wrong. Try again.')
    })
  })
})
