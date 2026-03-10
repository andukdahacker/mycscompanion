import type { FastifyInstance } from 'fastify'
import type { Kysely } from 'kysely'
import type { DB } from '@mycscompanion/shared'
import type { Redis } from 'ioredis'
import { db as defaultDb } from '../../shared/db.js'
import type { RateLimitChecker } from '../../shared/rate-limiter.js'
import type { AnthropicService, AnthropicClient } from './services/anthropic.js'
import type { ContextAssembler } from './services/context-assembler.js'
import type { StuckContextAssembler } from './services/stuck-context-assembler.js'
import { createAnthropicService } from './services/anthropic.js'
import { createContextAssembler } from './services/context-assembler.js'
import { createStuckContextAssembler } from './services/stuck-context-assembler.js'
import { messageRoutes } from './routes/message.js'
import { historyRoutes } from './routes/history.js'
import { streamRoutes } from './routes/stream.js'
import { stuckInterventionRoutes } from './routes/stuck-intervention.js'

export interface TutorPluginOptions {
  readonly db?: Kysely<DB>
  readonly redis?: Redis // Required when contextAssembler is not provided
  readonly rateLimiter: RateLimitChecker
  readonly anthropicClient?: AnthropicClient
  readonly contentRoot?: string
  readonly promptsRoot?: string
  // Pre-built services (for testing)
  readonly anthropicService?: AnthropicService
  readonly contextAssembler?: ContextAssembler
  readonly stuckContextAssembler?: StuckContextAssembler
}

const unavailableService: AnthropicService = {
  async createTutorResponse() {
    throw new Error('Anthropic API key not configured')
  },
  createStreamingTutorResponse() {
    throw new Error('Anthropic API key not configured')
  },
}

export async function tutorPlugin(
  fastify: FastifyInstance,
  opts: TutorPluginOptions
): Promise<void> {
  const db = opts.db ?? defaultDb

  // Use injected services, create from client, or fall back to unavailable stub
  const anthropicService =
    opts.anthropicService ??
    (opts.anthropicClient ? createAnthropicService(opts.anthropicClient) : unavailableService)

  let contextAssembler: ContextAssembler
  let stuckContextAssembler: StuckContextAssembler | null = null

  if (opts.contextAssembler) {
    contextAssembler = opts.contextAssembler
  } else {
    if (!opts.redis) {
      throw new Error('redis is required when contextAssembler is not provided')
    }
    contextAssembler = createContextAssembler({
      db,
      redis: opts.redis,
      contentRoot: opts.contentRoot,
      promptsRoot: opts.promptsRoot,
    })
  }

  if (opts.stuckContextAssembler) {
    stuckContextAssembler = opts.stuckContextAssembler
  } else if (opts.redis) {
    stuckContextAssembler = createStuckContextAssembler({
      db,
      redis: opts.redis,
      contentRoot: opts.contentRoot,
      promptsRoot: opts.promptsRoot,
    })
  }

  await fastify.register(messageRoutes, {
    db,
    anthropicService,
    contextAssembler,
    rateLimiter: opts.rateLimiter,
  })

  await fastify.register(historyRoutes, { db })

  await fastify.register(streamRoutes, {
    db,
    anthropicService,
    contextAssembler,
    rateLimiter: opts.rateLimiter,
  })

  if (stuckContextAssembler !== null) {
    const assembler = stuckContextAssembler
    await fastify.register(stuckInterventionRoutes, {
      db,
      anthropicService,
      stuckContextAssembler: assembler,
      rateLimiter: opts.rateLimiter,
    })
  }
}
