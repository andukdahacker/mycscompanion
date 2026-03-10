import { describe, it, expect, afterEach, vi } from 'vitest'
import { selectModel, createAnthropicService } from './anthropic.js'
import type { TutorContext, TutorRequestParams, AnthropicClient, AnthropicMessageStream } from './anthropic.js'

function createMockClient(overrides: {
  create?: AnthropicClient['messages']['create']
  stream?: AnthropicClient['messages']['stream']
} = {}): AnthropicClient {
  return {
    messages: {
      create: overrides.create ?? vi.fn<AnthropicClient['messages']['create']>(),
      stream: overrides.stream ?? vi.fn<AnthropicClient['messages']['stream']>(),
    },
  }
}

function createMockStream(chunks: string[]): AnthropicMessageStream {
  const handlers = new Map<string, (...args: never[]) => void>()

  const mock: AnthropicMessageStream = {
    on(event: string, handler: (...args: never[]) => void) {
      handlers.set(event, handler)
      return mock
    },
  }

  process.nextTick(() => {
    const textHandler = handlers.get('text')
    const finalHandler = handlers.get('finalMessage')

    if (textHandler) {
      let snapshot = ''
      for (const chunk of chunks) {
        snapshot += chunk
        ;(textHandler as (delta: string, snapshot: string) => void)(chunk, snapshot)
      }
    }

    if (finalHandler) {
      const fullText = chunks.join('')
      ;(finalHandler as (msg: unknown) => void)({
        content: [{ type: 'text', text: fullText }],
        model: 'claude-haiku-4-5-20251001',
        usage: {
          input_tokens: 100,
          output_tokens: 50,
          cache_creation_input_tokens: 1200,
          cache_read_input_tokens: 0,
        },
      })
    }
  })

  return mock
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('selectModel', () => {
  it('should return Haiku for default Socratic dialogue', () => {
    const context: TutorContext = { userMessage: 'I am stuck on this', hasCompileErrors: false }
    expect(selectModel(context)).toBe('claude-haiku-4-5-20251001')
  })

  it('should return Sonnet when compile errors are present', () => {
    const context: TutorContext = { userMessage: 'help', hasCompileErrors: true }
    expect(selectModel(context)).toBe('claude-sonnet-4-6-20250514')
  })

  it('should return Sonnet for explanation patterns', () => {
    const patterns = [
      'explain how this works',
      'what is a hash table',
      'how does persistence work',
      'why does my code fail',
      'what happens when I call Put',
      'how would I implement this',
    ]

    for (const msg of patterns) {
      const context: TutorContext = { userMessage: msg, hasCompileErrors: false }
      expect(selectModel(context)).toBe('claude-sonnet-4-6-20250514')
    }
  })

  it('should prioritize compile errors over explanation patterns', () => {
    const context: TutorContext = { userMessage: 'explain this error', hasCompileErrors: true }
    expect(selectModel(context)).toBe('claude-sonnet-4-6-20250514')
  })

  it('should return Sonnet when isStuckIntervention is true', () => {
    const context: TutorContext = { userMessage: 'some message', hasCompileErrors: false, isStuckIntervention: true }
    expect(selectModel(context)).toBe('claude-sonnet-4-6-20250514')
  })

  it('should return Haiku for default when isStuckIntervention is undefined', () => {
    const context: TutorContext = { userMessage: 'some message', hasCompileErrors: false }
    expect(selectModel(context)).toBe('claude-haiku-4-5-20251001')
  })
})

describe('createAnthropicService', () => {
  describe('createTutorResponse', () => {
    it('should call Anthropic API and return content with model', async () => {
      const mockCreate = vi.fn().mockResolvedValue({
        content: [{ type: 'text', text: 'What do you think happens when the process exits?' }],
        model: 'claude-haiku-4-5-20251001',
      })

      const mockClient = createMockClient({ create: mockCreate })
      const service = createAnthropicService(mockClient)

      const params: TutorRequestParams = {
        systemPrompt: 'You are a tutor',
        conversationHistory: [{ role: 'user', content: 'I need help' }],
        context: { userMessage: 'I need help', hasCompileErrors: false },
      }

      const result = await service.createTutorResponse(params)

      expect(result.content).toBe('What do you think happens when the process exits?')
      expect(result.model).toBe('claude-haiku-4-5-20251001')
      expect(mockCreate).toHaveBeenCalledWith({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1024,
        system: 'You are a tutor',
        messages: [{ role: 'user', content: 'I need help' }],
      })
    })

    it('should select Sonnet when compile errors are present', async () => {
      const mockCreate = vi.fn().mockResolvedValue({
        content: [{ type: 'text', text: 'Look at line 5...' }],
        model: 'claude-sonnet-4-6-20250514',
      })

      const mockClient = createMockClient({ create: mockCreate })
      const service = createAnthropicService(mockClient)

      const params: TutorRequestParams = {
        systemPrompt: 'You are a tutor',
        conversationHistory: [{ role: 'user', content: 'explain the error' }],
        context: { userMessage: 'explain the error', hasCompileErrors: true },
      }

      await service.createTutorResponse(params)

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({ model: 'claude-sonnet-4-6-20250514' })
      )
    })

    it('should handle API errors by propagating them', async () => {
      const mockCreate = vi.fn().mockRejectedValue(new Error('API unavailable'))

      const mockClient = createMockClient({ create: mockCreate })
      const service = createAnthropicService(mockClient)

      const params: TutorRequestParams = {
        systemPrompt: 'You are a tutor',
        conversationHistory: [{ role: 'user', content: 'help' }],
        context: { userMessage: 'help', hasCompileErrors: false },
      }

      await expect(service.createTutorResponse(params)).rejects.toThrow('API unavailable')
    })

    it('should return empty string when response has no text blocks', async () => {
      const mockCreate = vi.fn().mockResolvedValue({
        content: [],
        model: 'claude-haiku-4-5-20251001',
      })

      const mockClient = createMockClient({ create: mockCreate })
      const service = createAnthropicService(mockClient)

      const params: TutorRequestParams = {
        systemPrompt: 'You are a tutor',
        conversationHistory: [{ role: 'user', content: 'help' }],
        context: { userMessage: 'help', hasCompileErrors: false },
      }

      const result = await service.createTutorResponse(params)
      expect(result.content).toBe('')
    })
  })

  describe('createStreamingTutorResponse', () => {
    it('should call client.messages.stream with correct parameters', () => {
      const mockStreamFn = vi.fn().mockReturnValue(createMockStream(['Hello']))
      const mockClient = createMockClient({ stream: mockStreamFn })
      const service = createAnthropicService(mockClient)

      const params: TutorRequestParams = {
        systemPrompt: 'You are a tutor',
        conversationHistory: [{ role: 'user', content: 'Help me' }],
        context: { userMessage: 'Help me', hasCompileErrors: false },
      }

      service.createStreamingTutorResponse(params)

      expect(mockStreamFn).toHaveBeenCalledWith({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1024,
        system: 'You are a tutor',
        messages: [{ role: 'user', content: 'Help me' }],
      })
    })

    it('should select Sonnet when compile errors are present', () => {
      const mockStreamFn = vi.fn().mockReturnValue(createMockStream(['Hi']))
      const mockClient = createMockClient({ stream: mockStreamFn })
      const service = createAnthropicService(mockClient)

      const params: TutorRequestParams = {
        systemPrompt: 'You are a tutor',
        conversationHistory: [{ role: 'user', content: 'help' }],
        context: { userMessage: 'help', hasCompileErrors: true },
      }

      service.createStreamingTutorResponse(params)

      expect(mockStreamFn).toHaveBeenCalledWith(
        expect.objectContaining({ model: 'claude-sonnet-4-6-20250514' })
      )
    })

    it('should return an AnthropicMessageStream with event handlers', async () => {
      const mockStreamFn = vi.fn().mockReturnValue(createMockStream(['Hello', ' world']))
      const mockClient = createMockClient({ stream: mockStreamFn })
      const service = createAnthropicService(mockClient)

      const params: TutorRequestParams = {
        systemPrompt: 'You are a tutor',
        conversationHistory: [{ role: 'user', content: 'help' }],
        context: { userMessage: 'help', hasCompileErrors: false },
      }

      const stream = service.createStreamingTutorResponse(params)

      const textDeltas: string[] = []
      let finalMessage: unknown = null

      stream.on('text', (delta: string) => {
        textDeltas.push(delta)
      })
      stream.on('finalMessage', (msg) => {
        finalMessage = msg
      })

      await new Promise((resolve) => process.nextTick(resolve))

      expect(textDeltas).toEqual(['Hello', ' world'])
      expect(finalMessage).toEqual(
        expect.objectContaining({
          content: [{ type: 'text', text: 'Hello world' }],
          model: 'claude-haiku-4-5-20251001',
        })
      )
    })
  })
})
