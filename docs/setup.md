# Local Development Setup Guide

## Prerequisites

- Node.js >= 20 (check with `node -v`)
- pnpm (`npm install -g pnpm`)
- Docker & Docker Compose

## Step 1: Local Infrastructure (PostgreSQL + Redis)

```bash
docker compose up -d
docker compose ps              # Verify both containers running
```

This starts:
- PostgreSQL 16 on `localhost:5433`
- Redis 7 on `localhost:6379`

## Step 2: Install Dependencies

```bash
pnpm install
```

## Step 3: Firebase Project Setup

Firebase is required — the backend auth hook blocks every API call without it.

### Create the project

1. Go to https://console.firebase.google.com
2. "Add project" → name it `mycscompanion` (or any name)
3. Disable Google Analytics (not needed)
4. Wait for project creation

### Enable authentication

1. Build → Authentication → Get Started
2. Sign-in method tab → Enable **Email/Password**

### Get webapp config (6 values)

1. Project Settings (gear icon) → General → Your Apps
2. Click web icon (`</>`) → Register app as `mycscompanion-webapp`
3. Copy the `firebaseConfig` values:
   - `apiKey` → `VITE_FIREBASE_API_KEY`
   - `authDomain` → `VITE_FIREBASE_AUTH_DOMAIN`
   - `projectId` → `VITE_FIREBASE_PROJECT_ID`
   - `storageBucket` → `VITE_FIREBASE_STORAGE_BUCKET`
   - `messagingSenderId` → `VITE_FIREBASE_MESSAGING_SENDER_ID`
   - `appId` → `VITE_FIREBASE_APP_ID`

### Get service account key (backend)

1. Project Settings → Service Accounts tab
2. "Generate new private key" → Download the JSON file
3. Base64-encode it:
   ```bash
   base64 -w 0 < ~/Downloads/mycscompanion-firebase-adminsdk-xxxxx.json
   ```
4. The output string is your `FIREBASE_SERVICE_ACCOUNT` value

## Step 4: Fill in .env

The `.env` file already exists at the project root (git-ignored). Fill in the Firebase values:

```bash
# These are the only values you MUST fill in for local dev:
FIREBASE_SERVICE_ACCOUNT=<base64-encoded JSON from step 3>
VITE_FIREBASE_API_KEY=<from Firebase Console>
VITE_FIREBASE_AUTH_DOMAIN=<project-id>.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=<project-id>
VITE_FIREBASE_STORAGE_BUCKET=<project-id>.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=<number>
VITE_FIREBASE_APP_ID=<string>
```

Everything else in `.env` has working defaults for local dev.

## Step 5: Database Setup

```bash
pnpm --filter backend db:migrate    # Run migrations
pnpm --filter shared db:types       # Generate Kysely types
pnpm --filter backend db:seed       # Seed tracks + milestones
```

## Step 6: Start Development

```bash
pnpm dev
```

This runs all 3 apps concurrently:
- Backend API: http://localhost:3001 (health check: http://localhost:3001/health)
- Webapp: http://localhost:5173
- Website: http://localhost:4321

## Environment Variables Reference

### Required for local dev

| Variable | Value | Source |
|---|---|---|
| `DATABASE_URL` | `postgresql://mycscompanion:mycscompanion@localhost:5433/mycscompanion` | Pre-filled |
| `REDIS_URL` | `redis://localhost:6379` | Pre-filled |
| `FIREBASE_SERVICE_ACCOUNT` | Base64-encoded JSON | Firebase Console |
| `VITE_FIREBASE_API_KEY` | From Firebase config | Firebase Console |
| `VITE_FIREBASE_AUTH_DOMAIN` | From Firebase config | Firebase Console |
| `VITE_FIREBASE_PROJECT_ID` | From Firebase config | Firebase Console |
| `VITE_FIREBASE_STORAGE_BUCKET` | From Firebase config | Firebase Console |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | From Firebase config | Firebase Console |
| `VITE_FIREBASE_APP_ID` | From Firebase config | Firebase Console |

### Optional / have defaults

| Variable | Default | Purpose |
|---|---|---|
| `VITE_API_URL` | `http://localhost:3001` | Backend URL for webapp |
| `NODE_ENV` | `development` | Runtime environment |
| `PORT` | `3001` | Backend port |
| `HOST` | `0.0.0.0` | Backend bind address |
| `CORS_ORIGIN` | `http://localhost:5173` | Allowed webapp origin |
| `LOG_LEVEL` | `info` | Pino log level |
| `MCC_ADMIN_USER` | `admin` | Bull Board username |

### Not needed yet

| Variable | When needed | Purpose |
|---|---|---|
| `MCC_FLY_API_TOKEN` | Testing code execution | Fly.io API for ephemeral VMs |
| `MCC_FLY_APP_NAME` | Testing code execution | Fly.io app name (default: `mcc-execution`) |
| `MCC_EXECUTION_IMAGE` | Testing code execution | Docker image for Go sandbox |
| `MCC_SENTRY_DSN` | First production deploy | Error tracking (auto-disabled in dev) |
| `MCC_ADMIN_PASSWORD` | When you need queue UI | Bull Board auth |
| `ANTHROPIC_API_KEY` | Epic 6 (Tutor) | AI tutor — not yet implemented |

## Deferred Service Setup

### Fly.io (code execution — Epic 3 worker)

Set this up when you need to test the full submission → execution → results flow. The API server runs fine without it.

1. Create account at https://fly.io
2. Install CLI: `curl -L https://fly.io/install.sh | sh`
3. Log in: `fly auth login`
4. Create execution app: `fly apps create mcc-execution`
5. Get API token: `fly tokens create deploy -x 999999h`
6. Build local execution image: `docker compose --profile execution build`
7. Set in `.env`:
   ```
   MCC_FLY_API_TOKEN=fo1_xxxxx
   MCC_FLY_APP_NAME=mcc-execution
   MCC_EXECUTION_IMAGE=mcc-execution:local
   ```

### Sentry (error tracking — before production)

Auto-disabled in `development` and `test`. No local setup needed.

1. Create project at https://sentry.io (Node.js type)
2. Copy DSN from Project Settings → Client Keys
3. Set `MCC_SENTRY_DSN` in production env vars

### Railway (hosting — first deploy)

See [deployment.md](./deployment.md) for full Railway setup instructions.

1. Create project at https://railway.app → connect GitHub repo
2. Add PostgreSQL + Redis plugins (auto-set `DATABASE_URL` and `REDIS_URL`)
3. Create API service (start: `pnpm --filter backend start:api`)
4. Create Worker service (start: `pnpm --filter backend start:worker`)
5. Deploy webapp separately (Vercel or Railway static)
6. Set all production env vars per service

## Troubleshooting

**Backend fails to start with auth error:**
→ `FIREBASE_SERVICE_ACCOUNT` is missing or malformed. Re-generate and base64-encode.

**Database connection refused:**
→ Run `docker compose up -d` and verify with `docker compose ps`.

**Webapp shows blank page / API errors:**
→ Check that all 6 `VITE_FIREBASE_*` vars are set. Restart `pnpm dev` after changing `.env`.

**Tests fail with database errors:**
→ Run `pnpm --filter backend db:migrate` to apply latest migrations.

**`db:types` fails:**
→ Database must be running and migrated first. Run `docker compose up -d` then `db:migrate` then `db:types`.
