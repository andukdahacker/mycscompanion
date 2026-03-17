---
stepsCompleted:
  - step-01-validate-prerequisites
  - step-02-design-epics
  - step-03-create-stories
inputDocuments:
  - '_bmad-output/planning-artifacts/prd.md'
  - '_bmad-output/planning-artifacts/architecture.md'
  - '_bmad-output/planning-artifacts/ux-design-specification.md'
---

# mycscompanion - Epic Breakdown

## Overview

This document provides the complete epic and story breakdown for mycscompanion, decomposing the requirements from the PRD, UX Design, and Architecture into implementable stories.

## Requirements Inventory

### Functional Requirements

**Learning Experience (FR1-FR13)**

- FR1: Learner can view a milestone brief with learning objectives, acceptance criteria, and benchmark targets
- FR2: Learner can edit code in a browser-based code editor with syntax highlighting and project file structure
- FR3: Learner can start a milestone with pre-loaded starter code at the appropriate scaffolding level for that milestone
- FR4: Learner can submit code for compilation and execution and receive results in-browser
- FR5: Learner can view compilation errors, runtime output, and panic messages with sufficient detail to diagnose code issues
- FR6: System can automatically evaluate acceptance criteria against learner submission results
- FR7: Learner can view acceptance criteria status (met/unmet) after each submission
- FR8: Learner can complete a milestone when all acceptance criteria are met and advance to the next milestone
- FR9: Learner can view benchmark results after each submission with performance metrics (ops/sec, latency)
- FR10: Learner can view historical benchmark results across submissions within a milestone
- FR11: Learner can view a benchmark trajectory visualization across milestones showing their database improving over time
- FR12: Learner can view "How the Pros Did It" comparisons showing their implementation alongside production code (SQLite/PostgreSQL) in a diff view (Soft MVP)
- FR13: Learner can view visual concept explainers (annotated diagrams) for key data structures when relevant to the current milestone

**AI Tutoring (FR14-FR19)**

- FR14: Learner can converse with an AI tutor that responds with Socratic questions rather than direct answers
- FR15: Learner can receive AI tutor interventions that are aware of their current code state, milestone context, and acceptance criteria progress
- FR16: Learner can receive AI tutor responses personalized to their background (role, experience level, primary language)
- FR17: Learner can receive proactive AI tutor intervention when stuck (detected by inactivity threshold)
- FR18: Learner can receive tutor-surfaced visual concept explainers when struggling with a structural concept
- FR19: Learner can view AI tutor responses as they stream in real-time (not waiting for full response)

**Code Execution & Benchmarks (FR20-FR25)**

- FR20: System can compile and execute learner-submitted Go code in an isolated sandboxed environment
- FR21: System can enforce resource limits on code execution (CPU, memory, time, process count, network isolation)
- FR22: System can queue code submissions and process them in order with fair scheduling
- FR23: System can run standardized benchmark workloads against learner code and return consistent, reproducible results
- FR24: System can distinguish between user-code errors (compilation failures, runtime panics) and platform errors, surfacing each appropriately
- FR25: System can rate-limit code submissions per user to prevent execution abuse

**User Onboarding & Assessment (FR26-FR32)**

- FR26: Visitor can sign up using email/password or GitHub OAuth
- FR27: Visitor can sign in and have their session persist across browser sessions
- FR28: New user can complete a background questionnaire (role, experience, primary language) during onboarding
- FR29: System can detect potentially under-qualified users based on background questionnaire responses
- FR30: Potentially under-qualified user can complete a lightweight code comprehension check (multiple-choice, not a coding test)
- FR31: Under-qualified user can receive a graceful redirect with specific alternative learning resource recommendations
- FR32: Redirected user can optionally provide their email for future re-engagement notification (Growth — not Hard MVP)

**Progress & Session Management (FR33-FR39)**

- FR33: Learner can resume their project exactly where they left off (code state, milestone progress, last benchmark results)
- FR34: System can auto-save learner code state at regular intervals and on submission
- FR35: Learner can start or resume a session with a single action ("Continue Building") with no navigation decisions required. Logged-in learner lands directly on their active milestone workspace by default.
- FR36: System can generate and store a natural-language session summary at the end of each session capturing milestone progress, criteria met/unmet, and current work context
- FR37: Returning learner can view their pre-computed session summary as re-engagement context
- FR38: AI tutor can receive the session summary as context when a learner returns after absence
- FR39: Learner can view their overall progress across all milestones in the track

**User Account & Privacy (FR40-FR43)**

- FR40: User can delete their account and all associated data
- FR41: User can export their data (code submissions, progress, AI conversations) as a downloadable file
- FR42: Visitor can view a privacy policy page describing data collection and usage
- FR43: System can maintain user sessions with auto-refresh on tab focus after idle without forced logout

**Content Pipeline (FR44-FR45)**

- FR44: System can validate that milestone starter code compiles and reference implementation passes acceptance criteria
- FR45: System can serve milestone content structured as: brief, starter code at appropriate scaffolding level, acceptance criteria, benchmark targets, and concept explainer assets

**Marketing & Landing Page (FR46-FR50)**

- FR46: Visitor can view a landing page that communicates the product value proposition with concrete proof (code screenshots, benchmark outputs, milestone list)
- FR47: Visitor can preview Milestone 1 content (brief, starter code, acceptance criteria) before signing up
- FR48: Visitor can initiate signup directly from the landing page
- FR49: Landing page can render optimized Open Graph cards for social sharing (screenshot of benchmark or code)
- FR50: Landing page can be indexed by search engines with appropriate meta tags and structured data

**Administration & Operations (FR51-FR56)**

- FR51: Admin can monitor infrastructure health, deployments, and logs via external dashboard tooling
- FR52: Admin can view and manage queued/stuck/failed code execution jobs via external job monitoring tooling
- FR53: Admin can receive automated error alerts when platform errors occur
- FR54: Admin can review AI tutor conversation logs to assess prompt quality and identify tuning opportunities
- FR55: Admin can query analytics data (milestone completions, signups, retention, dropout points) via direct database queries or external analytics tooling
- FR56: System can load AI tutor prompts and stuck detection thresholds from external configuration

### NonFunctional Requirements

**Performance**

- NFR-P1: Code compilation round-trip <5 seconds (failure: >10% exceed 10s)
- NFR-P2: Benchmark execution round-trip <10 seconds (failure: >10% exceed 15s)
- NFR-P3: AI tutor time-to-first-token <1 second (failure: >3s TTFT in >5% of sessions)
- NFR-P4: Landing page LCP <1.5 seconds on 4G throttled
- NFR-P5: Webapp initial load LCP <2.5 seconds
- NFR-P6: Webapp TTI <3.5 seconds
- NFR-P7: Monaco editor ready <1.5 seconds after app shell
- NFR-P8: Client-side route transitions <200ms
- NFR-P9: Landing page total JS <50KB
- NFR-P10: Webapp initial JS bundle <500KB gzipped (Monaco lazy-loaded separately)
- NFR-P11: 10 simultaneous code executions at MVP scale (100 users)

**Security**

- NFR-S1: Each code submission runs in a disposable container/VM with CPU limit, memory limit, 60s timeout, process limit, network isolation, read-only filesystem
- NFR-S2: No persistent state in execution containers — destroyed after each submission
- NFR-S3: All traffic over HTTPS/TLS, SSE streams over HTTPS
- NFR-S4: PostgreSQL on Railway uses encrypted storage at rest
- NFR-S5: Firebase Auth handles credential storage, password hashing, session tokens
- NFR-S6: All API endpoints require valid Firebase Auth token (except health check and public pages)
- NFR-S7: Code submissions rate-limited at 10/min/user; AI tutor at 30/min/user
- NFR-S8: Automated dependency vulnerability scanning (Dependabot or equivalent)

**Reliability**

- NFR-R1: 99% platform uptime (allows ~7 hours downtime/month)
- NFR-R2: Benchmark consistency: reference-normalized scoring with ±5% variance in normalized ratio within a session
- NFR-R3: Reference implementation pinned per track version, updated only with historical score migration
- NFR-R4: >95% of compilable submissions complete without platform errors
- NFR-R5: Zero data loss on user code and progress (auto-save survives browser crash, tab close, network interruption)
- NFR-R6: Failed/stuck BullMQ jobs auto-retried once, then marked failed with admin alert
- NFR-R7: AI tutor available in >95% of sessions (instrumented from day one)
- NFR-R8: Graceful degradation — core loop (edit→submit→benchmark) functions without AI tutor

**Scalability**

- NFR-SC1: 100 concurrent users, 10 simultaneous code executions at MVP
- NFR-SC2: Per-user infrastructure cost ≤$0.65/month at 100 users
- NFR-SC3: Cost trajectory toward $0.30/user at 1,000 users
- NFR-SC4: PostgreSQL handles 1,000 users without performance degradation
- NFR-SC5: BullMQ <5s average queue wait at peak load (20 concurrent submissions)
- NFR-SC6: Execution workers horizontally scalable (add Railway replicas, no arch changes)
- NFR-SC7: AI tutor cost managed via context window limits, prompt caching, per-user rate limits

**Accessibility**

- NFR-A1: WCAG 2.1 AA for core flows (signup, onboarding, code editing, AI chat, benchmark results)
- NFR-A2: All core flows completable with keyboard only, validated by axe-core in CI
- NFR-A3: Monaco editor screen reader mode enabled; ARIA live regions for AI tutor streaming
- NFR-A4: Code syntax highlighting meets AA contrast ratios; dark theme tested explicitly
- NFR-A5: All visual concept explainer SVGs have descriptive alt text; benchmark charts have data table alternatives
- NFR-A6: Semantic HTML for landing page (Astro); appropriate ARIA roles for dynamic webapp content

### Additional Requirements

**From Architecture:**

- ARCH-1: Manual Assembly starter template — Turborepo + pnpm workspaces with 3 apps (backend, webapp, website) and 4 packages (ui, shared, execution, config)
- ARCH-2: Hybrid deployment topology — Railway for web infrastructure + Fly.io Machines for isolated code execution (Firecracker VMs)
- ARCH-3: Firebase Auth confined to `app.mycscompanion.dev` only; landing page at `mycscompanion.dev` is pure static with CTA redirects
- ARCH-4: Kysely query builder with `kysely-codegen` for type generation; migrations via `kysely-ctl`
- ARCH-5: Fastify server with 6 domain plugins (auth, execution, tutor, curriculum, progress, account) registered in specific order
- ARCH-6: SSE streaming via `fastify-sse-v2` with Redis pub/sub for worker↔API communication; 30s heartbeat; `Last-Event-ID` for reconnect replay
- ARCH-7: Anthropic SDK with tiered model routing — Haiku for Socratic dialogue (default), Sonnet for code analysis and conceptual explanation
- ARCH-8: Frontend state: TanStack Query v5 for server state + Zustand (2 stores: `useWorkspaceUIStore`, `useEditorStore`) for UI state
- ARCH-9: `packages/execution` shared package defining typed ExecutionEvent discriminated union, Fly Machine config, benchmark runner logic
- ARCH-10: Redis event log per submission (TTL 5 min) enabling SSE reconnect replay via `Last-Event-ID`
- ARCH-11: Client-side stuck detection timer; thresholds loaded from milestone config on workspace mount
- ARCH-12: `cuid2` for all entity IDs (except `users.id` = Firebase UID)
- ARCH-13: Cursor-based pagination for all list endpoints
- ARCH-14: Co-located test files (`{source}.test.ts`); Vitest for unit/integration; Playwright for E2E
- ARCH-15: Plugin isolation — plugins import only from `shared/` and `packages/*`, never cross-plugin
- ARCH-16: Content CI pipeline (separate GitHub Actions workflow) validates milestone content against Fly.io execution environment
- ARCH-17: `docker-compose.yml` for local development (PostgreSQL 16 + Redis 7)
- ARCH-18: Worker and API share one codebase (`apps/backend`) but run as separate Railway services with separate entry points
- ARCH-19: Core schema entities: users, tracks, milestones, sessions, code_snapshots, submissions, benchmark_results, tutor_messages, session_summaries
- ARCH-20: Database naming: snake_case tables (plural), snake_case columns, `timestamptz` for all timestamps
- ARCH-21: API naming: kebab-case routes, camelCase JSON response fields, `toCamelCase()` conversion on all Kysely results
- ARCH-22: Railway service topology: 6 services (api, worker, postgres, redis, webapp, website)
- ARCH-23: CI/CD pipeline: lint → typecheck → test → build on push to main; Railway auto-deploys; Turborepo remote caching
- ARCH-24: Monitoring: Sentry (errors), Railway logs (Fastify pino JSON), Metabase (analytics), Bull Board (queue monitoring)

**From UX Design:**

- UX-1: Content-before-tools loading pattern — milestone brief text renders immediately while Monaco lazy-loads (~1.5s)
- UX-2: Persistent background SSE connection per session for stuck detection, even when tutor panel is collapsed
- UX-3: Zero temporal framing in session summaries — no dates, no "welcome back," no relative timestamps
- UX-4: Two-stage stuck detection: Stage 1 (threshold hit) = subtle green glow on collapsed tutor panel; Stage 2 (+60s) = panel auto-expands with Socratic question
- UX-5: Workshop atmosphere — no gamification (badges, streaks, XP), no celebration animations, no patronizing encouragement, no persistent navigation bar in workspace
- UX-6: Benchmark display hierarchy — hero absolute number (large, green for improvement, white for regression) with "(this session)" qualifier + secondary normalized ratio below
- UX-7: Error presentation layer — human-readable interpretation above collapsible raw compiler output; interpretation describes, tutor prescribes (never cross this boundary)
- UX-8: Shareable artifact design — benchmark visualizations use engineering language ("12,400 range scan ops/sec"), portfolio-grade, self-contained context for screenshots
- UX-9: Dark-first color system — green accent for actions only; no red anywhere; success green ≠ brand green (≥30 degrees hue difference); color never sole signal
- UX-10: Typography — Inter for UI, JetBrains Mono for code; `font-display: swap` (Astro) and `optional` (webapp); 12px minimum everywhere
- UX-11: Resizable split panels for workspace (react-resizable-panels / shadcn Resizable) — editor+terminal (left) | tutor (right); tutor non-modal, collapses to 32px
- UX-12: Progressive benchmark loading states — 0-2s spinner, 2-5s elapsed timer, 5-10s context, 10-59s extended, 60s timeout (diagnostic framing)
- UX-13: Acceptance criteria diagnostic template: "[Criteria name]: MET/NOT MET" with expected vs actual; "NOT MET" not "FAILED"; green check for met, gray dash for not met
- UX-14: 3-breakpoint responsive design — ≥1280px full experience, 1024-1279px tutor overlay mode, <768px read-only mobile (progress + brief + conversation history)
- UX-15: Focus management — Monaco gets initial focus; Escape releases focus; defined tab order through workspace; no focus theft on tutor expand
- UX-16: Screen reader live region announcements — compilation complete, benchmark results, criteria changes (batched), tutor message (on stream end, not per-token)
- UX-17: 44x44px minimum touch targets for all interactive elements
- UX-18: Shared hooks: `useAutoScroll` (auto-scroll with user override), `useBenchmarkProgress` (time-driven states), `useDelayedLoading` (500ms delay), `useTutorStream` (SSE lifecycle)
- UX-19: No-red color audit and one-primary-per-screen lint rule in CI
- UX-20: Contextual overview variants: returning (stats + summary + CTA), first-time (intro + brief excerpt + "Start Building"), milestone-start (zeroed stats)
- UX-21: Milestone completion as full-screen view (not dialog) — trajectory chart animation, engineering-grade language, next milestone preview, Strava emotional pattern
- UX-22: Keyboard shortcuts: `⌘+Enter` (Run), `⌘+Shift+Enter` (Benchmark), `⌘+/` (toggle tutor), `Escape` (collapse tutor); must unbind Monaco `⌘+Enter` conflict
- UX-23: Terminal panel with two tab views: "Output" (compilation/run results) and "Criteria" (CriteriaList); labels always static
- UX-24: Tutor input: single-line `<input>`, `Enter` to send, disabled while streaming, placeholder "Ask a question..."
- UX-25: `prefers-reduced-motion` respected for all animations; trajectory chart glow removed; tutor expansion instant

### FR Coverage Map

| FR | Epic | Description |
|---|---|---|
| FR1 | Epic 4 | View milestone brief with objectives, criteria, benchmark targets |
| FR2 | Epic 3 | Edit code in browser-based editor with syntax highlighting |
| FR3 | Epic 4 | Start milestone with pre-loaded starter code |
| FR4 | Epic 3 | Submit code for compilation and execution |
| FR5 | Epic 3 | View compilation errors, runtime output, panic messages |
| FR6 | Epic 4 | Auto-evaluate acceptance criteria against submission results |
| FR7 | Epic 4 | View acceptance criteria status (met/unmet) after submission |
| FR8 | Epic 4 | Complete milestone and advance to next |
| FR9 | Epic 7 | View benchmark results with performance metrics |
| FR10 | Epic 7 | View historical benchmark results within a milestone |
| FR11 | Epic 7 | View benchmark trajectory visualization across milestones |
| FR12 | Epic 4 | "How the Pros Did It" diff comparison (Soft MVP — deferred) |
| FR13 | Epic 4 | View visual concept explainers (annotated diagrams) |
| FR14 | Epic 6 | Converse with AI tutor using Socratic questions |
| FR15 | Epic 6 | AI tutor aware of code state, milestone, criteria progress |
| FR16 | Epic 6 | AI tutor personalized to background |
| FR17 | Epic 6 | Proactive AI tutor intervention when stuck |
| FR18 | Epic 6 | Tutor-surfaced visual concept explainers |
| FR19 | Epic 6 | AI tutor responses stream in real-time |
| FR20 | Epic 3 | Compile and execute Go code in isolated sandbox |
| FR21 | Epic 3 | Enforce resource limits on code execution |
| FR22 | Epic 3 | Queue code submissions with fair scheduling |
| FR23 | Epic 7 | Run standardized benchmark workloads with consistent results |
| FR24 | Epic 3 | Distinguish user-code errors from platform errors |
| FR25 | Epic 3 | Rate-limit code submissions per user |
| FR26 | Epic 2 | Sign up via email/password or GitHub OAuth |
| FR27 | Epic 2 | Sign in with persistent sessions |
| FR28 | Epic 2 | Complete background questionnaire during onboarding |
| FR29 | Epic 2 | Detect potentially under-qualified users |
| FR30 | Epic 2 | Lightweight code comprehension check |
| FR31 | Epic 2 | Graceful redirect with alternative resource recommendations |
| FR32 | Epic 2 | Email capture for re-engagement (Growth — deferred) |
| FR33 | Epic 5 | Resume project exactly where left off |
| FR34 | Epic 5 | Auto-save code state at regular intervals |
| FR35 | Epic 5 | Single-action start/resume ("Continue Building") |
| FR36 | Epic 5 | Generate and store session summary at end of session |
| FR37 | Epic 5 | Returning learner views pre-computed session summary |
| FR38 | Epic 6 | AI tutor receives session summary as context |
| FR39 | Epic 5 | View overall progress across all milestones |
| FR40 | Epic 8 | Delete account and all associated data |
| FR41 | Epic 8 | Export data as downloadable file |
| FR42 | Epic 8 | View privacy policy page |
| FR43 | Epic 2 | Maintain sessions with auto-refresh on tab focus |
| FR44 | Epic 1 | Content CI: starter code compiles, reference impl passes |
| FR45 | Epic 4 | Serve structured milestone content |
| FR46 | Epic 9 | Landing page with value proposition and concrete proof |
| FR47 | Epic 9 | Preview Milestone 1 content before signup |
| FR48 | Epic 9 | Initiate signup from landing page |
| FR49 | Epic 9 | Optimized Open Graph cards for social sharing |
| FR50 | Epic 9 | Search engine indexing with meta tags and structured data |
| FR51 | Epic 10 | Monitor infrastructure health via external tools |
| FR52 | Epic 10 | View and manage execution job queue via external tools |
| FR53 | Epic 1 | Receive automated error alerts (Sentry integration) |
| FR54 | Epic 10 | Review AI tutor conversation logs |
| FR55 | Epic 10 | Query analytics data via direct DB or external tools |
| FR56 | Epic 10 | Load AI tutor prompts and thresholds from external config |

**Coverage: 56/56 FRs mapped. 0 gaps.**

### NFR-to-Epic Allocation

| NFR | Primary Epic | Notes |
|---|---|---|
| NFR-P1 (compilation <5s) | Epic 3 | Execution pipeline AC |
| NFR-P2 (benchmark <10s) | Epic 7 | Benchmark runner AC |
| NFR-P3 (tutor TTFT <1s) | Epic 6 | Tutor integration AC |
| NFR-P4 (landing LCP <1.5s) | Epic 9 | Landing page AC |
| NFR-P5, P6 (webapp LCP/TTI) | Epic 3 | Workspace AC |
| NFR-P7 (Monaco ready <1.5s) | Epic 3 | Editor AC |
| NFR-P8 (route transitions <200ms) | Epic 4 | Milestone navigation AC |
| NFR-P9 (landing JS <50KB) | Epic 9 | Build config AC |
| NFR-P10 (webapp JS <500KB) | Epic 3 | Build config AC |
| NFR-P11 (10 concurrent executions) | Epic 3 | Execution pipeline AC |
| NFR-S1, S2 (execution isolation) | Epic 3 | Fly Machine AC |
| NFR-S3, S4 (encryption) | Epic 1 | Infrastructure AC |
| NFR-S5, S6 (auth security) | Epic 2 | Auth AC |
| NFR-S7 (rate limiting) | Epics 2, 3 | Auth + execution AC |
| NFR-S8 (dependency scanning) | Epic 1 | CI pipeline AC |
| NFR-R1 (99% uptime) | Epic 1 | Deployment config AC |
| NFR-R2, R3 (benchmark consistency) | Epic 7 | Benchmark AC |
| NFR-R4 (execution success >95%) | Epic 3 | Execution AC |
| NFR-R5 (zero data loss) | Epic 5 | Auto-save AC |
| NFR-R6 (queue recovery) | Epic 3 | BullMQ AC |
| NFR-R7 (tutor availability >95%) | Epic 6 | Tutor AC |
| NFR-R8 (graceful degradation) | Epic 6 | Tutor AC |
| NFR-SC1-SC7 (scalability) | Epics 1, 3, 6 | Infra + execution + tutor AC |
| NFR-A1-A6 (accessibility) | Epics 2-7, 9 | All frontend stories AC |

## Epic List

### Epic 1: Project Foundation & Developer Environment
Engineers can clone, install, and run the full monorepo locally with database, Redis, CI/CD, and base configurations in place. This epic produces the scaffolding that all subsequent epics build upon — Turborepo monorepo with 3 apps and 4 shared packages, PostgreSQL + Redis via docker-compose, GitHub Actions CI/CD pipeline (including Content CI scaffold), base TypeScript/ESLint/Vitest configs, initial database schema with Kysely migrations, Sentry error tracking integration, and canonical test infrastructure (test utilities, mock patterns, test database setup with per-test transaction rollback).
**FRs covered:** FR44, FR53. Addresses ARCH-1, ARCH-4, ARCH-5, ARCH-14, ARCH-17, ARCH-19, ARCH-20, ARCH-22, ARCH-23, ARCH-24.

### Epic 2: User Authentication & Onboarding
Engineers can sign up (email/password or GitHub OAuth), sign in with persistent sessions, complete a 3-question background questionnaire, get assessed via a lightweight skill floor check, and receive graceful redirection with specific alternative resources if not yet ready. Sessions auto-refresh on tab focus without forced logout.
**FRs covered:** FR26, FR27, FR28, FR29, FR30, FR31, FR43. (FR32 deferred to Growth.)

### Epic 3: Code Execution & Workspace
Engineers can write Go code in a Monaco browser editor with syntax highlighting, submit code for server-side compilation in isolated Firecracker VMs via Fly.io, see streaming compilation output with clear error classification (user-code errors vs platform errors), and have their submissions queued and rate-limited. The workspace uses resizable split panels with content-before-tools loading. Error presentation uses a two-tier display: human-readable interpretation above collapsible raw compiler output.
**FRs covered:** FR2, FR4, FR5, FR20, FR21, FR22, FR24, FR25.

### Epic 4: Milestone Content & Learning Loop
Engineers can view milestone briefs with "Why This Matters" framing, load pre-scaffolded starter code, have acceptance criteria auto-evaluated on submission, see met/unmet status with diagnostic templates, complete milestones and advance to the next, and access visual concept explainers (static annotated SVGs). Milestone completion is a full-screen view with criteria summary and next milestone preview (trajectory chart added by Epic 7).
**FRs covered:** FR1, FR3, FR6, FR7, FR8, FR13, FR45. (FR12 "How the Pros Did It" deferred as Soft MVP.)

### Epic 5: Progress Persistence & Re-engagement
Engineers can auto-save work every 30-60 seconds (invisible), resume exactly where they left off, start or continue sessions with a single "Continue Building" action and zero navigation decisions, view overall progress across all milestones, and return after any absence with pre-computed session summaries using zero temporal framing. The contextual overview shows milestone progress, next criteria, and session summary for returning users (benchmark data added by Epic 7).
**FRs covered:** FR33, FR34, FR35, FR36, FR37, FR39.

### Epic 6: AI Socratic Tutor
Engineers can converse with a context-aware AI tutor that asks Socratic questions (not direct answers), is aware of their current code state, milestone context, acceptance criteria progress, background, and session summary (for returning users). The tutor streams responses in real-time via SSE, proactively intervenes via two-stage stuck detection (subtle signal → panel auto-expand), and surfaces visual concept explainers when the learner struggles with structural concepts. Tutor panel is non-modal, collapsible, and resizable within the workspace.
**FRs covered:** FR14, FR15, FR16, FR17, FR18, FR19, FR38.

### Epic 7: Benchmarks & Performance Narrative
Engineers can run standardized benchmarks against their code (deliberate user action), see reference-normalized performance metrics with a hero absolute number and secondary normalized ratio, view historical results across submissions within a milestone, and track their database's improvement across milestones via a trajectory visualization. Benchmark results use engineering-grade language designed as shareable artifacts. Upgrades the milestone completion view with trajectory chart animation and benchmark summary. Upgrades the contextual overview with last benchmark number and trend indicator.
**FRs covered:** FR9, FR10, FR11, FR23.

### Epic 8: User Account & Privacy
Users can manage their account settings, export all their data (code submissions, progress, AI conversations) as a downloadable file, delete their account and all associated data (GDPR compliance), and view a privacy policy page.
**FRs covered:** FR40, FR41, FR42.

### Epic 9: Landing Page & Marketing
Visitors can discover mycscompanion through an Astro landing page that communicates the value proposition with concrete proof (code screenshots, benchmark outputs, milestone list), preview Milestone 1 content (brief, criteria, starter code as read-only) before signing up, initiate signup via CTA, and share via optimized Open Graph cards. The page is SEO-optimized with meta tags and structured data. Visual consistency with webapp via shared Tailwind design tokens.
**FRs covered:** FR46, FR47, FR48, FR49, FR50.

### Epic 10: Operations & Monitoring
Admin can monitor infrastructure health via Railway dashboard, view and manage execution job queues via Bull Board, review AI tutor conversation logs for prompt quality assessment, query analytics data via direct SQL or Metabase, and configure AI tutor prompts and stuck detection thresholds from external files.
**FRs covered:** FR51, FR52, FR54, FR55, FR56.

---

## Epic 1: Project Foundation & Developer Environment

**Goal:** Engineers can clone, install, and run the full monorepo locally with database, Redis, CI/CD, and base configurations in place.

**FRs covered:** FR44, FR53
**ARCH requirements:** ARCH-1, ARCH-4, ARCH-5, ARCH-14, ARCH-17, ARCH-19, ARCH-20, ARCH-22, ARCH-23, ARCH-24
**NFRs:** NFR-S3, NFR-S4, NFR-S8, NFR-R1

### Story 1.1: Monorepo Scaffold & Local Dev Environment

As a **developer**,
I want to clone the repo, install dependencies, and start all local services with a single command,
So that I have a working development environment to build features against.

**Acceptance Criteria:**

**Given** a fresh clone of the repository
**When** I run `pnpm install` and `docker compose up`
**Then** PostgreSQL 16 and Redis 7 containers start and are reachable on their default ports
**And** the Turborepo workspace resolves 3 apps (`backend`, `webapp`, `website`) and 4 packages (`ui`, `shared`, `execution`, `config`)
**And** `pnpm dev` starts all apps concurrently via Turborepo
**And** each app and package has a valid `tsconfig.json` extending a shared base config
**And** ESLint is configured at root with shared rules across all workspaces
**And** a root `README.md` documents the setup steps (clone → install → docker compose → dev)

### Story 1.2: Database Foundation & Migration System

As a **developer**,
I want a type-safe database layer with versioned migrations,
So that I can build features against a consistent schema with a proven migration workflow.

**Acceptance Criteria:**

**Given** PostgreSQL is running via docker-compose
**When** I run the Kysely migration command
**Then** the initial migration creates foundational tables: `users`, `tracks`, `milestones`
**And** all tables use snake_case plural names and snake_case columns per ARCH-20
**And** all timestamp columns use `timestamptz` type
**And** all entity IDs use `cuid2` generation except `users.id` which stores the Firebase UID as text (ARCH-12)
**And** running migrations is idempotent (re-running does not error or duplicate data)
**And** the migration pattern is established for subsequent epics to add their own tables (each domain story creates only the tables it needs)

### Story 1.3: Database Codegen & Shared Utilities

As a **developer**,
I want auto-generated TypeScript types from the database schema and shared conversion utilities,
So that I have type-safe database access across all packages.

**Acceptance Criteria:**

**Given** the initial migration has run and tables exist
**When** I run `kysely-codegen`
**Then** TypeScript types are generated matching the current database schema (ARCH-4)
**And** a `toCamelCase()` utility exists in `packages/shared` for converting query results to camelCase JSON fields per ARCH-21
**And** a seed data script populates `tracks` and `milestones` tables with initial track/milestone metadata
**And** re-running codegen after a new migration updates types without manual intervention
**And** generated types are importable by all apps and packages in the monorepo

### Story 1.4: Fastify Server Bootstrap & Plugin Architecture

As a **developer**,
I want a Fastify server with domain-isolated plugins and structured logging,
So that I can add feature endpoints in the correct plugin without cross-plugin coupling.

**Acceptance Criteria:**

**Given** the backend app is started via `pnpm dev`
**When** the Fastify server initializes
**Then** it registers 6 domain plugins (`auth`, `execution`, `tutor`, `curriculum`, `progress`, `account`) in the specified order per ARCH-5
**And** each plugin is in its own directory under `apps/backend/src/plugins/`
**And** plugins import only from `packages/shared` and `packages/*`, never from other plugins (ARCH-15)
**And** pino JSON logging is configured for structured log output
**And** a `GET /health` endpoint returns `200 OK` with service status
**And** CORS is configured to allow requests from the webapp origin
**And** a separate worker entry point (`apps/backend/src/worker.ts`) exists sharing the same codebase but running as an independent process (ARCH-18)
**And** API routes use kebab-case naming per ARCH-21

### Story 1.5: Test Infrastructure & Shared Utilities

As a **developer**,
I want a working test framework with database isolation, mock utilities, and E2E scaffolding,
So that I can write reliable unit, integration, and end-to-end tests for any feature.

**Acceptance Criteria:**

**Given** the test command is run (`pnpm test`)
**When** Vitest executes test files
**Then** it discovers co-located test files using the `{source}.test.ts` convention (ARCH-14)
**And** a test database setup utility creates an isolated test database
**And** a per-test transaction rollback wrapper ensures tests do not leak state
**And** a Fastify inject helper enables HTTP-level integration tests without a running server
**And** a Redis mock utility is available for tests that interact with Redis
**And** a canary test validates the full test infrastructure (DB connection, transaction rollback, Fastify inject) works end-to-end
**And** test utilities are exported from a shared test helpers location
**And** Playwright is installed and configured for E2E testing with a base config targeting Chromium (ARCH-14)
**And** a Playwright test helper sets up authenticated browser context using Firebase Auth test tokens
**And** a sample E2E canary test validates that the Playwright infrastructure works (navigates to health endpoint)
**And** E2E tests are in a dedicated `e2e/` directory at the monorepo root, separate from co-located unit tests

### Story 1.6: CI/CD Pipeline & Quality Gates

As a **developer**,
I want automated quality gates on every push so that broken code cannot merge to main.

**Acceptance Criteria:**

**Given** a commit is pushed to the `main` branch or a pull request is opened
**When** GitHub Actions triggers the CI workflow
**Then** the pipeline runs in order: lint → typecheck → test → build (ARCH-23)
**And** Turborepo remote caching is enabled to skip unchanged packages
**And** Dependabot is configured for automated dependency vulnerability scanning (NFR-S8)
**And** a separate Content CI workflow file exists (scaffold only — runs validation when milestone content files are present, no-ops otherwise) for FR44
**And** axe-core accessibility checks are integrated into the CI pipeline, running against Playwright-rendered pages (NFR-A2)
**And** accessibility failures block merge — WCAG 2.1 AA violations are treated as CI failures
**And** the pipeline fails if any step fails, blocking merge

### Story 1.7: Error Tracking, Monitoring & Deployment Config

As an **admin**,
I want automated error alerts, structured logging, and deployment configuration so that the platform is observable and deployable from day one.

**Acceptance Criteria:**

**Given** the backend is deployed
**When** an unhandled error occurs in the Fastify server or worker process
**Then** the error is captured and reported to Sentry with stack trace and request context (FR53)
**And** Sentry is configured with environment tags (development, staging, production)
**And** pino structured logging outputs JSON format compatible with Railway log aggregation (ARCH-24)
**And** Bull Board is scaffolded as a route for queue monitoring (empty queues at this stage; functional when queues are created in Epic 3)
**And** HTTPS/TLS is enforced on all endpoints (NFR-S3)
**And** a `docker-compose.yml` entry for Metabase (free tier) is included in the local dev setup, pre-configured to connect to the local PostgreSQL database for analytics queries
**And** a `railway.toml` (or equivalent deployment config) defines all 6 services (api, worker, postgres, redis, webapp, website) with environment variable templates and start commands (ARCH-22)
**And** environment variable templates document all required config (DATABASE_URL, REDIS_URL, SENTRY_DSN, FLY_API_TOKEN, FIREBASE_CONFIG) without containing actual secrets
**And** a deployment README documents the Railway service topology and deployment process

---

## Epic 2: User Authentication & Onboarding

**Goal:** Engineers can sign up, sign in with persistent sessions, complete onboarding, get skill-assessed, and receive graceful redirection with specific alternative resources if not yet ready.

**FRs covered:** FR26, FR27, FR28, FR29, FR30, FR31, FR43 (FR32 deferred to Growth)
**ARCH requirements:** ARCH-3, ARCH-5, ARCH-12
**NFRs:** NFR-S5, NFR-S6, NFR-S7, NFR-A1, NFR-A2
**UX requirements:** UX-9, UX-10, UX-14, UX-17

### Story 2.1: Firebase Auth Integration & Session Management

As a **developer**,
I want Firebase Auth configured on the client and validated on the server,
So that users can authenticate securely and their sessions persist across visits.

**Acceptance Criteria:**

**Given** the webapp is loaded
**When** Firebase Auth SDK is initialized
**Then** it supports email/password and GitHub OAuth sign-in methods (FR26)
**And** Firebase Auth is confined to `app.mycscompanion.dev` only — the landing page at `mycscompanion.dev` has no Firebase dependency (ARCH-3)
**And** the backend auth plugin validates Firebase ID tokens on all protected API endpoints (NFR-S6)
**And** the `GET /health` endpoint remains publicly accessible without authentication
**And** user sessions persist across browser sessions via Firebase Auth persistence (FR27)
**And** sessions auto-refresh on tab focus after idle without forced logout (FR43)
**And** Firebase handles all credential storage, password hashing, and session tokens (NFR-S5)
**And** the auth middleware exposes user identity to downstream plugins, enabling per-user rate limiting in Epics 3 and 6

### Story 2.2: Signup & Login UI

As a **visitor**,
I want to sign up or log in with email/password or GitHub,
So that I can access the learning platform.

**Acceptance Criteria:**

**Given** an unauthenticated visitor navigates to the app
**When** they reach the auth page
**Then** they see a login form with email/password fields and a "Sign in with GitHub" button
**And** a "Create account" option switches to signup mode with email, password, and confirm password fields
**And** form validation provides inline error feedback for invalid email, weak password, or mismatched confirmation
**And** the page uses dark-first color system with green accent for primary action only (UX-9)
**And** typography uses Inter for UI text with `font-display: optional` (UX-10)
**And** all interactive elements meet 44x44px minimum touch targets (UX-17)
**And** the layout is responsive: full experience at ≥1280px, adapted at 1024-1279px, functional at <768px (UX-14)
**And** all form fields and buttons are keyboard-accessible with visible focus indicators (NFR-A1, NFR-A2)
**And** on successful signup, new users are redirected to the onboarding questionnaire
**And** on successful login, returning users are redirected to the workspace

### Story 2.3: Background Questionnaire & User Profile

As a **new user**,
I want to share my background during onboarding,
So that the platform can personalize my learning experience.

**Acceptance Criteria:**

**Given** a user has just completed signup
**When** they land on the onboarding page
**Then** they see a 3-question questionnaire: role (e.g., backend engineer, full-stack, student), experience level (junior, mid, senior), and primary programming language (FR28)
**And** each question uses clear, non-intimidating language consistent with the workshop atmosphere (UX-5)
**And** the questionnaire is completable with keyboard only (NFR-A2)
**And** on completion, a `users` record is created (or updated) in the database with the background data
**And** the user ID is the Firebase UID stored as text (ARCH-12)
**And** other entity IDs (if any created) use `cuid2` generation
**And** background data is stored in a format consumable by the AI tutor for personalization (FR16)
**And** the time from signup completion to questionnaire completion is logged; combined with first submission timestamp (Epic 3) to produce the onboarding canary metric — alert threshold <10 minutes from signup to first successful submission (UX Experience Instrumentation)
**And** the user is advanced to the skill floor assessment

### Story 2.4: Skill Floor Assessment

As a **new user**,
I want to complete a quick skill check so the platform can confirm I have the prerequisite knowledge.

**Acceptance Criteria:**

**Given** a user has completed the background questionnaire
**When** the system evaluates their responses
**Then** it identifies potentially under-qualified users based on background criteria (FR29)
**And** flagged users are presented with a lightweight code comprehension check — multiple-choice questions, not a coding test (FR30)
**And** the comprehension check assesses basic familiarity with programming concepts relevant to building a database
**And** users who pass the check proceed to the workspace
**And** users who are not flagged skip the check entirely and proceed directly to the workspace
**And** the assessment UI is keyboard-accessible and meets accessibility standards (NFR-A1, NFR-A2)
**And** the assessment uses the same dark-first design language as the rest of the app

### Story 2.5: Graceful Redirect for Under-Qualified Users

As an **under-qualified user**,
I want to receive helpful guidance on where to build prerequisite skills,
So that I can return when I'm ready rather than hitting a dead end.

**Acceptance Criteria:**

**Given** a user has not passed the skill floor assessment
**When** they see the redirect page
**Then** they receive a non-patronizing message explaining the prerequisite knowledge expected (FR31)
**And** the page lists specific alternative learning resources (courses, tutorials, books) relevant to their gaps
**And** the tone is encouraging and constructive — no "you failed" language, consistent with workshop atmosphere (UX-5)
**And** there is no dead end — users can bookmark and return later
**And** FR32 (email capture for re-engagement notification) is explicitly deferred to Growth phase and not implemented
**And** the page is responsive and accessible (UX-14, NFR-A1)

---

## Epic 3: Code Execution & Workspace

**Goal:** Engineers can write Go code in a Monaco browser editor, submit for compilation in isolated Firecracker VMs, see streaming output with clear error classification, and have submissions queued and rate-limited.

**FRs covered:** FR2, FR4, FR5, FR20, FR21, FR22, FR24, FR25
**ARCH requirements:** ARCH-6, ARCH-8, ARCH-9, ARCH-10, ARCH-11, ARCH-18
**NFRs:** NFR-P1, NFR-P5, NFR-P6, NFR-P7, NFR-P10, NFR-P11, NFR-S1, NFR-S2, NFR-R4, NFR-R6
**UX requirements:** UX-1, UX-7, UX-11, UX-15, UX-18, UX-22, UX-23, UX-25

### Story 3.1: Execution Environment Image & Registry

As a **developer**,
I want a versioned Docker image with the Go toolchain for Fly.io Machines,
So that code execution has a reproducible, maintained environment.

**Acceptance Criteria:**

**Given** the execution environment needs to compile and run learner Go code
**When** the Docker image is built
**Then** a Dockerfile in `packages/execution` builds a minimal image with Go toolchain (specific version pinned)
**And** the image is pushed to a container registry (Fly.io registry or GitHub Container Registry)
**And** the image version is tagged and referenced in Fly Machine configuration
**And** image build is automated in CI (rebuild on Dockerfile changes)
**And** the image includes only compilation and execution tooling — no persistent storage, no network utilities
**And** a local development fallback exists (Docker-based execution for local testing without Fly.io)

### Story 3.2: Execution Package & Fly.io Machine Integration

As a **developer**,
I want a shared execution package that provisions isolated Firecracker VMs on Fly.io,
So that learner code runs in a secure, disposable sandbox.

**Acceptance Criteria:**

**Given** the `packages/execution` shared package is imported
**When** a code execution request is made
**Then** a disposable Firecracker VM is provisioned on Fly.io using the image from Story 3.1
**And** each VM enforces resource limits: CPU cap, memory limit, 60-second timeout, process count limit, network isolation, and read-only filesystem (NFR-S1)
**And** no persistent state remains in the execution container — it is destroyed after each submission (NFR-S2)
**And** the package exports a typed `ExecutionEvent` discriminated union covering all event types (queued, compiling, compiled, running, output, error, complete, timeout) (ARCH-9)
**And** Fly Machine configuration (image, region, size class) is defined in the package
**And** the package can be imported by both API and worker without circular dependencies

### Story 3.3: Submission Queue & Worker Process

As a **learner**,
I want my code submissions queued and processed fairly,
So that the system handles concurrent users without dropping submissions.

**Acceptance Criteria:**

**Given** a code submission is received by the API
**When** it is enqueued in BullMQ
**Then** the worker process dequeues and processes jobs in FIFO order with fair scheduling across users (FR22)
**And** the worker delegates execution to the `packages/execution` module and publishes `ExecutionEvent` messages to Redis pub/sub (ARCH-6)
**And** code submissions are rate-limited at 10 per minute per user (FR25, NFR-S7)
**And** rate-limited requests receive a clear error response with retry-after guidance
**And** failed jobs are auto-retried once; permanently failed jobs are marked failed with an admin alert via Sentry (NFR-R6)
**And** the system supports 10 simultaneous code executions at MVP scale (NFR-P11)
**And** the worker runs as a separate Railway service using the same backend codebase with a separate entry point (ARCH-18)
**And** a migration creates the `submissions` table with: submission ID (cuid2), user ID, milestone ID, code content, status, execution result, criteria results, and timestamps per ARCH-19/ARCH-20. `kysely-codegen` is re-run to update TypeScript types

### Story 3.4: Submission API & SSE Streaming

As a **learner**,
I want to submit code and see compilation results stream in real-time,
So that I get immediate feedback without waiting for the full execution to complete.

**Acceptance Criteria:**

**Given** a learner submits code via the submission API endpoint
**When** the submission is accepted
**Then** the API returns an SSE stream that delivers `ExecutionEvent` messages as they occur
**And** a Redis event log is created per submission with 5-minute TTL (ARCH-10)
**And** SSE reconnection replays missed events via `Last-Event-ID` header (ARCH-6)
**And** SSE streams send a heartbeat every 30 seconds to keep the connection alive (ARCH-6)
**And** the API distinguishes user-code errors (compilation failures, runtime panics) from platform errors and surfaces each appropriately (FR24)
**And** compilation round-trip completes in <5 seconds for typical submissions (NFR-P1)
**And** an integration test validates that compilation round-trip for a simple Go program completes in <5 seconds (NFR-P1)
**And** >95% of compilable submissions complete without platform errors (NFR-R4)
**And** the submission endpoint requires a valid Firebase Auth token (NFR-S6)

### Story 3.5: Workspace Layout & Resizable Panels

As a **learner**,
I want a well-organized workspace with adjustable panel sizes,
So that I can arrange my coding environment to my preference.

**Acceptance Criteria:**

**Given** a learner navigates to their workspace
**When** the workspace loads
**Then** the workspace uses resizable split panels: editor + terminal on the left, tutor placeholder on the right (UX-11)
**And** the tutor panel collapses to 32px and is non-modal (UX-11)
**And** panels are resizable via `react-resizable-panels` or shadcn Resizable component
**And** the workspace is responsive: full experience at ≥1280px, tutor overlay at 1024-1279px, read-only mobile at <768px (UX-14)
**And** all animations respect `prefers-reduced-motion` (UX-25)
**And** loading indicators use a shared `useDelayedLoading` hook with a 500ms delay to prevent flash-of-spinner (UX-18)

### Story 3.6: Monaco Editor Integration

As a **learner**,
I want a code editor with Go syntax highlighting and keyboard shortcuts,
So that I can write code efficiently in my browser.

**Acceptance Criteria:**

**Given** the workspace layout is rendered (Story 3.5)
**When** the Monaco editor loads
**Then** milestone brief text renders immediately while Monaco lazy-loads in the background (UX-1)
**And** Monaco editor loads with Go syntax highlighting and project file structure within 1.5 seconds after app shell (NFR-P7)
**And** Monaco gets initial focus on workspace load (UX-15)
**And** `Escape` releases focus from Monaco (UX-15)
**And** a defined tab order moves through all workspace regions (UX-15)
**And** `⌘+Enter` is bound to Run Code with Monaco's default `⌘+Enter` binding unbound (UX-22)
**And** Monaco editor screen reader mode is enabled by default (NFR-A3)
**And** ARIA live regions are configured for dynamic content updates in the workspace (NFR-A3)
**And** code syntax highlighting color scheme meets WCAG AA contrast ratios against the dark background (NFR-A4)
**And** the dark theme is explicitly tested for contrast compliance (NFR-A4)

### Story 3.7: Terminal Output & Error Presentation

As a **learner**,
I want to see compilation output and errors presented clearly,
So that I can diagnose and fix issues in my code.

**Acceptance Criteria:**

**Given** a learner has submitted code for compilation
**When** execution events stream in via SSE
**Then** the terminal "Output" tab displays streaming compilation and runtime output in real-time (FR4, FR5)
**And** the terminal panel has two static-label tabs: "Output" and "Criteria" (UX-23)
**And** the "Criteria" tab is scaffolded as empty — populated by Epic 4
**And** errors use two-tier presentation: human-readable interpretation displayed above collapsible raw compiler output (UX-7)
**And** the interpretation describes the error; it never prescribes a fix (that is the tutor's role) (UX-7)
**And** user-code errors (compilation failures, runtime panics) are visually distinct from platform errors (FR24)
**And** platform errors show a user-friendly message with an option to retry
**And** screen reader live regions announce compilation completion (UX-16)
**And** the terminal uses JetBrains Mono font for code output (UX-10)

### Story 3.8: Workspace State Management

As a **developer**,
I want a well-structured state management layer for the workspace,
So that server state and UI state are managed predictably without prop drilling.

**Acceptance Criteria:**

**Given** the workspace is mounted
**When** state management initializes
**Then** TanStack Query v5 manages all server state (submissions, execution results, milestone data) with proper cache invalidation (ARCH-8)
**And** Zustand provides two UI stores: `useWorkspaceUIStore` (panel sizes, active tab, tutor visibility) and `useEditorStore` (file content, cursor position, dirty state) (ARCH-8)
**And** Monaco editor content syncs to `useEditorStore`
**And** SSE execution events update TanStack Query cache in real-time
**And** a client-side stuck detection timer is scaffolded: thresholds load from milestone config on workspace mount (ARCH-11) — actual stuck behavior is wired in Epic 6
**And** webapp initial JS bundle is <500KB gzipped with Monaco lazy-loaded separately (NFR-P10)
**And** webapp LCP is <2.5 seconds and TTI is <3.5 seconds (NFR-P5, NFR-P6)
**And** a Playwright E2E test validates LCP <2.5s and TTI <3.5s on workspace load (NFR-P5, NFR-P6)
**And** client-side route transitions complete in <200ms (NFR-P8)

---

## Epic 4: Milestone Content & Learning Loop

**Goal:** Engineers can view milestone briefs, load pre-scaffolded starter code, have acceptance criteria auto-evaluated on submission, see met/unmet status, complete milestones and advance, and access visual concept explainers.

**FRs covered:** FR1, FR3, FR6, FR7, FR8, FR13, FR45 (FR12 deferred as Soft MVP)
**ARCH requirements:** ARCH-16, ARCH-19
**NFRs:** NFR-P8, NFR-A5
**UX requirements:** UX-1, UX-5, UX-9, UX-12, UX-13, UX-20, UX-21

### Story 4.1: Milestone Content Model & Curriculum API

As a **developer**,
I want a curriculum API that serves structured milestone content,
So that the workspace can display briefs, criteria, and assets for any milestone.

**Acceptance Criteria:**

**Given** the curriculum plugin is registered on the Fastify server
**When** a client requests milestone content via the API
**Then** the response includes: brief with "Why This Matters" framing, learning objectives, acceptance criteria definitions, benchmark targets, and concept explainer asset references (FR45)
**And** milestone content is stored as structured files in the repository and served via API endpoints
**And** the `tracks` and `milestones` database tables are created or extended as needed to store track/milestone metadata and ordering (ARCH-19)
**And** the API returns milestones in sequence order within a track
**And** list endpoints use cursor-based pagination per ARCH-13
**And** all API responses use kebab-case routes and camelCase JSON fields (ARCH-21)
**And** endpoints require valid Firebase Auth token
**And** the Content CI workflow (scaffolded in Story 1.6) can validate that milestone content files conform to the expected structure (FR44)
**And** each milestone's acceptance criteria are defined as structured assertions with: criterion name, assertion type (stdout-contains, stdout-regex, exit-code-equals, output-line-count), expected value, and optional error hint
**And** the criterion assertion schema is defined in `packages/shared` as a TypeScript type exported for use by the evaluator, API, and Content CI

### Story 4.2: Milestone Brief & Starter Code Loading

As a **learner**,
I want to see the milestone brief and have starter code loaded into my editor,
So that I understand what to build and have a starting point at the right scaffolding level.

**Acceptance Criteria:**

**Given** a learner opens a milestone workspace
**When** the workspace loads
**Then** the milestone brief renders immediately with learning objectives and acceptance criteria listed (FR1)
**And** the brief uses "Why This Matters" framing to connect the milestone to real database engineering concepts
**And** the brief renders as part of the content-before-tools loading pattern — visible before Monaco finishes loading (UX-1)
**And** when starting a new milestone, pre-scaffolded starter code loads into the Monaco editor at the appropriate level for that milestone (FR3)
**And** the scaffolding level is appropriate to the milestone (e.g., Milestone 1 has more scaffolding, later milestones have less)
**And** the starter code is valid Go code that compiles (FR44 — validated by Content CI)
**And** the workspace tone is consistent with workshop atmosphere — no gamification, no patronizing encouragement (UX-5)

### Story 4.3: Acceptance Criteria Evaluation & Display

As a **learner**,
I want to see which acceptance criteria my code meets after each submission,
So that I know exactly what works and what still needs fixing.

**Acceptance Criteria:**

**Given** a learner has submitted code and execution completes
**When** the system evaluates acceptance criteria against the execution results
**Then** the evaluator parses execution output (stdout, stderr, exit code) against the structured assertion definitions from the milestone content (Story 4.1)
**And** each criterion is automatically scored as MET or NOT MET (FR6)
**And** the evaluator handles assertion types: exact string match, regex pattern match, numeric comparison (for benchmark thresholds), exit code check, and output line count
**And** if execution fails (compilation error or timeout), all criteria are marked NOT MET with the failure reason
**And** the "Criteria" tab in the terminal panel displays results using the diagnostic template: "[Criteria name]: MET/NOT MET" with expected vs actual values (FR7, UX-13)
**And** met criteria show a green check icon; not-met criteria show a gray dash — no red anywhere (UX-9)
**And** "NOT MET" is used instead of "FAILED" in all user-facing text (UX-13)
**And** criteria status updates are batched for screen reader announcements (UX-16)
**And** criteria evaluation results are persisted with the submission record in the database
**And** the criteria display maintains consistent ordering across submissions

### Story 4.4: Milestone Completion & Advancement

As a **learner**,
I want to complete a milestone when all criteria are met and advance to the next one,
So that I progress through building my database step by step.

**Acceptance Criteria:**

**Given** a learner has submitted code where all acceptance criteria are MET
**When** the system detects full criteria completion
**Then** the learner can trigger milestone completion and advance to the next milestone (FR8)
**And** milestone completion displays as a full-screen view, not a dialog (UX-21)
**And** the completion view shows: a criteria summary, engineering-grade language, and a next milestone preview (UX-21)
**And** there are no celebration animations, badges, streaks, or XP — consistent with workshop atmosphere (UX-5)
**And** a trajectory chart placeholder is present but not populated until Epic 7 adds benchmark data (UX-21)
**And** the emotional pattern follows the Strava model — satisfaction through accomplishment, not artificial reward (UX-21)
**And** route transition to the next milestone completes in <200ms (NFR-P8)
**And** `prefers-reduced-motion` is respected — trajectory chart glow and animations removed when active (UX-25)
**And** milestone completion status is persisted in the database

### Story 4.5: Visual Concept Explainers

As a **learner**,
I want to see annotated diagrams that explain key data structures,
So that I can visually understand the concepts behind what I'm building.

**Acceptance Criteria:**

**Given** a milestone has associated visual concept explainer assets
**When** the learner views the milestone workspace
**Then** annotated SVG diagrams for key data structures are accessible within the milestone context (FR13)
**And** explainers are static assets served with the milestone content via the curriculum API
**And** all SVGs have descriptive alt text for screen reader accessibility (NFR-A5)
**And** explainers are relevant to the current milestone's data structures and concepts
**And** the visual style is consistent with the dark-first design system (UX-9)
**And** explainers load without blocking the primary workspace rendering

### Story 4.6: Contextual Overview (First-Time & Milestone-Start)

As a **learner**,
I want to see a relevant overview when I start a milestone or use the platform for the first time,
So that I have the right context to begin working.

**Acceptance Criteria:**

**Given** a learner arrives at the workspace
**When** it is their first time using the platform
**Then** they see a first-time contextual overview with: introductory context, brief excerpt for Milestone 1, and a "Start Building" CTA (UX-20)
**And** when starting a new milestone (not the first visit), they see a milestone-start overview with zeroed stats and the milestone brief (UX-20)
**And** the returning-user variant is scaffolded with placeholder slots for session summary (populated by Epic 5) and benchmark data (populated by Epic 7) (UX-20)
**And** the overview uses workshop-appropriate language — no "welcome back" temporal framing (UX-3)
**And** the overview is keyboard-accessible and screen reader compatible (NFR-A1, NFR-A2)
**And** the CTA uses green accent as the sole primary action on screen (UX-9)

---

## Epic 5: Progress Persistence & Re-engagement

**Goal:** Engineers can auto-save work invisibly, resume exactly where they left off, start or continue sessions with a single action, view overall progress across milestones, and return after any absence with session summaries using zero temporal framing.

**FRs covered:** FR33, FR34, FR35, FR36, FR37, FR39
**ARCH requirements:** ARCH-19
**NFRs:** NFR-R5
**UX requirements:** UX-3, UX-5, UX-20

### Story 5.1: Auto-Save & Code Snapshot Persistence

As a **learner**,
I want my code saved automatically without any action on my part,
So that I never lose work due to browser crashes, tab closes, or network issues.

**Acceptance Criteria:**

**Given** a learner is editing code in the workspace
**When** 30-60 seconds have elapsed since the last save or the learner submits code
**Then** the current code state is persisted to the `code_snapshots` table silently — no UI indication, no save button (FR34)
**And** auto-save also triggers on `beforeunload` as a last-chance persist
**And** auto-save survives browser crash, tab close, and network interruption (NFR-R5)
**And** if a network save fails, the system retries with exponential backoff
**And** a migration creates the `sessions` and `code_snapshots` tables per ARCH-19/ARCH-20. `kysely-codegen` is re-run to update TypeScript types
**And** the `code_snapshots` table stores: snapshot ID (cuid2), user ID, milestone ID, session ID, file contents, and timestamp
**And** auto-save is completely invisible to the learner — no toasts, no spinners, no status indicators
**And** on code submission, the submission also creates a code snapshot as a save point

### Story 5.2: Session Resume & "Continue Building"

As a **returning learner**,
I want to pick up exactly where I left off with a single click,
So that I spend zero time navigating and get straight back to building.

**Acceptance Criteria:**

**Given** a learner has previously worked on a milestone
**When** they log in and land on the app
**Then** their default action is "Continue Building" — a single action with zero navigation decisions required (FR35)
**And** clicking "Continue Building" loads their active milestone workspace with: last saved code state, current milestone progress, and last submission results restored (FR33)
**And** the Monaco editor loads with the most recent code snapshot for the active milestone
**And** acceptance criteria status from the last submission is displayed in the Criteria tab
**And** logged-in learners land directly on their active milestone workspace by default (FR35)
**And** if no active session exists (brand new user), they are directed to the first milestone via the first-time contextual overview (Story 4.6)

### Story 5.3: Session Summary Generation

As a **system**,
I want to generate a natural-language session summary when a learner's session ends,
So that returning learners have useful context about where they left off.

**Acceptance Criteria:**

**Given** a learner's session ends
**When** the system generates the session summary
**Then** session end is detected via three mechanisms: (1) client-side `beforeunload` event sends a session-end signal to the API, (2) server-side heartbeat timeout — if no auto-save or API call is received for 15 minutes, the session is considered ended, (3) explicit logout
**And** for browser crash scenarios (no `beforeunload`), the server-side heartbeat timeout is the fallback — summary is generated on next login if no summary exists for the last session
**And** a migration creates the `session_summaries` table per ARCH-19/ARCH-20. `kysely-codegen` is re-run to update TypeScript types
**And** the summary is generated using a structured template that combines: current milestone name, criteria met/unmet with names, count of submissions in session, and a brief description of the latest code changes (derived from diff against session start snapshot) (FR36)
**And** the summary does NOT require an LLM call — it is deterministic and template-driven
**And** the template output reads as natural language despite being deterministic (e.g., "Working on Milestone 3: B-Tree Implementation. 3 of 5 criteria met. Focused on node splitting logic.")
**And** the summary uses zero temporal framing — no dates, no "welcome back," no "last time you," no relative timestamps (UX-3)
**And** the summary is written in engineering-appropriate language consistent with the workshop atmosphere (UX-5)
**And** the summary is pre-computed and stored, not generated on-the-fly at next login
**And** the `session_summaries` table stores: summary ID (cuid2), user ID, session ID, milestone ID, summary text, and created timestamp
**And** session summary generation is idempotent — generating a summary for an already-summarized session is a no-op
**And** if no meaningful activity occurred in the session (e.g., opened and immediately closed), no summary is generated

### Story 5.4: Session Summary Display for Returning Users

As a **returning learner**,
I want to see a summary of my last session when I come back,
So that I can quickly recall where I was and what to do next.

**Acceptance Criteria:**

**Given** a learner returns to the platform after a previous session
**When** the contextual overview loads
**Then** the returning-user variant displays the pre-computed session summary (FR37)
**And** this populates the returning-user contextual overview slot scaffolded in Story 4.6 (UX-20)
**And** the overview shows: milestone progress, next criteria to tackle, and current work context from the summary
**And** the summary uses zero temporal framing — no "2 days ago" or "welcome back" language (UX-3)
**And** a "Continue Building" CTA is prominently displayed as the primary action
**And** benchmark data slots in the returning-user overview remain as placeholders until Epic 7 populates them
**And** if no session summary exists (first visit or no prior activity), the first-time or milestone-start variant is shown instead

### Story 5.5: Overall Progress View

As a **learner**,
I want to see my progress across all milestones in the track,
So that I understand how far I've come and what's ahead.

**Acceptance Criteria:**

**Given** a learner accesses their progress view
**When** the progress data loads
**Then** the view shows all milestones in the track with status: completed, in-progress, or upcoming (FR39)
**And** completed milestones show the number of criteria met and completion indicator
**And** the in-progress milestone shows current criteria status (met/unmet count)
**And** upcoming milestones show title and brief description but no detailed content
**And** benchmark data slots are scaffolded per milestone but populated by Epic 7
**And** the progress view uses workshop-appropriate language — no gamification metrics like XP, streaks, or badges (UX-5)
**And** the view is keyboard-accessible and screen reader compatible (NFR-A1, NFR-A2)
**And** the progress view is responsive across all three breakpoints (UX-14)

---

## Epic 6: AI Socratic Tutor

**Goal:** Engineers can converse with a context-aware AI tutor that asks Socratic questions, streams responses in real-time via SSE, proactively intervenes via two-stage stuck detection, and surfaces visual concept explainers when the learner struggles with structural concepts.

**FRs covered:** FR14, FR15, FR16, FR17, FR18, FR19, FR38
**ARCH requirements:** ARCH-6, ARCH-7, ARCH-11
**NFRs:** NFR-P3, NFR-R7, NFR-R8, NFR-SC7
**UX requirements:** UX-2, UX-4, UX-11, UX-15, UX-16, UX-22, UX-24

### Story 6.1: Tutor Backend & Anthropic SDK Integration

As a **learner**,
I want an AI tutor that guides me with Socratic questions based on my actual code and progress,
So that I learn to solve problems myself rather than being given answers.

**Acceptance Criteria:**

**Given** the tutor plugin is registered on the Fastify server
**When** a learner sends a message to the tutor
**Then** the system calls the Anthropic API with a system prompt enforcing Socratic questioning — the tutor asks guiding questions, never provides direct answers or code solutions (FR14)
**And** the tutor request includes the learner's current code state, active milestone context, and acceptance criteria progress (FR15)
**And** the tutor request includes the learner's background (role, experience level, primary language) for personalized responses (FR16)
**And** tiered model routing is implemented: Haiku for Socratic dialogue (default), Sonnet for code analysis and conceptual explanation (ARCH-7)
**And** the tutor plugin imports only from `packages/shared` and `packages/*`, never from other plugins (ARCH-15)
**And** the tutor endpoint requires a valid Firebase Auth token

### Story 6.2: Tutor SSE Streaming & Conversation Persistence

As a **learner**,
I want to see the tutor's response as it's being generated,
So that I get immediate feedback without waiting for the full response.

**Acceptance Criteria:**

**Given** a learner sends a message to the tutor
**When** the Anthropic API begins generating a response
**Then** tokens stream to the client via SSE in real-time as they are generated (FR19)
**And** time-to-first-token is <1 second (NFR-P3); failure threshold is >3s TTFT in >5% of sessions
**And** a migration creates the `tutor_messages` table per ARCH-19/ARCH-20. `kysely-codegen` is re-run to update TypeScript types
**And** conversation messages (both learner and tutor) are persisted in the `tutor_messages` table
**And** when a learner returns after absence, the AI tutor receives the session summary as context (FR38)
**And** conversation history is included in the tutor context window up to configured limits
**And** prompt caching is enabled to reduce costs on repeated context (NFR-SC7)
**And** per-user rate limiting is enforced at 30 messages/min (NFR-S7)
**And** an integration test validates TTFT <1 second for a standard tutor request (NFR-P3)
**And** SSE streams use 30s heartbeat for connection keep-alive (ARCH-6)

### Story 6.3: Tutor Chat UI & Panel Integration

As a **learner**,
I want a clean, non-intrusive chat interface for the tutor,
So that I can ask questions without leaving my coding context.

**Acceptance Criteria:**

**Given** the workspace is loaded with the tutor panel (scaffolded in Story 3.4)
**When** the learner interacts with the tutor
**Then** the tutor panel displays a chat interface with conversation history and an input field
**And** the input is a single-line `<input>` element with placeholder "Ask a question..." (UX-24)
**And** `Enter` sends the message; the input is disabled while the tutor is streaming a response (UX-24)
**And** `⌘+/` toggles the tutor panel open/closed (UX-22)
**And** expanding the tutor panel does not steal focus from Monaco — focus remains in the editor unless the learner explicitly clicks the tutor input (UX-15)
**And** screen reader live regions announce the tutor's complete message on stream end, not per-token (UX-16)
**And** the tutor panel is non-modal and resizable within the workspace layout (UX-11)
**And** the chat panel uses a shared `useAutoScroll` hook that auto-scrolls on new messages but pauses when the user scrolls up manually (UX-18)
**And** SSE stream lifecycle is managed by a shared `useTutorStream` hook handling connection, reconnection, and cleanup (UX-18)
**And** on mobile (<768px), the tutor shows conversation history in read-only mode (UX-14)
**And** the chat uses JetBrains Mono for any code snippets in tutor responses (UX-10)

### Story 6.4: Two-Stage Stuck Detection & Proactive Intervention

As a **learner**,
I want the tutor to notice when I'm stuck and offer help without being intrusive,
So that I get unstuck faster without feeling watched or patronized.

**Acceptance Criteria:**

**Given** a learner is working on a milestone and has not made progress
**When** the client-side inactivity timer (scaffolded in Story 3.8) reaches the milestone-configured threshold
**Then** Stage 1 activates: a subtle green glow appears on the collapsed tutor panel as a non-intrusive signal (UX-4)
**And** if 60 additional seconds pass without activity, Stage 2 activates: the tutor panel auto-expands with a contextual Socratic question based on the learner's current code and criteria state (FR17, UX-4)
**And** a persistent background SSE connection is maintained per session for stuck detection, even when the tutor panel is collapsed (UX-2)
**And** stuck detection thresholds are loaded from milestone configuration on workspace mount (ARCH-11)
**And** thresholds can differ per milestone (earlier milestones may have shorter thresholds)
**And** the green glow respects `prefers-reduced-motion` — glow animation is removed, replaced with a static indicator (UX-25)
**And** if the learner dismisses the tutor or collapses the panel, stuck detection resets

### Story 6.5: Tutor-Surfaced Concept Explainers

As a **learner**,
I want the tutor to show me relevant diagrams when I'm struggling with a concept,
So that I can visually understand what I'm trying to build.

**Acceptance Criteria:**

**Given** a learner is conversing with the tutor and struggling with a structural concept
**When** the tutor detects the learner's difficulty relates to a concept with an available visual explainer
**Then** the tutor response includes a reference to the relevant visual concept explainer from the milestone content (FR18)
**And** the explainer renders inline in the chat or as a linked expandable element within the tutor panel
**And** the explainer assets are the same annotated SVGs created in Story 4.5
**And** the tutor's decision to surface an explainer is based on conversation context and the learner's specific struggle
**And** explainers include descriptive alt text for screen reader accessibility (NFR-A5)

### Story 6.6: Graceful Degradation & Availability

As a **learner**,
I want the core learning loop to work even if the AI tutor is unavailable,
So that I can keep building my database regardless of tutor status.

**Acceptance Criteria:**

**Given** the AI tutor service is unavailable (Anthropic API down, rate limit exceeded, or network issue)
**When** a learner attempts to use the tutor or stuck detection triggers
**Then** the core learning loop (edit → submit → evaluate criteria) continues to function fully without the tutor (NFR-R8)
**And** the tutor panel shows a non-intrusive notice indicating temporary unavailability — no error modals, no blocking UI
**And** stuck detection pauses its proactive intervention behavior during tutor unavailability
**And** tutor availability is instrumented from day one with metrics tracking uptime percentage (NFR-R7)
**And** the target is >95% tutor availability across sessions (NFR-R7)
**And** when the tutor becomes available again, the panel automatically recovers without requiring a page refresh
**And** tutor errors are reported to Sentry with context (model used, request size, error type)

---

## Epic 7: Benchmarks & Performance Narrative

**Goal:** Engineers can run standardized benchmarks against their code, see reference-normalized performance metrics with a hero display, view historical results within a milestone, and track their database's improvement across milestones via a trajectory visualization designed as a shareable artifact.

**FRs covered:** FR9, FR10, FR11, FR23
**ARCH requirements:** ARCH-9
**NFRs:** NFR-P2, NFR-R2, NFR-R3
**UX requirements:** UX-6, UX-8, UX-12, UX-21, UX-22, UX-25

### Story 7.1: Benchmark Runner & Reference Normalization

As a **developer**,
I want a benchmark execution pipeline that produces consistent, reference-normalized results,
So that learners can meaningfully compare their performance across submissions and milestones.

**Acceptance Criteria:**

**Given** a learner triggers a benchmark run
**When** the benchmark workload executes against the learner's code
**Then** standardized benchmark workloads run against the learner's compiled code in the Fly.io execution environment (FR23)
**And** the same workloads run against a pinned reference implementation to produce a normalization baseline
**And** results include both raw absolute numbers (ops/sec, latency) and a normalized ratio against the reference
**And** the reference implementation is pinned per track version and updated only with historical score migration (NFR-R3)
**And** benchmark results are consistent: ±5% variance in normalized ratio within a single session (NFR-R2)
**And** benchmark execution logic resides in `packages/execution` as shared code (ARCH-9)
**And** a migration creates the `benchmark_results` table per ARCH-19/ARCH-20. `kysely-codegen` is re-run to update TypeScript types
**And** benchmark results are stored in the `benchmark_results` table with: result ID (cuid2), submission ID, user ID, milestone ID, raw metrics, normalized ratio, reference version, and timestamp

### Story 7.2: Benchmark Results Display

As a **learner**,
I want to see my benchmark results presented clearly after each run,
So that I understand how my database implementation performs.

**Acceptance Criteria:**

**Given** a benchmark execution completes
**When** results are delivered to the client
**Then** the display shows a hero absolute number (large font, green text for improvement over previous run, white for regression) with a "(this session)" qualifier (FR9, UX-6)
**And** a secondary normalized ratio is displayed below the hero number (UX-6)
**And** benchmark round-trip completes in <10 seconds (NFR-P2); failure threshold is >10% exceeding 15s
**And** an integration test validates benchmark round-trip <10 seconds for a standard workload (NFR-P2)
**And** progressive loading states are driven by a shared `useBenchmarkProgress` hook implementing the 5-stage time-driven state machine: 0-2s spinner, 2-5s elapsed timer, 5-10s contextual message, 10-59s extended wait message, 60s timeout with diagnostic framing (UX-12, UX-18)
**And** results use engineering-grade language (e.g., "12,400 range scan ops/sec") — no casual or gamified language (UX-8)
**And** color is never the sole signal for improvement vs regression — text or icon also indicates direction (UX-9)
**And** all animations respect `prefers-reduced-motion` (UX-25)
**And** screen reader live regions announce benchmark completion and results (UX-16)
**And** benchmark-run frequency per milestone per user is tracked as an engagement metric — users completing criteria without voluntarily running benchmarks signals the emotional core isn't landing (UX Experience Instrumentation)

### Story 7.3: Historical Benchmark Results

As a **learner**,
I want to see how my benchmark results have changed across submissions within a milestone,
So that I can track whether my code changes are improving performance.

**Acceptance Criteria:**

**Given** a learner has multiple benchmark results within a milestone
**When** they view historical results
**Then** a list or chart shows benchmark results across submissions in chronological order (FR10)
**And** each entry shows the absolute metric, normalized ratio, and submission number
**And** the display indicates trend direction (improving or regressing) between consecutive results
**And** historical data is queried from the `benchmark_results` table filtered by user and milestone
**And** historical results are paginated using cursor-based pagination per ARCH-13
**And** engineering-grade language is used throughout — no "great job" or casual commentary (UX-8)
**And** the historical view is keyboard-accessible (NFR-A2)
**And** benchmark charts have data table alternatives for accessibility (NFR-A5)

### Story 7.4: Benchmark Trajectory Visualization

As a **learner**,
I want to see how my database has improved across all milestones,
So that I can appreciate the full arc of what I've built — and share it.

**Acceptance Criteria:**

**Given** a learner has completed benchmarks across multiple milestones
**When** they view the trajectory visualization
**Then** a chart shows their database's performance trajectory across milestones over time (FR11)
**And** the chart uses engineering language with specific metrics (e.g., "12,400 range scan ops/sec") — not abstract scores (UX-8)
**And** the visualization is designed as a shareable artifact: portfolio-grade, self-contained context for screenshots (UX-8)
**And** `⌘+Shift+Enter` is bound to Run Benchmark (UX-22)
**And** the chart is responsive and readable at all three breakpoints (UX-14)
**And** the chart has a data table alternative for screen reader accessibility (NFR-A5)
**And** chart animations respect `prefers-reduced-motion` — glow effects removed when active (UX-25)

### Story 7.5: Progressive Enhancements to Overview & Completion

As a **learner**,
I want benchmark data integrated into my milestone completion and overview screens,
So that my performance narrative is woven throughout the experience.

**Acceptance Criteria:**

**Given** a learner completes a milestone with benchmark data available
**When** the milestone completion view displays (Story 4.4)
**Then** the trajectory chart placeholder is now populated with the animated trajectory chart from Story 7.4 (UX-21)
**And** the completion view includes a benchmark summary showing key metrics for the completed milestone
**And** trajectory chart animation plays on completion view entry; respects `prefers-reduced-motion` (UX-25)
**Given** a returning learner views the contextual overview (Story 5.4)
**When** the returning-user variant loads
**Then** the benchmark data slots are populated with: last benchmark number and trend indicator (up/down/flat) (UX-20)
**Given** a learner views the overall progress view (Story 5.5)
**When** progress data loads
**Then** per-milestone benchmark data is displayed alongside completion status — showing the performance arc across the track

---

## Epic 8: User Account & Privacy

**Goal:** Users can manage their account settings, export all their data, delete their account and all associated data (GDPR compliance), and view a privacy policy page.

**FRs covered:** FR40, FR41, FR42
**ARCH requirements:** ARCH-5
**NFRs:** NFR-A1, NFR-A2
**UX requirements:** UX-9, UX-14

### Story 8.1: Account Settings Page

As a **user**,
I want to view and manage my account settings,
So that I can see my profile information and access account actions.

**Acceptance Criteria:**

**Given** a logged-in user navigates to account settings
**When** the settings page loads
**Then** the page displays the user's email address and background questionnaire data (role, experience level, primary language)
**And** the settings page is accessible from the workspace via a consistent navigation element
**And** the page uses dark-first color system consistent with the rest of the app (UX-9)
**And** the layout is responsive across all three breakpoints (UX-14)
**And** all interactive elements are keyboard-accessible with visible focus indicators (NFR-A1, NFR-A2)
**And** the page includes links/actions for data export (Story 8.2), account deletion (Story 8.3), and privacy policy (Story 8.4)
**And** the account plugin handles all account-related API endpoints (ARCH-5)

### Story 8.2: Data Export

As a **user**,
I want to download all my data from the platform,
So that I have a personal copy of my work and interactions.

**Acceptance Criteria:**

**Given** a user is on the account settings page
**When** they request a data export
**Then** the system collects all user data: code submissions, code snapshots, benchmark results, milestone progress, AI tutor conversations, session summaries, and profile information (FR41)
**And** the export is processed asynchronously via BullMQ to avoid blocking the request
**And** the user receives a notification or download link when the export is ready
**And** the exported file is a structured JSON or ZIP archive with clearly labeled sections
**And** the export includes metadata (export date, data categories included)
**And** the export endpoint requires valid Firebase Auth token matching the requesting user
**And** no other user's data is included in the export

### Story 8.3: Account Deletion

As a **user**,
I want to permanently delete my account and all associated data,
So that my information is fully removed from the platform per my privacy rights.

**Acceptance Criteria:**

**Given** a user is on the account settings page
**When** they initiate account deletion
**Then** a confirmation step requires the user to explicitly confirm the irreversible action (FR40)
**And** the confirmation uses clear, direct language about what will be deleted — no ambiguity
**And** upon confirmation, all user data is deleted from the database: `users`, `sessions`, `code_snapshots`, `submissions`, `benchmark_results`, `tutor_messages`, `session_summaries`, and any other user-associated records
**And** the user's Firebase Auth account is deleted
**And** the deletion is cascading and complete — no orphaned records remain
**And** after deletion, the user is logged out and redirected to the landing page
**And** the action is irreversible — the confirmation step makes this explicit
**And** deletion is processed within a reasonable timeframe (not deferred indefinitely)

### Story 8.4: Privacy Policy Page

As a **visitor**,
I want to read the privacy policy before or after signing up,
So that I understand how my data is collected, used, and protected.

**Acceptance Criteria:**

**Given** a visitor or logged-in user navigates to the privacy policy
**When** the page loads
**Then** a privacy policy page is displayed describing data collection practices, data usage, data retention, third-party services (Firebase Auth, Anthropic, Sentry), and user rights (export, deletion) (FR42)
**And** the page is accessible without authentication — no login required
**And** the page is linked from the signup flow (Story 2.2) and account settings (Story 8.1)
**And** the page uses dark-first styling consistent with the app (UX-9)
**And** the page is responsive across all breakpoints (UX-14)
**And** the page meets accessibility standards — proper heading hierarchy, readable text, keyboard navigable (NFR-A1)

---

## Epic 9: Landing Page & Marketing

**Goal:** Visitors can discover mycscompanion through an Astro landing page that communicates the value proposition with concrete proof, preview Milestone 1 content before signing up, initiate signup via CTA, and share via optimized Open Graph cards. SEO-optimized with visual consistency via shared Tailwind design tokens.

**FRs covered:** FR46, FR47, FR48, FR49, FR50
**ARCH requirements:** ARCH-3
**NFRs:** NFR-P4, NFR-P9, NFR-A6
**UX requirements:** UX-9, UX-10, UX-14

### Story 9.1: Astro Landing Page Scaffold & Design System

As a **developer**,
I want an Astro static site with shared design tokens and performance budgets,
So that the landing page is visually consistent with the webapp and loads fast.

**Acceptance Criteria:**

**Given** the `apps/website` Astro app is configured in the monorepo
**When** the site is built and deployed to `mycscompanion.dev`
**Then** it renders as a static site with zero client-side JavaScript dependencies on Firebase or the webapp (ARCH-3)
**And** Tailwind CSS is configured with shared design tokens from the webapp for visual consistency
**And** the dark-first color system is applied with green accent reserved for primary actions only (UX-9)
**And** typography uses Inter for body text and JetBrains Mono for code samples with `font-display: swap` (UX-10)
**And** semantic HTML is used throughout — proper heading hierarchy, landmark regions, lists, and article elements (NFR-A6)
**And** total JavaScript on the landing page is <50KB (NFR-P9)
**And** Largest Contentful Paint is <1.5 seconds on 4G throttled connection (NFR-P4)
**And** a Lighthouse CI check validates LCP <1.5s on 4G throttle (NFR-P4) and total JS <50KB (NFR-P9)
**And** the layout is responsive across all three breakpoints (UX-14)
**And** a custom ESLint rule or stylelint rule enforces no-red color usage across the codebase (UX-19)
**And** a CI check validates that each screen/route has at most one primary-action-colored element (UX-19)

### Story 9.2: Value Proposition & Concrete Proof

As a **visitor**,
I want to see exactly what I'll build and achieve on mycscompanion,
So that I can decide whether this is right for me based on real evidence.

**Acceptance Criteria:**

**Given** a visitor lands on `mycscompanion.dev`
**When** the landing page renders
**Then** the page communicates the core value proposition: build a database from scratch across 5 milestones (FR46)
**And** concrete proof is displayed: code screenshots from actual milestones, benchmark output examples with real metrics, and the full 5-milestone list (FR46)
**And** the language is engineering-grade and workshop-appropriate — no hype, no empty promises, no gamification language (UX-5)
**And** the page shows what the learner will actually build, not abstract descriptions
**And** all images have descriptive alt text (NFR-A6)
**And** the page structure follows a logical reading order for screen readers

### Story 9.3: Milestone 1 Preview

As a **visitor**,
I want to preview the first milestone before signing up,
So that I can evaluate the quality and depth of the content.

**Acceptance Criteria:**

**Given** a visitor is on the landing page
**When** they navigate to the Milestone 1 preview section
**Then** they can see the Milestone 1 brief with learning objectives (FR47)
**And** the starter code is displayed in a read-only code block with Go syntax highlighting (FR47)
**And** the acceptance criteria for Milestone 1 are listed (FR47)
**And** the preview is a static rendering — no Monaco editor, no interactive execution
**And** the preview gives a tangible sense of the learning experience without requiring signup
**And** a CTA to sign up is visible near the preview content

### Story 9.4: Signup CTA & Auth Redirect

As a **visitor**,
I want to sign up directly from the landing page,
So that I can start building without navigating to a separate page first.

**Acceptance Criteria:**

**Given** a visitor clicks the signup CTA on the landing page
**When** the CTA is activated
**Then** the visitor is redirected to `app.mycscompanion.dev` where Firebase Auth handles signup (FR48)
**And** the landing page at `mycscompanion.dev` has zero Firebase dependency — CTA is a simple link/redirect (ARCH-3)
**And** the CTA uses green accent as the sole primary action on the page (UX-9)
**And** the CTA meets 44x44px minimum touch target size (UX-17)
**And** the CTA is keyboard-accessible with visible focus indicator (NFR-A2)
**And** multiple CTAs are placed at strategic points on the page (hero section, after preview, footer) without competing for attention

### Story 9.5: SEO & Social Sharing

As a **visitor**,
I want to find mycscompanion via search engines and see a compelling preview when someone shares it,
So that the platform is discoverable and shareable.

**Acceptance Criteria:**

**Given** the landing page is deployed
**When** a search engine crawls the site or a user shares the URL
**Then** all pages have appropriate `<title>`, `<meta description>`, and canonical URL tags (FR50)
**And** structured data (JSON-LD) is included for rich search result snippets (FR50)
**And** Open Graph cards are optimized for social sharing with engineering-grade visuals — a benchmark screenshot or code snippet (FR49)
**And** Twitter Card meta tags are included for Twitter/X sharing
**And** OG images are pre-rendered at the correct dimensions for major platforms (1200x630)
**And** the OG card content is self-contained — communicates value without requiring click-through (UX-8)
**And** a `robots.txt` and `sitemap.xml` are generated as part of the Astro build

---

## Epic 10: Operations & Monitoring

**Goal:** Admin can monitor infrastructure health, manage execution job queues, review AI tutor conversation logs for prompt quality, query analytics data, and configure AI tutor prompts and stuck detection thresholds from external files.

**FRs covered:** FR51, FR52, FR54, FR55, FR56
**ARCH requirements:** ARCH-24
**NFRs:** NFR-SC1

### Story 10.1: Infrastructure Health Monitoring

As an **admin**,
I want to monitor infrastructure health and logs via external dashboards,
So that I can detect and respond to issues quickly.

**Acceptance Criteria:**

**Given** the platform is deployed to Railway
**When** the admin accesses monitoring tools
**Then** Railway dashboard shows service status, deployment history, and resource usage for all 6 services (api, worker, postgres, redis, webapp, website) (FR51, ARCH-22)
**And** Sentry dashboards show error rates, performance metrics, and deployment tracking (ARCH-24)
**And** Fastify pino JSON structured logs are queryable in Railway's log aggregation viewer (ARCH-24)
**And** logs include request IDs, user IDs (where applicable), and timestamps for traceability
**And** Sentry alerts (configured in Story 1.6) fire for unhandled errors and performance regressions
**And** no custom admin UI is built — all monitoring leverages external tooling

### Story 10.2: Execution Queue Management via Bull Board

As an **admin**,
I want to view and manage the code execution job queue,
So that I can identify stuck or failed jobs and take corrective action.

**Acceptance Criteria:**

**Given** the Bull Board route (scaffolded in Story 1.6) is deployed with real queue data
**When** the admin accesses Bull Board
**Then** the dashboard shows all BullMQ queues with job counts by status: waiting, active, completed, failed, delayed (FR52)
**And** the admin can inspect individual job details including payload, error messages, and attempt history
**And** the admin can retry failed jobs or remove stuck jobs from the queue
**And** access to Bull Board is restricted to admin credentials — not publicly accessible
**And** the dashboard reflects real-time queue state

### Story 10.3: AI Tutor Conversation Log Review

As an **admin**,
I want to review AI tutor conversations to assess prompt quality,
So that I can identify tuning opportunities and improve the tutoring experience.

**Acceptance Criteria:**

**Given** tutor conversations are stored in the `tutor_messages` table (from Story 6.2)
**When** the admin queries conversation logs
**Then** logs are queryable via direct database SQL queries or Metabase dashboards (FR54)
**And** each conversation log includes: user ID, milestone context, user background summary, conversation messages (learner + tutor), model used (Haiku/Sonnet), and timestamps
**And** logs support filtering by milestone, model tier, and date range
**And** the admin can identify patterns: common questions, areas where the Socratic approach breaks down, and topics where learners consistently struggle
**And** conversation log queries support cursor-based pagination per ARCH-13
**And** no custom admin UI is built — Metabase dashboards or direct SQL are sufficient at MVP

### Story 10.4: Analytics & Reporting

As an **admin**,
I want to query key platform metrics,
So that I can understand user behavior and identify improvement opportunities.

**Acceptance Criteria:**

**Given** the platform has active users
**When** the admin accesses analytics
**Then** the following metrics are queryable via direct SQL or Metabase: signup count, milestone completion rates, per-milestone dropout points, retention (returning users), average time-to-completion per milestone, and active user count (FR55)
**And** Metabase is connected to the PostgreSQL database with pre-configured dashboard queries for key metrics (ARCH-24)
**And** queries can filter by date range, milestone, and user cohort
**And** the system supports 100 concurrent users at MVP scale without analytics queries impacting platform performance (NFR-SC1)
**And** a cost tracking query is available that calculates per-user infrastructure cost based on Railway and Fly.io usage data (NFR-SC2)
**And** the cost query is documented with the formula and data sources, enabling monthly cost-per-user monitoring
**And** no custom analytics UI is built — Metabase and direct SQL are sufficient at MVP

### Story 10.5: External Configuration for Tutor & Stuck Detection

As an **admin**,
I want to update AI tutor prompts and stuck detection thresholds without deploying code,
So that I can tune the learning experience based on observed behavior.

**Acceptance Criteria:**

**Given** the platform is deployed
**When** the admin updates external configuration files
**Then** AI tutor system prompts (Socratic guidelines, persona instructions, context formatting) are loaded from external configuration files, not hardcoded (FR56)
**And** stuck detection inactivity thresholds are loaded from external configuration, configurable per milestone (FR56)
**And** model routing rules (when to use Haiku vs Sonnet) are configurable via external config
**And** configuration changes take effect on next request or server restart — no code deployment required
**And** invalid configuration is validated on load with clear error messages logged to Sentry
**And** a default configuration is bundled with the codebase as a fallback if external config is missing

---

## Epic 11: Persistent Execution Service (Architecture Pivot)

**Goal:** Replace the ephemeral Fly Machines execution model (Stories 3.1-3.3) with a persistent Go HTTP execution service that returns stdout/stderr directly in the HTTP response. Eliminates ~2min cold starts and fixes broken stdout capture (0% output). Target: <5s round-trip, 100% output capture, ~70% code reduction in execution processor.

**Supersedes:** Stories 3.1, 3.2, 3.3 execution approach (ephemeral Fly Machines)
**ADR:** `_bmad-output/implementation-artifacts/adr-persistent-execution-service.md`
**Research:** `_bmad-output/planning-artifacts/research/technical-browser-code-execution-research-2026-03-17.md`

**FRs covered:** FR4, FR20, FR21, FR22, FR24
**NFRs:** NFR-P1, NFR-P2, NFR-S1, NFR-R4, NFR-R6, NFR-SC1, NFR-SC5

**Critical production failures driving this epic:**
1. ~2 minute cold starts per submission (Fly Machine provisioning: 30-90s before code even compiles)
2. Stdout capture completely broken (Fly Machines API returns 404 for per-machine logs; platform logs API returns 401 with Machines API tokens)

### Story 11.1: Go Execution Server & Dockerfile

As a **developer**,
I want a persistent Go HTTP execution service that compiles and runs user Go code,
So that code submissions return output directly in the HTTP response without VM provisioning.

**Acceptance Criteria:**

**Given** the execution service needs to compile and run learner Go code
**When** an HTTP POST request is sent to `/execute` with base64-encoded Go source
**Then** a Go HTTP server in `infra/fly-execution/server/` handles the request with `main.go` (HTTP server, routing) and `executor.go` (subprocess management, tmpdir lifecycle, timeout)
**And** the server creates an isolated temporary workspace per request (`os.MkdirTemp`), writes `main.go` and `go.mod`, runs `go build` with timeout, runs the binary with args and timeout, and returns structured JSON: `{ stdout, stderr, exit_code, duration_ms, build_duration_ms, run_duration_ms }`
**And** cleanup of temporary workspaces happens via `defer os.RemoveAll` (runs even on panic)
**And** a `/health` endpoint returns 200 OK for Fly.io health checks
**And** authentication is enforced via `Authorization: Bearer <MCC_EXECUTION_SECRET>` on every `/execute` request
**And** a semaphore caps concurrent executions (e.g., 10) to prevent CPU/memory exhaustion
**And** subprocess isolation includes: `ulimit -u 256` (fork bomb prevention), `context.WithTimeout` (kills subprocess tree after N seconds), isolated tmpdir per request, non-root `runner` user
**And** the Dockerfile at `infra/fly-execution/Dockerfile` uses multi-stage build: Stage 1 builds the Go server binary, Stage 2 is the runtime image with Go toolchain (needed for compiling user code) + the server binary + `runner` user
**And** the Go build cache is pre-warmed at container startup by compiling a hello-world program that imports common stdlib packages
**And** the server is tested locally with Docker: `docker build && docker run -p 8080:8080` + curl tests
**And** Go unit tests and integration tests exist using `net/http/httptest` covering: successful compilation, compilation errors (invalid Go code returns stderr), timeout handling (infinite loop terminates correctly), concurrent request isolation, fork bomb prevention, authentication rejection (missing/wrong token)
**And** HTTP response is always 200 OK — `exit_code` conveys success/failure (0 = success, 2 = compilation failure, non-zero = runtime failure)

### Story 11.2: Backend Integration & Execution Processor Rewrite

As a **developer**,
I want the BullMQ execution worker to call the persistent execution service via a single HTTP POST,
So that the execution pipeline is simplified from 5+ API calls to 1 and stdout capture works reliably.

**Acceptance Criteria:**

**Given** the persistent execution service from Story 11.1 is available
**When** a code submission job is processed by the BullMQ worker
**Then** a new `execution-service-client.ts` in `packages/execution/` encapsulates the HTTP POST to `/execute` with `ExecuteRequest` and `ExecuteResponse` types matching the ADR specification
**And** the execution processor is rewritten: the entire Fly Machine lifecycle (create → wait started → wait stopped → fetch logs → get exit code → destroy) is replaced by a single call to `ExecutionServiceClient.execute()`
**And** the `ExecuteResponse.stdout` is used directly for criteria evaluation (replaces broken log-fetched output)
**And** the `ExecuteResponse.stderr` is used for compilation error display
**And** the `ExecuteResponse.exit_code` determines success/failure (replaces `analyzeOutput` + machine state inspection)
**And** SSE event publishing is preserved: `output` event with stdout, `compile_error` event with stderr, `complete` event with exit code and criteria results, `error` event for platform failures, `timeout` event for execution timeouts
**And** BullMQ job handling, retry logic, and concurrency settings are preserved unchanged
**And** criteria evaluation logic is preserved unchanged (evaluates against stdout from HTTP response instead of log messages)
**And** benchmark phase integration point is preserved (when implemented, uses another `/execute` call with reference code)
**And** database updates to `submissions` table are preserved — `execution_result` JSON shape is unchanged
**And** `fly-config.ts` is simplified to contain only `executionServiceUrl` (from `MCC_EXECUTION_URL`) and timeout settings
**And** dead code is removed: `fly-client.ts`, `fly-api-types.ts`, `machine-request-builder.ts`, `fetchMachineLogs`, `readNdjsonMessages`, `startLogStream`, `analyzeOutput`, `truncateOutput`, all Fly Machine lifecycle code
**And** `packages/execution/index.ts` exports are updated to reflect the new module structure
**And** existing tests for Fly Machine lifecycle are removed and replaced with tests for the new execution service client (using `msw` v2 HTTP handlers to mock the execution service)
**And** the execution processor tests verify: successful execution → SSE events published, compilation error → `compile_error` SSE event, timeout → `timeout` SSE event, service unavailable → retry via BullMQ

### Story 11.3: Fly Deployment, Cutover & E2E Validation

As a **developer**,
I want the persistent execution service deployed to Fly.io and the backend worker pointed at it,
So that the new execution pipeline is live in production with verified end-to-end functionality.

**Acceptance Criteria:**

**Given** the Go execution server (Story 11.1) and backend integration (Story 11.2) are complete
**When** the deployment and cutover are executed
**Then** `infra/fly-execution/fly.toml` is configured with: `app = "mcc-execution"`, `primary_region = "sin"`, `internal_port = 8080`, `auto_stop_machines = "off"`, `auto_start_machines = true`, `min_machines_running = 1`, `shared-cpu-4x` with 1024MB RAM
**And** the execution service is deployed to Fly.io via `flyctl deploy` with `MCC_EXECUTION_SECRET` set as a Fly secret
**And** the `/health` endpoint returns 200 OK after deployment (verified via `flyctl status` and direct curl)
**And** `MCC_EXECUTION_URL` and `MCC_EXECUTION_SECRET` environment variables are set on the Railway worker service
**And** old environment variables are removed from Railway: `MCC_FLY_API_TOKEN`, `MCC_FLY_LOGS_TOKEN`, `MCC_FLY_APP_NAME`
**And** the updated backend worker is deployed to Railway
**And** end-to-end validation passes: submit valid Go code → compilation succeeds → stdout displayed in terminal → acceptance criteria evaluated → result stored in database
**And** end-to-end validation passes for error cases: submit invalid Go code → compilation error displayed in terminal with stderr → no Sentry alert
**And** submission round-trip latency is <5 seconds (measured from SSE `output` event timestamp minus job creation timestamp)
**And** stdout capture rate is 100% (non-empty stdout for all compilable submissions)
**And** existing BullMQ retry behavior works: if execution service is temporarily unavailable, jobs are retried with exponential backoff

### Story 11.4: CI/CD Pipeline & Documentation Cleanup

As a **developer**,
I want automated deployment for the execution service and updated documentation,
So that the new architecture is maintained and documented for future development.

**Acceptance Criteria:**

**Given** the persistent execution service is deployed and validated (Story 11.3)
**When** changes are pushed to `infra/fly-execution/**` on the main branch
**Then** a GitHub Actions workflow at `.github/workflows/deploy-execution.yml` runs Go tests (`cd infra/fly-execution/server && go test ./...`) and deploys to Fly.io via `flyctl deploy` (using `FLY_API_TOKEN` secret)
**And** the workflow only triggers on changes to `infra/fly-execution/**` (path filter)
**And** deployment only proceeds if tests pass
**And** `project-context.md` is updated: `@mycscompanion/execution` description reflects the new execution service client (not Fly Machine config); `MCC_EXECUTION_URL` and `MCC_EXECUTION_SECRET` replace `MCC_FLY_API_TOKEN` in env var conventions; NFR-S1 note updated to reflect process-level isolation with upgrade path to nsjail
**And** the existing execution image CI workflow (if any, for the old Fly Machine image) is removed or updated
**And** no orphaned Fly Machine resources remain (old app cleaned up if separate from new app)
