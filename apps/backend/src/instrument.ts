import * as Sentry from '@sentry/node'
import { readFileSync } from 'node:fs'

function getRelease(): string | undefined {
  // Railway sets RAILWAY_GIT_COMMIT_SHA automatically
  const sha = process.env['RAILWAY_GIT_COMMIT_SHA']
  if (sha) return `mycscompanion-api@${sha.slice(0, 7)}`

  // Fallback: read from package.json version
  try {
    const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf-8')) as { version: string }
    return `mycscompanion-api@${pkg.version}`
  } catch {
    return undefined
  }
}

const dsn = process.env['MCC_SENTRY_DSN']

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env['NODE_ENV'] ?? 'development',
    // Only send errors in staging/production — skip in development/test
    enabled: process.env['NODE_ENV'] === 'production' || process.env['NODE_ENV'] === 'staging',
    release: getRelease(),
    tracesSampleRate: 0, // No performance monitoring for MVP (ARCH: "No custom APM for MVP")
  })
}

export { Sentry }
