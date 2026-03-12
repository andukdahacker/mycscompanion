# Story 8.4: Privacy Policy Page

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a visitor,
I want to read the privacy policy before or after signing up,
so that I understand how my data is collected, used, and protected.

## Acceptance Criteria

1. Given a visitor or logged-in user navigates to the privacy policy, when the page loads, then a privacy policy page is displayed describing data collection practices, data usage, data retention, third-party services (Firebase Auth, Anthropic, Sentry), and user rights (export, deletion) (FR42)
2. And the page is accessible without authentication — no login required
3. And the page is linked from the signup flow (Story 2.2) and account settings (Story 8.1)
4. And the page uses dark-first styling consistent with the app (UX-9)
5. And the page is responsive across all breakpoints (UX-14)
6. And the page meets accessibility standards — proper heading hierarchy, readable text, keyboard navigable (NFR-A1)

## Tasks / Subtasks

- [x] Task 1: Create PrivacyPolicy route component (AC: #1, #4, #5, #6)
  - [x] 1.1 Create `apps/webapp/src/routes/PrivacyPolicy.tsx`:
    - Static content page — only hook is `useAuth` for conditional back-link. No API calls, no state management.
    - **Export:** Use **named export** `export { PrivacyPolicy }`. This is a public route with direct import in App.tsx — same pattern as `SignIn`, `SignUp`, `Onboarding`, `NotReady` (all use named exports with direct imports). Only lazy-loaded protected routes use default exports.
    - **Structure with proper heading hierarchy (AC #6):**
      ```
      h1: Privacy Policy
        h2: Information We Collect
        h2: How We Use Your Information
        h2: Third-Party Services
        h2: Data Retention
        h2: Your Rights
        h2: Data Security
        h2: Changes to This Policy
        h2: Contact Us
      ```
    - **Content must cover (AC #1 / FR42):**
      - **Information We Collect:** Account info (email, display name via Firebase Auth), background questionnaire responses (role, experience level, primary language), code submissions (Go source code), benchmark results, AI tutor conversations, session data (code snapshots, session summaries), learning progress (milestone completion)
      - **How We Use Your Information:** Providing the learning platform, tracking progress, AI tutor interactions, performance benchmarking, improving the service
      - **Third-Party Services (explicit per AC):**
        - Firebase Auth — authentication and session management
        - Anthropic API — AI tutor (Haiku 4.5 / Sonnet 4.6) — conversation content sent for responses
        - Sentry — error tracking (platform errors only, never user code content)
        - Fly.io — code execution environment (user Go code runs in isolated VMs)
      - **Data Retention:** Data retained while account is active. Deleted upon account deletion request (Story 8.3).
      - **Your Rights:** Export all data (Story 8.2 — JSON archive), delete account and all data (Story 8.3 — irreversible, immediate), access account settings to view profile information
      - **Data Security:** HTTPS in transit, PostgreSQL with parameterized queries, Firebase Auth tokens, isolated code execution environments
      - **Cookies:** Essential cookies only (Firebase Auth session) — no tracking cookies, no analytics cookies, no cookie consent banner needed
    - **Styling (AC #4, #5) — use manual Tailwind utilities (do NOT install `@tailwindcss/typography`):**
      - Same page container pattern as AccountSettings: `<main className="flex min-h-screen items-start justify-center bg-background px-4 py-12">`
      - Max-width container for readability: `max-w-2xl` (wider than AccountSettings `max-w-lg` since this is long-form text)
      - Section spacing: `space-y-8` between h2 sections
      - Headings: `text-lg font-semibold text-foreground` for h2
      - Body text: `text-sm text-muted-foreground leading-relaxed`
      - Lists: `list-disc pl-6 text-sm text-muted-foreground space-y-1` (same as DeleteAccountDialog data list)
      - Responsive text sizing — readable on mobile without horizontal scroll
    - **Navigation:**
      - Use `useAuth` hook (`import { useAuth } from '../hooks/use-auth'`) to determine auth state
      - If `user` is non-null → show `<Link to="/settings">Back to settings</Link>`
      - If `user` is null and `loading` is false → show `<Link to="/sign-up">Back to sign up</Link>`
      - While `loading` is true → show nothing (prevents flash of wrong link)
      - Link styling: `text-sm text-muted-foreground hover:underline` (same as AccountSettings "Back to overview" link)
    - **Last updated date** — hardcoded in component: `"Last updated: March 2026"` (static content, no dynamic date needed)

- [x] Task 2: Register route in App.tsx (AC: #2)
  - [x] 2.1 Update `apps/webapp/src/App.tsx`:
    - Add **direct import** (NOT lazy-loaded — matches SignIn/SignUp/Onboarding/NotReady pattern for public routes):
      ```typescript
      import { PrivacyPolicy } from './routes/PrivacyPolicy'
      ```
    - Add as a **PUBLIC route** (outside `<ProtectedRoute>` wrapper), alongside `/sign-in` and `/sign-up`:
      ```tsx
      {/* Public routes */}
      <Route path="/sign-in" element={<SignIn />} />
      <Route path="/sign-up" element={<SignUp />} />
      <Route path="/privacy" element={<PrivacyPolicy />} />
      ```
    - **Route path:** `/privacy` — short, clean, standard convention
    - **Public route** — NOT inside `<ProtectedRoute>`. This is critical for AC #2 (accessible without authentication).
    - **No Suspense/lazy needed** — this is a static content component with no dynamic imports. Direct import like SignIn/SignUp keeps it simple and consistent with the public route pattern.
    - **No skeleton component needed** — pure static content, no data fetching.

- [x] Task 3: Link from SignUp page (AC: #3)
  - [x] 3.1 Update `apps/webapp/src/routes/SignUp.tsx`:
    - Add a privacy policy link below the "Already have an account? Sign in" text (line 254-259):
      ```tsx
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
      ```
    - **Placement:** Below the sign-in link, before the closing `</CardContent>`. Standard signup page pattern — privacy link near the action button.
    - **`Link` (not `<a>`)** — internal SPA navigation, not an external URL
    - **Styling:** Same `text-body-sm text-muted-foreground` as surrounding text. Link itself matches the "Sign in" link style.

- [x] Task 4: Link from AccountSettings page (AC: #3)
  - [x] 4.1 Update `apps/webapp/src/routes/AccountSettings.tsx`:
    - **Replace the disabled placeholder button** at lines 203-205. Current code:
      ```tsx
      <Button variant="outline" className="w-full" disabled>
        Privacy Policy (Coming soon)
      </Button>
      ```
    - Replace with `asChild` pattern (Button renders as Link — idiomatic shadcn/ui via Radix Slot):
      ```tsx
      <Button variant="outline" className="w-full" asChild>
        <Link to="/privacy">Privacy Policy</Link>
      </Button>
      ```
    - **`asChild` is confirmed supported** — `packages/ui/src/components/ui/button.tsx` imports `Slot` from `radix-ui` and uses `Slot.Root` when `asChild=true`. Already used in `alert-dialog.tsx` and `dialog.tsx`.
    - **IMPORTANT for tests:** With `asChild`, the rendered DOM element is an `<a>` tag (from `Link`), NOT a `<button>`. Tests must use `screen.getByRole('link')`, not `screen.getByRole('button')`.
    - **`Link` is already imported** in AccountSettings (line 2: `import { useNavigate, Link } from 'react-router'`)

- [x] Task 5: Create PrivacyPolicy tests (AC: #1, #2, #4, #5, #6)
  - [x] 5.1 Create `apps/webapp/src/routes/PrivacyPolicy.test.tsx`:
    - **Mock `useAuth` hook** — test both authenticated and unauthenticated states:
      ```typescript
      const mockUseAuth = vi.fn()
      vi.mock('../hooks/use-auth', () => ({
        useAuth: () => mockUseAuth(),
      }))
      ```
    - **Tests:**
      - `it('should render the Privacy Policy heading')` — `screen.getByRole('heading', { name: /privacy policy/i, level: 1 })`
      - `it('should render all required content sections')` — verify h2 headings exist: Information We Collect, How We Use Your Information, Third-Party Services, Data Retention, Your Rights, Data Security
      - `it('should mention Firebase Auth as a third-party service')` — `screen.getByText(/firebase/i)`
      - `it('should mention Anthropic as a third-party service')` — `screen.getByText(/anthropic/i)`
      - `it('should mention Sentry as a third-party service')` — `screen.getByText(/sentry/i)`
      - `it('should mention data export rights')` — `screen.getByText(/export/i)`
      - `it('should mention account deletion rights')` — `screen.getByText(/delet/i)`
      - `it('should show "Back to settings" link when user is authenticated')`
      - `it('should show "Back to sign up" link when user is not authenticated')`
      - `it('should have proper heading hierarchy')` — query all headings, verify h1 before h2s
    - **Render with `MemoryRouter`** — no `TestProviders` needed (no TanStack Query usage). But if `useAuth` internally uses context, wrap with appropriate provider.
    - **Use `it()`, never `test()`**
    - **Use `vi.restoreAllMocks()` in `afterEach`**
    - **No snapshot tests** — explicit behavioral assertions only

- [x] Task 6: Update AccountSettings tests (AC: #3)
  - [x] 6.1 Update `apps/webapp/src/routes/AccountSettings.test.tsx`:
    - **Replace existing test** at lines 241-245:
      ```typescript
      it('should render disabled "Privacy Policy" link', () => {
        renderComponent()
        const button = screen.getByText('Privacy Policy (Coming soon)')
        expect(button.closest('button')?.disabled).toBe(true)
      })
      ```
    - **New test:**
      ```typescript
      it('should render enabled "Privacy Policy" link to /privacy', () => {
        renderComponent()
        const link = screen.getByRole('link', { name: /privacy policy/i })
        expect(link.getAttribute('href')).toBe('/privacy')
      })
      ```
    - The test changes from checking for a disabled button to checking for an enabled link to `/privacy`

- [x] Task 7: Add privacy link test to SignUp.test.tsx (AC: #3)
  - [x] 7.1 Update `apps/webapp/src/routes/SignUp.test.tsx`:
    - File exists with 18 tests. Uses `renderSignUp()` helper with `MemoryRouter` + `Routes` (routes: `/sign-up`, `/sign-in`, `/overview`, `/onboarding`). Add `/privacy` route to the MemoryRouter's Routes for link resolution.
    - Mock setup: `mockUseAuth.mockReturnValue({ user: null, loading: false })` before rendering.
    - Add test in the main `describe('SignUp')` block:
      ```typescript
      it('should render privacy policy link', () => {
        mockUseAuth.mockReturnValue({ user: null, loading: false })
        renderSignUp()
        const link = screen.getByRole('link', { name: /privacy policy/i })
        expect(link.getAttribute('href')).toBe('/privacy')
      })
      ```
    - **Update `renderSignUp()` helper** to include a `/privacy` route in the `<Routes>`:
      ```tsx
      <Route path="/privacy" element={<div>Privacy Page</div>} />
      ```

## Dev Notes

### Architecture Compliance

- **Public route in webapp** — PrivacyPolicy is a public route (like `/sign-in`, `/sign-up`), NOT behind `<ProtectedRoute>`. This satisfies AC #2 (accessible without authentication).
- **Why webapp, not Astro website?** The Astro website (`apps/website`) is currently just a placeholder landing page. Both the signup page and account settings page (which need to link to privacy policy) are in the webapp. Using an internal `Link` component for SPA navigation is simpler and more reliable than cross-domain navigation to the Astro app. When Epic 9 builds out the website, the privacy policy can be duplicated or moved there.
- **No new Zustand stores** — page is pure static content, no state management needed
- **Named export with direct import** — public routes (SignIn, SignUp, Onboarding, NotReady) use named exports with direct imports. Only lazy-loaded protected routes (Workspace, Overview, etc.) use default exports for `React.lazy()`. PrivacyPolicy is a public route → named export.
- **No new packages** — do NOT install `@tailwindcss/typography`. Use manual Tailwind utilities for text styling.
- **No API calls** — pure static content. No backend changes needed.
- **No database changes** — no migrations, no new tables.

### Existing Implementation to Build On

| What | Where | Status |
|---|---|---|
| App.tsx router | `apps/webapp/src/App.tsx` | Add public `/privacy` route |
| SignUp page | `apps/webapp/src/routes/SignUp.tsx` | Add privacy policy link after "Sign in" link |
| AccountSettings | `apps/webapp/src/routes/AccountSettings.tsx` | Replace disabled button with `asChild` Link |
| `useAuth` hook | `apps/webapp/src/hooks/use-auth.ts` | Use for conditional back-link display |
| Button component | `@mycscompanion/ui/src/components/ui/button` | Already supports `asChild` prop via Radix Slot |
| SignIn page | `apps/webapp/src/routes/SignIn.tsx` | Reference for public route pattern |

### Data Flow

```
No data flow — this is a static content page.

Navigation paths:
  /sign-up → "Privacy Policy" link → /privacy (public, no auth)
  /settings → "Privacy Policy" button → /privacy (authenticated, but route is public)
  /privacy → "Back to sign up" (if unauthenticated)
  /privacy → "Back to settings" (if authenticated)
```

### Content Sections Required (FR42)

The privacy policy must describe:
1. **Data collection:** What personal data is collected and how
2. **Data usage:** How collected data is used
3. **Data retention:** How long data is kept
4. **Third-party services:** Firebase Auth, Anthropic API, Sentry, Fly.io
5. **User rights:** Export (Story 8.2), deletion (Story 8.3)
6. **Cookies:** Essential only (Firebase Auth session) — no tracking

### Security Considerations

- **No auth required** — the route is public by design (AC #2)
- **No user data displayed** — pure static content, no PII exposure risk
- **No API calls** — no attack surface
- **XSS safe** — static JSX content, no dangerouslySetInnerHTML, no dynamic content injection

### Previous Story Intelligence (from 8.3)

1. **Public routes use named exports** — SignIn, SignUp, Onboarding, NotReady all use named exports with direct imports. Only lazy-loaded protected routes use default exports. PrivacyPolicy follows the public route pattern.
2. **`Link` is already imported** in AccountSettings — no new import needed for the privacy link
3. **Button `asChild` pattern** — shadcn/ui Button supports `asChild` for rendering as a different element (Radix Slot). Use this for the button-styled link in AccountSettings.
4. **Test patterns** — AccountSettings tests use `MemoryRouter` + `TestProviders` wrapper, `vi.mock` for hooks, `userEvent` for interactions, `screen.getByRole` for queries.
5. **Placeholder button pattern** — the "Privacy Policy (Coming soon)" button follows the same pattern as the previously-disabled "Delete Account (Coming soon)" button that was replaced in Story 8.3. Same replacement approach applies.
6. **`useAuth` hook** — already used across the app for auth state. Import from `../hooks/use-auth`.

### Git Intelligence (Recent Commits)

```
24c7ab1 Implement Story 8.3: Account Deletion with code review fixes
e71145c Implement Story 8.2: Data Export with code review fixes
4af2625 Implement Story 8.1: Account Settings Page with code review fixes
```

**Patterns established:**
- Route components at `apps/webapp/src/routes/` — public routes use named exports (direct import), protected routes use default exports (React.lazy)
- Tests co-located as `*.test.tsx` next to source
- AccountSettings has placeholder buttons that get replaced in subsequent stories
- Public routes (`/sign-in`, `/sign-up`) are outside `<ProtectedRoute>` in App.tsx

### Testing Strategy

- **Route component tests (PrivacyPolicy.test.tsx):** Verify all content sections render, heading hierarchy is correct, third-party services are mentioned, user rights are described, conditional back-link based on auth state.
- **AccountSettings test update:** Replace disabled button test with enabled link test.
- **SignUp test update:** Verify privacy policy link renders with correct href.
- **No backend tests** — no backend changes in this story.
- **No snapshot tests** — explicit behavioral assertions only.
- **No E2E tests** — static content page doesn't warrant Playwright tests.

### Project Structure Notes

**New files:**
- `apps/webapp/src/routes/PrivacyPolicy.tsx` — Privacy policy page component
- `apps/webapp/src/routes/PrivacyPolicy.test.tsx` — Privacy policy tests

**Modified files:**
- `apps/webapp/src/App.tsx` — Add `/privacy` public route with direct import
- `apps/webapp/src/routes/SignUp.tsx` — Add privacy policy link
- `apps/webapp/src/routes/AccountSettings.tsx` — Replace disabled button with `asChild` Link
- `apps/webapp/src/routes/AccountSettings.test.tsx` — Update placeholder test to link test
- `apps/webapp/src/routes/SignUp.test.tsx` — Add privacy link test, update `renderSignUp()` helper routes

**All component files use `PascalCase.tsx`, co-located tests use `*.test.tsx`**

### References

- [Source: _bmad-output/planning-artifacts/epics.md — Epic 8, Story 8.4 acceptance criteria]
- [Source: _bmad-output/planning-artifacts/prd.md — FR42: Visitor can view a privacy policy page describing data collection and usage]
- [Source: _bmad-output/planning-artifacts/prd.md — GDPR consideration: FR40 (deletion), FR41 (export), FR42 (privacy policy)]
- [Source: _bmad-output/planning-artifacts/prd.md — No cookie consent banner needed — only essential cookies (Firebase Auth session)]
- [Source: _bmad-output/project-context.md — All project rules, testing rules, anti-patterns]
- [Source: apps/webapp/src/App.tsx — Router config: public routes outside ProtectedRoute, lazy loading pattern]
- [Source: apps/webapp/src/routes/AccountSettings.tsx — Disabled "Privacy Policy (Coming soon)" button (lines 203-205)]
- [Source: apps/webapp/src/routes/AccountSettings.test.tsx — Placeholder test for privacy button (lines 241-245)]
- [Source: apps/webapp/src/routes/SignUp.tsx — Sign-in link pattern (lines 254-259), no existing privacy link]
- [Source: apps/webapp/src/routes/SignIn.tsx — Public route component pattern]
- [Source: apps/webapp/src/hooks/use-auth.ts — Auth state hook for conditional rendering]
- [Source: _bmad-output/implementation-artifacts/8-3-account-deletion.md — Previous story patterns and learnings]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6

### Debug Log References

None — clean implementation, no blocking issues.

### Completion Notes List

- Task 1: Created PrivacyPolicy.tsx with all 8 content sections (Information We Collect, How We Use, Third-Party Services, Data Retention, Your Rights, Data Security, Changes, Contact Us). Conditional back-link via useAuth. Manual Tailwind styling matching AccountSettings pattern.
- Task 2: Registered /privacy as public route in App.tsx with direct import (matches SignIn/SignUp pattern).
- Task 3: Added "By creating an account, you agree to our Privacy Policy" link in SignUp.tsx below the sign-in link.
- Task 4: Replaced disabled "Privacy Policy (Coming soon)" button with asChild Link to /privacy in AccountSettings.tsx.
- Task 5: Created 11 tests in PrivacyPolicy.test.tsx — content sections, third-party services, user rights, auth-conditional navigation, heading hierarchy.
- Task 6: Updated AccountSettings.test.tsx — replaced disabled button test with enabled link test verifying href="/privacy".
- Task 7: Added privacy policy link test to SignUp.test.tsx and /privacy route to renderSignUp() helper.
- All 671 webapp tests pass. Zero regressions. Typecheck clean. Lint clean (pre-existing AccountSettings default export lint note for React.lazy compatibility).

### Change Log

- 2026-03-12: Implemented Story 8.4 — Privacy Policy Page (all 7 tasks complete)
- 2026-03-12: Code review fixes — Added missing Cookies section (FR42), added Fly.io and Cookies tests, expanded section coverage assertions, moved afterEach inside describe

### File List

**New files:**
- `apps/webapp/src/routes/PrivacyPolicy.tsx`
- `apps/webapp/src/routes/PrivacyPolicy.test.tsx`

**Modified files:**
- `apps/webapp/src/App.tsx`
- `apps/webapp/src/routes/SignUp.tsx`
- `apps/webapp/src/routes/AccountSettings.tsx`
- `apps/webapp/src/routes/AccountSettings.test.tsx`
- `apps/webapp/src/routes/SignUp.test.tsx`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`
