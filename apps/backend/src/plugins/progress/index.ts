import type { FastifyInstance } from 'fastify'
import type { Kysely } from 'kysely'
import type { DB } from '@mycscompanion/shared'
import { db as defaultDb } from '../../shared/db.js'
import type { OverviewContentLoader } from './routes/overview.js'
import { overviewRoutes } from './routes/overview.js'

export interface ProgressPluginOptions {
  readonly db?: Kysely<DB>
  readonly contentLoader: OverviewContentLoader
}

export async function progressPlugin(
  fastify: FastifyInstance,
  opts: ProgressPluginOptions
): Promise<void> {
  const db = opts.db ?? defaultDb

  await fastify.register(overviewRoutes, { db, contentLoader: opts.contentLoader })
}
