import { describe, it, expect, afterEach, vi } from 'vitest'
import { selectModel, createAnthropicService } from './anthropic.js'
import type { TutorContext, TutorRequestParams, AnthropicClient } from './anthropic.js'

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
})

describe('createAnthropicService', () => {
  describe('createTutorResponse', () => {
    it('should call Anthropic API and return content with model', async () => {
      const mockCreate = vi.fn().mockResolvedValue({
        content: [{ type: 'text', text: 'What do you think happens when the process exits?' }],
        model: 'claude-haiku-4-5-20251001',
      })

      const mockClient: AnthropicClient = { messages: { create: mockCreate } }
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

      const mockClient: AnthropicClient = { messages: { create: mockCreate } }
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

      const mockClient: AnthropicClient = { messages: { create: mockCreate } }
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

      const mockClient: AnthropicClient = { messages: { create: mockCreate } }
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
})
