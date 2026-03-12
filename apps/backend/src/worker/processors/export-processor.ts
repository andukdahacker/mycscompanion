import type { Job, Processor } from 'bullmq'
import type { Kysely } from 'kysely'
import type { DB } from '@mycscompanion/shared'
import type { Logger } from 'pino'
import type { ExportJobData } from '../../shared/queue.js'
import { toCamelCase } from '@mycscompanion/shared'
import { sql } from 'kysely'

type ExportProcessorDeps = {
  readonly db: Kysely<DB>
  readonly logger: Logger
}

export function createExportProcessor(deps: ExportProcessorDeps): Processor<ExportJobData> {
  return async (job: Job<ExportJobData>) => {
    const { exportId, userId } = job.data

    try {
      deps.logger.info({ exportId, userId }, 'Starting data export')

      const user = await deps.db
        .selectFrom('users')
        .selectAll()
        .where('id', '=', userId)
        .executeTakeFirstOrThrow()

      const sessions = await deps.db
        .selectFrom('sessions')
        .selectAll()
        .where('user_id', '=', userId)
        .orderBy('started_at', 'asc')
        .execute()

      const codeSnapshots = await deps.db
        .selectFrom('code_snapshots')
        .selectAll()
        .where('user_id', '=', userId)
        .orderBy('created_at', 'asc')
        .execute()

      const submissions = await deps.db
        .selectFrom('submissions')
        .selectAll()
        .where('user_id', '=', userId)
        .orderBy('created_at', 'asc')
        .execute()

      const benchmarkResults = await deps.db
        .selectFrom('benchmark_results')
        .selectAll()
        .where('user_id', '=', userId)
        .orderBy('created_at', 'asc')
        .execute()

      const tutorMessages = await deps.db
        .selectFrom('tutor_messages')
        .selectAll()
        .where('user_id', '=', userId)
        .orderBy('created_at', 'asc')
        .execute()

      const sessionSummaries = await deps.db
        .selectFrom('session_summaries')
        .selectAll()
        .where('user_id', '=', userId)
        .orderBy('created_at', 'asc')
        .execute()

      const milestoneProgress = await deps.db
        .selectFrom('user_milestones')
        .selectAll()
        .where('user_id', '=', userId)
        .orderBy('created_at', 'asc')
        .execute()

      const exportPayload = {
        metadata: {
          exportDate: new Date().toISOString(),
          userId,
          categoriesIncluded: [
            'profile',
            'sessions',
            'codeSnapshots',
            'submissions',
            'benchmarkResults',
            'tutorMessages',
            'sessionSummaries',
            'milestoneProgress',
          ],
        },
        data: {
          profile: toCamelCase(user),
          sessions: toCamelCase(sessions),
          codeSnapshots: toCamelCase(codeSnapshots),
          submissions: toCamelCase(submissions),
          benchmarkResults: toCamelCase(benchmarkResults),
          tutorMessages: toCamelCase(tutorMessages),
          sessionSummaries: toCamelCase(sessionSummaries),
          milestoneProgress: toCamelCase(milestoneProgress),
        },
      }

      await deps.db
        .updateTable('data_exports')
        .set({
          status: 'completed',
          export_data: JSON.stringify(exportPayload),
          completed_at: sql`now()`,
        })
        .where('id', '=', exportId)
        .execute()

      deps.logger.info({ exportId, userId }, 'Data export completed')
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error'
      deps.logger.error({ exportId, userId, err }, 'Data export failed')

      await deps.db
        .updateTable('data_exports')
        .set({
          status: 'failed',
          error_message: errorMessage,
        })
        .where('id', '=', exportId)
        .execute()

      throw err
    }
  }
}
