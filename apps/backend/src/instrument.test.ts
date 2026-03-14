import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const { mockSentryInit } = vi.hoisted(() => ({
  mockSentryInit: vi.fn(),
}))

vi.mock('@sentry/node', () => ({
  init: mockSentryInit,
  captureException: vi.fn(),
  close: vi.fn().mockResolvedValue(undefined),
}))

describe('Sentry Instrumentation', () => {
  const originalEnv = { ...process.env }

  beforeEach(() => {
    mockSentryInit.mockClear()
    vi.resetModules()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    process.env = { ...originalEnv }
  })

  it('should include release in Sentry init when RAILWAY_GIT_COMMIT_SHA is set', async () => {
    process.env['MCC_SENTRY_DSN'] = 'https://test@sentry.io/123'
    process.env['NODE_ENV'] = 'production'
    process.env['RAILWAY_GIT_COMMIT_SHA'] = 'abc1234567890'

    await import('./instrument.js')

    expect(mockSentryInit).toHaveBeenCalledWith(
      expect.objectContaining({
        release: 'mycscompanion-api@abc1234',
      })
    )
  })

  it('should fallback to package.json version when no Railway SHA', async () => {
    process.env['MCC_SENTRY_DSN'] = 'https://test@sentry.io/123'
    process.env['NODE_ENV'] = 'production'
    delete process.env['RAILWAY_GIT_COMMIT_SHA']

    await import('./instrument.js')

    expect(mockSentryInit).toHaveBeenCalledWith(
      expect.objectContaining({
        release: expect.stringMatching(/^mycscompanion-api@/),
      })
    )
  })

  it('should not init Sentry when DSN is not set', async () => {
    delete process.env['MCC_SENTRY_DSN']

    await import('./instrument.js')

    expect(mockSentryInit).not.toHaveBeenCalled()
  })
})
