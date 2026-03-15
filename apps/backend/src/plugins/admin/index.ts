import { timingSafeEqual } from 'node:crypto'
import type { FastifyInstance } from 'fastify'
import type { Queue } from 'bullmq'
import basicAuth from '@fastify/basic-auth'
import { createBullBoard } from '@bull-board/api'
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter'
import { FastifyAdapter } from '@bull-board/fastify'
import { reloadRoutes } from './routes/reload-config.js'

interface AdminPluginOptions {
  readonly executionQueue?: Queue
  readonly exportQueue?: Queue
  readonly resetPromptCaches?: () => void
  readonly reloadModelRoutingConfig?: () => Promise<void>
  readonly invalidateContentCache?: (milestoneSlug?: string) => Promise<void>
  readonly validatePromptFiles?: () => Promise<readonly string[]>
}

async function adminPlugin(fastify: FastifyInstance, opts: AdminPluginOptions = {}): Promise<void> {
  // Basic auth for /admin routes
  const adminUser = process.env['MCC_ADMIN_USER'] ?? 'admin'
  const adminPass = process.env['MCC_ADMIN_PASSWORD']

  if (!adminPass) {
    fastify.log.warn('MCC_ADMIN_PASSWORD not set — admin routes disabled')
    return
  }

  await fastify.register(basicAuth, {
    validate: async (username, password) => {
      const userBuf = Buffer.from(username)
      const expectedUserBuf = Buffer.from(adminUser)
      const passBuf = Buffer.from(password)
      const expectedPassBuf = Buffer.from(adminPass)
      // Constant-time comparison to prevent timing attacks
      const userMatch = userBuf.length === expectedUserBuf.length && timingSafeEqual(userBuf, expectedUserBuf)
      const passMatch = passBuf.length === expectedPassBuf.length && timingSafeEqual(passBuf, expectedPassBuf)
      if (!userMatch || !passMatch) {
        throw new Error('Unauthorized')
      }
    },
    authenticate: { realm: 'mycscompanion-admin' },
  })

  // Protect all routes in this plugin scope with basic auth
  fastify.addHook('onRequest', fastify.basicAuth)

  // Bull Board setup
  const serverAdapter = new FastifyAdapter()
  serverAdapter.setBasePath('/admin/queues')

  const queues: BullMQAdapter[] = []
  if (opts.executionQueue) queues.push(new BullMQAdapter(opts.executionQueue))
  if (opts.exportQueue) queues.push(new BullMQAdapter(opts.exportQueue))

  createBullBoard({
    queues,
    serverAdapter,
  })

  await fastify.register(serverAdapter.registerPlugin(), { prefix: '/queues' })

  // Reload routes for external configuration management
  if (opts.resetPromptCaches && opts.reloadModelRoutingConfig && opts.invalidateContentCache && opts.validatePromptFiles) {
    await fastify.register(reloadRoutes, {
      resetPromptCaches: opts.resetPromptCaches,
      reloadModelRoutingConfig: opts.reloadModelRoutingConfig,
      invalidateContentCache: opts.invalidateContentCache,
      validatePromptFiles: opts.validatePromptFiles,
    })
  }
}

export { adminPlugin }
export type { AdminPluginOptions }
