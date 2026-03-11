import type { Kysely } from 'kysely'
import type { DB } from '@mycscompanion/shared'
import type { BenchmarkRunResult } from '@mycscompanion/execution'
import { generateId } from './id.js'

export async function persistBenchmarkResult(
  db: Kysely<DB>,
  params: {
    readonly submissionId: string
    readonly userId: string
    readonly milestoneId: string
    readonly benchmarkName: string
    readonly result: BenchmarkRunResult
    readonly referenceVersion: string
  },
): Promise<string> {
  const id = generateId()

  await db
    .insertInto('benchmark_results')
    .values({
      id,
      submission_id: params.submissionId,
      user_id: params.userId,
      milestone_id: params.milestoneId,
      benchmark_name: params.benchmarkName,
      raw_metrics: JSON.stringify({
        userMedian: params.result.userMedian,
        referenceMedian: params.result.referenceMedian,
        opsPerSec: params.result.opsPerSec,
        p50LatencyUs: params.result.p50LatencyUs,
        p99LatencyUs: params.result.p99LatencyUs,
      }),
      normalized_ratio: params.result.normalizedRatio.toString(),
      reference_version: params.referenceVersion,
    })
    .execute()

  return id
}
