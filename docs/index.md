# mycscompanion — Project Documentation Index

**Generated:** 2026-03-20 | **Mode:** Initial Scan (Exhaustive) | **Version:** 1.2.0

## Project Overview

- **Type:** Monorepo (pnpm + Turborepo) with 9 parts
- **Primary Language:** TypeScript (full-stack) + Go (curriculum content + execution server)
- **Architecture:** Plugin-based Fastify backend, React SPA, Astro static site, shared packages
- **Purpose:** Interactive CS learning platform — learners build real systems in Go with AI tutoring

## Quick Reference

### apps/backend
- **Type:** Backend API + Worker
- **Tech Stack:** Fastify 5, Kysely + PostgreSQL, BullMQ + Redis, Firebase Auth, Anthropic SDK, Sentry
- **Entry Points:** `src/server.ts` (API), `src/worker/worker.ts` (jobs)

### apps/webapp
- **Type:** Web SPA
- **Tech Stack:** React 19, Vite 7, React Router 7, TanStack Query, Zustand, Monaco Editor, Firebase Auth, Tailwind CSS v4
- **Entry Point:** `src/main.tsx`

### apps/website
- **Type:** Static site
- **Tech Stack:** Astro 5, Tailwind CSS v4, Lighthouse CI
- **Entry Point:** `src/pages/index.astro`

### packages/shared
- **Exports:** DB types (Kysely-codegen), API types, curriculum types, domain types, constants, `toCamelCase()`

### packages/ui
- **Exports:** 13 shadcn/ui components (Button, Card, Dialog, Select, etc.), `cn()` utility

### packages/execution
- **Exports:** `ExecutionServiceClient`, `ExecutionEvent` types, `parseBenchmarkOutput()`, Fly config

### packages/config
- **Exports:** ESLint config, Vitest base config, Tailwind tokens, test utilities (mock Redis, mock Firebase, test QueryClient)

### content/
- **Structure:** 5 milestones with Go code, YAML criteria/benchmarks, AI tutor prompts, JSON schemas

### infra/fly-execution
- **Type:** Go HTTP server in Docker (golang:1.23-alpine)
- **Purpose:** Isolated code compilation and execution sandbox

## Generated Documentation

- [Project Overview](./project-overview.md) — Executive summary, tech stack, architecture type, subsystems
- [Source Tree Analysis](./source-tree-analysis.md) — Complete annotated directory tree with purpose descriptions
- [API Contracts](./api-contracts.md) — All 25+ REST API routes with request/response types
- [Data Models](./data-models.md) — Database schema (12 tables + 8 analytics views), relationships, conventions
- [Component Inventory](./component-inventory.md) — UI library (13 components), webapp components (30+), hooks (27), stores (2)
- [Integration Architecture](./integration-architecture.md) — How parts communicate (HTTP, SSE, Redis pub/sub, BullMQ)
- [Development Guide](./development-guide.md) — Prerequisites, setup, commands, testing, deployment, conventions

## Existing Documentation

- [README.md](../README.md) — Setup instructions, workspace structure
- [Architecture Decision Document](../_bmad-output/planning-artifacts/architecture.md) — Full architectural decisions (auth, API, data, frontend, infra, patterns)
- [Product Brief](../_bmad-output/planning-artifacts/product-brief-mycscompanion-2026-02-21.md) — Product vision and goals
- [PRD](../_bmad-output/planning-artifacts/prd.md) — Product requirements document
- [UX Design Specification](../_bmad-output/planning-artifacts/ux-design-specification.md) — UX patterns, wireframes, design system

## Getting Started

```bash
# Prerequisites: Node.js >= 20, pnpm 10.x, Docker
corepack enable
pnpm install
docker compose up -d
pnpm --filter backend db:migrate
pnpm --filter backend db:seed
cp .env.example .env  # Edit with your credentials
pnpm dev  # Starts backend (3001), webapp (5173), website
```

For detailed setup: [Development Guide](./development-guide.md)
