# Monitoring Setup

All monitoring for mycscompanion uses external tooling — no custom admin UI.

## Sentry Alert Configuration

Alert rules are configured in the **Sentry dashboard** (not in code).

Navigate to: **Settings → Alerts → Create Rule**

### Required Alert Rules

| Alert Rule | Trigger | Window | Action |
|---|---|---|---|
| High Error Rate | Error count > 10 | 1 hour | Email admin |
| New Issue | First occurrence of new error type | Immediate | Email admin |
| Unhandled Exception | Any unhandled exception | Immediate | Email admin |

### Setup Steps

1. Go to your Sentry project → **Alerts** → **Create Alert Rule**
2. For **High Error Rate:**
   - Select "Issue" alert type
   - Condition: "An event is seen more than 10 times in 1 hour"
   - Action: Send notification to admin email
3. For **New Issue:**
   - Select "Issue" alert type
   - Condition: "A new issue is created"
   - Action: Send notification to admin email
4. For **Unhandled Exception:**
   - Select "Issue" alert type
   - Filter: `error.unhandled:true`
   - Action: Send notification to admin email

### Sentry Features Enabled

- **Error tracking:** Automatic via `@sentry/node` (backend) and `@sentry/react` (webapp)
- **Release tracking:** Uses `RAILWAY_GIT_COMMIT_SHA` for deployment association
- **Environment tagging:** `production` / `staging` / `development`
- **Performance monitoring:** Disabled for MVP (`tracesSampleRate: 0`)

## Railway Monitoring

### Service Health

Railway provides built-in monitoring for all services via the Railway dashboard.

| Service | Type | Health Check | Monitoring |
|---|---|---|---|
| api | Web service | `GET /health` (configured in `railway.toml`) | Dashboard metrics, logs |
| worker | Worker service | BullMQ worker activity | Dashboard metrics, logs |
| postgres | Managed database | Railway built-in | Connection metrics, storage |
| redis | Managed service | Railway built-in | Memory usage, connections |
| webapp | Static site | Railway CDN built-in | CDN metrics |
| website | Static site | Railway CDN built-in | CDN metrics |

### Viewing Service Status

1. Open Railway dashboard → select project
2. Each service card shows: deploy status, uptime, resource usage
3. Click a service for detailed metrics: CPU, memory, network, deployment history

### Log Viewer

Railway aggregates logs from all services. Fastify outputs structured JSON via pino.

**Log format:**
```json
{"level":30,"time":1709049600001,"msg":"request completed","reqId":"clx7abc12def","uid":"firebase-uid-123","method":"GET","url":"/api/milestones"}
```

**Key fields:**
- `reqId` — Globally unique request ID (cuid2 format, 25 chars)
- `uid` — Firebase user ID (present only for authenticated requests)
- `level` — pino log level (30=info, 40=warn, 50=error)
- `time` — Unix epoch milliseconds

**Example log queries in Railway:**
- Filter by level: search for `"level":50` (errors only)
- Filter by request ID: search for `"reqId":"clx7abc12def"`
- Filter by user: search for `"uid":"firebase-uid-123"`
- Filter by route: search for `"url":"/api/execution"`

## Railway Service Configuration Files

| Service | Config File |
|---|---|
| api | `apps/backend/railway.toml` |
| worker | `apps/backend/railway.worker.toml` |
| postgres | Managed by Railway (no config file) |
| redis | Managed by Railway (no config file) |
| webapp | `apps/webapp/railway.toml` |
| website | `apps/website/railway.toml` |
