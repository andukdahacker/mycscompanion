# Story 8.3: Account Deletion

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a user,
I want to permanently delete my account and all associated data,
so that my information is fully removed from the platform per my privacy rights.

## Acceptance Criteria

1. Given a user is on the account settings page, when they initiate account deletion, then a confirmation step requires the user to explicitly confirm the irreversible action (FR40)
2. And the confirmation uses clear, direct language about what will be deleted — no ambiguity
3. And upon confirmation, all user data is deleted from the database: `users`, `sessions`, `code_snapshots`, `submissions`, `benchmark_results`, `tutor_messages`, `session_summaries`, `user_milestones`, `data_exports`, and any other user-associated records
4. And the user's Firebase Auth account is deleted
5. And the deletion is cascading and complete — no orphaned records remain
6. And after deletion, the user is logged out and redirected to the sign-in page
7. And the action is irreversible — the confirmation step makes this explicit
8. And deletion is processed synchronously within the request (not deferred indefinitely)

## Tasks / Subtasks

- [x] Task 1: Expand Firebase Admin interface for user deletion (AC: #4)
  - [x] 1.1 Update `apps/backend/src/plugins/auth/firebase.ts`:
    - Expand the `TokenVerifier` interface to include `deleteUser`:
      ```typescript
      /** Narrow interface — only what plugins actually need from Firebase Admin */
      interface FirebaseAdminAuth {
        verifyIdToken(token: string): Promise<{ uid: string }>
        deleteUser(uid: string): Promise<void>
      }
      ```
    - **Rename `TokenVerifier` → `FirebaseAdminAuth`** — the interface now covers more than just token verification. Update all references.
    - The actual `getAuth()` return value from `firebase-admin/auth` already has both methods, so `initFirebaseAdmin()` return type just changes to `FirebaseAdminAuth`.
  - [x] 1.2 Update all imports of `TokenVerifier` to `FirebaseAdminAuth`:
    - `apps/backend/src/plugins/auth/index.ts` — change `AuthPluginOptions` type and usage
    - `apps/backend/src/plugins/auth/auth.test.ts` — update mock type if referenced
  - [x] 1.3 **No new npm packages** — `firebase-admin/auth`'s `Auth.deleteUser(uid)` already exists in the installed `firebase-admin` package.

- [x] Task 2: Create deletion route in account plugin (AC: #3, #4, #5, #8)
  - [x] 2.1 Create `apps/backend/src/plugins/account/delete.ts`:
    ```typescript
    import type { FastifyInstance } from 'fastify'
    import type { Kysely } from 'kysely'
    import type { DB } from '@mycscompanion/shared'
    import type { FirebaseAdminAuth } from '../auth/firebase.js'

    type DeleteRoutesOptions = {
      readonly db: Kysely<DB>
      readonly firebaseAuth: FirebaseAdminAuth
    }

    export async function deleteRoutes(
      fastify: FastifyInstance,
      opts: DeleteRoutesOptions
    ): Promise<void> {
      // DELETE /api/account/delete
    }
    ```
    - **DELETE /api/account/delete:**
      - Uses `request.uid` for the authenticated user
      - Performs deletion within a database transaction:
        ```typescript
        await opts.db.transaction().execute(async (trx) => {
          // 1. Delete benchmark_results FIRST — no CASCADE on user_id FK
          await trx.deleteFrom('benchmark_results').where('user_id', '=', request.uid).execute()
          // 2. Delete user record — CASCADE handles all other tables
          const result = await trx.deleteFrom('users').where('id', '=', request.uid).executeTakeFirst()
          if (!result.numDeletedRows || result.numDeletedRows === 0n) {
            throw new Error('User not found')
          }
        })
        ```
      - After DB transaction succeeds, delete Firebase Auth user:
        ```typescript
        try {
          await opts.firebaseAuth.deleteUser(request.uid)
        } catch (err: unknown) {
          // Log but don't fail — DB deletion is the critical path
          // Firebase user without DB record is harmless (will get 404 on profile fetch)
          fastify.log.warn({ uid: request.uid, err }, 'Firebase user deletion failed after DB deletion')
        }
        ```
      - Return `{ message: 'Account deleted successfully' }`
      - **Error handling:** If DB transaction fails, return 500 `{ error: { code: 'DELETION_FAILED', message: 'Account deletion failed. Please try again.' } }`. Sentry captures via global error handler.
      - **Why synchronous (not queued):** Deletion is a single DB transaction (< 100ms for any user). No need for BullMQ complexity. The epic requires "not deferred indefinitely."
      - **Why Firebase deletion is fire-and-forget after DB:** The DB is the source of truth. If Firebase deletion fails, the user can't access anything anyway (profile endpoint returns 404). Firebase user without a DB record is a harmless orphan that can be cleaned up manually if needed.
    - **CRITICAL: `benchmark_results` has NO CASCADE on ANY of its FKs.** See migration `009_add_benchmark_results.ts`:
      - `user_id` FK → `users.id` — NO `.onDelete('cascade')`
      - `submission_id` FK → `submissions.id` — NO `.onDelete('cascade')`
      - `milestone_id` FK → `milestones.id` — NO `.onDelete('cascade')`
      Must delete `benchmark_results` by `user_id` FIRST in the transaction. If not deleted first, PostgreSQL will block CASCADE deletion of `submissions` (which are referenced by `benchmark_results.submission_id`). All other user-referencing tables DO have CASCADE.
    - **Tables cleaned up by CASCADE when `users` row is deleted:**
      - `sessions` (CASCADE) → which cascades to: `code_snapshots`, `session_summaries`, `tutor_messages` (via session FK)
      - `submissions` (CASCADE)
      - `user_milestones` (CASCADE)
      - `tutor_messages` (CASCADE via user_id FK)
      - `code_snapshots` (CASCADE via user_id FK)
      - `session_summaries` (CASCADE via user_id FK)
      - `data_exports` (CASCADE)
    - **Table NOT cleaned by CASCADE:**
      - `benchmark_results` — **must delete manually in transaction** (confirmed in migration 009)

- [x] Task 3: Register deletion route in account plugin (AC: #4)
  - [x] 3.1 Update `apps/backend/src/plugins/account/index.ts`:
    - Add imports:
      ```typescript
      import type { FirebaseAdminAuth } from '../auth/firebase.js'
      import { deleteRoutes } from './delete.js'
      ```
    - Update `AccountPluginOptions`:
      ```typescript
      interface AccountPluginOptions {
        readonly db?: typeof defaultDb
        readonly exportQueue?: Queue<ExportJobData>
        readonly firebaseAuth?: FirebaseAdminAuth
      }
      ```
    - Register delete routes (conditional on firebaseAuth like exportQueue):
      ```typescript
      if (opts.firebaseAuth) {
        await fastify.register(deleteRoutes, { db, firebaseAuth: opts.firebaseAuth })
      }
      ```
    - **Conditional registration** — keeps existing tests working (they don't pass firebaseAuth). Makes the dependency explicit.

- [x] Task 4: Pass Firebase Admin auth to account plugin in app.ts (AC: #4)
  - [x] 4.1 Update `apps/backend/src/app.ts`:
    - Import `initFirebaseAdmin` (it's already used by authPlugin internally, but we need the instance):
      ```typescript
      import { initFirebaseAdmin } from './plugins/auth/firebase.js'
      ```
    - Create Firebase Admin instance once and share it:
      ```typescript
      const firebaseAuth = initFirebaseAdmin()
      // Pass to auth plugin (replaces internal init)
      await fastify.register(authPlugin, { firebaseAuth })
      // Later, pass to account plugin
      await fastify.register(accountPlugin, { prefix: '/api/account', exportQueue, firebaseAuth })
      ```
    - **Why share the instance:** `initFirebaseAdmin()` is idempotent (checks `getApps().length > 0` before re-init), but explicit sharing is cleaner and makes the dependency graph obvious.
    - **Auth plugin already accepts `firebaseAuth` as optional** — it falls back to `initFirebaseAdmin()` internally. Passing it explicitly just skips the internal init.

- [x] Task 5: Create deletion route tests (AC: #3, #4, #5, #8)
  - [x] 5.1 Create `apps/backend/src/plugins/account/delete.test.ts`:
    ```typescript
    import { describe, it, expect, vi, afterEach, afterAll, beforeEach } from 'vitest'
    import Fastify from 'fastify'
    import type { FastifyInstance } from 'fastify'
    import { sql } from 'kysely'
    import { createMockFirebaseAuth } from '@mycscompanion/config/test-utils'
    import { authPlugin } from '../auth/index.js'
    import { accountPlugin } from './index.js'
    import { db } from '../../shared/db.js'
    import type { FirebaseAdminAuth } from '../auth/firebase.js'

    const TEST_UID = 'test-delete-uid'
    ```
    - **Test setup pattern:** Follow `export.test.ts` exactly:
      - `buildApp()` creates Fastify with auth + account plugins
      - Mock Firebase auth with `createMockFirebaseAuth(TEST_UID)` **extended** with `deleteUser: vi.fn().mockResolvedValue(undefined)`
      - `afterEach` cleanup via `db.deleteFrom()` in FK-safe order
      - `afterAll` close app
    - **Mock `FirebaseAdminAuth` for tests:**
      ```typescript
      const mockDeleteUser = vi.fn().mockResolvedValue(undefined)
      const mockFirebaseAuth: FirebaseAdminAuth = {
        ...createMockFirebaseAuth(TEST_UID),
        deleteUser: mockDeleteUser,
      }
      ```
    - **Tests:**
      - `it('should delete all user data from database')` — insert test data across ALL user tables (users, sessions, code_snapshots, submissions, benchmark_results, tutor_messages, session_summaries, user_milestones, data_exports), call DELETE, verify all tables are empty for that user
      - `it('should delete Firebase Auth user')` — verify `mockDeleteUser` called with `TEST_UID`
      - `it('should not delete other users data')` — insert data for 2 users, delete 1, verify other user's data intact
      - `it('should return success message on successful deletion')` — verify response `{ message: 'Account deleted successfully' }`
      - `it('should return 404 when user not found in database')` — call DELETE for non-existent user, verify 404 or 500
      - `it('should succeed even if Firebase deletion fails')` — mock `deleteUser` to reject, verify DB deletion still happened and response is success
      - `it('should not delete DB data if transaction fails')` — (harder to test, optional) verify atomicity
      - `it('should require authentication')` — call without auth header, verify 401
    - **Test data insertion pattern** (insert in FK-safe order: parents before children):
      ```typescript
      // 1. Insert user
      await db.insertInto('users').values({
        id: TEST_UID,
        email: 'delete-test@example.com',
        created_at: sql`now()`,
        updated_at: sql`now()`,
      }).execute()
      // 2. Insert session (depends on user)
      await db.insertInto('sessions').values({
        id: 'test-session-del',
        user_id: TEST_UID,
        milestone_id: 'test-milestone',
        created_at: sql`now()`,
        updated_at: sql`now()`,
      }).execute()
      // 3. Insert benchmark_results, submissions, etc.
      ```
    - **Cleanup order in `afterEach`** (children before parents):
      ```typescript
      await db.deleteFrom('data_exports').where('user_id', 'like', 'test-%').execute()
      await db.deleteFrom('benchmark_results').where('user_id', 'like', 'test-%').execute()
      await db.deleteFrom('tutor_messages').where('user_id', 'like', 'test-%').execute()
      await db.deleteFrom('session_summaries').where('user_id', 'like', 'test-%').execute()
      await db.deleteFrom('code_snapshots').where('user_id', 'like', 'test-%').execute()
      await db.deleteFrom('submissions').where('user_id', 'like', 'test-%').execute()
      await db.deleteFrom('user_milestones').where('user_id', 'like', 'test-%').execute()
      await db.deleteFrom('sessions').where('user_id', 'like', 'test-%').execute()
      await db.deleteFrom('users').where('id', 'like', 'test-%').execute()
      ```
    - **Use `fastify.inject()`** — never supertest
    - **Use real PostgreSQL** — no mocking Kysely
    - **Use `vi.restoreAllMocks()` in `afterEach`**
    - **Use `it()`, never `test()`**

- [x] Task 6: Install AlertDialog component from shadcn/ui (AC: #1, #2)
  - [x] 6.1 Add AlertDialog to `@mycscompanion/ui`:
    - Run: `pnpm --filter @mycscompanion/ui dlx shadcn@latest add alert-dialog`
    - This creates `packages/ui/src/components/ui/alert-dialog.tsx` with Radix primitives
    - **Why AlertDialog over Dialog:** AlertDialog is specifically designed for destructive/irreversible confirmations. It traps focus and requires explicit action — user can't dismiss by clicking outside. This is critical for account deletion (AC #1, #7).
    - AlertDialog exports: `AlertDialog`, `AlertDialogTrigger`, `AlertDialogContent`, `AlertDialogHeader`, `AlertDialogFooter`, `AlertDialogTitle`, `AlertDialogDescription`, `AlertDialogAction`, `AlertDialogCancel`
  - [x] 6.2 **No barrel file change needed** — `@mycscompanion/ui` has NO barrel file (import components individually for tree-shaking, per project context rules).

- [x] Task 7: Create `useAccountDeletion` hook (AC: #1, #6, #8)
  - [x] 7.1 Create `apps/webapp/src/hooks/use-account-deletion.ts`:
    ```typescript
    import { useState, useCallback } from 'react'
    import { useNavigate } from 'react-router'
    import { apiFetch } from '../lib/api-fetch'
    import { signOut } from '../lib/firebase'

    type DeletionState = {
      readonly status: 'idle' | 'deleting' | 'failed'
      readonly error: string | null
    }

    function useAccountDeletion() {
      const navigate = useNavigate()
      const [state, setState] = useState<DeletionState>({ status: 'idle', error: null })

      const deleteAccount = useCallback(async () => {
        setState({ status: 'deleting', error: null })
        try {
          await apiFetch<{ message: string }>('/api/account/delete', { method: 'DELETE' })
          // Sign out after successful deletion (clears local Firebase session)
          try {
            await signOut()
          } catch {
            // Sign-out failure is non-critical — account is already deleted
          }
          navigate('/sign-in', { replace: true })
        } catch {
          setState({ status: 'failed', error: 'Account deletion failed. Please try again.' })
        }
      }, [navigate])

      const reset = useCallback(() => {
        setState({ status: 'idle', error: null })
      }, [])

      return { state, deleteAccount, reset }
    }

    export { useAccountDeletion }
    ```
    - **Flow:** DELETE API call → sign out (best-effort) → navigate to sign-in
    - **No polling needed** — deletion is synchronous, not queued
    - **`reset` function** — allows clearing error state when dialog is closed (user can retry)
    - **`signOut()` after deletion** — clears the local Firebase auth token. Without this, `apiFetch` would still try to use the (now-deleted) Firebase user's token, causing 401 errors.
    - **Navigate to `/sign-in` (not `/`)** — user needs to sign in with a new account. Same pattern as `handleSignOut` in AccountSettings.
    - **No TanStack Query** — same reasoning as `use-data-export.ts`. This is a one-shot imperative action, not cacheable server state.
  - [x] 7.2 Create `apps/webapp/src/hooks/use-account-deletion.test.ts`:
    - Test: `deleteAccount` should call DELETE /api/account/delete
    - Test: should call signOut after successful deletion
    - Test: should navigate to /sign-in after successful deletion
    - Test: should navigate to /sign-in even if signOut fails after deletion
    - Test: should set status to 'failed' on API error
    - Test: `reset` should clear error state
    - Test: should set status to 'deleting' during API call
    - **Mock `apiFetch` via `vi.mock('../lib/api-fetch')`**
    - **Mock `signOut` via `vi.mock('../lib/firebase')`**
    - **Mock `useNavigate` via `vi.mock('react-router')`**
    - **Use `renderHook` from `@testing-library/react`**
    - **Use `act()` for state updates**
    - **Use `vi.restoreAllMocks()` in `afterEach`**

- [x] Task 8: Create `DeleteAccountDialog` component (AC: #1, #2, #7)
  - [x] 8.1 Create `apps/webapp/src/components/settings/DeleteAccountDialog.tsx`:
    ```tsx
    import {
      AlertDialog,
      AlertDialogAction,
      AlertDialogCancel,
      AlertDialogContent,
      AlertDialogDescription,
      AlertDialogFooter,
      AlertDialogHeader,
      AlertDialogTitle,
    } from '@mycscompanion/ui/src/components/ui/alert-dialog'
    interface DeleteAccountDialogProps {
      readonly open: boolean
      readonly onOpenChange: (open: boolean) => void
      readonly onConfirm: () => void
      readonly isDeleting: boolean
    }

    function DeleteAccountDialog({
      open,
      onOpenChange,
      onConfirm,
      isDeleting,
    }: DeleteAccountDialogProps): React.ReactElement {
      return (
        <AlertDialog open={open} onOpenChange={onOpenChange}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Account</AlertDialogTitle>
              <AlertDialogDescription>
                This action is permanent and cannot be undone. All your data will be
                permanently deleted, including:
              </AlertDialogDescription>
            </AlertDialogHeader>
            <ul className="list-disc pl-6 text-sm text-muted-foreground space-y-1">
              <li>Your profile and account information</li>
              <li>All code submissions and snapshots</li>
              <li>Benchmark results and progress data</li>
              <li>AI tutor conversation history</li>
              <li>Session summaries</li>
            </ul>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={(e) => {
                  e.preventDefault()
                  onConfirm()
                }}
                disabled={isDeleting}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {isDeleting ? 'Deleting\u2026' : 'Delete My Account'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )
    }

    export { DeleteAccountDialog }
    ```
    - **AlertDialog (not Dialog)** — prevents dismissal by clicking outside. User MUST explicitly Cancel or Confirm. Critical for irreversible actions (AC #1, #7).
    - **`e.preventDefault()` on AlertDialogAction** — Radix `AlertDialogAction` auto-closes the dialog on click by default. `preventDefault()` keeps the dialog open so the user sees the "Deleting..." loading state. Without this, the dialog would close immediately, `onOpenChange(false)` would fire, and `resetDeletion()` would race with the active deletion.
    - **Destructive styling on confirm button** — `bg-destructive text-destructive-foreground` makes it visually clear this is dangerous. Maps to red in the dark theme.
    - **Disabled during deletion** — both buttons disabled while `isDeleting` is true. Prevents double-submit.
    - **"Deleting..." loading text** — follows the `signingOut ? 'Signing out...' : 'Sign Out'` pattern from AccountSettings.
    - **Explicit data list** — AC #2 requires "clear, direct language about what will be deleted." The bulleted list enumerates exactly what gets removed.
    - **No email confirmation input** — the epic doesn't require it, and it would complicate the flow unnecessarily. A modal confirmation with explicit action is sufficient.
  - [x] 8.2 Create `apps/webapp/src/components/settings/DeleteAccountDialog.test.tsx`:
    - Test: should render dialog title and description when open
    - Test: should render list of data to be deleted
    - Test: should call onConfirm when "Delete My Account" is clicked
    - Test: should call onOpenChange(false) when Cancel is clicked
    - Test: should show "Deleting..." text when isDeleting is true
    - Test: should disable both buttons when isDeleting is true
    - Test: should not render content when open is false
    - **Use `screen.getByRole('alertdialog')` to find the dialog**
    - **Use `vi.fn()` for onConfirm and onOpenChange**
    - **Use `vi.restoreAllMocks()` in `afterEach`**
    - **No `TestProviders` or `MemoryRouter` needed** — `DeleteAccountDialog` has no router or TanStack Query dependencies. Plain `render()` is sufficient (same pattern as `ConceptExplainerDialog.test.tsx`).

- [x] Task 9: Update AccountSettings to enable deletion functionality (AC: #1, #2, #6, #7)
  - [x] 9.1 Update `apps/webapp/src/routes/AccountSettings.tsx`:
    - Add imports at top:
      ```tsx
      import { useAccountDeletion } from '../hooks/use-account-deletion'
      import { DeleteAccountDialog } from '../components/settings/DeleteAccountDialog'
      ```
    - Add state and hook inside `AccountSettings` function, after the `useDataExport` hook:
      ```tsx
      const { state: deletionState, deleteAccount, reset: resetDeletion } = useAccountDeletion()
      const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)

      const handleDeleteConfirm = useCallback(() => {
        void deleteAccount()
      }, [deleteAccount])

      const handleDeleteDialogChange = useCallback((open: boolean) => {
        if (deletionState.status === 'deleting') return // Don't close during active deletion
        setDeleteDialogOpen(open)
        if (!open) {
          resetDeletion()
        }
      }, [resetDeletion, deletionState.status])
      ```
    - **Replace the disabled delete button** at lines 177-179. The exact current code is:
      ```tsx
      <Button variant="outline" className="w-full" disabled>
        Delete Account (Coming soon)
      </Button>
      ```
      Replace with:
      ```tsx
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
      ```
    - **Add the dialog** at the end of the component, just before the closing `</main>`:
      ```tsx
      <DeleteAccountDialog
        open={deleteDialogOpen}
        onOpenChange={handleDeleteDialogChange}
        onConfirm={handleDeleteConfirm}
        isDeleting={deletionState.status === 'deleting'}
      />
      ```
    - **Button styling:** `text-destructive hover:text-destructive` — red text signals danger without using the full destructive variant (which would be too visually heavy in the settings list).
    - **Error message** — displayed above the button when deletion fails. User can retry by clicking the button again.
    - **Dialog state managed locally** — `deleteDialogOpen` is local UI state (not Zustand), consistent with the "no new Zustand stores" rule.
    - **`void` keyword** on async callbacks — same pattern as `handleSignOut` on line 192.
  - [x] 9.2 Update `apps/webapp/src/routes/AccountSettings.test.tsx`:
    - Add mock for `useAccountDeletion`:
      ```typescript
      const mockUseAccountDeletion = vi.fn()
      vi.mock('../hooks/use-account-deletion', () => ({
        useAccountDeletion: () => mockUseAccountDeletion(),
      }))
      ```
    - Add to `beforeEach` default mock value:
      ```typescript
      mockUseAccountDeletion.mockReturnValue({
        state: { status: 'idle', error: null },
        deleteAccount: vi.fn(),
        reset: vi.fn(),
      })
      ```
    - **Replace existing test** at lines 224-228 (`it('should render disabled "Delete Account" button')`):
      - New test: `it('should render "Delete Account" button that is enabled')`
    - **Add new tests in the existing describe or new describe block:**
      - `it('should open delete dialog when Delete Account button is clicked')`
      - `it('should call deleteAccount when dialog confirm is clicked')`
      - `it('should close dialog when Cancel is clicked')`
      - `it('should show error message when deletion fails')`
      - `it('should show "Deleting..." in dialog when deletion in progress')`
    - **Dialog testing pattern:** Click "Delete Account" button → assert dialog opens → click confirm/cancel → assert callbacks called
    - **Use `screen.getByRole('alertdialog')` for dialog assertions**
    - **Use `userEvent.click()` for interactions**

## Dev Notes

### Architecture Compliance

- **Plugin isolation preserved** — delete routes live in account plugin (`/api/account/delete`), matching ARCH-5 architecture
- **No cross-plugin imports** — delete route queries DB directly, uses injected `firebaseAuth` for Firebase deletion
- **No new Zustand stores** — deletion state managed via local `useState` in custom hook (imperative one-shot action, not server state)
- **Named exports only** — all new modules use named exports
- **Plugin registration order** — no change needed. Account plugin remains at position 3 (domain plugins). Auth plugin at position 1 provides the `FirebaseAdminAuth` instance.
- **No new BullMQ queue** — deletion is synchronous. A single DB transaction + Firebase call is fast enough (< 200ms total). No need for queue/worker complexity.
- **Dependency injection** — `FirebaseAdminAuth` injected via plugin options (testable). Never hardcoded.
- **Import `AlertDialog` individually** — no barrel import from `@mycscompanion/ui` (tree-shaking rule)

### Existing Implementation to Build On

| What | Where | Status |
|---|---|---|
| Account plugin | `apps/backend/src/plugins/account/index.ts` | Complete — add delete routes registration |
| Firebase Admin init | `apps/backend/src/plugins/auth/firebase.ts` | Complete — expand `TokenVerifier` → `FirebaseAdminAuth` |
| Auth plugin | `apps/backend/src/plugins/auth/index.ts` | Complete — update type import |
| App.ts plugin wiring | `apps/backend/src/app.ts` | Complete — share `firebaseAuth` instance |
| `apiFetch` | `apps/webapp/src/lib/api-fetch.ts` | Complete — use for DELETE request |
| `signOut()` | `apps/webapp/src/lib/firebase.ts` | Complete — call after deletion |
| AccountSettings.tsx | `apps/webapp/src/routes/AccountSettings.tsx` | Complete — replace disabled delete button |
| Dialog component | `packages/ui/src/components/ui/dialog.tsx` | Complete — reference for AlertDialog pattern |
| `createMockFirebaseAuth` | `@mycscompanion/config/test-utils` | Complete — extend with `deleteUser` for tests |

### Data Flow

```
Frontend AccountSettings route:
  1. User clicks "Delete Account" button
  2. DeleteAccountDialog opens (AlertDialog — can't dismiss by clicking outside)
  3. Dialog shows explicit warning listing all data to be deleted
  4. User clicks "Delete My Account" confirm button
  5. useAccountDeletion.deleteAccount() →
     DELETE /api/account/delete
     → Backend starts DB transaction:
       → DELETE FROM benchmark_results WHERE user_id = uid (no CASCADE)
       → DELETE FROM users WHERE id = uid (CASCADE deletes all other tables)
     → Transaction commits
     → Backend calls firebaseAuth.deleteUser(uid) (fire-and-forget)
     → Returns { message: 'Account deleted successfully' }
  6. Frontend calls signOut() (clears local Firebase session)
  7. Frontend navigates to /sign-in with replace: true
```

### Database Deletion Strategy

**Transaction with explicit + cascade deletion:**

```
Within single DB transaction:
  1. DELETE benchmark_results WHERE user_id = uid  ← NO CASCADE, must be explicit
  2. DELETE users WHERE id = uid                   ← CASCADE handles everything below:
     ├── sessions (CASCADE)
     │   ├── code_snapshots (CASCADE via session_id FK)
     │   ├── session_summaries (CASCADE via session_id FK)
     │   └── tutor_messages (CASCADE via session_id FK)
     ├── submissions (CASCADE via user_id FK)
     ├── user_milestones (CASCADE via user_id FK)
     ├── tutor_messages (CASCADE via user_id FK)
     ├── code_snapshots (CASCADE via user_id FK)
     ├── session_summaries (CASCADE via user_id FK)
     └── data_exports (CASCADE via user_id FK)
```

**Why `benchmark_results` MUST be deleted first:** It has no CASCADE on any of its three FKs (`user_id`, `submission_id`, `milestone_id`). If `submissions` are cascade-deleted before `benchmark_results`, PostgreSQL will block with a FK violation on `benchmark_results.submission_id`. Deleting `benchmark_results` by `user_id` first removes all references, allowing the `users` CASCADE to proceed cleanly.

**Why not add CASCADE to benchmark_results retroactively?** Adding a new migration to alter the FK would work but introduces a schema change for a simple delete that we can handle explicitly in code. The explicit delete-before-cascade approach is safer and doesn't require a migration.

### Security Considerations

- **Auth required** — DELETE endpoint behind global auth hook (ARCH-5 position 1)
- **Scoped to `request.uid`** — impossible to delete another user's account
- **No admin backdoor** — deletion can only be triggered by the account owner
- **Transaction atomicity** — if any part of DB deletion fails, nothing is deleted (ACID)
- **Firebase deletion is best-effort** — if it fails after DB deletion, the orphaned Firebase user can't access anything (profile returns 404). Logged for manual cleanup.
- **AlertDialog prevents accidental dismissal** — user must explicitly confirm or cancel
- **No confirmation email/code** — acceptable for MVP. The in-app confirmation dialog with explicit warning is sufficient per the epic's acceptance criteria.

### Previous Story Intelligence (from 8.2)

1. **Export processor queries the same set of tables** — `export-processor.ts` collects data from users, sessions, code_snapshots, submissions, benchmark_results, tutor_messages, session_summaries, user_milestones. Deletion must cover the same set.
2. **Cascade delete on `data_exports`** — Story 8.2's migration (`010_add_data_exports.ts`) added `.onDelete('cascade')` on `user_id` FK. This means data_exports are automatically cleaned up when the user is deleted.
3. **Export queue (BullMQ)** — If a user has an in-progress export job when they delete their account, the job will fail gracefully (user/export rows no longer exist). The worker's `failed` event handler will log but not Sentry-capture this (retry exhaustion). No special handling needed.
4. **`toCamelCase()` handles arrays** — not relevant for deletion, but good to know for future reference.
5. **Test cleanup pattern** — `db.deleteFrom().where('id', 'like', 'test-%')` in `afterEach`, FK-safe order.
6. **AccountSettings test mock pattern** — `vi.mock('../hooks/use-data-export')` with `vi.fn()` mock, configured per test in `beforeEach` or inline.

### Git Intelligence (Recent Commits)

```
e71145c Implement Story 8.2: Data Export with code review fixes
4af2625 Implement Story 8.1: Account Settings Page with code review fixes
```

**Patterns established:**
- Account plugin at `apps/backend/src/plugins/account/` with clean module separation (profile.ts, onboarding.ts, skill-assessment.ts, export.ts)
- AccountSettings route at `apps/webapp/src/routes/AccountSettings.tsx` with disabled action buttons for future stories
- Hooks at `apps/webapp/src/hooks/use-*.ts` for account actions
- Conditional plugin route registration based on injected dependencies
- `afterEach` cleanup with `db.deleteFrom()` in FK-safe order

### Testing Strategy

- **Route tests (fastify.inject, real DB):** `delete.test.ts` — insert test data across ALL user tables for 2 users, delete 1, verify all data removed for deleted user, all data intact for other user. Mock Firebase `deleteUser` to verify it's called. Test Firebase failure doesn't prevent DB deletion.
- **Hook tests (mocked API):** `use-account-deletion.test.ts` — mock `apiFetch`, mock `signOut`, mock `useNavigate`. Test state transitions (idle → deleting → navigate OR idle → deleting → failed). Test reset clears error.
- **Component tests (mocked AlertDialog interactions):** `DeleteAccountDialog.test.tsx` — test dialog renders when open, test confirm callback, test cancel callback, test loading state, test data list rendering.
- **Integration test in AccountSettings:** `AccountSettings.test.tsx` — mock `useAccountDeletion` hook, test button opens dialog, test confirm triggers deletion, test error display, test dialog close resets state.
- **No snapshot tests** — explicit behavioral assertions only
- **Import test utils from `@mycscompanion/config/test-utils/`**

### Project Structure Notes

**New files:**
- `packages/ui/src/components/ui/alert-dialog.tsx` — AlertDialog component from shadcn/ui
- `apps/backend/src/plugins/account/delete.ts` — Delete API route (DELETE /api/account/delete)
- `apps/backend/src/plugins/account/delete.test.ts` — Route tests (real DB, fastify.inject)
- `apps/webapp/src/hooks/use-account-deletion.ts` — Frontend deletion hook
- `apps/webapp/src/hooks/use-account-deletion.test.ts` — Hook tests
- `apps/webapp/src/components/settings/DeleteAccountDialog.tsx` — Confirmation dialog component
- `apps/webapp/src/components/settings/DeleteAccountDialog.test.tsx` — Dialog component tests

**Modified files:**
- `apps/backend/src/plugins/auth/firebase.ts` — Rename `TokenVerifier` → `FirebaseAdminAuth`, add `deleteUser` to interface
- `apps/backend/src/plugins/auth/index.ts` — Update type import from `TokenVerifier` → `FirebaseAdminAuth`
- `apps/backend/src/plugins/account/index.ts` — Add `firebaseAuth` option, register delete routes
- `apps/backend/src/app.ts` — Create shared `firebaseAuth` instance, pass to auth + account plugins
- `apps/webapp/src/routes/AccountSettings.tsx` — Replace disabled delete button with functional UI + dialog
- `apps/webapp/src/routes/AccountSettings.test.tsx` — Update delete button tests, add dialog interaction tests

**All new component files use `PascalCase.tsx`, hooks use `kebab-case.ts`, backend files use `kebab-case.ts`**
**Co-located tests: `*.test.ts(x)` next to source**

### References

- [Source: _bmad-output/planning-artifacts/epics.md — Epic 8, Story 8.3 acceptance criteria (lines 1267-1284)]
- [Source: _bmad-output/planning-artifacts/epics.md — FR40: User can delete their account and all associated data]
- [Source: _bmad-output/project-context.md — All project rules, testing rules, anti-patterns]
- [Source: apps/backend/src/plugins/auth/firebase.ts — TokenVerifier interface, initFirebaseAdmin (lines 1-34)]
- [Source: apps/backend/src/plugins/auth/index.ts — Auth plugin, request.uid decorator (lines 1-51)]
- [Source: apps/backend/src/plugins/account/index.ts — AccountPluginOptions, conditional route registration]
- [Source: apps/backend/src/plugins/account/export.ts — Export route pattern (DI, error handling, scoped to request.uid)]
- [Source: apps/backend/src/app.ts — Plugin registration order, queue creation, shared dependencies (lines 1-141)]
- [Source: apps/backend/migrations/009_add_benchmark_results.ts — benchmark_results FK has NO CASCADE]
- [Source: apps/backend/migrations/010_add_data_exports.ts — data_exports FK has CASCADE]
- [Source: apps/backend/src/worker/processors/export-processor.ts — Complete list of user data tables]
- [Source: apps/webapp/src/routes/AccountSettings.tsx — Disabled "Delete Account" button (lines 177-179), sign-out pattern (lines 47-55)]
- [Source: apps/webapp/src/routes/AccountSettings.test.tsx — Mock patterns (lines 8-31), delete button test (lines 224-228)]
- [Source: apps/webapp/src/hooks/use-data-export.ts — Hook pattern for account actions (state, callbacks, no TanStack Query)]
- [Source: apps/webapp/src/lib/firebase.ts — signOut export, auth.currentUser pattern]
- [Source: apps/webapp/src/lib/api-fetch.ts — apiFetch with auth token attachment]
- [Source: packages/ui/src/components/ui/dialog.tsx — Dialog component pattern (reference for AlertDialog)]
- [Source: apps/backend/src/plugins/account/export.test.ts — Test patterns: buildApp, mock queue, cleanup order]
- [Source: apps/backend/src/plugins/account/account.test.ts — Test patterns: createMockFirebaseAuth, db.deleteFrom cleanup]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6

### Debug Log References

- Discovered `submissions.user_id` FK has NO CASCADE in actual DB (despite migration specifying it). Added explicit deletion of `user_milestones` and `submissions` in transaction alongside `benchmark_results`.
- shadcn CLI tried to rewrite `button.tsx` imports from relative to `src/` paths — reverted to maintain consistency with existing components.

### Completion Notes List

- Task 1: Renamed `TokenVerifier` → `FirebaseAdminAuth`, added `deleteUser` method. Updated all imports and mock factory.
- Task 2: Created `delete.ts` with DELETE `/delete` route. Transaction deletes: benchmark_results → user_milestones → submissions (all NO CASCADE), then users (CASCADE handles rest). Firebase deletion is fire-and-forget.
- Task 3: Registered delete routes in account plugin, conditional on `firebaseAuth` being provided.
- Task 4: Shared `initFirebaseAdmin()` instance in `app.ts`, passed to both auth and account plugins.
- Task 5: Created `delete.test.ts` with 7 tests covering: full data deletion, Firebase Auth deletion, user isolation, success response, 404/500 on missing user, Firebase failure resilience, auth requirement. All use real PostgreSQL.
- Task 6: Installed AlertDialog from shadcn/ui. Fixed import paths to use relative imports matching project convention.
- Task 7: Created `useAccountDeletion` hook with DELETE → signOut → navigate flow. 8 tests covering all state transitions.
- Task 8: Created `DeleteAccountDialog` with AlertDialog (prevents dismiss by clicking outside), explicit data list, destructive styling, loading state. 6 tests.
- Task 9: Replaced disabled "Delete Account (Coming soon)" button with functional button + dialog. Added error display. 25 total AccountSettings tests (4 new deletion tests).

### Change Log

- 2026-03-12: Implemented Story 8.3 Account Deletion — all 9 tasks complete
- 2026-03-12: Code review fixes applied (7 issues: 2 HIGH, 3 MEDIUM, 2 LOW):
  - [H1] Added missing Cancel→onOpenChange test in DeleteAccountDialog.test.tsx
  - [H2] Added missing dialog close/Cancel + reset tests in AccountSettings.test.tsx
  - [M1] Added explicit DELETION_FAILED error code in delete.ts (was relying on global handler)
  - [M2] Added code comments documenting CASCADE discrepancy in delete.ts
  - [M3] Added mockDeleteUser.mockResolvedValue in beforeEach to fix mock lifecycle
  - [L1] Fixed test name typo in use-account-deletion.test.ts
  - [L2] Added double-invocation guard in useAccountDeletion hook

### File List

**New files:**
- `packages/ui/src/components/ui/alert-dialog.tsx`
- `apps/backend/src/plugins/account/delete.ts`
- `apps/backend/src/plugins/account/delete.test.ts`
- `apps/webapp/src/hooks/use-account-deletion.ts`
- `apps/webapp/src/hooks/use-account-deletion.test.ts`
- `apps/webapp/src/components/settings/DeleteAccountDialog.tsx`
- `apps/webapp/src/components/settings/DeleteAccountDialog.test.tsx`

**Modified files:**
- `apps/backend/src/plugins/auth/firebase.ts` — Renamed `TokenVerifier` → `FirebaseAdminAuth`, added `deleteUser`
- `apps/backend/src/plugins/auth/index.ts` — Updated type import
- `apps/backend/src/plugins/account/index.ts` — Added `firebaseAuth` option, registered delete routes
- `apps/backend/src/app.ts` — Shared `firebaseAuth` instance, passed to auth + account plugins
- `apps/webapp/src/routes/AccountSettings.tsx` — Replaced disabled delete button with functional UI + dialog
- `apps/webapp/src/routes/AccountSettings.test.tsx` — Updated delete button tests, added dialog tests
- `packages/config/test-utils/mock-firebase-auth.ts` — Added `deleteUser` to mock interface
