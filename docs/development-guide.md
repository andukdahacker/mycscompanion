# Development Guide — mycscompanion

**Generated:** 2026-03-20 | **Scan Level:** Exhaustive

## Prerequisites

- **Node.js** >= 20 (see `.nvmrc`)
- **pnpm** 10.x (`corepack enable` to activate)
- **Docker** and Docker Compose (for PostgreSQL + Redis)
- **Go** 1.23+ (only needed for local execution testing)

## Getting Started

```bash
# Clone repository
git clone <repo-url> mycscompanion
cd mycscompanion

# Install dependencies
pnpm install

# Start local infrastructure (PostgreSQL 16 + Redis 7)
docker compose up -d

# Run database migrations
pnpm --filter backend db:migrate

# Generate DB types (optional, already committed)
pnpm --filter shared db:types

# Seed initial data (tracks + milestones)
pnpm --filter backend db:seed

# Copy environment variables
cp .env.example .env
# Edit .env with your Firebase, Anthropic, etc. credentials

# Start all apps concurrently
pnpm dev
```

## Environment Variables

| Variable | Required | Used By | Description |
|---|---|---|---|
| `DATABASE_URL` | Yes | backend | PostgreSQL connection string |
| `REDIS_URL` | Yes | backend | Redis connection string |
| `ANTHROPIC_API_KEY` | No | backend | Anthropic API key (tutor disabled if absent) |
| `FIREBASE_SERVICE_ACCOUNT` | No | backend | Firebase Admin SDK JSON (auth disabled if absent) |
| `MCC_EXECUTION_URL` | Yes (worker) | worker | Go execution server URL |
| `MCC_EXECUTION_SECRET` | Yes (worker) | worker | Execution server auth secret |
| `MCC_ADMIN_USER` | No | backend | Admin username (default: 'admin') |
| `MCC_ADMIN_PASSWORD` | No | backend | Admin password for Bull Board |
| `VITE_FIREBASE_*` | Yes | webapp | Firebase client config (6 variables) |
| `VITE_API_URL` | No | webapp | API URL (default: http://localhost:3001) |
| `VITE_MCC_SENTRY_DSN` | No | webapp | Sentry DSN for error tracking |
| `MCC_SENTRY_DSN` | No | backend | Sentry DSN for backend |
| `PORT` | No | backend | API port (default: 3001) |
| `HOST` | No | backend | Bind address (default: 0.0.0.0) |
| `CORS_ORIGIN` | No | backend | CORS origin (default: http://localhost:5173) |
| `LOG_LEVEL` | No | backend | Pino log level (default: info) |

## Development Commands

### Root (all workspaces)

```bash
pnpm dev           # Start all apps concurrently (backend + webapp + website)
pnpm build         # Build all apps
pnpm test          # Run all tests
pnpm lint          # Lint all apps
pnpm typecheck     # TypeScript check all apps
```

### Backend (`apps/backend`)

```bash
pnpm --filter backend dev           # Start API server (tsx --watch)
pnpm --filter backend dev:worker    # Start BullMQ worker (tsx --watch)
pnpm --filter backend test          # Run Vitest tests
pnpm --filter backend build         # Compile TypeScript
pnpm --filter backend typecheck     # Type-check without emit
pnpm --filter backend db:migrate    # Run pending migrations
pnpm --filter backend db:migrate:down  # Roll back last migration
pnpm --filter backend db:migrate:make  # Create new migration file
pnpm --filter backend db:seed       # Seed database with tracks + milestones
```

### Webapp (`apps/webapp`)

```bash
pnpm --filter webapp dev            # Start Vite dev server (port 5173)
pnpm --filter webapp build          # TypeScript + Vite production build
pnpm --filter webapp test           # Run Vitest unit tests
pnpm --filter webapp test:e2e       # Run Playwright E2E tests
pnpm --filter webapp test:e2e:ui    # Playwright interactive UI mode
pnpm --filter webapp typecheck      # Type-check
pnpm --filter webapp preview        # Preview production build
```

### Website (`apps/website`)

```bash
pnpm --filter website dev           # Start Astro dev server
pnpm --filter website build         # Build static site
pnpm --filter website lighthouse    # Run Lighthouse CI audit
```

### Shared packages

```bash
pnpm --filter shared db:types       # Regenerate Kysely types from DB
pnpm --filter shared build          # Compile TypeScript
pnpm --filter shared test           # Run tests
pnpm --filter execution test        # Run execution package tests
```

## Local Infrastructure

### Docker Compose Services

| Service | Image | Port | Purpose |
|---|---|---|---|
| `postgres` | postgres:16 | 5433:5432 | Database |
| `redis` | redis:7 | 6379:6379 | Cache, queues, pub/sub |
| `execution` | mcc-execution:local | 8080:8080 | Code execution (optional, profile: execution) |
| `metabase` | metabase/metabase | 3000:3000 | Analytics (optional, profile: metabase) |

```bash
# Start core services
docker compose up -d

# Start with execution sandbox
docker compose --profile execution up -d

# Start with Metabase analytics
docker compose --profile metabase up -d

# View logs
docker compose logs -f postgres redis

# Reset database
docker compose down -v && docker compose up -d
```

### Database Connection

```
Host: localhost
Port: 5433
User: mycscompanion
Password: mycscompanion
Database: mycscompanion
URL: postgresql://mycscompanion:mycscompanion@localhost:5433/mycscompanion
```

## Testing

### Test Framework

- **Unit/Integration:** Vitest (base config in `packages/config/vitest.config.ts`)
- **E2E:** Playwright (Chromium, `apps/webapp/e2e/`)
- **Test utilities:** `packages/config/test-utils/` (mock Redis, mock Firebase, test QueryClient)

### Test Patterns

- Co-located test files: `{source-file}.test.ts` next to source
- Always `it()`, never `test()`. `describe` mirrors module structure
- Database tests use real PostgreSQL (test transaction per test, rolled back)
- Fastify routes tested via `fastify.inject()` (never supertest)
- External APIs mocked with `msw` (Mock Service Worker)
- Firebase Auth mocked via `createMockFirebaseAuth()`
- Redis mocked via `createMockRedis()` (in-memory)
- TanStack Query tests use `createTestQueryClient()` (no cache/retry)
- SSE tested via injectable `EventSource` constructor

### Running Tests

```bash
# All tests
pnpm test

# Specific workspace
pnpm --filter backend test
pnpm --filter webapp test

# Watch mode
pnpm --filter backend test -- --watch

# E2E (requires running app)
pnpm --filter webapp test:e2e
```

## Build & Deployment

### Build Process

Turborepo orchestrates builds with dependency ordering:
1. `packages/shared` → compiled first (other packages depend on types)
2. `packages/execution` → depends on shared
3. `packages/ui`, `packages/config` → independent
4. `apps/backend`, `apps/webapp`, `apps/website` → depend on packages

### Deployment Topology

| Service | Platform | Config File |
|---|---|---|
| API Server | Railway (web service) | `apps/backend/railway.toml` |
| Worker | Railway (worker service) | `apps/backend/railway.worker.toml` |
| PostgreSQL | Railway (managed) | — |
| Redis | Railway (managed) | — |
| Webapp | Railway (static) | `apps/webapp/railway.toml` |
| Website | Railway (static) | — |
| Execution | Fly.io | `infra/fly-execution/fly.toml` |

### CI/CD

**GitHub Actions** (`.github/workflows/`):
- `content-ci.yml` — Validates milestone content on changes to `content/`

**CI steps** (when fully configured):
1. `pnpm install --frozen-lockfile`
2. `turbo lint`
3. `turbo typecheck`
4. `turbo test`
5. `turbo build`
6. Railway auto-deploys from main

## Code Conventions

### Naming

| Context | Convention | Example |
|---|---|---|
| Files (utility/plugin) | kebab-case.ts | `rate-limiter.ts` |
| Files (React component) | PascalCase.tsx | `TutorPanel.tsx` |
| Functions | camelCase | `createSubmission()` |
| Constants | SCREAMING_SNAKE_CASE | `MAX_MESSAGE_LENGTH` |
| Types/Interfaces | PascalCase, no I prefix | `ExecutionEvent` |
| Zustand stores | use{Name}Store | `useEditorStore` |
| TanStack Query keys | [domain, action, params] | `['workspace', 'get', id]` |
| DB tables | snake_case, plural | `code_snapshots` |
| API routes | kebab-case, plural | `/api/execution/submissions` |
| JSON response fields | camelCase | `milestoneId` |
| Env vars (app) | MCC_ prefix | `MCC_EXECUTION_URL` |

### Import Conventions

- Workspace packages: `import { ... } from '@mycscompanion/shared'`
- Within an app: relative paths only (no `@/` aliases)
- UI package: individual component imports (no barrel for tree-shaking)

### Architecture Rules

- Fastify plugins only import from `shared/` and `packages/*` — never cross-plugin
- Plugin registration order documented in `app.ts` with position comments
- `toCamelCase()` on all Kysely results before `reply.send()`
- `cuid2` for all entity IDs (never auto-increment, never UUID)
- Cursor-based pagination (never offset)
- User code/AI conversations never logged at `info` level or above
