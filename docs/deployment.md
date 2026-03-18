# Deployment Guide

## Railway Service Topology

| Service | Railway Type | Start Command | Pre-Deploy | Health Check |
|---------|-------------|---------------|------------|--------------|
| api | Web service | `node --import ./dist/instrument.js dist/server.js` | `pnpm --filter backend db:migrate` | `/health` |
| worker | Worker service | `node --import ./dist/instrument.js dist/worker/worker.js` | — | — |
| postgres | Managed PostgreSQL | — (managed) | — | Built-in |
| redis | Managed Redis | — (managed) | — | Built-in |
| webapp | Static site | `npx serve dist -s -l 3000` | — | — |
| website | Static site | `npx serve dist -l 3000` | — | — |

## Service Creation

Railway services are created via the Railway dashboard, not config files. The `railway.toml` in each app directory controls per-service build/deploy settings only.

1. Create a new Railway project
2. Connect the GitHub repository
3. Add services:
   - **api**: Web service, root directory `apps/backend`, uses `railway.toml`
   - **worker**: Worker service, root directory `apps/backend`, uses `railway.worker.toml` (rename to `railway.toml` in Railway config or set via dashboard)
   - **postgres**: Add PostgreSQL plugin (managed)
   - **redis**: Add Redis plugin (managed)
   - **webapp**: Web service, root directory `apps/webapp`, uses `railway.toml`
   - **website**: Web service, root directory `apps/website`, uses `railway.toml`
4. Configure environment variables for each service (see below)

## Environment Variables per Service

### api

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL connection string (auto-set by Railway PostgreSQL plugin) |
| `REDIS_URL` | Yes | Redis connection string (auto-set by Railway Redis plugin) |
| `MCC_SENTRY_DSN` | Yes | Sentry DSN for error tracking |
| `NODE_ENV` | Yes | Set to `production` |
| `CORS_ORIGIN` | Yes | Webapp URL (e.g., `https://app.mycscompanion.dev`) |
| `MCC_ADMIN_USER` | No | Bull Board username (default: `admin`) |
| `MCC_ADMIN_PASSWORD` | Yes | Bull Board password |
| `FIREBASE_SERVICE_ACCOUNT` | Yes | Firebase Admin SDK service account (Story 2.1) |

### worker

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | Same as api |
| `REDIS_URL` | Yes | Same as api |
| `MCC_SENTRY_DSN` | Yes | Same as api |
| `NODE_ENV` | Yes | Set to `production` |
| `MCC_EXECUTION_URL` | Yes | Persistent execution service URL (e.g., `https://mcc-execution.fly.dev`) |
| `MCC_EXECUTION_SECRET` | Yes | Shared secret for execution service Bearer auth |
| `ANTHROPIC_API_KEY` | Yes | Anthropic API key for AI tutor (Story 6.1) |

### webapp

| Variable | Required | Description |
|----------|----------|-------------|
| `MCC_FIREBASE_CONFIG` | Yes | Firebase web app config JSON (build-time) |

### website

No environment variables required (static site).

## Database Migrations

The api service's `preDeployCommand` in `railway.toml` runs `pnpm --filter backend db:migrate` before the API starts. If migrations fail, the deployment is aborted — the previous version continues running.

Down migrations are manual only. Run via Railway CLI or SSH into the service.

## TLS/HTTPS

Railway handles TLS termination at the edge automatically. The application receives plain HTTP from Railway's internal proxy. `trustProxy: true` in Fastify ensures correct protocol detection from `X-Forwarded-Proto` headers.

No app-level TLS configuration is needed.

## Monitoring Setup

### Sentry

1. Create a Sentry project at https://sentry.io
2. Get the DSN from Project Settings > Client Keys
3. Set `MCC_SENTRY_DSN` environment variable on api and worker services
4. Sentry is `enabled: false` in development/test — only active in staging/production

### Bull Board

1. Set `MCC_ADMIN_PASSWORD` on the api service
2. Access at `https://<api-url>/admin/queues`
3. Authenticate with `MCC_ADMIN_USER` (default: `admin`) and `MCC_ADMIN_PASSWORD`
4. Shows empty queue dashboard until Epic 3 adds real queues

### Metabase (Local Dev Only)

1. Start Metabase: `docker compose --profile metabase up metabase`
2. Access at `http://localhost:3000`
3. Connects to the local PostgreSQL database for analytics queries
4. Not deployed to Railway — local development tool only

## Deployment Flow

1. Push to `main` branch
2. GitHub Actions CI runs: lint → typecheck → test → build
3. On CI success, Railway auto-deploys from `main`
4. Pre-deploy command runs migrations (api service only)
5. New version starts with health check verification

## Rollback

Use Railway's built-in rollback via the dashboard:

1. Go to the service in Railway dashboard
2. Click on Deployments
3. Select a previous successful deployment
4. Click Rollback

## Local Dev vs Production

| Concern | Local Dev | Production |
|---------|-----------|------------|
| Port | `3001` (Fastify) | Railway-assigned (typically `3000`) |
| Logging | `pino-pretty` (human-readable) | JSON lines (machine-parseable) |
| Sentry | Disabled (`enabled: false`) | Active |
| TLS | None (plain HTTP) | Railway edge TLS |
| Database | `localhost:5433` (Docker) | Railway managed PostgreSQL |
| Redis | `localhost:6379` (Docker) | Railway managed Redis |
| Env vars | `.env` file | Railway environment variables |
