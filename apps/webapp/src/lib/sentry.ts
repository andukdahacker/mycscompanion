import * as Sentry from '@sentry/react'

const dsn: string | undefined = import.meta.env['VITE_MCC_SENTRY_DSN']

if (dsn) {
  Sentry.init({
    dsn,
    environment: import.meta.env['MODE'],
    enabled: import.meta.env['PROD'],
    release: import.meta.env['VITE_MCC_RELEASE'],
    tracesSampleRate: 0,
  })
}

export { Sentry }
