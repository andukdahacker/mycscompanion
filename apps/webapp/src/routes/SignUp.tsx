import { useState } from 'react'
import { Navigate, useNavigate, Link } from 'react-router'
import { useAuth } from '../hooks/use-auth'
import { signUpWithEmail, signInWithGithub, mapFirebaseError } from '../lib/firebase'
import { Button } from '@mycscompanion/ui/src/components/ui/button'
import { Input } from '@mycscompanion/ui/src/components/ui/input'
import { Label } from '@mycscompanion/ui/src/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@mycscompanion/ui/src/components/ui/card'
import { Separator } from '@mycscompanion/ui/src/components/ui/separator'

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const MIN_PASSWORD_LENGTH = 8

interface FieldErrors {
  email: string | null
  password: string | null
  confirmPassword: string | null
}

function SignUp(): React.ReactElement {
  const { user, loading } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({
    email: null,
    password: null,
    confirmPassword: null,
  })
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [githubLoading, setGithubLoading] = useState(false)

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4" aria-busy="true">
        <Card className="w-full max-w-[400px]">
          <CardHeader className="text-center">
            <CardTitle>
              <div className="mx-auto h-7 w-48 rounded bg-muted" />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-4">
              <div className="h-11 rounded bg-muted" />
              <div className="h-11 rounded bg-muted" />
              <div className="h-11 rounded bg-muted" />
              <div className="h-11 rounded bg-muted" />
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (user) {
    return <Navigate to="/overview" replace />
  }

  const validateEmail = (value: string): string | null => {
    if (!EMAIL_REGEX.test(value)) {
      return 'Please enter a valid email address.'
    }
    return null
  }

  const validatePassword = (value: string): string | null => {
    if (value.length < MIN_PASSWORD_LENGTH) {
      return `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`
    }
    return null
  }

  const validateConfirmPassword = (value: string): string | null => {
    if (value !== password) {
      return 'Passwords do not match.'
    }
    return null
  }

  const handleBlur = (field: keyof FieldErrors): void => {
    if (field === 'email' && email) {
      setFieldErrors((prev) => ({ ...prev, email: validateEmail(email) }))
    } else if (field === 'password' && password) {
      setFieldErrors((prev) => ({ ...prev, password: validatePassword(password) }))
    } else if (field === 'confirmPassword' && confirmPassword) {
      setFieldErrors((prev) => ({
        ...prev,
        confirmPassword: validateConfirmPassword(confirmPassword),
      }))
    }
  }

  const clearFieldError = (field: keyof FieldErrors): void => {
    setFieldErrors((prev) => ({ ...prev, [field]: null }))
  }

  const hasValidationErrors = (): boolean => {
    const emailError = validateEmail(email)
    const passwordError = validatePassword(password)
    const confirmError = validateConfirmPassword(confirmPassword)
    setFieldErrors({ email: emailError, password: passwordError, confirmPassword: confirmError })
    return emailError !== null || passwordError !== null || confirmError !== null
  }

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault()
    if (hasValidationErrors()) return
    setError(null)
    setSubmitting(true)
    try {
      await signUpWithEmail(email, password)
      navigate('/onboarding', { replace: true })
    } catch (err) {
      setError(mapFirebaseError(err) ?? 'Something went wrong. Try again.')
    } finally {
      setSubmitting(false)
    }
  }

  const handleGithubSignUp = async (): Promise<void> => {
    setError(null)
    setGithubLoading(true)
    try {
      const { isNewUser } = await signInWithGithub()
      if (isNewUser) {
        navigate('/onboarding', { replace: true })
      } else {
        navigate('/overview', { replace: true })
      }
    } catch (err) {
      const message = mapFirebaseError(err)
      if (message !== null) {
        setError(message)
      }
    } finally {
      setGithubLoading(false)
    }
  }

  const isDisabled = submitting || githubLoading

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <Card className="w-full max-w-[400px]">
        <CardHeader className="text-center">
          <CardTitle>
            <h1 className="text-h2 text-foreground">mycscompanion</h1>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={(e) => void handleSubmit(e)} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value)
                  clearFieldError('email')
                }}
                onBlur={() => handleBlur('email')}
                disabled={isDisabled}
                className="min-h-11"
                autoComplete="email"
                aria-invalid={fieldErrors.email !== null}
                aria-describedby={fieldErrors.email ? 'email-error' : undefined}
              />
              {fieldErrors.email && (
                <p id="email-error" className="text-body-sm text-muted-foreground">
                  {fieldErrors.email}
                </p>
              )}
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value)
                  clearFieldError('password')
                }}
                onBlur={() => handleBlur('password')}
                disabled={isDisabled}
                className="min-h-11"
                autoComplete="new-password"
                aria-invalid={fieldErrors.password !== null}
                aria-describedby={fieldErrors.password ? 'password-error' : undefined}
              />
              {fieldErrors.password && (
                <p id="password-error" className="text-body-sm text-muted-foreground">
                  {fieldErrors.password}
                </p>
              )}
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="confirm-password">Confirm password</Label>
              <Input
                id="confirm-password"
                type="password"
                value={confirmPassword}
                onChange={(e) => {
                  setConfirmPassword(e.target.value)
                  clearFieldError('confirmPassword')
                }}
                onBlur={() => handleBlur('confirmPassword')}
                disabled={isDisabled}
                className="min-h-11"
                autoComplete="new-password"
                aria-invalid={fieldErrors.confirmPassword !== null}
                aria-describedby={fieldErrors.confirmPassword ? 'confirm-password-error' : undefined}
              />
              {fieldErrors.confirmPassword && (
                <p id="confirm-password-error" className="text-body-sm text-muted-foreground">
                  {fieldErrors.confirmPassword}
                </p>
              )}
            </div>
            <Button
              type="submit"
              disabled={isDisabled}
              className="min-h-11"
              aria-disabled={submitting}
            >
              {submitting ? 'Creating account...' : 'Create account'}
            </Button>
            {error && (
              <p className="text-body-sm text-muted-foreground" role="alert">
                {error}
              </p>
            )}
          </form>

          <div className="relative my-6 flex items-center">
            <Separator className="flex-1" />
            <span className="px-3 text-body-sm text-muted-foreground">or</span>
            <Separator className="flex-1" />
          </div>

          <Button
            variant="outline"
            className="min-h-11 w-full"
            disabled={isDisabled}
            aria-disabled={githubLoading}
            onClick={() => void handleGithubSignUp()}
          >
            {githubLoading ? 'Connecting...' : 'Sign up with GitHub'}
          </Button>

          <p className="mt-6 text-center text-body-sm text-muted-foreground">
            Already have an account?{' '}
            <Link to="/sign-in" className="py-2 text-foreground underline underline-offset-4 hover:text-primary">
              Sign in
            </Link>
          </p>
          <p className="mt-2 text-center text-body-sm text-muted-foreground">
            By creating an account, you agree to our{' '}
            <Link to="/privacy" className="text-foreground underline underline-offset-4 hover:text-primary">
              Privacy Policy
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  )
}

export { SignUp }
