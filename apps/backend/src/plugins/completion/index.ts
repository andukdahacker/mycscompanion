import type { FastifyInstance } from 'fastify'
import type { Kysely } from 'kysely'
import type { DB } from '@mycscompanion/shared'
import { db as defaultDb } from '../../shared/db.js'
import type { BriefLoader } from './routes/completion.js'
import { completionRoutes } from './routes/completion.js'

export interface CompletionPluginOptions {
  readonly db?: Kysely<DB>
  readonly contentLoader: BriefLoader
}

export async function completionPlugin(
  fastify: FastifyInstance,
  opts: CompletionPluginOptions
): Promise<void> {
  const db = opts.db ?? defaultDb

  await fastify.register(completionRoutes, { db, contentLoader: opts.contentLoader })
}
