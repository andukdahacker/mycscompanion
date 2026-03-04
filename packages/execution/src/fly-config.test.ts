import { afterEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_FLY_MACHINE_CONFIG, getExecutionImageRef } from './fly-config'
import type { FlyMachineConfig } from './index'

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})

describe('DEFAULT_FLY_MACHINE_CONFIG', () => {
  it('should satisfy FlyMachineConfig type with correct values', () => {
    const config: FlyMachineConfig = DEFAULT_FLY_MACHINE_CONFIG
    expect(config.image).toBe('registry.fly.io/mcc-execution:latest')
    expect(config.cpuKind).toBe('shared')
    expect(config.cpus).toBe(1)
    expect(config.memoryMb).toBe(256)
    expect(config.timeoutSeconds).toBe(60)
    expect(config.autoDestroy).toBe(true)
    expect(config.restartPolicy).toBe('no')
  })

  it('should have cpus >= 1', () => {
    expect(DEFAULT_FLY_MACHINE_CONFIG.cpus).toBeGreaterThanOrEqual(1)
  })

  it('should have memoryMb >= 128', () => {
    expect(DEFAULT_FLY_MACHINE_CONFIG.memoryMb).toBeGreaterThanOrEqual(128)
  })

  it('should have timeoutSeconds > 0', () => {
    expect(DEFAULT_FLY_MACHINE_CONFIG.timeoutSeconds).toBeGreaterThan(0)
  })

  it('should use shared CPU kind', () => {
    expect(DEFAULT_FLY_MACHINE_CONFIG.cpuKind).toBe('shared')
  })

  it('should auto-destroy machines after completion', () => {
    expect(DEFAULT_FLY_MACHINE_CONFIG.autoDestroy).toBe(true)
  })

  it('should not restart machines on failure', () => {
    expect(DEFAULT_FLY_MACHINE_CONFIG.restartPolicy).toBe('no')
  })

  it('should reference the Fly registry image', () => {
    expect(DEFAULT_FLY_MACHINE_CONFIG.image).toMatch(
      /^registry\.fly\.io\/mcc-execution:/,
    )
  })
})

describe('getExecutionImageRef', () => {
  it('should return Fly registry URL when env var is not set', () => {
    delete process.env.MCC_EXECUTION_IMAGE
    expect(getExecutionImageRef()).toBe('registry.fly.io/mcc-execution:latest')
  })

  it('should return env var value when MCC_EXECUTION_IMAGE is set', () => {
    vi.stubEnv('MCC_EXECUTION_IMAGE', 'mcc-execution:local')
    expect(getExecutionImageRef()).toBe('mcc-execution:local')
  })
})
