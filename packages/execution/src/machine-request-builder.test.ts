import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildMachineRequest, MAX_CODE_SIZE_BYTES } from './machine-request-builder'
import { DEFAULT_FLY_MACHINE_CONFIG } from './fly-config'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('buildMachineRequest', () => {
  const defaultCode = 'package main\n\nfunc main() {\n\tprintln("Hello")\n}'
  const defaultOptions = {
    submissionId: 'sub_abc123',
    milestoneId: 'ms_001',
  }

  describe('basic request structure', () => {
    it('should produce a valid FlyCreateMachineRequest', () => {
      const request = buildMachineRequest(
        DEFAULT_FLY_MACHINE_CONFIG,
        defaultCode,
        defaultOptions,
      )
      expect(request.config).toBeDefined()
      expect(request.config.image).toBe('registry.fly.io/mcc-execution:latest')
    })

    it('should set auto_destroy to true', () => {
      const request = buildMachineRequest(
        DEFAULT_FLY_MACHINE_CONFIG,
        defaultCode,
        defaultOptions,
      )
      expect(request.config.auto_destroy).toBe(true)
    })

    it('should set restart policy to no', () => {
      const request = buildMachineRequest(
        DEFAULT_FLY_MACHINE_CONFIG,
        defaultCode,
        defaultOptions,
      )
      expect(request.config.restart.policy).toBe('no')
    })

    it('should set empty services array to prevent inbound traffic', () => {
      const request = buildMachineRequest(
        DEFAULT_FLY_MACHINE_CONFIG,
        defaultCode,
        defaultOptions,
      )
      expect(request.config.services).toEqual([])
    })
  })

  describe('guest configuration', () => {
    it('should map camelCase config to snake_case API fields', () => {
      const request = buildMachineRequest(
        DEFAULT_FLY_MACHINE_CONFIG,
        defaultCode,
        defaultOptions,
      )
      expect(request.config.guest.cpu_kind).toBe('shared')
      expect(request.config.guest.cpus).toBe(1)
      expect(request.config.guest.memory_mb).toBe(256)
    })
  })

  describe('code injection', () => {
    it('should inject code as base64 file at /workspace/main.go', () => {
      const request = buildMachineRequest(
        DEFAULT_FLY_MACHINE_CONFIG,
        defaultCode,
        defaultOptions,
      )
      expect(request.config.files).toHaveLength(1)
      const file = request.config.files[0]
      expect(file).toBeDefined()
      expect(file!.guest_path).toBe('/workspace/main.go')

      const decoded = Buffer.from(
        file!.raw_value,
        'base64',
      ).toString('utf-8')
      expect(decoded).toBe(defaultCode)
    })
  })

  describe('init exec command', () => {
    it('should set init.exec with ulimit and go build+run', () => {
      const request = buildMachineRequest(
        DEFAULT_FLY_MACHINE_CONFIG,
        defaultCode,
        defaultOptions,
      )
      expect(request.config.init.exec).toEqual([
        'sh',
        '-c',
        'ulimit -u 64 && go build -o main . 2>&1 && ./main 2>&1',
      ])
    })
  })

  describe('metadata', () => {
    it('should set submission_id and milestone_id in metadata', () => {
      const request = buildMachineRequest(
        DEFAULT_FLY_MACHINE_CONFIG,
        defaultCode,
        defaultOptions,
      )
      expect(request.config.metadata).toEqual({
        submission_id: 'sub_abc123',
        milestone_id: 'ms_001',
      })
    })
  })

  describe('region override', () => {
    it('should use config region by default', () => {
      const configWithRegion = {
        ...DEFAULT_FLY_MACHINE_CONFIG,
        region: 'iad' as const,
      }
      const request = buildMachineRequest(
        configWithRegion,
        defaultCode,
        defaultOptions,
      )
      expect(request.region).toBe('iad')
    })

    it('should use region override when provided', () => {
      const request = buildMachineRequest(
        DEFAULT_FLY_MACHINE_CONFIG,
        defaultCode,
        { ...defaultOptions, region: 'lax' },
      )
      expect(request.region).toBe('lax')
    })

    it('should not include region when neither config nor override set', () => {
      const request = buildMachineRequest(
        DEFAULT_FLY_MACHINE_CONFIG,
        defaultCode,
        defaultOptions,
      )
      expect(request.region).toBeUndefined()
    })
  })

  describe('code size validation', () => {
    it('should reject code exceeding MAX_CODE_SIZE_BYTES', () => {
      const largeCode = 'a'.repeat(MAX_CODE_SIZE_BYTES + 1)
      expect(() =>
        buildMachineRequest(DEFAULT_FLY_MACHINE_CONFIG, largeCode, defaultOptions),
      ).toThrow(/code size exceeds maximum/i)
    })

    it('should accept code at exactly MAX_CODE_SIZE_BYTES', () => {
      const maxCode = 'a'.repeat(MAX_CODE_SIZE_BYTES)
      expect(() =>
        buildMachineRequest(DEFAULT_FLY_MACHINE_CONFIG, maxCode, defaultOptions),
      ).not.toThrow()
    })

    it('should validate size before base64 encoding', () => {
      const largeCode = 'a'.repeat(MAX_CODE_SIZE_BYTES + 1)
      expect(() =>
        buildMachineRequest(DEFAULT_FLY_MACHINE_CONFIG, largeCode, defaultOptions),
      ).toThrow(/64/i)
    })
  })

  describe('MAX_CODE_SIZE_BYTES', () => {
    it('should be 64 KB', () => {
      expect(MAX_CODE_SIZE_BYTES).toBe(64 * 1024)
    })
  })
})
