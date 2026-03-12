import type { FastifyInstance } from 'fastify'
import type { Queue } from 'bullmq'
import type { ExportJobData } from '../../shared/queue.js'
import type { FirebaseAdminAuth } from '../auth/firebase.js'
import { db as defaultDb } from '../../shared/db.js'
import { profileRoutes } from './profile.js'
import { onboardingRoutes } from './onboarding.js'
import { skillAssessmentRoutes } from './skill-assessment.js'
import { exportRoutes } from './export.js'
import { deleteRoutes } from './delete.js'

interface AccountPluginOptions {
  readonly db?: typeof defaultDb
  readonly exportQueue?: Queue<ExportJobData>
  readonly firebaseAuth?: FirebaseAdminAuth
}

export async function accountPlugin(fastify: FastifyInstance, opts: AccountPluginOptions = {}): Promise<void> {
  const db = opts.db ?? defaultDb
  await fastify.register(profileRoutes, { db })
  await fastify.register(onboardingRoutes, { db })
  await fastify.register(skillAssessmentRoutes, { db })
  if (opts.exportQueue) {
    await fastify.register(exportRoutes, { db, exportQueue: opts.exportQueue })
  }
  if (opts.firebaseAuth) {
    await fastify.register(deleteRoutes, { db, firebaseAuth: opts.firebaseAuth })
  }
}
