import { mergeConfig } from 'vitest/config'
import { baseVitestConfig } from '../../packages/config/vitest.config'

export default mergeConfig(baseVitestConfig, {
  test: {
    environment: 'jsdom',
    setupFiles: ['@testing-library/jest-dom/vitest'],
    exclude: ['**/e2e/**', '**/node_modules/**'],
    passWithNoTests: true,
  },
})
