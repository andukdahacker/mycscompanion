import { initializeApp, cert, getApps } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'

/** Narrow interface — only what plugins actually need from Firebase Admin */
interface FirebaseAdminAuth {
  verifyIdToken(token: string): Promise<{ uid: string }>
  deleteUser(uid: string): Promise<void>
}

function initFirebaseAdmin(): FirebaseAdminAuth {
  if (getApps().length > 0) return getAuth()

  const serviceAccount = process.env['FIREBASE_SERVICE_ACCOUNT']
  if (!serviceAccount) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT environment variable is required')
  }

  // Support both raw JSON string and base64-encoded JSON
  const decoded = serviceAccount.startsWith('{')
    ? serviceAccount
    : Buffer.from(serviceAccount, 'base64').toString('utf-8')

  let credential: ReturnType<typeof cert>
  try {
    credential = cert(JSON.parse(decoded))
  } catch {
    throw new Error('FIREBASE_SERVICE_ACCOUNT contains invalid JSON or service account — check encoding')
  }

  initializeApp({ credential })
  return getAuth()
}

export { initFirebaseAdmin }
export type { FirebaseAdminAuth }
