import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})

describe('executionServiceConfig', () => {
  it('should have default timeout of 30 seconds', async () => {
    const { executionServiceConfig } = await import('./fly-config.js')
    expect(executionServiceConfig.defaultTimeoutSeconds).toBe(30)
  })

  it('should have max timeout of 120 seconds', async () => {
    const { executionServiceConfig } = await import('./fly-config.js')
    expect(executionServiceConfig.maxTimeoutSeconds).toBe(120)
  })

  it('should read MCC_EXECUTION_URL from environment', async () => {
    vi.stubEnv('MCC_EXECUTION_URL', 'https://mcc-execution.fly.dev')
    // Dynamic import to pick up env var
    vi.resetModules()
    const { executionServiceConfig } = await import('./fly-config.js')
    expect(executionServiceConfig.url).toBe('https://mcc-execution.fly.dev')
  })

  it('should read MCC_EXECUTION_SECRET from environment', async () => {
    vi.stubEnv('MCC_EXECUTION_SECRET', 'my-secret')
    vi.resetModules()
    const { executionServiceConfig } = await import('./fly-config.js')
    expect(executionServiceConfig.secret).toBe('my-secret')
  })

  it('should default url to empty string when env var missing', async () => {
    delete process.env.MCC_EXECUTION_URL
    vi.resetModules()
    const { executionServiceConfig } = await import('./fly-config.js')
    expect(executionServiceConfig.url).toBe('')
  })

  it('should default secret to empty string when env var missing', async () => {
    delete process.env.MCC_EXECUTION_SECRET
    vi.resetModules()
    const { executionServiceConfig } = await import('./fly-config.js')
    expect(executionServiceConfig.secret).toBe('')
  })
})
