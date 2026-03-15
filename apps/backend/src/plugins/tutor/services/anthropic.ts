export interface AnthropicMessageStream {
  on(event: 'text', handler: (textDelta: string, textSnapshot: string) => void): AnthropicMessageStream
  on(event: 'finalMessage', handler: (message: {
    content: Array<{ type: string; text?: string }>
    model: string
    usage: {
      input_tokens: number
      output_tokens: number
      cache_creation_input_tokens?: number
      cache_read_input_tokens?: number
    }
  }) => void): AnthropicMessageStream
  on(event: 'error', handler: (error: Error) => void): AnthropicMessageStream
}

export type AnthropicRequestBody = {
  model: string
  max_tokens: number
  system: string
  messages: Array<{ role: 'user' | 'assistant'; content: string }>
}

export interface AnthropicClient {
  readonly messages: {
    create(body: AnthropicRequestBody, options?: { signal?: AbortSignal }): Promise<{
      content: Array<{ type: string; text?: string }>
    }>
    stream(body: AnthropicRequestBody, options?: { signal?: AbortSignal }): AnthropicMessageStream
  }
}

export type TutorContext = {
  readonly userMessage: string
  readonly hasCompileErrors: boolean
  readonly isStuckIntervention?: boolean
}

export type TutorRequestParams = {
  readonly systemPrompt: string
  readonly conversationHistory: readonly { role: 'user' | 'assistant'; content: string }[]
  readonly context: TutorContext
}

export type TutorModel = string

import { loadModelRoutingConfig } from './config-loader.js'
import type { ModelRoutingRule } from '@mycscompanion/shared'

const TTFT_TIMEOUT_MS = Number(process.env['MCC_TUTOR_TTFT_TIMEOUT_MS']) || 30_000
const STREAM_TIMEOUT_MS = Number(process.env['MCC_TUTOR_STREAM_TIMEOUT_MS']) || 120_000

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function matchesCondition(rule: ModelRoutingRule, context: TutorContext): boolean {
  switch (rule.condition) {
    case 'stuck_intervention':
      return context.isStuckIntervention === true
    case 'compile_errors':
      return context.hasCompileErrors === true
    case 'explain_pattern':
      if (!context.userMessage || !rule.patterns?.length) return false
      const pattern = new RegExp(`\\b(${rule.patterns.map(escapeRegex).join('|')})\\b`, 'i')
      return pattern.test(context.userMessage)
    default:
      return false
  }
}

export function selectModel(context: TutorContext): TutorModel {
  const config = loadModelRoutingConfig()
  for (const rule of config.routing_rules) {
    if (matchesCondition(rule, context)) {
      return config.models[rule.model]
    }
  }
  return config.models[config.default_model]
}

export interface AnthropicService {
  createTutorResponse(params: TutorRequestParams): Promise<{
    readonly content: string
    readonly model: string
  }>
  createStreamingTutorResponse(params: TutorRequestParams): AnthropicMessageStream
}

export type TutorErrorType = 'rate_limit' | 'overloaded' | 'auth_error' | 'timeout' | 'network_error' | 'api_error'

export function classifyError(error: unknown): TutorErrorType {
  if (error instanceof Error && error.name === 'AbortError') return 'timeout'

  // Anthropic SDK errors have a `status` property
  const status = typeof error === 'object' && error !== null && 'status' in error
    ? (error as { status: number }).status
    : undefined
  if (status === 429) return 'rate_limit'
  if (status === 529) return 'overloaded'
  if (status === 401) return 'auth_error'
  if (typeof status === 'number' && status >= 500) return 'api_error'

  // Network-level errors
  if (error instanceof TypeError && error.message.includes('fetch')) return 'network_error'
  if (error instanceof Error && (error.message.includes('ECONNREFUSED') || error.message.includes('ENOTFOUND') || error.message.includes('ETIMEDOUT'))) return 'network_error'

  return 'api_error'
}

export function createAnthropicService(client: AnthropicClient): AnthropicService {
  return {
    async createTutorResponse(params: TutorRequestParams) {
      const model = selectModel(params.context)
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), TTFT_TIMEOUT_MS)

      try {
        const response = await client.messages.create(
          {
            model,
            max_tokens: 1024,
            system: params.systemPrompt,
            messages: params.conversationHistory.map((msg) => ({
              role: msg.role,
              content: msg.content,
            })),
          },
          { signal: controller.signal }
        )

        const textBlock = response.content.find((block): block is { type: string; text: string } =>
          block.type === 'text' && typeof block.text === 'string'
        )
        const content = textBlock?.text ?? ''

        return { content, model }
      } finally {
        clearTimeout(timeout)
      }
    },

    createStreamingTutorResponse(params: TutorRequestParams) {
      const model = selectModel(params.context)
      const controller = new AbortController()
      const ttftTimeout = setTimeout(() => controller.abort(), TTFT_TIMEOUT_MS)

      const stream = client.messages.stream(
        {
          model,
          max_tokens: 1024,
          system: params.systemPrompt,
          messages: params.conversationHistory.map((msg) => ({
            role: msg.role,
            content: msg.content,
          })),
        },
        { signal: controller.signal }
      )

      // Once first text arrives, switch to total stream timeout
      let receivedFirstText = false
      let streamTimeout: ReturnType<typeof setTimeout> | null = null

      const originalOn = stream.on.bind(stream)

      // Intercept 'text' event to track TTFT and set stream timeout
      originalOn('text', () => {
        if (!receivedFirstText) {
          receivedFirstText = true
          clearTimeout(ttftTimeout)
          streamTimeout = setTimeout(() => controller.abort(), STREAM_TIMEOUT_MS)
        }
      })

      // Clean up timeouts on completion or error
      originalOn('finalMessage', () => {
        clearTimeout(ttftTimeout)
        if (streamTimeout) clearTimeout(streamTimeout)
      })

      originalOn('error', () => {
        clearTimeout(ttftTimeout)
        if (streamTimeout) clearTimeout(streamTimeout)
      })

      return stream
    },
  }
}
