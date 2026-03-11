import type { FastifyInstance } from 'fastify'
import type { Kysely } from 'kysely'
import type { DB } from '@mycscompanion/shared'

export interface BenchmarkResultsRoutesOptions {
  readonly db: Kysely<DB>
}

function parseRawMetrics(raw: unknown): Record<string, unknown> {
  if (typeof raw === 'string') {
    const parsed: unknown = JSON.parse(raw)
    return typeof parsed === 'object' && parsed !== null ? parsed as Record<string, unknown> : {}
  }
  return typeof raw === 'object' && raw !== null ? raw as Record<string, unknown> : {}
}

function mapBenchmarkRow(row: {
  readonly id: string
  readonly submission_id: string
  readonly benchmark_name: string
  readonly raw_metrics: unknown
  readonly normalized_ratio: string | number
  readonly reference_version: string
  readonly created_at: Date | string
}) {
  const rawMetrics = parseRawMetrics(row.raw_metrics)
  return {
    id: row.id,
    submissionId: row.submission_id,
    benchmarkName: row.benchmark_name,
    opsPerSec: typeof rawMetrics.opsPerSec === 'number' ? rawMetrics.opsPerSec : 0,
    normalizedRatio: parseFloat(String(row.normalized_ratio)),
    userMedian: typeof rawMetrics.userMedian === 'number' ? rawMetrics.userMedian : 0,
    referenceMedian: typeof rawMetrics.referenceMedian === 'number' ? rawMetrics.referenceMedian : 0,
    p50LatencyUs: typeof rawMetrics.p50LatencyUs === 'number' ? rawMetrics.p50LatencyUs : null,
    p99LatencyUs: typeof rawMetrics.p99LatencyUs === 'number' ? rawMetrics.p99LatencyUs : null,
    referenceVersion: row.reference_version,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
  }
}

export async function benchmarkResultsRoutes(
  fastify: FastifyInstance,
  opts: BenchmarkResultsRoutesOptions,
): Promise<void> {
  const { db } = opts

  fastify.get<{ Params: { submissionId: string } }>(
    '/submissions/:submissionId/benchmark',
    async (request, reply) => {
      const { submissionId } = request.params

      const row = await db
        .selectFrom('benchmark_results')
        .innerJoin('submissions', 'submissions.id', 'benchmark_results.submission_id')
        .select([
          'benchmark_results.id',
          'benchmark_results.submission_id',
          'benchmark_results.benchmark_name',
          'benchmark_results.raw_metrics',
          'benchmark_results.normalized_ratio',
          'benchmark_results.reference_version',
          'benchmark_results.created_at',
          'submissions.user_id',
        ])
        .where('benchmark_results.submission_id', '=', submissionId)
        .executeTakeFirst()

      if (!row) {
        reply.code(404)
        return { error: { code: 'NOT_FOUND', message: 'No benchmark result found for this submission' } }
      }

      if (row.user_id !== request.uid) {
        reply.code(403)
        return { error: { code: 'FORBIDDEN', message: 'You do not have access to this submission' } }
      }

      return mapBenchmarkRow(row)
    },
  )

  fastify.get<{ Params: { milestoneId: string } }>(
    '/benchmark-results/latest/:milestoneId',
    async (request, reply) => {
      const { milestoneId } = request.params
      const uid = request.uid

      const row = await db
        .selectFrom('benchmark_results')
        .innerJoin('submissions', 'submissions.id', 'benchmark_results.submission_id')
        .select([
          'benchmark_results.id',
          'benchmark_results.submission_id',
          'benchmark_results.benchmark_name',
          'benchmark_results.raw_metrics',
          'benchmark_results.normalized_ratio',
          'benchmark_results.reference_version',
          'benchmark_results.created_at',
        ])
        .where('submissions.user_id', '=', uid)
        .where('submissions.milestone_id', '=', milestoneId)
        .orderBy('benchmark_results.created_at', 'desc')
        .limit(1)
        .executeTakeFirst()

      if (!row) {
        reply.code(404)
        return { error: { code: 'NOT_FOUND', message: 'No benchmark results found for this milestone' } }
      }

      return mapBenchmarkRow(row)
    },
  )
}
