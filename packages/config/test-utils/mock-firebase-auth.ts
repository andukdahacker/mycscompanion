import type { Mock } from 'vitest'
import { vi } from 'vitest'

interface MockDecodedToken {
  readonly uid: string
  readonly email: string
  readonly name?: string
}

interface MockFirebaseAuth {
  verifyIdToken: Mock<(token: string) => Promise<MockDecodedToken>>
  deleteUser: Mock<(uid: string) => Promise<void>>
}

function createMockFirebaseAuth(defaultUid?: string): MockFirebaseAuth {
  const uid = defaultUid ?? 'test-user-uid'
  return {
    verifyIdToken: vi.fn(async () => ({
      uid,
      email: `${uid}@test.com`,
      name: 'Test User',
    })),
    deleteUser: vi.fn(async () => undefined),
  }
}

export { createMockFirebaseAuth }
export type { MockFirebaseAuth, MockDecodedToken }
