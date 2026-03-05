import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { resolve } from 'node:path'
import type { Redis } from 'ioredis'
import { createMockRedis } from '@mycscompanion/config/test-utils'
import { createContentLoader } from './content-loader.js'
import type { ContentLoader } from './content-loader.js'

const CONTENT_ROOT = resolve(process.cwd(), '..', '..', 'content', 'milestones')

let mockRedis: ReturnType<typeof createMockRedis>
let loader: ContentLoader

beforeEach(() => {
  mockRedis = createMockRedis()
  loader = createContentLoader({
    redis: mockRedis as unknown as Redis,
    contentRoot: CONTENT_ROOT,
  })
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('ContentLoader integration', () => {
  describe('01-kv-store (fully authored milestone)', () => {
    it('should load brief as raw markdown', async () => {
      const brief = await loader.loadMilestoneBrief('01-kv-store')
      expect(brief).not.toBeNull()
      expect(brief).toContain('# Milestone 1')
      expect(brief).toContain('Key-Value Store')
    })

    it('should load acceptance criteria with camelCase keys', async () => {
      const criteria = await loader.loadAcceptanceCriteria('01-kv-store')
      expect(criteria.length).toBeGreaterThan(0)

      const first = criteria[0]!
      expect(first.name).toBe('put-and-get')
      expect(first.order).toBe(1)
      expect(first.assertion).toBeDefined()
      expect(first.assertion.type).toBe('stdout-contains')
      expect(first.assertion.commandArgs).toBe('test')
    })

    it('should load benchmark config with camelCase keys', async () => {
      const config = await loader.loadBenchmarkConfig('01-kv-store')
      expect(config).not.toBeNull()
      expect(config!.benchmarks.length).toBeGreaterThan(0)

      const bench = config!.benchmarks[0]!
      expect(bench.name).toBe('sequential-inserts')
      expect(bench.warmupIterations).toBe(2)
      expect(bench.measuredIterations).toBe(10)
      expect(bench.workload.numOperations).toBe(1000)
      expect(bench.targetMetrics.opsPerSec).toBe(100)
    })

    it('should return empty array for assets with only .gitkeep', async () => {
      const assets = await loader.listConceptExplainerAssets('01-kv-store')
      expect(assets).toEqual([])
    })

    it('should load starter code content from main.go', async () => {
      const code = await loader.loadStarterCode('01-kv-store')
      expect(code).not.toBeNull()
      expect(code).toContain('package main')
      expect(code).toContain('func main()')
    })
  })

  describe('02-05 milestones (placeholder content)', () => {
    it('should handle empty criteria arrays gracefully', async () => {
      const criteria = await loader.loadAcceptanceCriteria('02-storage-engine')
      expect(criteria).toEqual([])
    })

    it('should return null benchmark config for empty benchmarks', async () => {
      const config = await loader.loadBenchmarkConfig('02-storage-engine')
      expect(config).toBeNull()
    })

    it('should return null starterCodePath for .gitkeep only dirs', async () => {
      const path = await loader.getStarterCodePath('02-storage-engine')
      expect(path).toBeNull()
    })

    it('should return null starterCode for .gitkeep only dirs', async () => {
      const code = await loader.loadStarterCode('02-storage-engine')
      expect(code).toBeNull()
    })

    it('should still load brief markdown for placeholder milestones', async () => {
      const brief = await loader.loadMilestoneBrief('02-storage-engine')
      expect(brief).not.toBeNull()
    })
  })

  describe('nonexistent milestone', () => {
    it('should return null/empty for all fields', async () => {
      const brief = await loader.loadMilestoneBrief('nonexistent')
      const criteria = await loader.loadAcceptanceCriteria('nonexistent')
      const config = await loader.loadBenchmarkConfig('nonexistent')
      const assets = await loader.listConceptExplainerAssets('nonexistent')
      const starter = await loader.getStarterCodePath('nonexistent')

      expect(brief).toBeNull()
      expect(criteria).toEqual([])
      expect(config).toBeNull()
      expect(assets).toEqual([])
      expect(starter).toBeNull()
    })
  })

  describe('cache invalidation', () => {
    it('should clear cached content for a specific slug', async () => {
      await loader.loadMilestoneBrief('01-kv-store')
      expect(mockRedis.set).toHaveBeenCalledOnce()

      await loader.invalidateCache('01-kv-store')
      expect(mockRedis.del).toHaveBeenCalledWith('curriculum:milestone:01-kv-store')
    })

    it('should clear all curriculum cache keys', async () => {
      await loader.loadMilestoneBrief('01-kv-store')
      await loader.loadMilestoneBrief('02-storage-engine')

      await loader.invalidateAllCaches()
      expect(mockRedis.keys).toHaveBeenCalledWith('curriculum:milestone:*')
      expect(mockRedis.del).toHaveBeenCalled()
    })
  })
})
