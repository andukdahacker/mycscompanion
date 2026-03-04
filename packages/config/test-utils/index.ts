export { createMockRedis } from './mock-redis.js'
export type { MockRedis } from './mock-redis.js'
export { createTestQueryClient } from './query-client.js'
export { createMockFirebaseAuth } from './mock-firebase-auth.js'
export type { MockFirebaseAuth, MockDecodedToken } from './mock-firebase-auth.js'
export { setupFlyApiHandlers, createMockFlyMachineResponse } from './mock-fly-api.js'
export type {
  MockFlyMachineState,
  MockFlyMachineOptions,
  SetupFlyApiHandlersOptions,
} from './mock-fly-api.js'

// TestProviders is a React component (.tsx) — import directly from
// '@mycscompanion/config/test-utils/providers' in frontend test files.
// NOT re-exported here to avoid TS6142 in backend (no --jsx).
