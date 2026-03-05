import type { FastifyInstance } from 'fastify'
import type { Kysely } from 'kysely'
import type { DB } from '@mycscompanion/shared'
import type { Redis } from 'ioredis'
import { db as defaultDb } from '../../shared/db.js'
import { createContentLoader } from './content-loader.js'
import { trackRoutes } from './routes/tracks.js'
import { milestoneRoutes } from './routes/milestones.js'

export interface CurriculumPluginOptions {
  readonly db?: Kysely<DB>
  readonly redis: Redis
  readonly contentRoot?: string
}

export async function curriculumPlugin(
  fastify: FastifyInstance,
  opts: CurriculumPluginOptions
): Promise<void> {
  const db = opts.db ?? defaultDb
  const contentLoader = createContentLoader({ redis: opts.redis, contentRoot: opts.contentRoot, log: fastify.log })

  await fastify.register(trackRoutes, { prefix: '/tracks', db })
  await fastify.register(milestoneRoutes, { prefix: '/milestones', db, contentLoader })
}
