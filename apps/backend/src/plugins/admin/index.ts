import { timingSafeEqual } from 'node:crypto'
import type { FastifyInstance } from 'fastify'
import type { Queue } from 'bullmq'
import basicAuth from '@fastify/basic-auth'
import { createBullBoard } from '@bull-board/api'
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter'
import { FastifyAdapter } from '@bull-board/fastify'

interface AdminPluginOptions {
  readonly executionQueue?: Queue
}

async function adminPlugin(fastify: FastifyInstance, opts: AdminPluginOptions = {}): Promise<void> {
  // Basic auth for /admin routes
  const adminUser = process.env['MCC_ADMIN_USER'] ?? 'admin'
  const adminPass = process.env['MCC_ADMIN_PASSWORD']

  if (!adminPass) {
    fastify.log.warn('MCC_ADMIN_PASSWORD not set — Bull Board disabled')
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

  // Bull Board setup
  const serverAdapter = new FastifyAdapter()
  serverAdapter.setBasePath('/admin/queues')

  const queues = opts.executionQueue
    ? [new BullMQAdapter(opts.executionQueue)]
    : []

  createBullBoard({
    queues,
    serverAdapter,
  })

  // Use setBasePath ONLY — do NOT also pass prefix, or routes will double-prefix
  await fastify.register(serverAdapter.registerPlugin())

  // Protect all routes in this plugin scope with basic auth
  fastify.addHook('onRequest', fastify.basicAuth)
}

export { adminPlugin }
