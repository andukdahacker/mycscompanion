import { readFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import yaml from 'js-yaml'
import type { ModelRoutingConfig, ModelRoutingRule } from '@mycscompanion/shared'

const DEFAULT_PROMPTS_ROOT = resolve(process.cwd(), '..', '..', 'content', 'prompts')

const VALID_CONDITIONS = new Set(['stuck_intervention', 'compile_errors', 'explain_pattern'])
const VALID_MODELS = new Set(['haiku', 'sonnet'])

const DEFAULT_CONFIG: ModelRoutingConfig = {
  models: {
    haiku: 'claude-haiku-4-5-20251001',
    sonnet: 'claude-sonnet-4-6-20250514',
  },
  default_model: 'haiku',
  routing_rules: [
    { condition: 'stuck_intervention', model: 'sonnet', description: 'Use Sonnet for stuck interventions' },
    { condition: 'compile_errors', model: 'sonnet', description: 'Use Sonnet when submission has compile errors' },
    {
      condition: 'explain_pattern',
      model: 'sonnet',
      description: 'Use Sonnet for conceptual explanation requests',
      patterns: ['explain', 'what is', 'how does', 'why does', 'what happens', 'how would'],
    },
  ],
}

export interface ConfigLoaderLogger {
  error(obj: Record<string, unknown>, msg: string): void
  warn(obj: Record<string, unknown>, msg: string): void
}

let cachedConfig: ModelRoutingConfig | null = null
let configPromptsRoot: string = DEFAULT_PROMPTS_ROOT
let configLogger: ConfigLoaderLogger | null = null

export function initConfigLoader(opts?: { readonly promptsRoot?: string; readonly log?: ConfigLoaderLogger }): void {
  configPromptsRoot = opts?.promptsRoot ?? DEFAULT_PROMPTS_ROOT
  configLogger = opts?.log ?? null
}

function validateConfig(raw: unknown): { readonly valid: boolean; readonly errors: readonly string[] } {
  const errors: string[] = []

  if (typeof raw !== 'object' || raw === null) {
    return { valid: false, errors: ['Config must be an object'] }
  }

  const config = raw as Record<string, unknown>

  // Validate models
  if (typeof config['models'] !== 'object' || config['models'] === null) {
    errors.push('Missing or invalid "models" object')
  } else {
    const models = config['models'] as Record<string, unknown>
    if (typeof models['haiku'] !== 'string') errors.push('models.haiku must be a string')
    if (typeof models['sonnet'] !== 'string') errors.push('models.sonnet must be a string')
  }

  // Validate default_model
  if (!VALID_MODELS.has(config['default_model'] as string)) {
    errors.push(`default_model must be "haiku" or "sonnet", got "${String(config['default_model'])}"`)
  }

  // Validate routing_rules
  if (!Array.isArray(config['routing_rules'])) {
    errors.push('routing_rules must be an array')
  } else {
    for (const [i, rule] of (config['routing_rules'] as unknown[]).entries()) {
      if (typeof rule !== 'object' || rule === null) {
        errors.push(`routing_rules[${i}] must be an object`)
        continue
      }
      const r = rule as Record<string, unknown>
      if (!VALID_CONDITIONS.has(r['condition'] as string)) {
        errors.push(`routing_rules[${i}].condition must be one of: ${[...VALID_CONDITIONS].join(', ')}`)
      }
      if (!VALID_MODELS.has(r['model'] as string)) {
        errors.push(`routing_rules[${i}].model must be "haiku" or "sonnet"`)
      }
      if (r['condition'] === 'explain_pattern') {
        if (!Array.isArray(r['patterns']) || r['patterns'].length === 0) {
          errors.push(`routing_rules[${i}]: explain_pattern rules must have a non-empty patterns array`)
        }
      }
    }
  }

  return { valid: errors.length === 0, errors }
}

export function loadModelRoutingConfig(): ModelRoutingConfig {
  if (cachedConfig) return cachedConfig

  // Synchronous cache check — actual loading is triggered by loadModelRoutingConfigAsync
  // Return default if not yet loaded
  return DEFAULT_CONFIG
}

export async function loadModelRoutingConfigAsync(): Promise<ModelRoutingConfig> {
  if (cachedConfig) return cachedConfig

  try {
    const filePath = join(configPromptsRoot, 'model-routing.yaml')
    const raw = await readFile(filePath, 'utf-8')
    const parsed = yaml.load(raw)

    const validation = validateConfig(parsed)
    if (!validation.valid) {
      configLogger?.error(
        { errors: validation.errors, filePath },
        'Invalid model routing config — using default'
      )
      cachedConfig = DEFAULT_CONFIG
      return DEFAULT_CONFIG
    }

    cachedConfig = parsed as ModelRoutingConfig
    return cachedConfig
  } catch (err) {
    configLogger?.error(
      { error: String(err) },
      'Failed to load model routing config — using default'
    )
    cachedConfig = DEFAULT_CONFIG
    return DEFAULT_CONFIG
  }
}

export function resetModelRoutingConfigCache(): void {
  cachedConfig = null
}

export function getDefaultModelRoutingConfig(): ModelRoutingConfig {
  return DEFAULT_CONFIG
}

export { DEFAULT_CONFIG, validateConfig }
export type { ModelRoutingConfig }
