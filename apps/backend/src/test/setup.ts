import { afterAll, afterEach, vi } from 'vitest'
import { destroyDb } from '../shared/db.js'

afterEach(() => {
  vi.restoreAllMocks()
})

afterAll(async () => {
  await destroyDb()
})
