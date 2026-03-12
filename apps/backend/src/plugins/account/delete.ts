import type { FastifyInstance } from 'fastify'
import type { Kysely } from 'kysely'
import type { DB } from '@mycscompanion/shared'
import type { FirebaseAdminAuth } from '../auth/firebase.js'

type DeleteRoutesOptions = {
  readonly db: Kysely<DB>
  readonly firebaseAuth: FirebaseAdminAuth
}

export async function deleteRoutes(
  fastify: FastifyInstance,
  opts: DeleteRoutesOptions
): Promise<void> {
  const { db, firebaseAuth } = opts

  // DELETE /delete — permanently delete user account and all data
  fastify.delete('/delete', async (request, reply) => {
    const userId = request.uid

    try {
      await db.transaction().execute(async (trx) => {
        // 1. Delete benchmark_results — no CASCADE on any FK
        await trx.deleteFrom('benchmark_results').where('user_id', '=', userId).execute()
        // 2. Delete user_milestones — no CASCADE on completing_submission_id FK to submissions
        //    (actual DB lacks CASCADE despite migration definition — see Story 8.3 debug log)
        await trx.deleteFrom('user_milestones').where('user_id', '=', userId).execute()
        // 3. Delete submissions — no CASCADE on user_id FK in actual DB
        //    (actual DB lacks CASCADE despite migration definition — see Story 8.3 debug log)
        await trx.deleteFrom('submissions').where('user_id', '=', userId).execute()
        // 4. Delete user record — CASCADE handles: sessions, code_snapshots,
        //    session_summaries, tutor_messages, data_exports
        const result = await trx.deleteFrom('users').where('id', '=', userId).executeTakeFirst()
        if (!result.numDeletedRows || result.numDeletedRows === 0n) {
          throw new Error('User not found')
        }
      })
    } catch {
      return reply.status(500).send({
        error: { code: 'DELETION_FAILED', message: 'Account deletion failed. Please try again.' },
      })
    }

    // Delete Firebase Auth user (best-effort — DB is source of truth)
    try {
      await firebaseAuth.deleteUser(userId)
    } catch (err: unknown) {
      fastify.log.warn({ uid: userId, err }, 'Firebase user deletion failed after DB deletion')
    }

    return reply.send({ message: 'Account deleted successfully' })
  })
}
