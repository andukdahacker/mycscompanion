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

export interface AnthropicClient {
  readonly messages: {
    create(body: {
      model: string
      max_tokens: number
      system: string
      messages: Array<{ role: 'user' | 'assistant'; content: string }>
    }): Promise<{
      content: Array<{ type: string; text?: string }>
    }>
    stream(body: {
      model: string
      max_tokens: number
      system: string
      messages: Array<{ role: 'user' | 'assistant'; content: string }>
    }): AnthropicMessageStream
  }
}

export type TutorContext = {
  readonly userMessage: string
  readonly hasCompileErrors: boolean
}

export type TutorRequestParams = {
  readonly systemPrompt: string
  readonly conversationHistory: readonly { role: 'user' | 'assistant'; content: string }[]
  readonly context: TutorContext
}

export type TutorModel = 'claude-haiku-4-5-20251001' | 'claude-sonnet-4-6-20250514'

const HAIKU_MODEL: TutorModel = 'claude-haiku-4-5-20251001'
const SONNET_MODEL: TutorModel = 'claude-sonnet-4-6-20250514'

const EXPLAIN_PATTERNS = /\b(explain|what is|how does|why does|what happens|how would)\b/i

export function selectModel(context: TutorContext): TutorModel {
  if (context.hasCompileErrors) return SONNET_MODEL
  if (EXPLAIN_PATTERNS.test(context.userMessage)) return SONNET_MODEL
  return HAIKU_MODEL
}

export interface AnthropicService {
  createTutorResponse(params: TutorRequestParams): Promise<{
    readonly content: string
    readonly model: string
  }>
  createStreamingTutorResponse(params: TutorRequestParams): AnthropicMessageStream
}

export function createAnthropicService(client: AnthropicClient): AnthropicService {
  return {
    async createTutorResponse(params: TutorRequestParams) {
      const model = selectModel(params.context)

      const response = await client.messages.create({
        model,
        max_tokens: 1024,
        system: params.systemPrompt,
        messages: params.conversationHistory.map((msg) => ({
          role: msg.role,
          content: msg.content,
        })),
      })

      const textBlock = response.content.find((block): block is { type: string; text: string } =>
        block.type === 'text' && typeof block.text === 'string'
      )
      const content = textBlock?.text ?? ''

      return { content, model }
    },

    createStreamingTutorResponse(params: TutorRequestParams) {
      const model = selectModel(params.context)

      return client.messages.stream({
        model,
        max_tokens: 1024,
        system: params.systemPrompt,
        messages: params.conversationHistory.map((msg) => ({
          role: msg.role,
          content: msg.content,
        })),
      })
    },
  }
}
