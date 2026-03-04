import { mergeConfig } from 'vitest/config'
import { baseVitestConfig } from '@mycscompanion/config/vitest.config'

const pgPort = process.env['CI'] === 'true' ? '5432' : '5433'

export default mergeConfig(baseVitestConfig, {
  test: {
    env: {
      DATABASE_URL: `postgresql://mycscompanion:mycscompanion@localhost:${pgPort}/mycscompanion_test`,
      REDIS_URL: 'redis://localhost:6379',
      NODE_ENV: 'test',
      LOG_LEVEL: 'silent',
    },
    fileParallelism: false,
    globalSetup: './src/test/global-setup.ts',
    setupFiles: ['./src/test/setup.ts'],
    exclude: ['**/e2e/**', '**/node_modules/**'],
  },
})
