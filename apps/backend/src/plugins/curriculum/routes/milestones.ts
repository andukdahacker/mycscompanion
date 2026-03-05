import type { FastifyInstance } from 'fastify'
import type { Kysely } from 'kysely'
import type { DB } from '@mycscompanion/shared'
import type { ContentLoader } from '../content-loader.js'

interface MilestoneRoutesOptions {
  readonly db: Kysely<DB>
  readonly contentLoader: ContentLoader
}

export async function milestoneRoutes(fastify: FastifyInstance, opts: MilestoneRoutesOptions): Promise<void> {
  const { db, contentLoader } = opts

  fastify.get<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const { id } = request.params

    const milestone = await db
      .selectFrom('milestones')
      .select(['id', 'track_id', 'slug', 'title', 'position'])
      .where((eb) => eb.or([eb('id', '=', id), eb('slug', '=', id)]))
      .executeTakeFirst()

    if (!milestone) {
      return reply.status(404).send({
        error: { code: 'NOT_FOUND', message: 'Milestone not found' },
      })
    }

    const [brief, acceptanceCriteria, benchmarkConfig, conceptExplainerAssets, starterCodePath] =
      await Promise.all([
        contentLoader.loadMilestoneBrief(milestone.slug),
        contentLoader.loadAcceptanceCriteria(milestone.slug),
        contentLoader.loadBenchmarkConfig(milestone.slug),
        contentLoader.listConceptExplainerAssets(milestone.slug),
        contentLoader.getStarterCodePath(milestone.slug),
      ])

    return {
      milestoneId: milestone.id,
      trackId: milestone.track_id,
      slug: milestone.slug,
      title: milestone.title,
      position: milestone.position,
      brief,
      acceptanceCriteria,
      benchmarkConfig,
      conceptExplainerAssets,
      starterCodePath,
    }
  })
}
