import type { FastifyInstance } from 'fastify'
import fp from 'fastify-plugin'
import { initFirebaseAdmin, type FirebaseAdminAuth } from './firebase.js'

declare module 'fastify' {
  interface FastifyRequest {
    uid: string
  }
}

interface AuthPluginOptions {
  readonly firebaseAuth?: FirebaseAdminAuth
}

async function auth(fastify: FastifyInstance, opts: AuthPluginOptions): Promise<void> {
  const firebaseAuth = opts.firebaseAuth ?? initFirebaseAdmin()

  fastify.decorateRequest('uid', '')

  fastify.addHook('onRequest', async (request, reply) => {
    // Public routes — skip auth
    if (request.url === '/health' || request.url.startsWith('/health?')) return
    if (request.url === '/admin' || request.url.startsWith('/admin/')) return // Admin routes use basic auth, not Firebase

    const authHeader = request.headers.authorization
    if (!authHeader?.startsWith('Bearer ')) {
      return reply.status(401).send({
        error: { code: 'UNAUTHORIZED', message: 'Missing or invalid authorization header' },
      })
    }

    const token = authHeader.slice(7) // Strip "Bearer "

    try {
      const decodedToken = await firebaseAuth.verifyIdToken(token)
      request.uid = decodedToken.uid
    } catch (err: unknown) {
      const message =
        err instanceof Error && err.message.includes('expired')
          ? 'Token expired'
          : 'Invalid token'

      return reply.status(401).send({
        error: { code: 'UNAUTHORIZED', message },
      })
    }
  })
}

export const authPlugin = fp(auth, { name: 'auth-plugin' })
