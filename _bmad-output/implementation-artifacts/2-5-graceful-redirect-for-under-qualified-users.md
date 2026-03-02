# Story 2.5: Graceful Redirect for Under-Qualified Users

Status: done

<!-- When this story contradicts project-context.md, project-context.md is authoritative. -->

## Story

As an **under-qualified user**,
I want to receive helpful guidance on where to build prerequisite skills,
So that I can return when I'm ready rather than hitting a dead end.

## Acceptance Criteria

1. **Given** a user has not passed the skill floor assessment **When** they see the redirect page **Then** they receive a non-patronizing message explaining the prerequisite knowledge expected (FR31).
2. **And** the page lists specific alternative learning resources (courses, tutorials, books) relevant to their gaps.
3. **And** the tone is encouraging and constructive — no "you failed" language, consistent with workshop atmosphere (UX-5).
4. **And** there is no dead end — users can bookmark and return later.
5. **And** FR32 (email capture for re-engagement notification) is explicitly deferred to Growth phase and NOT implemented.
6. **And** the page is responsive and accessible (UX-14, NFR-A1, NFR-A2).

## Tasks / Subtasks

- [x] Task 1: Create NotReady route component (AC: #1, #2, #3, #4, #6)
  - [x] 1.1 Create `apps/webapp/src/routes/NotReady.tsx`:

    **Imports:**
    ```typescript
    import { useCallback } from 'react'
    import { useNavigate } from 'react-router'
    import { signOut } from '../lib/firebase'
    import { Button } from '@mycscompanion/ui/src/components/ui/button'
    import { Card, CardContent, CardHeader } from '@mycscompanion/ui/src/components/ui/card'
    ```

    **Component structure:**
    ```typescript
    export function NotReady(): React.ReactElement {
      const navigate = useNavigate()

      const handleSignOut = useCallback(async () => {
        await signOut()
        navigate('/sign-in', { replace: true })
      }, [navigate])

      return (
        <div className="flex min-h-screen items-center justify-center bg-background px-4">
          <Card className="w-full max-w-lg">
            <CardHeader>
              <h1 className="text-2xl font-semibold leading-none">
                Go might be new territory — and that's totally fine
              </h1>
              <p className="text-muted-foreground">
                mycscompanion assumes you can already read basic code — loops,
                conditionals, and functions. A few focused weeks of study will get
                you there.
              </p>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Resource list */}
              <section aria-labelledby="resources-heading">
                <h2 id="resources-heading" className="mb-3 text-lg font-medium">
                  Recommended starting points
                </h2>
                <ul className="space-y-3">
                  {RESOURCES.map((r) => (
                    <li key={r.href}>
                      <a
                        href={r.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="group block rounded-md bg-muted p-3 transition-colors hover:bg-muted/80"
                      >
                        <span className="font-medium text-foreground group-hover:underline">
                          {r.title}
                        </span>
                        <span className="mt-0.5 block text-sm text-muted-foreground">
                          {r.description}
                        </span>
                      </a>
                    </li>
                  ))}
                </ul>
              </section>

              {/* Return message */}
              <p className="text-sm text-muted-foreground">
                Bookmark this page and come back anytime — your account stays
                active and we'll be here when you're ready.
              </p>

              {/* Sign out */}
              <Button
                variant="outline"
                className="min-h-11 w-full"
                onClick={handleSignOut}
              >
                Sign out
              </Button>
            </CardContent>
          </Card>
        </div>
      )
    }
    ```

  - [x] 1.2 Define the resources constant in the same file (above the component):
    ```typescript
    interface Resource {
      readonly title: string
      readonly description: string
      readonly href: string
    }

    const RESOURCES: readonly Resource[] = [
      {
        title: 'A Tour of Go',
        description: 'The official interactive Go tutorial — covers all the fundamentals in your browser.',
        href: 'https://go.dev/tour/',
      },
      {
        title: 'Go by Example',
        description: 'Annotated code examples for every core concept, from hello-world to concurrency.',
        href: 'https://gobyexample.com/',
      },
      {
        title: 'The Go Programming Language (book)',
        description: 'Thorough reference by Donovan & Kernighan. Chapters 1-5 cover everything you need.',
        href: 'https://www.gopl.io/',
      },
      {
        title: 'Codecademy: Learn Go',
        description: 'Structured interactive course if you prefer step-by-step lessons.',
        href: 'https://www.codecademy.com/learn/learn-go',
      },
    ]
    ```
    - Resources are specific, actionable, and free or widely accessible
    - Ordered from quickest-start (interactive tour) to deepest (book)
    - External links open in new tab (`target="_blank"`, `rel="noopener noreferrer"`)

  - [x] 1.3 UX compliance checklist:
    - Title: "Go might be new territory — and that's totally fine" — no "failed"/"wrong"/"sorry" language (UX-5)
    - Subtitle explains what prerequisites are expected — loops, conditionals, functions
    - Tone: mentorship, not rejection — "A few focused weeks of study will get you there"
    - Resources section uses `aria-labelledby` for screen readers
    - Return message: "Bookmark this page and come back anytime" — no dead end (AC #4)
    - Sign out button: clear exit path, `min-h-11` (44px touch target)
    - Dark-first design using `bg-background`, `bg-card`, `bg-muted`, `text-foreground`, `text-muted-foreground`
    - Responsive: `max-w-lg` + `px-4` padding, works at all breakpoints
    - NO email capture field (FR32 deferred to Growth — AC #5)

- [x] Task 2: Update App.tsx routing (AC: #1)
  - [x] 2.1 In `apps/webapp/src/App.tsx`, add direct import at top with other route imports (matches existing `SignIn`, `SignUp`, `Onboarding` pattern — routes are NOT lazy-loaded):
      ```typescript
      import { NotReady } from './routes/NotReady'
      ```

  - [x] 2.2 Replace the inline `NotReadyPlaceholder` component:
    - Remove the `NotReadyPlaceholder` function entirely
    - Update the route to use the new component:
      ```tsx
      <Route path="/not-ready" element={<NotReady />} />
      ```

- [x] Task 3: Write frontend tests (AC: #1, #2, #3, #4, #5, #6)
  - [x] 3.1 Create `apps/webapp/src/routes/NotReady.test.tsx`:

    **Test setup:**
    ```typescript
    import { render, screen } from '@testing-library/react'
    import userEvent from '@testing-library/user-event'
    import { MemoryRouter } from 'react-router'
    import { vi, describe, it, expect, afterEach } from 'vitest'

    const mockNavigate = vi.fn()
    vi.mock('react-router', async () => {
      const actual = await vi.importActual('react-router')
      return { ...actual, useNavigate: () => mockNavigate }
    })

    const mockSignOut = vi.fn().mockResolvedValue(undefined)
    vi.mock('../lib/firebase', () => ({
      signOut: () => mockSignOut(),
    }))

    const { NotReady } = await import('./NotReady')
    ```

    **Test cases:**
    ```typescript
    describe('NotReady', () => {
      afterEach(() => {
        vi.restoreAllMocks()
      })

      function renderNotReady(): void {
        render(
          <MemoryRouter initialEntries={['/not-ready']}>
            <NotReady />
          </MemoryRouter>
        )
      }

      it('should render encouraging heading without rejection language', () => {
        renderNotReady()
        expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
          /go might be new territory/i
        )
        // Verify no rejection language
        const pageText = document.body.textContent ?? ''
        expect(pageText).not.toMatch(/\bfailed\b/i)
        expect(pageText).not.toMatch(/\bincorrect\b/i)
        expect(pageText).not.toMatch(/\bwrong\b/i)
        expect(pageText).not.toMatch(/\bsorry\b/i)
      })

      it('should render specific alternative learning resources with external links', () => {
        renderNotReady()
        const links = screen.getAllByRole('link')
        expect(links.length).toBeGreaterThanOrEqual(3)
        for (const link of links) {
          expect(link).toHaveAttribute('target', '_blank')
          expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'))
        }
      })

      it('should render A Tour of Go as first resource', () => {
        renderNotReady()
        expect(screen.getByRole('link', { name: /a tour of go/i })).toHaveAttribute(
          'href',
          'https://go.dev/tour/'
        )
      })

      it('should render bookmark/return message', () => {
        renderNotReady()
        expect(screen.getByText(/bookmark this page/i)).toBeInTheDocument()
        expect(screen.getByText(/come back anytime/i)).toBeInTheDocument()
      })

      it('should render sign out button with 44px minimum touch target', () => {
        renderNotReady()
        const signOutButton = screen.getByRole('button', { name: /sign out/i })
        expect(signOutButton).toBeInTheDocument()
        expect(signOutButton.className).toContain('min-h-11')
      })

      it('should sign out and navigate to /sign-in on sign out click', async () => {
        const user = userEvent.setup()
        renderNotReady()
        await user.click(screen.getByRole('button', { name: /sign out/i }))
        expect(mockSignOut).toHaveBeenCalledOnce()
        expect(mockNavigate).toHaveBeenCalledWith('/sign-in', { replace: true })
      })

      it('should not render any email capture elements (FR32 deferred)', () => {
        renderNotReady()
        expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
        expect(screen.queryByLabelText(/email/i)).not.toBeInTheDocument()
      })

      it('should have accessible resources section with aria-labelledby', () => {
        renderNotReady()
        const heading = screen.getByText(/recommended starting points/i)
        expect(heading).toHaveAttribute('id', 'resources-heading')
        const section = heading.closest('section')
        expect(section).toHaveAttribute('aria-labelledby', 'resources-heading')
      })
    })
    ```

  - [x] 3.2 Testing patterns (carry forward from Story 2.4):
    - `MemoryRouter` from `'react-router'` (not `react-router-dom`) for test routing
    - `vi.mock()` at top-level, then dynamic import for actuals
    - `afterEach(() => vi.restoreAllMocks())` always
    - `it()` not `test()`, names describe behavior
    - No `any` type — including test files
    - No snapshot tests — explicit behavioral assertions

## Dev Notes

### Critical Architecture Patterns

- **Frontend-only story.** No backend changes, no database migrations, no new API endpoints. All routing gates already work from Story 2.4.
- **Replace inline placeholder, not create from scratch.** Story 2.4 created `NotReadyPlaceholder` inline in `App.tsx`. This story replaces it with a proper route component at `apps/webapp/src/routes/NotReady.tsx`.
- **ProtectedRoute gate is ALREADY IMPLEMENTED.** The `OnboardingGate` in `ProtectedRoute.tsx` already handles: `assessmentFailed → /not-ready`, non-failed users blocked from `/not-ready`. Do NOT modify `ProtectedRoute.tsx`.
- **useOnboardingStatus hook is ALREADY IMPLEMENTED.** Returns `assessmentFailed: boolean`. Do NOT modify the hook.
- **No email capture.** FR32 is explicitly deferred to Growth phase. Do NOT implement email input, form submission, or any re-engagement notification feature.
- **Named exports only.** `export function NotReady()` — never default export.
- **No `@/` import aliases** — relative paths within apps.
- **No `any` type** — including test files.
- **`readonly` on interface fields** for shared data.
- **State management:** This component uses minimal React state (only for sign-out loading if needed). No Zustand, no TanStack Query — this is a static page with a sign-out action.
- **`signOut` from `../lib/firebase`** — use the local wrapper function (takes no arguments). Do NOT import `signOut` from `firebase/auth` directly — the wrapper in `firebase.ts` already handles the `auth` instance internally.
- **`CardTitle` renders a `<div>`, not a heading.** Use an explicit `<h1>` element for the page title to ensure proper heading semantics and accessibility. Do NOT rely on `CardTitle` for heading role.

### Existing Files That Handle Routing (DO NOT MODIFY)

| File | Role | Story 2.4 Status |
|---|---|---|
| `apps/webapp/src/components/common/ProtectedRoute.tsx` | Gates failed users to `/not-ready`, blocks non-failed from `/not-ready` | Complete — do NOT modify |
| `apps/webapp/src/hooks/use-onboarding-status.ts` | Returns `assessmentFailed: boolean` based on profile | Complete — do NOT modify |
| `apps/webapp/src/routes/Onboarding.tsx` | Redirects failed users to `/not-ready` after assessment | Complete — do NOT modify |
| `apps/backend/src/plugins/account/skill-assessment.ts` | `POST /api/account/skill-assessment` | Complete — do NOT modify |
| `apps/backend/src/plugins/account/profile.ts` | Returns `skillFloorPassed` via `selectAll()` | Complete — do NOT modify |

### Files to CREATE

| File | Purpose |
|---|---|
| `apps/webapp/src/routes/NotReady.tsx` | Graceful redirect page component |
| `apps/webapp/src/routes/NotReady.test.tsx` | Component tests |

### Files to MODIFY

| File | Change |
|---|---|
| `apps/webapp/src/App.tsx` | Remove `NotReadyPlaceholder`, import `NotReady`, update route element |

### UX Tone Requirements (MANDATORY)

From UX spec Flow 5 and emotional design principles:

**NEVER use these words on the page:**
- "failed", "fail", "failure"
- "incorrect", "wrong"
- "sorry", "unfortunately"
- "rejected", "denied"
- "test", "exam", "quiz" (in reference to the assessment)

**Target emotional tone:**
- "Respected and guided" — per UX emotional journey table
- "This isn't rejection, it's direction" — design goal
- Mentorship framing: "Here's a great path. Come back when you're ready."
- Workshop atmosphere (UX-5)

**Design language:**
- Dark-first (`bg-background`, `bg-card`, `bg-muted`)
- Inter font for UI text (loaded globally)
- Green accent for primary action only — sign-out is `outline` variant, NOT primary
- `text-muted-foreground` for secondary text
- `min-h-11` (44px) touch targets on all interactive elements
- Responsive: works at all breakpoints (max-w-lg + horizontal padding)

### Previous Story Intelligence (Story 2.4)

**Patterns established and proven:**
- `Card`/`CardHeader`/`CardContent` layout for centered page forms
- `Button` with `min-h-11` for 44px touch targets
- `bg-background` for page background (design tokens, not raw Tailwind)
- `text-muted-foreground` for secondary/descriptive text
- `signOut()` (from `../lib/firebase`, no arguments) + `navigate('/sign-in', { replace: true })` for sign-out flow
- `MemoryRouter` from `'react-router'` in tests
- Radix UI `beforeAll` polyfills NOT needed for this story (no RadioGroup/Select)

**Code review fixes from Story 2.4 to learn from:**
- H1: Always handle non-404 error paths — don't leave users stuck on loading skeleton
- M1: Use controlled components properly from initial render

**Story 2.4 tech debt noted:**
- `OverviewPlaceholder` in App.tsx uses raw Tailwind colors (`bg-neutral-950 text-neutral-400`) instead of design tokens. The new `NotReady` component uses proper design tokens. Do NOT fix `OverviewPlaceholder` in this story.

### Project Structure Notes

- `NotReady.tsx` goes in `apps/webapp/src/routes/` — route-level components live here, not in `components/`
- Test file co-located: `NotReady.test.tsx` next to `NotReady.tsx`
- No new packages, no new shared types, no new UI components needed
- No barrel file changes — route components are imported directly

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 2.5: Graceful Redirect for Under-Qualified Users] — BDD acceptance criteria, FR31 requirement, FR32 deferral
- [Source: _bmad-output/planning-artifacts/prd.md#FR31] — Under-qualified user redirect with alternative learning resources
- [Source: _bmad-output/planning-artifacts/prd.md#FR32] — Email capture explicitly deferred to Growth phase
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#Flow 5: Skill Floor Check → Graceful Redirect] — Full flowchart, "Go might be new territory" framing, resource recommendations, email capture deferral
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#Emotional Journey] — "Respected and guided" target emotion, mentorship tone
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#Tone Patterns] — "Respect at boundaries", no rejection language
- [Source: _bmad-output/planning-artifacts/architecture.md#Frontend Routes] — /not-ready route in SPA routing
- [Source: _bmad-output/planning-artifacts/architecture.md#Component Structure] — Route components in apps/webapp/src/routes/
- [Source: _bmad-output/implementation-artifacts/2-4-skill-floor-assessment.md] — Previous story: routing gate implementation, useOnboardingStatus hook, placeholder setup, code review fixes
- [Source: _bmad-output/project-context.md] — All project rules, anti-patterns, naming conventions

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6 (claude-opus-4-6)

### Debug Log References

- Initial test run failed with "document is not defined" — ran from root without jsdom environment. Fixed by running from webapp workspace.
- Tests failed with duplicate DOM elements — jsdom cleanup not running between tests. Fixed by adding explicit `cleanup()` in `afterEach`.

### Completion Notes List

- Created `NotReady.tsx` with encouraging tone, 4 learning resources, accessible markup, sign-out flow, and bookmark messaging. All per story spec.
- Removed `NotReadyPlaceholder` from `App.tsx`, replaced with imported `NotReady` component.
- Created 8 test cases covering: heading tone, no rejection language, resource links with `target="_blank"`, A Tour of Go first resource, bookmark message, sign-out button 44px touch target, sign-out navigation, no email capture (FR32 deferred), accessible `aria-labelledby` section.
- All 107 tests pass (8 new + 99 existing) — zero regressions.
- Code review fixes applied: H1 (sign-out error handling with try/catch), M1 (complete UX banned-word test coverage), M2 (loading/disabled state on sign-out button), M3 (sign-out error path test), L1 (sr-only "opens in new tab" for screen readers). 3 new tests added (11 total). All 110 tests pass.
- No backend changes, no database changes, no new dependencies.

### File List

- `apps/webapp/src/routes/NotReady.tsx` — **CREATED** — Graceful redirect page component
- `apps/webapp/src/routes/NotReady.test.tsx` — **CREATED** — 11 component tests
- `apps/webapp/src/App.tsx` — **MODIFIED** — Removed `NotReadyPlaceholder`, added `NotReady` import, updated route element

## Change Log

- 2026-03-02: Implemented Story 2.5 — Created NotReady route component with encouraging redirect page, learning resources, accessible markup, and 8 comprehensive tests. Replaced inline placeholder in App.tsx.
- 2026-03-02: Code review fixes — Added try/catch error handling to sign-out (H1), expanded banned-word test to cover full UX tone list (M1), added loading/disabled state on sign-out button (M2), added sign-out error path test (M3), added sr-only "opens in new tab" for screen readers (L1). Tests: 8 → 11. Suite: 110 pass.
