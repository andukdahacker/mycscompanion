# Story 8.1: Account Settings Page

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a user,
I want to view and manage my account settings,
so that I can see my profile information and access account actions.

## Acceptance Criteria

1. Given a logged-in user navigates to account settings, when the settings page loads, then the page displays the user's display name (if set), email address, and background questionnaire data (role, experience level, primary language)
2. Given the settings page loads, then it is accessible from the workspace via a consistent navigation element
3. Given the settings page loads, then the page uses dark-first color system consistent with the rest of the app (UX-9)
4. Given the settings page is viewed on any device, then the layout is responsive across all three breakpoints: desktop (>=1280px), small desktop (1024-1279px), and mobile (<768px) (UX-14)
5. Given the settings page is used with keyboard only, then all interactive elements are keyboard-accessible with visible focus indicators (NFR-A1, NFR-A2)
6. Given the settings page loads, then the page includes placeholder links/actions for data export (Story 8.2), account deletion (Story 8.3), privacy policy (Story 8.4), and theme toggle (deferred preference)
7. Given the account plugin handles all account-related API endpoints, then the existing `GET /api/account/profile` endpoint is reused (ARCH-5)

## Tasks / Subtasks

- [x] Task 1: Create `useAccountProfile` TanStack Query hook (AC: #1, #7)
  - [x] 1.1 Create `apps/webapp/src/hooks/use-account-profile.ts`:
    ```typescript
    import { useQuery } from '@tanstack/react-query'
    import { apiFetch } from '../lib/api-fetch'
    import type { UserProfile } from '@mycscompanion/shared'

    function useAccountProfile() {
      return useQuery<UserProfile>({
        queryKey: ['account', 'profile'],
        queryFn: () => apiFetch<UserProfile>('/api/account/profile'),
        staleTime: 5 * 60 * 1000, // 5 minutes — profile data rarely changes
      })
    }

    export { useAccountProfile }
    ```
    **Note:** The `GET /api/account/profile` endpoint already exists in `apps/backend/src/plugins/account/profile.ts` and returns all `users` table columns via `toCamelCase()`. The `UserProfile` type is already defined in `packages/shared/src/types/api.ts` (lines 16-28). No backend changes needed.
  - [x] 1.2 Create `apps/webapp/src/hooks/use-account-profile.test.ts`:
    - Test: returns profile data on success
    - Test: returns error state when API fails
    - Use `createTestQueryClient()` from `@mycscompanion/config/test-utils/`
    - Mock `apiFetch` via `vi.mock('../lib/api-fetch')`

- [x] Task 2: Create `AccountSettingsSkeleton` loading component (AC: #3)
  - [x] 2.1 Create `apps/webapp/src/components/settings/AccountSettingsSkeleton.tsx`:
    - Purpose-built skeleton matching the settings page layout (no generic spinners)
    - Pattern: match `OverviewSkeleton` / `ProgressSkeleton` approach — animated pulse rectangles for each data section
    - Skeleton sections: header area, email field, 3 profile fields, 3 action links
    ```tsx
    function AccountSettingsSkeleton(): React.ReactElement {
      return (
        <main className="flex min-h-screen items-start justify-center bg-background px-4 py-12">
          <div className="w-full max-w-lg space-y-8">
            <div className="space-y-2">
              <div className="h-8 w-48 bg-muted rounded animate-pulse motion-reduce:animate-none" />
              <div className="h-4 w-64 bg-muted rounded animate-pulse motion-reduce:animate-none" />
            </div>
            {/* Profile section skeleton */}
            <div className="space-y-4">
              {Array.from({ length: 5 }, (_, i) => (
                <div key={i} className="space-y-1">
                  <div className="h-3 w-24 bg-muted rounded animate-pulse motion-reduce:animate-none" />
                  <div className="h-5 w-48 bg-muted rounded animate-pulse motion-reduce:animate-none" />
                </div>
              ))}
            </div>
            {/* Actions skeleton */}
            <div className="space-y-3">
              {Array.from({ length: 4 }, (_, i) => (
                <div key={i} className="h-10 w-full bg-muted rounded animate-pulse motion-reduce:animate-none" />
              ))}
            </div>
          </div>
        </main>
      )
    }

    export { AccountSettingsSkeleton }
    ```
    - **`motion-reduce:animate-none`** on ALL pulse elements — respects `prefers-reduced-motion` (established pattern from TrajectoryChart, BenchmarkHeroDisplay)
  - [x] 2.2 Create `apps/webapp/src/components/settings/AccountSettingsSkeleton.test.tsx`:
    - Test: renders skeleton with pulse animation elements

- [x] Task 3: Create `AccountSettings` route component (AC: #1, #2, #3, #4, #5, #6)
  - [x] 3.1 Create `apps/webapp/src/routes/AccountSettings.tsx`:
    ```typescript
    import { useNavigate, Link } from 'react-router'
    import { Button } from '@mycscompanion/ui/src/components/ui/button'
    import { Card, CardContent, CardHeader, CardTitle } from '@mycscompanion/ui/src/components/ui/card'
    import { useAccountProfile } from '../hooks/use-account-profile'
    import { signOut } from '../lib/firebase'
    import { AccountSettingsSkeleton } from '../components/settings/AccountSettingsSkeleton'
    ```
    - **Page layout:** Full-height top-aligned centered layout:
      - `<main className="flex min-h-screen items-start justify-center bg-background px-4 py-12">`
      - Content wrapper: `<div className="w-full max-w-lg space-y-8">`
      - **Why `items-start` (not `items-center`):** Settings page can have enough content to scroll. Vertical centering would push content below the fold on smaller screens. Top-alignment ensures content is always visible from the top.
      - **Why `max-w-lg` (not `max-w-2xl`):** Settings is a narrow form-like layout, not a content-rich overview. `max-w-lg` (32rem) keeps fields readable without excessive whitespace. Overview/progress use `max-w-2xl` because they display wider content cards and grids.
    - **Header section:**
      - `<h1>` "Account Settings" (text-h1/24px, font-semibold, text-foreground)
      - Back link: `<Link to="/overview">` "Back to overview" (text-sm, text-muted-foreground, hover:underline)
    - **Profile info section** (read-only display, inside a `<Card>`):
      - Display Name: `data.displayName` — show if non-null, otherwise show "Not set"
      - Email: `data.email` — displayed as read-only text (not editable — Firebase Auth owns this)
      - Role: formatted display name from `data.role` (e.g., "backend-engineer" → "Backend Engineer")
      - Experience Level: formatted from `data.experienceLevel` (e.g., "3-to-5" → "3-5 years")
      - Primary Language: formatted from `data.primaryLanguage` (e.g., "javascript-typescript" → "JavaScript / TypeScript")
      - Each field: label (`text-xs font-medium uppercase tracking-wide text-muted-foreground`) + value (`text-sm text-foreground`)
      - If any profile field is null, show "Not set" in `text-muted-foreground`
    - **Display name mapping helper** (inline in component or small utility):
      ```typescript
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
      ```
      **Note:** These match the `SelectItem` values in `Onboarding.tsx` (lines 132-165). Keep in sync. Use the shared types `UserRole`, `ExperienceLevel`, `PrimaryLanguage` from `@mycscompanion/shared` for type safety.
    - **Account actions section** (inside a separate `<Card>`):
      - "Export My Data" — disabled button with "(Coming soon)" label. This will be implemented in Story 8.2.
      - "Delete Account" — disabled button with "(Coming soon)" label. This will be implemented in Story 8.3.
      - "Privacy Policy" — disabled link with "(Coming soon)" label. This will be implemented in Story 8.4.
      - Disabled styling: `opacity-50 cursor-not-allowed` or use Button's `disabled` prop
    - **Preferences section** (inside a separate `<Card>` or within Actions card):
      - "Theme" — disabled toggle/button with "(Coming soon)" label. UX spec states: "Theme toggle accessible in account settings, not prominent in workspace (engineers set it once)." Light theme implementation is deferred; this is a placeholder only.
      - Per UX spec: light theme should respect `prefers-color-scheme` on first visit, then store preference in localStorage. Implementation deferred to a future story.
    - **Sign out section:**
      - "Sign Out" button (variant="outline", full width)
      - **Must track loading state** — use `useState<boolean>(false)` for `signingOut`:
        - While signing out: button disabled, text shows "Signing out..."
        - After sign-out (success or failure): navigate to `/sign-in`
      - **Must wrap in try/catch** — navigate regardless of sign-out failure (matching NotReady.tsx pattern):
        ```typescript
        const [signingOut, setSigningOut] = useState(false)

        const handleSignOut = useCallback(async () => {
          setSigningOut(true)
          try {
            await signOut()
          } catch {
            // Navigate even if sign-out fails — user intent is clear
          }
          navigate('/sign-in', { replace: true })
        }, [navigate])
        ```
      - Button: `<Button variant="outline" className="w-full min-h-11" disabled={signingOut} onClick={() => void handleSignOut()}>`
      - Import `useState`, `useCallback` from `react`
      - Pattern reference: `NotReady.tsx` (lines 37-48)
    - **Error state:** If `useAccountProfile` returns error, show retry button (pattern from Overview)
    - **Loading state:** Return `<AccountSettingsSkeleton />` when `isLoading`
    - **Responsive behavior (UX-14):**
      - Desktop (>=1280px): max-w-lg centered, comfortable spacing
      - Small desktop (1024-1279px): same layout, slightly tighter
      - Mobile (<768px): full-width with px-4 padding, all content accessible
      - All breakpoints use same component — Tailwind responsive utilities handle sizing
    - **Accessibility (NFR-A1, NFR-A2):**
      - `<main>` semantic landmark
      - `<h1>` for page title
      - `<section>` for each logical group (profile, actions)
      - All buttons have accessible names
      - Focus indicators via Radix UI (default ring behavior)
      - Tab order: back link → profile info → action buttons → sign out
      - `aria-label` on sections for screen reader context
    - **IMPORTANT:** Use `export default` for `React.lazy()` compatibility. This is the ONE exception to the "named exports only" rule — React.lazy requires default export for route components. Same pattern as all other route files (Overview.tsx, Progress.tsx, etc.)
  - [x] 3.2 Create `apps/webapp/src/routes/AccountSettings.test.tsx`:
    - **CRITICAL: Wrap in BOTH `MemoryRouter` AND `TestProviders`** — `AccountSettings` uses `<Link>` and `useNavigate()` which require Router context. `TestProviders` only provides `QueryClientProvider`, NOT a Router.
    ```tsx
    import { MemoryRouter } from 'react-router'
    import { TestProviders } from '@mycscompanion/config/test-utils/'

    render(
      <MemoryRouter>
        <TestProviders>
          <AccountSettings />
        </TestProviders>
      </MemoryRouter>
    )
    ```
    - Test structure:
    ```typescript
    describe('AccountSettings', () => {
      afterEach(() => {
        vi.restoreAllMocks()
        cleanup()
      })

      describe('when profile loads successfully', () => {
        it('should render display name when present', () => {})
        it('should render email address', () => {})
        it('should render formatted role label', () => {})
        it('should render formatted experience level', () => {})
        it('should render formatted primary language', () => {})
        it('should display "Not set" for null profile fields', () => {})
        it('should render back link to /overview', () => {})
      })

      describe('when loading', () => {
        it('should render AccountSettingsSkeleton', () => {})
      })

      describe('when profile fails to load', () => {
        it('should render error state with retry button', () => {})
      })

      describe('sign out', () => {
        it('should call signOut and navigate to /sign-in', () => {})
        it('should disable button and show "Signing out..." while in progress', () => {})
        it('should navigate to /sign-in even when signOut fails', () => {})
      })

      describe('placeholder actions', () => {
        it('should render disabled "Export My Data" button', () => {})
        it('should render disabled "Delete Account" button', () => {})
        it('should render disabled "Privacy Policy" link', () => {})
        it('should render disabled theme toggle placeholder', () => {})
      })
    })
    ```
    - Mock `useAccountProfile` hook via `vi.mock('../hooks/use-account-profile')`
    - Mock `signOut` from firebase via `vi.mock('../lib/firebase')`
    - Use `vi.fn()` for mocked functions, verify calls with `expect(...).toHaveBeenCalled()`

- [x] Task 4: Register `/settings` route in App.tsx (AC: #2)
  - [x] 4.1 Update `apps/webapp/src/App.tsx`:
    - Add lazy import:
      ```typescript
      const AccountSettings = React.lazy(() => import('./routes/AccountSettings'))
      ```
    - Add route inside `<ProtectedRoute>` block, after `/not-ready`:
      ```tsx
      <Route
        path="/settings"
        element={
          <Suspense fallback={<AccountSettingsSkeleton />}>
            <AccountSettings />
          </Suspense>
        }
      />
      ```
    - Import `AccountSettingsSkeleton`:
      ```typescript
      import { AccountSettingsSkeleton } from './components/settings/AccountSettingsSkeleton'
      ```
    - **Route path:** `/settings` (not `/account/settings` — simpler, consistent with flat route structure)
  - [x] 4.2 Update `apps/webapp/src/App.test.tsx` (if it exists) or verify existing tests still pass

- [x] Task 5: Add settings navigation link to overview and progress pages (AC: #2)
  - [x] 5.1 Update `apps/webapp/src/components/overview/MilestoneStartOverview.tsx`:
    - Add a settings link as the **FIRST child** INSIDE the existing `<div className="w-full max-w-2xl space-y-8">` wrapper. Do NOT add a new div outside the wrapper — that would break the centered layout.
      ```tsx
      {/* Insert as first child of the max-w-2xl div */}
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">mycscompanion</span>
        <Link
          to="/settings"
          className="text-sm text-muted-foreground hover:text-foreground hover:underline"
          aria-label="Account settings"
        >
          Settings
        </Link>
      </div>
      ```
    - **IMPORTANT:** The current component has NO header/nav. This is a minimal top row. Do NOT create a separate Header component — keep it simple, inline. Future epics can add a shared header if patterns warrant it.
    - The existing layout is: `<main className="flex min-h-screen items-center justify-center ..."><div className="w-full max-w-2xl space-y-8">`. The settings link div goes INSIDE the `max-w-2xl` div, not outside it.
  - [x] 5.2 Update `apps/webapp/src/components/overview/MilestoneStartOverview.test.tsx`:
    - `it('should render settings link pointing to /settings')` — verify `<a href="/settings">` with text "Settings"
  - [x] 5.3 Update `apps/webapp/src/components/overview/FirstTimeOverview.tsx`:
    - Add the same settings link pattern as the FIRST child inside its content wrapper div
    - Same pattern as MilestoneStartOverview — `<div className="flex items-center justify-between">` with project name + settings link
  - [x] 5.4 Update `apps/webapp/src/components/overview/FirstTimeOverview.test.tsx`:
    - `it('should render settings link pointing to /settings')`
  - [x] 5.5 Update `apps/webapp/src/components/progress/ProgressView.tsx`:
    - **Target `ProgressView.tsx`, NOT `Progress.tsx`** — `Progress.tsx` is a 1-line wrapper (`return <ProgressView />`)
    - Add settings link at the top of the ProgressView component, same pattern as overview
    - The component already has a "Back to overview" link — add settings link in a top row alongside or near that existing navigation
  - [x] 5.6 Update `apps/webapp/src/components/progress/ProgressView.test.tsx`:
    - `it('should render settings link pointing to /settings')`

- [x] Task 6: Add settings link to WorkspaceTopBar (AC: #2)
  - [x] 6.1 Update `apps/webapp/src/components/workspace/WorkspaceTopBar.tsx`:
    - Add a settings icon/link on the right side of the top bar, before the Run button:
      ```tsx
      import { Settings } from 'lucide-react'
      import { Link } from 'react-router'

      // In the right-side button group, add before Run button:
      <Link
        to="/settings"
        className="inline-flex items-center justify-center rounded-md text-sm font-medium text-muted-foreground hover:text-foreground h-8 w-8"
        aria-label="Account settings"
        title="Account settings"
      >
        <Settings className="size-4" />
      </Link>
      ```
    - **Why icon-only in workspace:** Workspace real estate is precious. A small gear icon is universally understood. The settings link in overview/progress can be text because those pages have more space.
    - Uses `lucide-react` (already a dependency — used for `Play` and `BarChart3` icons in same component)
    - **Note:** WorkspaceTopBar currently has NO `react-router` imports. Adding `Link` is a new dependency for this component. The component is pure props-driven today; this is the first time it gets a router-aware element.
  - [x] 6.2 Update `apps/webapp/src/components/workspace/WorkspaceTopBar.test.tsx`:
    - `it('should render settings link with href /settings and aria-label')` — verify `<a>` element with correct attributes
    - **CRITICAL:** Tests must wrap in `MemoryRouter` since `Link` requires Router context. WorkspaceTopBar tests currently don't use a Router — this must be added.

## Dev Notes

### Architecture Compliance

- **Plugin isolation preserved** — reuses existing `GET /api/account/profile` endpoint. No new backend code needed for this story.
- **No new Zustand stores** — profile data flows through TanStack Query (`useAccountProfile` hook)
- **No cross-plugin imports** — account plugin already handles profile endpoint
- **Named exports only** — all new components use named exports. Exception: `AccountSettings.tsx` route uses `export default` for `React.lazy()` compatibility (same pattern as all other route files)
- **`toCamelCase()` already applied** — `profile.ts` line 24 already converts DB response
- **No new packages** — uses existing `lucide-react`, `@mycscompanion/ui`, `@tanstack/react-query`
- **Dark-first color system (UX-9)** — uses existing Tailwind tokens: `bg-background`, `text-foreground`, `text-muted-foreground`, `border`, etc.
- **Responsive breakpoints (UX-14)** — Tailwind responsive utilities, max-w-lg centered layout works at all 3 breakpoints
- **Accessibility (NFR-A1, NFR-A2)** — semantic HTML, ARIA labels, keyboard navigation via Radix, focus indicators

### Existing Implementation to Build On

| What | Where | Status |
|---|---|---|
| `GET /api/account/profile` endpoint | `apps/backend/src/plugins/account/profile.ts` | Complete — returns full `UserProfile` |
| `UserProfile` type | `packages/shared/src/types/api.ts` lines 16-28 | Complete — includes all needed fields |
| `UserRole`, `ExperienceLevel`, `PrimaryLanguage` types | `packages/shared/src/types/domain.ts` lines 1-3 | Complete — union types for profile fields |
| `signOut()` function | `apps/webapp/src/lib/firebase.ts` line 48 | Complete — reuse for sign-out button |
| `apiFetch` utility | `apps/webapp/src/lib/api-fetch.ts` | Complete — handles auth token, 401 retry |
| Card, Button, Select components | `@mycscompanion/ui/src/components/ui/` | Complete — reuse for settings UI |
| Onboarding form pattern | `apps/webapp/src/routes/Onboarding.tsx` | Complete — reference for display name mappings |
| NotReady sign-out pattern | `apps/webapp/src/routes/NotReady.tsx` lines 37-48 | Complete — reference for sign-out flow |
| WorkspaceTopBar | `apps/webapp/src/components/workspace/WorkspaceTopBar.tsx` | Complete — add settings icon |
| ProtectedRoute | `apps/webapp/src/components/common/ProtectedRoute.tsx` | Complete — guards /settings route |
| `Play`, `BarChart3` lucide icons | `WorkspaceTopBar.tsx` line 2 | Complete — confirms lucide-react available |

### Data Flow

```
Frontend AccountSettings route:
  useAccountProfile() → apiFetch('/api/account/profile')
  → Backend GET /api/account/profile
  → Kysely: db.selectFrom('users').selectAll().where('id', '=', request.uid)
  → toCamelCase(user)
  → Response: UserProfile { email, role, experienceLevel, primaryLanguage, ... }

Frontend renders:
  Profile section: read-only display of email + questionnaire data
  Actions section: disabled buttons for export/delete/privacy (Stories 8.2-8.4)
  Sign out: signOut() → navigate('/sign-in')

Navigation entry points:
  Overview → "Settings" text link (top-right)
  Progress → "Settings" text link (top-right)
  Workspace → Settings gear icon in WorkspaceTopBar
```

### Users Table Schema (for reference)

```sql
-- From migrations 001, 002, 003:
CREATE TABLE users (
  id TEXT PRIMARY KEY,           -- Firebase UID (NOT cuid2)
  email TEXT NOT NULL,
  display_name TEXT,
  role TEXT,                     -- 'backend-engineer' | 'frontend-engineer' | ...
  experience_level TEXT,         -- 'less-than-1' | '1-to-3' | '3-to-5' | '5-plus'
  primary_language TEXT,         -- 'go' | 'python' | 'javascript-typescript' | ...
  onboarding_completed_at TIMESTAMPTZ,
  skill_floor_passed BOOLEAN,
  skill_floor_completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

No migration needed — all columns already exist.

### Previous Story Intelligence (from 7.5)

1. **`Intl.NumberFormat` for number display** — established pattern for formatted numbers. Not directly needed for settings page but good to know for consistency.
2. **`motion-reduce:animate-none`** — respect `prefers-reduced-motion` for ALL animations including `animate-pulse` on skeletons. Apply `motion-reduce:animate-none` to every `animate-pulse` element in `AccountSettingsSkeleton`.
3. **Co-located test files** — `*.test.ts(x)` next to source. Follow this for all new files.
4. **Test determinism** — use fixed data, not `Date.now()`. Apply to profile mock data.
5. **Import test utils from `@mycscompanion/config/test-utils/`** — never create ad-hoc mocks.

### Git Intelligence (Recent Commits)

```
4964fc2 Implement Story 7.5: Progressive Enhancements to Overview & Completion with code review fixes
544d8fa Implement Story 7.4: Benchmark Trajectory Visualization with code review fixes
1f8dfcf Implement Story 7.3: Historical Benchmark Results with code review fixes
71ae75a Implement Story 7.2: Benchmark Results Display with code review fixes
0f8aac2 Implement Story 7.1: Benchmark Runner & Reference Normalization with code review fixes
```

**Patterns established:**
- All route components in `apps/webapp/src/routes/` use `export default` for React.lazy
- Loading skeletons in `apps/webapp/src/components/{feature}/` directory
- TanStack Query hooks in `apps/webapp/src/hooks/use-*.ts`
- Query keys follow `['domain', 'action', params]` convention
- shadcn/ui components imported individually from `@mycscompanion/ui/src/components/ui/`

### Testing Strategy

- **Hook tests:** `apps/webapp/src/hooks/use-account-profile.test.ts` — mock `apiFetch`, verify query key, staleTime, error handling
- **Skeleton tests:** `apps/webapp/src/components/settings/AccountSettingsSkeleton.test.tsx` — verify renders pulse elements
- **Route component tests:** `apps/webapp/src/routes/AccountSettings.test.tsx` — comprehensive tests for all states (loading, loaded, error), profile display, sign-out flow, disabled action buttons
- **Navigation tests:** Update existing overview + progress + workspace tests to verify settings link presence
- **No snapshot tests** — explicit behavioral assertions only
- **Import test utils from `@mycscompanion/config/test-utils/`**
- **Use `vi.fn()`, `vi.mock()`, `vi.restoreAllMocks()` in `afterEach`**

### Component Insertion Guide

```
App.tsx (route registration)
  └── /settings → <AccountSettings /> (lazy loaded with AccountSettingsSkeleton fallback)

AccountSettings.tsx (route component)
  ├── Loading → <AccountSettingsSkeleton />
  ├── Error → <section> with retry button
  └── Loaded →
      ├── Header: "Account Settings" + back link to /overview
      ├── Profile Card: displayName, email, role, experience, language (read-only)
      ├── Preferences Card: theme toggle (disabled, "Coming soon")
      ├── Actions Card: export (disabled), delete (disabled), privacy (disabled)
      └── Sign Out button (with loading state: "Signing out...")

Navigation entry points (settings link as FIRST child INSIDE content wrapper div):
  MilestoneStartOverview.tsx → "Settings" text link (top-right, inside max-w-2xl div)
  FirstTimeOverview.tsx → "Settings" text link (top-right, inside content wrapper)
  ProgressView.tsx → "Settings" text link (top-right, NOT Progress.tsx)
  WorkspaceTopBar.tsx → Settings gear icon (before Run button, first react-router import)
```

### Project Structure Notes

**New files:**
- `apps/webapp/src/hooks/use-account-profile.ts` — TanStack Query hook for profile data
- `apps/webapp/src/hooks/use-account-profile.test.ts` — Hook tests
- `apps/webapp/src/components/settings/AccountSettingsSkeleton.tsx` — Loading skeleton
- `apps/webapp/src/components/settings/AccountSettingsSkeleton.test.tsx` — Skeleton tests
- `apps/webapp/src/routes/AccountSettings.tsx` — Settings page route component
- `apps/webapp/src/routes/AccountSettings.test.tsx` — Route component tests

**Modified files:**
- `apps/webapp/src/App.tsx` — Add `/settings` route with lazy loading
- `apps/webapp/src/components/overview/MilestoneStartOverview.tsx` — Add settings link (first child inside max-w-2xl div)
- `apps/webapp/src/components/overview/MilestoneStartOverview.test.tsx` — Test settings link
- `apps/webapp/src/components/overview/FirstTimeOverview.tsx` — Add settings link
- `apps/webapp/src/components/overview/FirstTimeOverview.test.tsx` — Test settings link
- `apps/webapp/src/components/progress/ProgressView.tsx` — Add settings link (NOT `Progress.tsx` which is a 1-line wrapper)
- `apps/webapp/src/components/progress/ProgressView.test.tsx` — Test settings link
- `apps/webapp/src/components/workspace/WorkspaceTopBar.tsx` — Add settings icon + first react-router import
- `apps/webapp/src/components/workspace/WorkspaceTopBar.test.tsx` — Test settings icon + add MemoryRouter wrapper

**No backend changes** — existing `GET /api/account/profile` endpoint is sufficient.

**All new component files use `PascalCase.tsx`, hooks use `kebab-case.ts`**
**Co-located tests: `*.test.ts(x)` next to source**

### Known Tech Debt

- **Label maps duplication:** `ROLE_LABELS`, `EXPERIENCE_LABELS`, `LANGUAGE_LABELS` duplicate display names from `Onboarding.tsx`'s `<SelectItem>` components. Consider extracting to `@mycscompanion/shared` as constants in a future cleanup. Acceptable for now — keep inline and document sync requirement.
- **ProtectedRoute handles non-onboarded users:** `ProtectedRoute` already redirects to `/onboarding` if questionnaire is incomplete. Users who haven't completed onboarding will never reach `/settings`. However, if a user's profile has null fields for other reasons, the "Not set" display handles it gracefully.

### References

- [Source: _bmad-output/planning-artifacts/epics.md — Epic 8, Story 8.1 acceptance criteria]
- [Source: _bmad-output/planning-artifacts/architecture.md — ARCH-5 account plugin, plugin registration, route patterns]
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md — UX-9 dark-first color system, UX-14 breakpoints]
- [Source: _bmad-output/planning-artifacts/prd.md — FR40-FR42, NFR-A1, NFR-A2]
- [Source: _bmad-output/project-context.md — All project rules and anti-patterns]
- [Source: apps/backend/src/plugins/account/profile.ts — Existing profile endpoint]
- [Source: apps/webapp/src/routes/Onboarding.tsx — Form patterns, display name mappings]
- [Source: apps/webapp/src/routes/NotReady.tsx — Sign-out pattern]
- [Source: packages/shared/src/types/api.ts — UserProfile type definition]
- [Source: packages/shared/src/types/domain.ts — UserRole, ExperienceLevel, PrimaryLanguage types]
- [Source: apps/webapp/src/components/workspace/WorkspaceTopBar.tsx — Navigation icon pattern]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6

### Debug Log References

None

### Completion Notes List

- Task 1: Created `useAccountProfile` TanStack Query hook with 5-min staleTime, reusing existing `GET /api/account/profile` endpoint. Tests verify success and error states.
- Task 2: Created `AccountSettingsSkeleton` with purpose-built pulse animation skeleton. All pulse elements include `motion-reduce:animate-none`. Tests verify rendering and accessibility.
- Task 3: Created `AccountSettings` route component with profile display (formatted labels for role, experience, language), error/loading states, sign-out flow (matching NotReady.tsx pattern), and disabled placeholder actions for Stories 8.2-8.4. Comprehensive tests cover all states and interactions.
- Task 4: Registered `/settings` route in App.tsx with lazy loading and `AccountSettingsSkeleton` fallback. No App.test.tsx exists; verified via full test suite.
- Task 5: Added "Settings" link to MilestoneStartOverview, FirstTimeOverview, and ProgressView as first child inside content wrapper divs. Tests added for all three.
- Task 6: Added Settings gear icon (`lucide-react`) to WorkspaceTopBar before Run button. First `react-router` import for this component. Updated WorkspaceTopBar tests with MemoryRouter wrapper. Also updated WorkspaceLayout tests with MemoryRouter wrapper since WorkspaceTopBar now uses `Link`.

### Change Log

- 2026-03-12: Implemented Story 8.1 — Account Settings Page with all 6 tasks complete
- 2026-03-12: Code review — fixed 6 issues (1 HIGH, 4 MEDIUM, 1 LOW): removed double-render in loading test, removed unnecessary optional chaining on narrowed `data`, added explicit `!data` guard for type safety, improved component type annotation, added missing `vi.restoreAllMocks()` in skeleton test, removed redundant `mockReset()`

### File List

**New files:**
- `apps/webapp/src/hooks/use-account-profile.ts`
- `apps/webapp/src/hooks/use-account-profile.test.ts`
- `apps/webapp/src/components/settings/AccountSettingsSkeleton.tsx`
- `apps/webapp/src/components/settings/AccountSettingsSkeleton.test.tsx`
- `apps/webapp/src/routes/AccountSettings.tsx`
- `apps/webapp/src/routes/AccountSettings.test.tsx`

**Modified files:**
- `apps/webapp/src/App.tsx` — added /settings route with lazy loading
- `apps/webapp/src/components/overview/MilestoneStartOverview.tsx` — added settings link
- `apps/webapp/src/components/overview/MilestoneStartOverview.test.tsx` — added settings link test
- `apps/webapp/src/components/overview/FirstTimeOverview.tsx` — added settings link
- `apps/webapp/src/components/overview/FirstTimeOverview.test.tsx` — added settings link test
- `apps/webapp/src/components/progress/ProgressView.tsx` — added settings link
- `apps/webapp/src/components/progress/ProgressView.test.tsx` — added settings link test
- `apps/webapp/src/components/workspace/WorkspaceTopBar.tsx` — added settings icon link
- `apps/webapp/src/components/workspace/WorkspaceTopBar.test.tsx` — added settings icon test, added MemoryRouter
- `apps/webapp/src/components/workspace/WorkspaceLayout.test.tsx` — added MemoryRouter wrapper for all renders
