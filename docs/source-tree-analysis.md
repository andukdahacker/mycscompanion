# Source Tree Analysis — mycscompanion

**Generated:** 2026-03-20 | **Scan Level:** Exhaustive

## Complete Annotated Directory Tree

```
mycscompanion/
├── .github/
│   └── workflows/
│       └── content-ci.yml                    # Content validation CI (scaffold)
├── .env.example                              # All env vars documented
├── .nvmrc                                    # Node.js version (>=20)
├── docker-compose.yml                        # Local dev: PostgreSQL 16 + Redis 7 + execution + metabase
├── turbo.json                                # Pipeline: build, dev, test, lint, typecheck
├── package.json                              # pnpm workspaces root (pnpm@10.30.2)
├── pnpm-workspace.yaml                       # Workspace: apps/*, packages/*
├── tsconfig.base.json                        # Shared TS config (strict, ES2022, bundler)
├── eslint.config.js                          # Delegates to packages/config
│
├── apps/
│   ├── backend/                              # ── Fastify API + BullMQ Worker ──
│   │   ├── migrations/                       # Kysely migration files (001-013)
│   │   │   ├── 001_initial_schema.ts         #   Core: users, tracks, milestones
│   │   │   ├── 002_add_user_onboarding.ts    #   Onboarding fields
│   │   │   ├── 003_add_skill_assessment.ts   #   Skill floor assessment
│   │   │   ├── 004_add_submissions.ts        #   Code submissions + execution results
│   │   │   ├── 005_add_user_milestones.ts    #   Completion tracking
│   │   │   ├── 006_add_sessions_and_code_snapshots.ts  # Sessions + auto-save
│   │   │   ├── 007_add_session_summaries.ts  #   AI-generated session summaries
│   │   │   ├── 008_add_tutor_messages.ts     #   Tutor conversation history
│   │   │   ├── 009_add_benchmark_results.ts  #   Performance benchmarking
│   │   │   ├── 010_add_data_exports.ts       #   GDPR data export
│   │   │   ├── 011_add_tutor_analytics_views.ts  # Tutor analytics views
│   │   │   ├── 012_add_platform_analytics_views.ts  # Platform analytics views
│   │   │   └── 013_add_multi_file_support.ts #   Multi-file submissions (M2+)
│   │   ├── src/
│   │   │   ├── server.ts                     # HTTP server entry (port 3001)
│   │   │   ├── app.ts                        # Fastify app builder + plugin registration
│   │   │   ├── instrument.ts                 # Sentry instrumentation
│   │   │   ├── plugins/
│   │   │   │   ├── auth/                     # Firebase token verification
│   │   │   │   │   ├── index.ts              #   onRequest hook (global)
│   │   │   │   │   └── firebase.ts           #   Firebase Admin SDK init
│   │   │   │   ├── execution/                # Code execution API
│   │   │   │   │   ├── index.ts              #   Plugin registration
│   │   │   │   │   └── routes/
│   │   │   │   │       ├── submit.ts         #   POST /api/execution/submit
│   │   │   │   │       ├── stream.ts         #   GET /api/execution/:id/stream (SSE)
│   │   │   │   │       └── benchmark-results.ts  # Benchmark query routes
│   │   │   │   ├── tutor/                    # AI tutoring system
│   │   │   │   │   ├── index.ts              #   Plugin + circuit breaker
│   │   │   │   │   ├── routes/
│   │   │   │   │   │   ├── message.ts        #   POST /api/tutor/:sessionId/message
│   │   │   │   │   │   ├── stream.ts         #   POST /api/tutor/:sessionId/stream (SSE)
│   │   │   │   │   │   ├── history.ts        #   GET /api/tutor/:sessionId/messages
│   │   │   │   │   │   ├── health.ts         #   GET /api/tutor/health
│   │   │   │   │   │   ├── stuck-intervention.ts  # Stuck detection handler
│   │   │   │   │   │   └── degradation.ts    #   Circuit breaker health
│   │   │   │   │   └── services/
│   │   │   │   │       ├── anthropic.ts      #   Anthropic SDK + model routing
│   │   │   │   │       ├── context-assembler.ts  # System prompt assembly
│   │   │   │   │       ├── stuck-context-assembler.ts  # Stuck intervention prompts
│   │   │   │   │       ├── circuit-breaker.ts  # Circuit breaker pattern
│   │   │   │   │       ├── config-loader.ts  #   YAML model routing config
│   │   │   │   │       ├── conversation-history.ts  # Message loading
│   │   │   │   │       └── tutor-metrics.ts  #   Redis metrics collection
│   │   │   │   ├── curriculum/               # Content serving
│   │   │   │   │   ├── index.ts
│   │   │   │   │   ├── content-loader.ts     #   Filesystem + Redis caching
│   │   │   │   │   └── routes/
│   │   │   │   │       ├── tracks.ts         #   GET /api/curriculum/tracks
│   │   │   │   │       └── milestones.ts     #   GET /api/curriculum/milestones/:id
│   │   │   │   ├── progress/                 # Session & progress management
│   │   │   │   │   ├── index.ts
│   │   │   │   │   ├── routes/
│   │   │   │   │   │   ├── overview.ts       #   GET /api/progress/overview
│   │   │   │   │   │   ├── auto-save.ts      #   POST /api/progress/save
│   │   │   │   │   │   ├── latest-snapshot.ts  # GET /api/progress/snapshots/:id/latest
│   │   │   │   │   │   ├── sessions.ts       #   POST /api/progress/sessions
│   │   │   │   │   │   ├── session-end.ts    #   POST /api/progress/sessions/end
│   │   │   │   │   │   ├── resume.ts         #   GET /api/progress/resume/:id
│   │   │   │   │   │   └── track-progress.ts #   GET /api/progress/track-progress
│   │   │   │   │   └── services/
│   │   │   │   │       ├── summary-generator.ts  # AI session summaries
│   │   │   │   │       └── stale-session-handler.ts  # 15-min timeout cleanup
│   │   │   │   ├── completion/               # Milestone completion
│   │   │   │   │   └── routes/
│   │   │   │   │       └── completion.ts     #   GET/POST /api/completion/:id
│   │   │   │   ├── account/                  # User account management
│   │   │   │   │   ├── profile.ts            #   GET /api/account/profile
│   │   │   │   │   ├── onboarding.ts         #   POST /api/account/onboarding
│   │   │   │   │   ├── skill-assessment.ts   #   POST /api/account/skill-assessment
│   │   │   │   │   ├── export.ts             #   POST/GET /api/account/export*
│   │   │   │   │   └── delete.ts             #   DELETE /api/account
│   │   │   │   └── admin/                    # Admin tools
│   │   │   │       └── routes/
│   │   │   │           └── reload-config.ts  #   POST /admin/reload-config
│   │   │   ├── shared/
│   │   │   │   ├── db.ts                     # Kysely database connection
│   │   │   │   ├── redis.ts                  # Redis client (ioredis)
│   │   │   │   ├── queue.ts                  # BullMQ queue definitions
│   │   │   │   ├── event-publisher.ts        # Redis pub/sub for SSE
│   │   │   │   ├── rate-limiter.ts           # Sliding window rate limiter
│   │   │   │   ├── criteria-evaluator.ts     # Acceptance criteria evaluation
│   │   │   │   ├── benchmark-persistence.ts  # Benchmark result storage
│   │   │   │   └── id.ts                     # cuid2 ID generation
│   │   │   ├── worker/
│   │   │   │   ├── worker.ts                 # BullMQ worker entry point
│   │   │   │   └── processors/
│   │   │   │       ├── execution-processor.ts  # Code execution jobs
│   │   │   │       └── export-processor.ts   # Data export jobs
│   │   │   ├── test/                         # Test utilities
│   │   │   │   ├── setup.ts, global-setup.ts
│   │   │   │   ├── test-app.ts, test-db.ts
│   │   │   │   └── *.test.ts                 # Health, error, logging tests
│   │   │   └── scripts/
│   │   │       └── seed.ts                   # Database seeding
│   │   ├── kysely.config.ts                  # Migration config
│   │   ├── vitest.config.ts
│   │   ├── railway.toml                      # Railway API deployment
│   │   └── railway.worker.toml               # Railway worker deployment
│   │
│   ├── webapp/                               # ── React SPA (Vite + SWC) ──
│   │   ├── src/
│   │   │   ├── main.tsx                      # Entry: Sentry + StrictMode
│   │   │   ├── App.tsx                       # Router + QueryClient + lazy routes
│   │   │   ├── routes/
│   │   │   │   ├── SignIn.tsx                # Email + GitHub auth
│   │   │   │   ├── SignUp.tsx                # Registration
│   │   │   │   ├── Onboarding.tsx            # Questionnaire + skill assessment
│   │   │   │   ├── Overview.tsx              # Current milestone (lazy)
│   │   │   │   ├── Progress.tsx              # All milestones (lazy)
│   │   │   │   ├── Workspace.tsx             # Code editor workspace (lazy)
│   │   │   │   ├── Completion.tsx            # Milestone completion (lazy)
│   │   │   │   ├── AccountSettings.tsx       # Profile + export + delete (lazy)
│   │   │   │   ├── NotReady.tsx              # Skill floor failed
│   │   │   │   └── PrivacyPolicy.tsx         # Privacy policy
│   │   │   ├── components/
│   │   │   │   ├── common/
│   │   │   │   │   └── ProtectedRoute.tsx    # Auth + onboarding gate
│   │   │   │   ├── workspace/                # 20+ workspace components
│   │   │   │   │   ├── CodeEditor.tsx        #   Monaco Go editor wrapper
│   │   │   │   │   ├── TerminalPanel.tsx     #   Output/criteria/brief tabs
│   │   │   │   │   ├── TutorPanel.tsx        #   AI chat interface
│   │   │   │   │   ├── WorkspaceLayout.tsx   #   Resizable panels + shortcuts
│   │   │   │   │   ├── BenchmarkHeroDisplay.tsx  # Benchmark result card
│   │   │   │   │   ├── FileTabs.tsx          #   Multi-file tabs (M2)
│   │   │   │   │   └── ...                   #   Error, brief, skeleton, etc.
│   │   │   │   ├── overview/                 # Overview components
│   │   │   │   ├── progress/                 # Progress listing
│   │   │   │   ├── onboarding/               # Skill floor check
│   │   │   │   ├── completion/               # Completion skeleton
│   │   │   │   └── settings/                 # Account settings, delete dialog
│   │   │   ├── hooks/                        # 27 custom hooks
│   │   │   │   ├── use-auth.ts               #   Firebase auth state
│   │   │   │   ├── use-auto-save.ts          #   30s debounced code save
│   │   │   │   ├── use-submit-code.ts        #   Execution orchestrator
│   │   │   │   ├── use-sse.ts                #   SSE with reconnect
│   │   │   │   ├── use-tutor-stream.ts       #   Tutor SSE streaming
│   │   │   │   ├── use-stuck-detection.ts    #   2-stage stuck detection
│   │   │   │   ├── use-benchmark-progress.ts #   Benchmark state machine
│   │   │   │   └── ...                       #   Session, overview, completion, etc.
│   │   │   ├── stores/
│   │   │   │   ├── editor-store.ts           # Zustand: code content, files, cursor
│   │   │   │   └── workspace-ui-store.ts     # Zustand: tutor, tabs, breakpoint
│   │   │   └── lib/
│   │   │       ├── api-fetch.ts              # Authenticated fetch + token refresh
│   │   │       ├── firebase.ts               # Firebase init + auth functions
│   │   │       ├── sentry.ts                 # Sentry error tracking
│   │   │       ├── parse-sse-stream.ts       # SSE line parser (async generator)
│   │   │       └── parse-explainer-refs.ts   # [explainer:file.svg] parser
│   │   ├── e2e/                              # Playwright E2E tests
│   │   │   ├── a11y.test.ts                  # Accessibility (axe-core)
│   │   │   ├── canary.test.ts                # Smoke test
│   │   │   ├── benchmark-roundtrip.spec.ts   # Full benchmark flow
│   │   │   └── workspace-performance.spec.ts # Execution perf test
│   │   ├── vite.config.ts, playwright.config.ts, vitest.config.ts
│   │   └── railway.toml                      # Railway static site deployment
│   │
│   └── website/                              # ── Astro Static Landing Page ──
│       ├── src/
│       │   ├── pages/
│       │   │   └── index.astro               # Landing page (build-time content loading)
│       │   ├── layouts/
│       │   │   └── Base.astro                # Root layout + SEO meta tags
│       │   └── styles/
│       │       └── globals.css               # Typography system + Tailwind
│       ├── public/og/                        # Open Graph images
│       └── astro.config.mjs                  # Site: mycscompanion.com, sitemap
│
├── packages/
│   ├── config/                               # ── Shared Configuration ──
│   │   ├── test-utils/
│   │   │   ├── index.ts                      # Test utility exports
│   │   │   ├── mock-redis.ts                 # In-memory Redis mock
│   │   │   ├── mock-firebase-auth.ts         # Firebase auth mock
│   │   │   └── query-client.ts               # Test QueryClient (no cache/retry)
│   │   ├── vitest.config.ts                  # Base Vitest config
│   │   ├── eslint.config.ts                  # Base ESLint config
│   │   └── tailwind-tokens.css               # Design token CSS variables
│   │
│   ├── shared/                               # ── Shared Types & Utilities ──
│   │   ├── src/
│   │   │   ├── types/
│   │   │   │   ├── db.ts                     # Kysely-codegen DB interfaces (12 tables + 8 views)
│   │   │   │   ├── api.ts                    # Request/response types (224 lines)
│   │   │   │   ├── curriculum.ts             # AcceptanceCriterion, BenchmarkConfig, etc.
│   │   │   │   ├── domain.ts                 # UserRole, ExperienceLevel, PrimaryLanguage
│   │   │   │   └── index.ts                  # Type barrel exports
│   │   │   ├── constants.ts                  # TRACKS, MILESTONES constants
│   │   │   ├── to-camel-case.ts              # snake_case → camelCase converter
│   │   │   └── index.ts                      # Package exports
│   │   └── vitest.config.ts
│   │
│   ├── ui/                                   # ── UI Component Library ──
│   │   ├── src/
│   │   │   ├── components/ui/
│   │   │   │   ├── alert-dialog.tsx          # Radix AlertDialog
│   │   │   │   ├── button.tsx                # CVA variants (6 variants, 5 sizes)
│   │   │   │   ├── card.tsx                  # Composable card system
│   │   │   │   ├── collapsible.tsx           # Radix Collapsible
│   │   │   │   ├── dialog.tsx                # Radix Dialog
│   │   │   │   ├── input.tsx                 # Text input
│   │   │   │   ├── label.tsx                 # Form label
│   │   │   │   ├── radio-group.tsx           # Radix RadioGroup
│   │   │   │   ├── resizable.tsx             # react-resizable-panels
│   │   │   │   ├── scroll-area.tsx           # Radix ScrollArea
│   │   │   │   ├── select.tsx                # Radix Select
│   │   │   │   ├── separator.tsx             # Radix Separator
│   │   │   │   └── skeleton.tsx              # Loading placeholder
│   │   │   ├── lib/utils.ts                  # cn() — clsx + tailwind-merge
│   │   │   └── index.ts                      # Barrel exports
│   │   └── components.json                   # shadcn/ui config
│   │
│   └── execution/                            # ── Execution Service Package ──
│       ├── src/
│       │   ├── events.ts                     # ExecutionEvent discriminated union (SSE types)
│       │   ├── fly-config.ts                 # ExecutionServiceConfig
│       │   ├── execution-service-client.ts   # HTTP client for Go execution server
│       │   ├── benchmark-runner.ts           # Benchmark output parser + median computation
│       │   └── index.ts                      # Barrel exports
│       └── vitest.config.ts
│
├── content/                                  # ── Curriculum Content ──
│   ├── milestones/
│   │   ├── 01-kv-store/                      # Milestone 1: Key-Value Store
│   │   │   ├── brief.md                      #   Learning brief (what/why/how)
│   │   │   ├── acceptance-criteria.yaml      #   8 criteria (put, get, delete, persist, etc.)
│   │   │   ├── benchmark-config.yaml         #   sequential-inserts benchmark
│   │   │   ├── metadata.yaml                 #   CS concept label, stuck detection
│   │   │   ├── assets/manifest.yaml          #   Concept explainer SVG diagrams
│   │   │   ├── starter-code/main.go          #   80% scaffolded Go code
│   │   │   └── reference-impl/main.go        #   Complete reference solution
│   │   ├── 02-storage-engine/                # Milestone 2: WAL + Storage Engine
│   │   │   ├── brief.md, criteria, benchmark, metadata
│   │   │   ├── starter-code/                 #   Multi-file: main.go, kv.go, wal.go, harness.go
│   │   │   └── reference-impl/              #   Multi-file reference
│   │   ├── 03-btree-indexing/                # Milestone 3 (placeholder)
│   │   ├── 04-query-parser/                  # Milestone 4 (placeholder)
│   │   └── 05-transactions/                  # Milestone 5 (placeholder)
│   ├── prompts/
│   │   ├── tutor-base.md                     # Socratic tutor system prompt
│   │   └── stuck-intervention.md             # Stuck detection intervention prompt
│   └── schema/
│       ├── acceptance-criteria.schema.json    # Criteria YAML schema
│       ├── benchmark-config.schema.json       # Benchmark YAML schema
│       ├── milestone-metadata.schema.json     # Metadata YAML schema
│       └── concept-explainer-manifest.schema.json  # Asset manifest schema
│
├── infra/
│   └── fly-execution/                        # ── Go Code Execution Sandbox ──
│       ├── Dockerfile                        # 2-stage build (golang:1.23-alpine)
│       ├── fly.toml                          # Fly.io deployment config
│       └── server/
│           ├── main.go                       # HTTP server (port 8080, auth, semaphore)
│           └── executor.go                   # Code execution (build + run + timeout)
│
└── scripts/
    ├── validate-no-red.sh                    # Ensure no raw red colors (use semantic tokens)
    └── validate-primary-action.sh            # Max one primary CTA per page
```

## Critical Folders

| Folder | Purpose | Key Files |
|---|---|---|
| `apps/backend/src/plugins/` | All API business logic, organized by domain | 7 plugin directories |
| `apps/backend/migrations/` | Database schema evolution | 13 migration files |
| `apps/backend/src/worker/` | Background job processing | execution-processor.ts, export-processor.ts |
| `apps/webapp/src/hooks/` | All data fetching and real-time logic | 27 custom hooks |
| `apps/webapp/src/components/workspace/` | Core interactive workspace | 20+ components |
| `packages/shared/src/types/` | Cross-app type contracts | db.ts, api.ts, curriculum.ts |
| `packages/execution/src/` | Execution domain shared code | events.ts, client, benchmark runner |
| `content/milestones/` | Curriculum content (Go + YAML) | 5 milestone directories |
| `infra/fly-execution/server/` | Isolated code execution | main.go, executor.go |

## Entry Points

| Entry Point | File | Purpose |
|---|---|---|
| API Server | `apps/backend/src/server.ts` | Fastify HTTP on port 3001 |
| Worker | `apps/backend/src/worker/worker.ts` | BullMQ job processor |
| Webapp | `apps/webapp/src/main.tsx` | React SPA entry |
| Website | `apps/website/src/pages/index.astro` | Astro landing page |
| Execution | `infra/fly-execution/server/main.go` | Go HTTP on port 8080 |
