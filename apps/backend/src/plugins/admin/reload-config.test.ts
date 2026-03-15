import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from 'vitest'
import Fastify from 'fastify'
import type { FastifyInstance } from 'fastify'
import { adminPlugin } from './index.js'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('Admin Reload Config Routes', () => {
  const adminUser = 'admin'
  const adminPass = 'test-reload-pass'
  let app: FastifyInstance
  let resetPromptCaches: ReturnType<typeof vi.fn>
  let reloadModelRoutingConfig: ReturnType<typeof vi.fn>
  let invalidateContentCache: ReturnType<typeof vi.fn>
  let validatePromptFiles: ReturnType<typeof vi.fn>

  beforeAll(async () => {
    process.env['MCC_ADMIN_PASSWORD'] = adminPass
    process.env['MCC_ADMIN_USER'] = adminUser

    resetPromptCaches = vi.fn<() => void>()
    reloadModelRoutingConfig = vi.fn<() => Promise<void>>().mockResolvedValue(undefined)
    invalidateContentCache = vi.fn<(slug?: string) => Promise<void>>().mockResolvedValue(undefined)
    validatePromptFiles = vi.fn<() => Promise<readonly string[]>>().mockResolvedValue([])

    app = Fastify()
    await app.register(adminPlugin, {
      prefix: '/admin',
      resetPromptCaches,
      reloadModelRoutingConfig,
      invalidateContentCache,
      validatePromptFiles,
    })
    await app.ready()
  })

  afterAll(async () => {
    await app.close()
    delete process.env['MCC_ADMIN_PASSWORD']
    delete process.env['MCC_ADMIN_USER']
  })

  function authHeader(): string {
    return `Basic ${Buffer.from(`${adminUser}:${adminPass}`).toString('base64')}`
  }

  describe('POST /admin/reload-prompts', () => {
    it('should return 401 without credentials', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/admin/reload-prompts',
      })

      expect(response.statusCode).toBe(401)
    })

    it('should return success with reloaded file list when prompts are valid', async () => {
      validatePromptFiles.mockResolvedValueOnce([])

      const response = await app.inject({
        method: 'POST',
        url: '/admin/reload-prompts',
        headers: { authorization: authHeader() },
      })

      expect(response.statusCode).toBe(200)
      const body = response.json()
      expect(body.reloaded).toEqual(['tutor-base.md', 'stuck-intervention.md'])
      expect(body.errors).toEqual([])
      expect(body.timestamp).toBeDefined()
      expect(resetPromptCaches).toHaveBeenCalledOnce()
    })

    it('should return 500 when prompt validation fails', async () => {
      validatePromptFiles.mockResolvedValueOnce(['tutor-base.md not found or unreadable'])

      const response = await app.inject({
        method: 'POST',
        url: '/admin/reload-prompts',
        headers: { authorization: authHeader() },
      })

      expect(response.statusCode).toBe(500)
      const body = response.json()
      expect(body.reloaded).toEqual([])
      expect(body.errors).toContain('tutor-base.md not found or unreadable')
      expect(resetPromptCaches).toHaveBeenCalled()
    })
  })

  describe('POST /admin/reload-config', () => {
    it('should return 401 without credentials', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/admin/reload-config',
      })

      expect(response.statusCode).toBe(401)
    })

    it('should return success with all reloaded components', async () => {
      validatePromptFiles.mockResolvedValueOnce([])

      const response = await app.inject({
        method: 'POST',
        url: '/admin/reload-config',
        headers: { authorization: authHeader() },
      })

      expect(response.statusCode).toBe(200)
      const body = response.json()
      expect(body.reloaded).toEqual(['prompts', 'model-routing', 'content-cache'])
      expect(body.errors).toEqual([])
      expect(body.timestamp).toBeDefined()
      expect(resetPromptCaches).toHaveBeenCalled()
      expect(reloadModelRoutingConfig).toHaveBeenCalled()
      expect(invalidateContentCache).toHaveBeenCalled()
    })

    it('should return 500 with errors when model routing reload fails', async () => {
      validatePromptFiles.mockResolvedValueOnce([])
      reloadModelRoutingConfig.mockRejectedValueOnce(new Error('config parse error'))

      const response = await app.inject({
        method: 'POST',
        url: '/admin/reload-config',
        headers: { authorization: authHeader() },
      })

      expect(response.statusCode).toBe(500)
      const body = response.json()
      expect(body.reloaded).toContain('prompts')
      expect(body.reloaded).toContain('content-cache')
      expect(body.reloaded).not.toContain('model-routing')
      expect(body.errors).toHaveLength(1)
      expect(body.errors[0]).toContain('config parse error')
    })

    it('should return 500 with errors when content cache invalidation fails', async () => {
      validatePromptFiles.mockResolvedValueOnce([])
      invalidateContentCache.mockRejectedValueOnce(new Error('redis down'))

      const response = await app.inject({
        method: 'POST',
        url: '/admin/reload-config',
        headers: { authorization: authHeader() },
      })

      expect(response.statusCode).toBe(500)
      const body = response.json()
      expect(body.reloaded).toContain('prompts')
      expect(body.reloaded).toContain('model-routing')
      expect(body.reloaded).not.toContain('content-cache')
      expect(body.errors).toHaveLength(1)
      expect(body.errors[0]).toContain('redis down')
    })

    it('should exclude prompts from reloaded when prompt validation fails', async () => {
      validatePromptFiles.mockResolvedValueOnce(['stuck-intervention.md is empty'])

      const response = await app.inject({
        method: 'POST',
        url: '/admin/reload-config',
        headers: { authorization: authHeader() },
      })

      expect(response.statusCode).toBe(500)
      const body = response.json()
      expect(body.reloaded).not.toContain('prompts')
      expect(body.reloaded).toContain('model-routing')
      expect(body.reloaded).toContain('content-cache')
      expect(body.errors).toContain('stuck-intervention.md is empty')
    })
  })
})
