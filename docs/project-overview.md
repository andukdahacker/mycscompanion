# Project Overview — mycscompanion

**Generated:** 2026-03-20 | **Mode:** Exhaustive Scan | **Repository Type:** Monorepo

## Executive Summary

mycscompanion is a full-stack web application that teaches computer science by having learners build real systems in Go. The platform provides an interactive workspace with a Monaco code editor, AI-powered Socratic tutoring (Anthropic Claude), automated code execution with benchmarking, and a structured curriculum of progressive milestones.

The current curriculum track is **"Build Your Own Database"** with 5 milestones:
1. Key-Value Store (M1) — single-file
2. Storage Engine / WAL (M2) — multi-file
3. B-Tree Indexing (M3)
4. Query Parser (M4)
5. Transactions (M5)

## Technology Stack

| Category | Technology | Version | Purpose |
|---|---|---|---|
| **Runtime** | Node.js | >=20 | Server runtime |
| **Package Manager** | pnpm | 10.30.2 | Monorepo dependency management |
| **Monorepo** | Turborepo | ^2.4.4 | Build orchestration, caching |
| **Language** | TypeScript | ~5.8.3 | Full-stack type safety |
| **API Framework** | Fastify | ^5.3.3 | HTTP server (backend) |
| **Frontend Framework** | React | ^19.1.1 | SPA webapp |
| **Build Tool** | Vite | ^7.1.7 | Webapp dev server & bundler |
| **Static Site** | Astro | ^5.9.3 | Landing page |
| **Database** | PostgreSQL | 16 | Primary data store |
| **Query Builder** | Kysely | ^0.28.11 | Type-safe SQL |
| **Cache/Queue** | Redis | 7 | BullMQ, rate limiting, pub/sub, caching |
| **Job Queue** | BullMQ | ^5.70.1 | Background execution & export jobs |
| **Auth** | Firebase Auth | ^13.7.0 (admin) | Email + GitHub OAuth |
| **AI** | Anthropic SDK | ^0.78.0 | Claude Haiku/Sonnet for tutoring |
| **Code Editor** | Monaco Editor | ^0.55.1 | In-browser Go editor |
| **State (server)** | TanStack Query | ^5.90.21 | Data fetching, caching |
| **State (client)** | Zustand | ^5.0.11 | UI state (2 stores) |
| **Routing** | React Router | ^7.6.1 | Client-side routing |
| **CSS** | Tailwind CSS | ^4.1.10 | Utility-first styling |
| **UI Components** | shadcn/ui + Radix UI | ^1.4.3 | Component library |
| **Error Tracking** | Sentry | ^10.40.0+ | API + webapp error monitoring |
| **Logging** | Pino | ^9.7.0 | Structured JSON logging |
| **E2E Testing** | Playwright | ^1.58.2 | Browser automation tests |
| **Unit Testing** | Vitest | ^4.0.18 | Unit/integration tests |
| **Code Execution** | Go | 1.23 | Learner code compilation & execution |
| **Execution Infra** | Docker/Fly.io | — | Isolated code execution sandbox |
| **ID Generation** | cuid2 | ^3.3.0 | URL-safe, sortable IDs |

## Architecture Type

**Monorepo with hybrid deployment:**
- **Railway** — API server, BullMQ worker, PostgreSQL, Redis, static hosting
- **Fly.io** — Ephemeral Go code execution VMs (Firecracker isolation)
- **Firebase** — Authentication only (no cross-subdomain auth)

**Architecture Pattern:** Plugin-based Fastify backend with domain-driven modules, React SPA with feature-grouped components, shared packages for cross-cutting types and utilities.

## Repository Structure

| Workspace | Type | Description |
|---|---|---|
| `apps/backend` | backend | Fastify API server + BullMQ worker (7 domain plugins) |
| `apps/webapp` | web | React 19 SPA (Vite + SWC) — workspace, tutor, progress |
| `apps/website` | web | Astro static landing page with SEO |
| `packages/config` | library | Shared ESLint, TypeScript, Vitest, Tailwind config + test utils |
| `packages/shared` | library | Shared types (DB, API, curriculum, domain), constants, utilities |
| `packages/ui` | library | shadcn/ui components (13 components) + Tailwind design tokens |
| `packages/execution` | library | Execution service client, SSE event types, benchmark runner |
| `content/` | curriculum | Go milestone content (briefs, criteria, benchmarks, starter/reference code) |
| `infra/fly-execution` | infra | Go HTTP execution server + Docker sandbox |
| `scripts/` | tooling | Content validation scripts (color, CTA) |

## Key Subsystems

1. **Code Execution Pipeline** — Submit → BullMQ → Worker → Fly.io VM → compile → test → benchmark → SSE stream results
2. **AI Tutor** — Anthropic Claude with Socratic prompting, context assembly, stuck detection, circuit breaker
3. **Session & Progress Management** — Auto-save (30s), session summaries, milestone completion tracking
4. **Curriculum System** — YAML-driven milestone content with JSON schema validation, CI pipeline
5. **Authentication** — Firebase Auth (email + GitHub), JWT verification, rate limiting
6. **Real-time Streaming** — SSE for execution output, tutor responses, benchmark progress
7. **Analytics** — PostgreSQL views for signup funnels, retention, milestone completion, tutor usage
