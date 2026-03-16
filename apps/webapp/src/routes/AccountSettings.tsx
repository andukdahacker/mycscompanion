import { useCallback, useState } from 'react'
import { useNavigate, Link } from 'react-router'
import { Button } from '@mycscompanion/ui/src/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@mycscompanion/ui/src/components/ui/card'
import { useAccountProfile } from '../hooks/use-account-profile'
import { useDataExport } from '../hooks/use-data-export'
import { useAccountDeletion } from '../hooks/use-account-deletion'
import { signOut } from '../lib/firebase'
import { AccountSettingsSkeleton } from '../components/settings/AccountSettingsSkeleton'
import { DeleteAccountDialog } from '../components/settings/DeleteAccountDialog'

const ROLE_LABELS: Record<string, string> = {
  'backend-engineer': 'Backend Engineer',
  'frontend-engineer': 'Frontend Engineer',
  'fullstack-engineer': 'Full-Stack Engineer',
  'devops-sre': 'DevOps / SRE',
  'student': 'Student',
  'other': 'Other',
}

const EXPERIENCE_LABELS: Record<string, string> = {
  'less-than-1': 'Less than 1 year',
  '1-to-3': '1-3 years',
  '3-to-5': '3-5 years',
  '5-plus': '5+ years',
}

const LANGUAGE_LABELS: Record<string, string> = {
  'go': 'Go',
  'python': 'Python',
  'javascript-typescript': 'JavaScript / TypeScript',
  'rust': 'Rust',
  'java': 'Java',
  'c-cpp': 'C / C++',
  'other': 'Other',
}

function formatLabel(value: string | null, labels: Record<string, string>): string {
  if (!value) return 'Not set'
  return labels[value] ?? value
}

function AccountSettings(): React.ReactElement {
  const navigate = useNavigate()
  const { data, isLoading, isError, refetch } = useAccountProfile()
  const [signingOut, setSigningOut] = useState(false)
  const { state: exportState, triggerExport, downloadExport } = useDataExport()
  const { state: deletionState, deleteAccount, reset: resetDeletion } = useAccountDeletion()
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)

  const handleDeleteConfirm = useCallback(() => {
    void deleteAccount()
  }, [deleteAccount])

  const handleDeleteDialogChange = useCallback((open: boolean) => {
    if (deletionState.status === 'deleting') return
    setDeleteDialogOpen(open)
    if (!open) {
      resetDeletion()
    }
  }, [resetDeletion, deletionState.status])

  const handleSignOut = useCallback(async () => {
    setSigningOut(true)
    try {
      await signOut()
    } catch {
      // Navigate even if sign-out fails — user intent is clear
    }
    navigate('/sign-in', { replace: true })
  }, [navigate])

  if (isLoading) {
    return <AccountSettingsSkeleton />
  }

  if (isError || !data) {
    return (
      <main className="flex min-h-screen items-start justify-center bg-background px-4 py-12">
        <div className="w-full max-w-lg space-y-8">
          <h1 className="text-2xl font-semibold text-foreground">Account Settings</h1>
          <section aria-label="Error">
            <p className="text-sm text-muted-foreground">Failed to load profile data.</p>
            <Button
              variant="outline"
              className="mt-4"
              onClick={() => void refetch()}
            >
              Retry
            </Button>
          </section>
        </div>
      </main>
    )
  }

  return (
    <main className="flex min-h-screen items-start justify-center bg-background px-4 py-12">
      <div className="w-full max-w-lg space-y-8">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Account Settings</h1>
          <Link
            to="/overview"
            className="text-sm text-muted-foreground hover:underline"
          >
            Back to overview
          </Link>
        </div>

        {/* Profile info section */}
        <Card>
          <CardHeader>
            <CardTitle>Profile</CardTitle>
          </CardHeader>
          <CardContent>
            <section aria-label="Profile information" className="space-y-4">
              <div>
                <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Display Name</span>
                <p className={`text-sm ${data.displayName ? 'text-foreground' : 'text-muted-foreground'}`}>
                  {data.displayName ?? 'Not set'}
                </p>
              </div>
              <div>
                <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Email</span>
                <p className="text-sm text-foreground">{data.email}</p>
              </div>
              <div>
                <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Role</span>
                <p className={`text-sm ${data.role ? 'text-foreground' : 'text-muted-foreground'}`}>
                  {formatLabel(data.role ?? null, ROLE_LABELS)}
                </p>
              </div>
              <div>
                <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Experience Level</span>
                <p className={`text-sm ${data.experienceLevel ? 'text-foreground' : 'text-muted-foreground'}`}>
                  {formatLabel(data.experienceLevel ?? null, EXPERIENCE_LABELS)}
                </p>
              </div>
              <div>
                <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Primary Language</span>
                <p className={`text-sm ${data.primaryLanguage ? 'text-foreground' : 'text-muted-foreground'}`}>
                  {formatLabel(data.primaryLanguage ?? null, LANGUAGE_LABELS)}
                </p>
              </div>
            </section>
          </CardContent>
        </Card>

        {/* Preferences section */}
        <Card>
          <CardHeader>
            <CardTitle>Preferences</CardTitle>
          </CardHeader>
          <CardContent>
            <section aria-label="Preferences">
              <Button variant="outline" className="w-full" disabled>
                Theme (Coming soon)
              </Button>
            </section>
          </CardContent>
        </Card>

        {/* Account actions section */}
        <Card>
          <CardHeader>
            <CardTitle>Account</CardTitle>
          </CardHeader>
          <CardContent>
            <section aria-label="Account actions" className="space-y-3">
              {exportState.status === 'idle' && (
                <Button variant="outline" className="w-full" onClick={() => void triggerExport()}>
                  Export My Data
                </Button>
              )}
              {exportState.status === 'processing' && (
                <Button variant="outline" className="w-full" disabled>
                  Preparing Export...
                </Button>
              )}
              {exportState.status === 'completed' && (
                <Button variant="outline" className="w-full" onClick={() => void downloadExport()}>
                  Download Export
                </Button>
              )}
              {exportState.status === 'failed' && (
                <div className="space-y-2">
                  <p className="text-sm text-destructive">{exportState.error}</p>
                  <Button variant="outline" className="w-full" onClick={() => void triggerExport()}>
                    Retry Export
                  </Button>
                </div>
              )}
              {deletionState.status === 'failed' && (
                <p className="text-sm text-destructive">{deletionState.error}</p>
              )}
              <Button
                variant="outline"
                className="w-full text-destructive hover:text-destructive"
                onClick={() => setDeleteDialogOpen(true)}
              >
                Delete Account
              </Button>
              <Button variant="outline" className="w-full" asChild>
                <Link to="/privacy">Privacy Policy</Link>
              </Button>
            </section>
          </CardContent>
        </Card>

        {/* Sign out */}
        <Button
          variant="outline"
          className="min-h-11 w-full"
          disabled={signingOut}
          onClick={() => void handleSignOut()}
        >
          {signingOut ? 'Signing out\u2026' : 'Sign Out'}
        </Button>
      </div>
      <DeleteAccountDialog
        open={deleteDialogOpen}
        onOpenChange={handleDeleteDialogChange}
        onConfirm={handleDeleteConfirm}
        isDeleting={deletionState.status === 'deleting'}
      />
    </main>
  )
}

// eslint-disable-next-line no-restricted-syntax -- Default export required for React.lazy()
export default AccountSettings
