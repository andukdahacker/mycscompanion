import type { FastifyInstance } from 'fastify'
import type { Kysely } from 'kysely'
import type { DB } from '@mycscompanion/shared'

interface TrackRoutesOptions {
  readonly db: Kysely<DB>
}

const queryParamsSchema = {
  type: 'object',
  properties: {
    afterCursor: { type: 'string' },
    pageSize: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
  },
} as const

interface TracksQuerystring {
  readonly afterCursor?: string
  readonly pageSize?: number
}

export async function trackRoutes(fastify: FastifyInstance, opts: TrackRoutesOptions): Promise<void> {
  const { db } = opts

  fastify.get<{ Querystring: TracksQuerystring }>(
    '/',
    { schema: { querystring: queryParamsSchema } },
    async (request) => {
      const { afterCursor, pageSize = 20 } = request.query

      let query = db
        .selectFrom('tracks')
        .select(['id', 'name', 'slug', 'description'])
        .orderBy('id')
        .limit(pageSize + 1)

      if (afterCursor) {
        query = query.where('id', '>', afterCursor)
      }

      const tracks = await query.execute()

      const hasMore = tracks.length > pageSize
      const items = hasMore ? tracks.slice(0, pageSize) : tracks

      const trackIds = items.map((t) => t.id)
      const milestones = trackIds.length > 0
        ? await db
            .selectFrom('milestones')
            .select(['id', 'slug', 'title', 'position', 'track_id'])
            .where('track_id', 'in', trackIds)
            .orderBy('position')
            .execute()
        : []

      const milestonesByTrack = new Map<string, typeof milestones>()
      for (const m of milestones) {
        const list = milestonesByTrack.get(m.track_id) ?? []
        list.push(m)
        milestonesByTrack.set(m.track_id, list)
      }

      const tracksWithMilestones = items.map((track) => ({
        id: track.id,
        name: track.name,
        slug: track.slug,
        description: track.description,
        milestones: (milestonesByTrack.get(track.id) ?? []).map((m) => ({
          id: m.id,
          slug: m.slug,
          title: m.title,
          position: m.position,
        })),
      }))

      return {
        items: tracksWithMilestones,
        nextCursor: hasMore ? items[items.length - 1]?.id ?? null : null,
      }
    }
  )
}
