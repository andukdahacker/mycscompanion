# Directory Index

## Files

- **[docker-compose.yml](./docker-compose.yml)** - Local Postgres, Redis, execution, and Metabase services
- **[eslint.config.js](./eslint.config.js)** - Root ESLint config re-exporting shared config
- **[package.json](./package.json)** - Monorepo root with Turbo-based dev/build/test scripts
- **[pnpm-lock.yaml](./pnpm-lock.yaml)** - pnpm dependency lockfile
- **[pnpm-workspace.yaml](./pnpm-workspace.yaml)** - pnpm workspace defining apps and packages
- **[README.md](./README.md)** - Project overview and getting started guide
- **[tsconfig.base.json](./tsconfig.base.json)** - Shared TypeScript compiler options and path aliases
- **[turbo.json](./turbo.json)** - Turborepo task pipeline configuration

## Subdirectories

### apps/

- **backend/** - Backend API service
- **webapp/** - Web application frontend
- **website/** - Marketing/content website

### content/

- **milestones/** - CS milestone curricula (KV store, storage engine, B-tree, etc.)
- **prompts/** - AI tutor prompts and model routing config
- **schema/** - JSON schemas for acceptance criteria, benchmarks, and metadata

### docs/

- **[deployment.md](./docs/deployment.md)** - Railway deployment guide and service topology
- **[monitoring-setup.md](./docs/monitoring-setup.md)** - Sentry and external monitoring configuration
- **[setup.md](./docs/setup.md)** - Local development setup guide

### infra/

- **fly-execution/** - Fly.io execution sandbox (Dockerfile, Go server, fly.toml)

### packages/

- **config/** - Shared ESLint and project configuration
- **execution/** - Code execution client library
- **shared/** - Shared types and utilities
- **ui/** - Shared UI component library

### scripts/

- **[validate-no-red.sh](./scripts/validate-no-red.sh)** - Enforce semantic color tokens over raw red values
- **[validate-primary-action.sh](./scripts/validate-primary-action.sh)** - Enforce single primary-action element per page

### _bmad-output/

- **analysis/** - BMAD analysis artifacts
- **implementation-artifacts/** - Tech specs and implementation documents
- **planning-artifacts/** - PRDs and planning documents
- **[project-context.md](./\_bmad-output/project-context.md)** - AI agent project context and rules
