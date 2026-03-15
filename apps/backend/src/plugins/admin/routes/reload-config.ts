import type { FastifyInstance } from 'fastify'

export interface ReloadRouteOptions {
  readonly resetPromptCaches: () => void
  readonly reloadModelRoutingConfig: () => Promise<void>
  readonly invalidateContentCache: (milestoneSlug?: string) => Promise<void>
  readonly validatePromptFiles: () => Promise<readonly string[]>
}

const reloadResponseSchema = {
  type: 'object',
  properties: {
    reloaded: { type: 'array', items: { type: 'string' } },
    errors: { type: 'array', items: { type: 'string' } },
    timestamp: { type: 'string' },
  },
} as const

export async function reloadRoutes(fastify: FastifyInstance, opts: ReloadRouteOptions): Promise<void> {
  const { resetPromptCaches, reloadModelRoutingConfig, invalidateContentCache, validatePromptFiles } = opts

  fastify.post('/reload-prompts', {
    schema: { response: { 200: reloadResponseSchema, 500: reloadResponseSchema } },
  }, async (request, reply) => {
    request.log.info('Admin: reloading prompt templates')

    resetPromptCaches()

    const validationErrors = await validatePromptFiles()
    if (validationErrors.length > 0) {
      request.log.error({ errors: validationErrors }, 'Prompt file validation errors after reload')
      return reply.status(500).send({
        reloaded: [] as string[],
        errors: [...validationErrors],
        timestamp: new Date().toISOString(),
      })
    }

    return {
      reloaded: ['tutor-base.md', 'stuck-intervention.md'],
      errors: [] as string[],
      timestamp: new Date().toISOString(),
    }
  })

  fastify.post('/reload-config', {
    schema: { response: { 200: reloadResponseSchema, 500: reloadResponseSchema } },
  }, async (request, reply) => {
    request.log.info('Admin: reloading all external configuration')

    const reloaded: string[] = []
    const errors: string[] = []

    try {
      resetPromptCaches()
      const promptErrors = await validatePromptFiles()
      if (promptErrors.length > 0) {
        errors.push(...promptErrors)
      } else {
        reloaded.push('prompts')
      }
    } catch (err) {
      errors.push(`Prompt cache reset failed: ${String(err)}`)
    }

    try {
      await reloadModelRoutingConfig()
      reloaded.push('model-routing')
    } catch (err) {
      errors.push(`Model routing reload failed: ${String(err)}`)
    }

    try {
      await invalidateContentCache()
      reloaded.push('content-cache')
    } catch (err) {
      errors.push(`Content cache invalidation failed: ${String(err)}`)
    }

    if (errors.length > 0) {
      return reply.status(500).send({ reloaded, errors, timestamp: new Date().toISOString() })
    }

    return { reloaded, errors, timestamp: new Date().toISOString() }
  })
}
