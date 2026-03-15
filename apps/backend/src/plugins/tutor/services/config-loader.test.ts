import { describe, it, expect, afterEach, vi, beforeEach } from 'vitest'
import { readFile } from 'node:fs/promises'
import {
  loadModelRoutingConfig,
  loadModelRoutingConfigAsync,
  resetModelRoutingConfigCache,
  initConfigLoader,
  DEFAULT_CONFIG,
  validateConfig,
} from './config-loader.js'

vi.mock('node:fs/promises', () => ({
  readFile: vi.fn(),
}))

const mockReadFile = vi.mocked(readFile)

const VALID_CONFIG_YAML = `
models:
  haiku: "claude-haiku-4-5-20251001"
  sonnet: "claude-sonnet-4-6-20250514"

default_model: haiku

routing_rules:
  - condition: stuck_intervention
    model: sonnet
    description: "Use Sonnet for stuck interventions"
  - condition: compile_errors
    model: sonnet
    description: "Use Sonnet for compile errors"
  - condition: explain_pattern
    model: sonnet
    description: "Use Sonnet for explanations"
    patterns:
      - "explain"
      - "what is"
`

const CUSTOM_CONFIG_YAML = `
models:
  haiku: "claude-haiku-custom"
  sonnet: "claude-sonnet-custom"

default_model: sonnet

routing_rules:
  - condition: stuck_intervention
    model: haiku
    description: "Use Haiku for stuck interventions"
  - condition: explain_pattern
    model: sonnet
    description: "Use Sonnet for explanations"
    patterns:
      - "explain"
      - "help me understand"
`

beforeEach(() => {
  mockReadFile.mockReset()
  resetModelRoutingConfigCache()
})

afterEach(() => {
  vi.restoreAllMocks()
  resetModelRoutingConfigCache()
})

describe('validateConfig', () => {
  it('should accept a valid config', () => {
    const config = {
      models: { haiku: 'model-a', sonnet: 'model-b' },
      default_model: 'haiku',
      routing_rules: [
        { condition: 'stuck_intervention', model: 'sonnet', description: 'test' },
      ],
    }
    const result = validateConfig(config)
    expect(result.valid).toBe(true)
    expect(result.errors).toHaveLength(0)
  })

  it('should reject non-object config', () => {
    const result = validateConfig('not an object')
    expect(result.valid).toBe(false)
    expect(result.errors).toContain('Config must be an object')
  })

  it('should reject config with missing models', () => {
    const result = validateConfig({
      default_model: 'haiku',
      routing_rules: [],
    })
    expect(result.valid).toBe(false)
    expect(result.errors[0]).toContain('models')
  })

  it('should reject config with invalid default_model', () => {
    const result = validateConfig({
      models: { haiku: 'a', sonnet: 'b' },
      default_model: 'opus',
      routing_rules: [],
    })
    expect(result.valid).toBe(false)
    expect(result.errors[0]).toContain('default_model')
  })

  it('should reject routing_rules that is not an array', () => {
    const result = validateConfig({
      models: { haiku: 'a', sonnet: 'b' },
      default_model: 'haiku',
      routing_rules: 'not-array',
    })
    expect(result.valid).toBe(false)
    expect(result.errors[0]).toContain('routing_rules must be an array')
  })

  it('should reject rules with invalid condition', () => {
    const result = validateConfig({
      models: { haiku: 'a', sonnet: 'b' },
      default_model: 'haiku',
      routing_rules: [
        { condition: 'invalid_condition', model: 'haiku', description: 'test' },
      ],
    })
    expect(result.valid).toBe(false)
    expect(result.errors[0]).toContain('condition')
  })

  it('should reject rules with invalid model reference', () => {
    const result = validateConfig({
      models: { haiku: 'a', sonnet: 'b' },
      default_model: 'haiku',
      routing_rules: [
        { condition: 'stuck_intervention', model: 'opus', description: 'test' },
      ],
    })
    expect(result.valid).toBe(false)
    expect(result.errors[0]).toContain('model')
  })

  it('should reject explain_pattern rules without patterns array', () => {
    const result = validateConfig({
      models: { haiku: 'a', sonnet: 'b' },
      default_model: 'haiku',
      routing_rules: [
        { condition: 'explain_pattern', model: 'sonnet', description: 'test' },
      ],
    })
    expect(result.valid).toBe(false)
    expect(result.errors[0]).toContain('patterns')
  })

  it('should reject explain_pattern rules with empty patterns array', () => {
    const result = validateConfig({
      models: { haiku: 'a', sonnet: 'b' },
      default_model: 'haiku',
      routing_rules: [
        { condition: 'explain_pattern', model: 'sonnet', description: 'test', patterns: [] },
      ],
    })
    expect(result.valid).toBe(false)
    expect(result.errors[0]).toContain('patterns')
  })
})

describe('loadModelRoutingConfig', () => {
  it('should return default config when no config is loaded yet', () => {
    const config = loadModelRoutingConfig()
    expect(config).toEqual(DEFAULT_CONFIG)
  })

  it('should return cached config after async load', async () => {
    mockReadFile.mockResolvedValue(CUSTOM_CONFIG_YAML)

    await loadModelRoutingConfigAsync()
    const config = loadModelRoutingConfig()

    expect(config.default_model).toBe('sonnet')
    expect(config.models.haiku).toBe('claude-haiku-custom')
  })
})

describe('loadModelRoutingConfigAsync', () => {
  it('should load and parse valid model-routing.yaml', async () => {
    mockReadFile.mockResolvedValue(VALID_CONFIG_YAML)

    const config = await loadModelRoutingConfigAsync()

    expect(config.models.haiku).toBe('claude-haiku-4-5-20251001')
    expect(config.models.sonnet).toBe('claude-sonnet-4-6-20250514')
    expect(config.default_model).toBe('haiku')
    expect(config.routing_rules).toHaveLength(3)
  })

  it('should fall back to default config on invalid file', async () => {
    const mockLog = { error: vi.fn(), warn: vi.fn() }
    initConfigLoader({ log: mockLog })

    mockReadFile.mockResolvedValue('invalid: yaml: [broken')

    const config = await loadModelRoutingConfigAsync()

    expect(config).toEqual(DEFAULT_CONFIG)
  })

  it('should fall back to default config on missing file', async () => {
    const mockLog = { error: vi.fn(), warn: vi.fn() }
    initConfigLoader({ log: mockLog })

    const err = new Error('ENOENT') as NodeJS.ErrnoException
    err.code = 'ENOENT'
    mockReadFile.mockRejectedValue(err)

    const config = await loadModelRoutingConfigAsync()

    expect(config).toEqual(DEFAULT_CONFIG)
    expect(mockLog.error).toHaveBeenCalled()
  })

  it('should fall back to default config when validation fails', async () => {
    const mockLog = { error: vi.fn(), warn: vi.fn() }
    initConfigLoader({ log: mockLog })

    mockReadFile.mockResolvedValue(`
models:
  haiku: "test"
default_model: opus
routing_rules: "not-array"
`)

    const config = await loadModelRoutingConfigAsync()

    expect(config).toEqual(DEFAULT_CONFIG)
    expect(mockLog.error).toHaveBeenCalled()
  })

  it('should cache config and return cached on subsequent calls', async () => {
    mockReadFile.mockResolvedValue(VALID_CONFIG_YAML)

    await loadModelRoutingConfigAsync()
    await loadModelRoutingConfigAsync()

    expect(mockReadFile).toHaveBeenCalledTimes(1)
  })

  it('should re-read from filesystem after resetModelRoutingConfigCache', async () => {
    mockReadFile.mockResolvedValue(VALID_CONFIG_YAML)

    await loadModelRoutingConfigAsync()
    resetModelRoutingConfigCache()

    mockReadFile.mockResolvedValue(CUSTOM_CONFIG_YAML)
    const config = await loadModelRoutingConfigAsync()

    expect(config.default_model).toBe('sonnet')
    expect(mockReadFile).toHaveBeenCalledTimes(2)
  })

  it('should use custom promptsRoot when provided via initConfigLoader', async () => {
    initConfigLoader({ promptsRoot: '/custom/prompts/path' })

    mockReadFile.mockResolvedValue(VALID_CONFIG_YAML)

    await loadModelRoutingConfigAsync()

    expect(mockReadFile).toHaveBeenCalledWith(
      expect.stringContaining('/custom/prompts/path/model-routing.yaml'),
      'utf-8'
    )
  })

  it('should load explain_pattern rule with custom patterns', async () => {
    mockReadFile.mockResolvedValue(CUSTOM_CONFIG_YAML)

    const config = await loadModelRoutingConfigAsync()

    const explainRule = config.routing_rules.find((r) => r.condition === 'explain_pattern')
    expect(explainRule).toBeDefined()
    expect(explainRule!.patterns).toEqual(['explain', 'help me understand'])
  })
})
