import { describe, it, expect, afterEach, vi, beforeEach } from 'vitest'
import type { Redis } from 'ioredis'
import { createMockRedis } from '@mycscompanion/config/test-utils'
import { createContentLoader } from './content-loader.js'
import type { ContentLoader } from './content-loader.js'

const mockReadFile = vi.fn()
const mockReaddir = vi.fn()

vi.mock('node:fs/promises', () => ({
  readFile: (...args: unknown[]) => mockReadFile(...args),
  readdir: (...args: unknown[]) => mockReaddir(...args),
}))

const CONTENT_ROOT = '/content/milestones'

const BRIEF_CONTENT = '# Milestone 1: Simple Key-Value Store\n\n## What You\'re Building\n\nA key-value store.'

const ACCEPTANCE_CRITERIA_YAML = `milestone: 01-kv-store

criteria:
  - name: put-and-get
    order: 1
    description: Put a key-value pair and retrieve it with Get.
    assertion:
      type: stdout-contains
      expected: "PASS: put-and-get"
      command_args: test
    error_hint: Check that Put stores the key-value pair.
  - name: exit-clean
    order: 2
    assertion:
      type: exit-code-equals
      expected: 0
      command_args: test
`

const BENCHMARK_CONFIG_YAML = `milestone: 01-kv-store

benchmarks:
  - name: sequential-inserts
    description: Sequential insertion of 1,000 key-value pairs.
    warmup_iterations: 2
    measured_iterations: 10
    workload:
      type: inserts
      num_operations: 1000
      key_size_bytes: 16
      value_size_bytes: 64
    target_metrics:
      ops_per_sec: 100
    reference_version: milestone-1-v1
`

const EMPTY_CRITERIA_YAML = `milestone: 02-storage-engine

criteria: []
`

const EMPTY_BENCHMARK_YAML = `milestone: 02-storage-engine

benchmarks: []
`

let mockRedis: ReturnType<typeof createMockRedis>
let loader: ContentLoader

function setupFs(files: Record<string, string>, dirs?: Record<string, string[]>): void {
  mockReadFile.mockImplementation(async (path: string) => {
    if (path in files) {
      return files[path]!
    }
    const err = new Error(`ENOENT: no such file or directory, open '${path}'`) as NodeJS.ErrnoException
    err.code = 'ENOENT'
    throw err
  })

  mockReaddir.mockImplementation(async (path: string) => {
    if (dirs && path in dirs) {
      return dirs[path]!
    }
    const err = new Error(`ENOENT: no such file or directory, scandir '${path}'`) as NodeJS.ErrnoException
    err.code = 'ENOENT'
    throw err
  })
}

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

describe('ContentLoader', () => {
  describe('loadMilestoneBrief', () => {
    it('should return raw markdown content from brief.md', async () => {
      setupFs(
        {
          [`${CONTENT_ROOT}/01-kv-store/brief.md`]: BRIEF_CONTENT,
          [`${CONTENT_ROOT}/01-kv-store/acceptance-criteria.yaml`]: ACCEPTANCE_CRITERIA_YAML,
          [`${CONTENT_ROOT}/01-kv-store/benchmark-config.yaml`]: BENCHMARK_CONFIG_YAML,
        },
        {
          [`${CONTENT_ROOT}/01-kv-store/assets`]: ['.gitkeep'],
          [`${CONTENT_ROOT}/01-kv-store/starter-code`]: ['.gitkeep'],
        }
      )

      const brief = await loader.loadMilestoneBrief('01-kv-store')
      expect(brief).toBe(BRIEF_CONTENT)
    })

    it('should return null when brief.md does not exist', async () => {
      setupFs({})

      const brief = await loader.loadMilestoneBrief('nonexistent')
      expect(brief).toBeNull()
    })
  })

  describe('loadAcceptanceCriteria', () => {
    it('should parse YAML and convert snake_case to camelCase', async () => {
      setupFs(
        {
          [`${CONTENT_ROOT}/01-kv-store/brief.md`]: BRIEF_CONTENT,
          [`${CONTENT_ROOT}/01-kv-store/acceptance-criteria.yaml`]: ACCEPTANCE_CRITERIA_YAML,
          [`${CONTENT_ROOT}/01-kv-store/benchmark-config.yaml`]: BENCHMARK_CONFIG_YAML,
        },
        {
          [`${CONTENT_ROOT}/01-kv-store/assets`]: ['.gitkeep'],
          [`${CONTENT_ROOT}/01-kv-store/starter-code`]: ['.gitkeep'],
        }
      )

      const criteria = await loader.loadAcceptanceCriteria('01-kv-store')
      expect(criteria).toHaveLength(2)
      expect(criteria[0]?.name).toBe('put-and-get')
      expect(criteria[0]?.order).toBe(1)
      expect(criteria[0]?.assertion.type).toBe('stdout-contains')
      expect(criteria[0]?.assertion.commandArgs).toBe('test')
      expect(criteria[0]?.errorHint).toBe('Check that Put stores the key-value pair.')
    })

    it('should return empty array when criteria is empty', async () => {
      setupFs(
        {
          [`${CONTENT_ROOT}/02-storage-engine/brief.md`]: '# Milestone 2',
          [`${CONTENT_ROOT}/02-storage-engine/acceptance-criteria.yaml`]: EMPTY_CRITERIA_YAML,
          [`${CONTENT_ROOT}/02-storage-engine/benchmark-config.yaml`]: EMPTY_BENCHMARK_YAML,
        },
        {
          [`${CONTENT_ROOT}/02-storage-engine/assets`]: [],
          [`${CONTENT_ROOT}/02-storage-engine/starter-code`]: ['.gitkeep'],
        }
      )

      const criteria = await loader.loadAcceptanceCriteria('02-storage-engine')
      expect(criteria).toEqual([])
    })

    it('should return empty array when file does not exist', async () => {
      setupFs({})

      const criteria = await loader.loadAcceptanceCriteria('nonexistent')
      expect(criteria).toEqual([])
    })
  })

  describe('loadBenchmarkConfig', () => {
    it('should parse YAML and convert snake_case to camelCase', async () => {
      setupFs(
        {
          [`${CONTENT_ROOT}/01-kv-store/brief.md`]: BRIEF_CONTENT,
          [`${CONTENT_ROOT}/01-kv-store/acceptance-criteria.yaml`]: ACCEPTANCE_CRITERIA_YAML,
          [`${CONTENT_ROOT}/01-kv-store/benchmark-config.yaml`]: BENCHMARK_CONFIG_YAML,
        },
        {
          [`${CONTENT_ROOT}/01-kv-store/assets`]: ['.gitkeep'],
          [`${CONTENT_ROOT}/01-kv-store/starter-code`]: ['.gitkeep'],
        }
      )

      const config = await loader.loadBenchmarkConfig('01-kv-store')
      expect(config).not.toBeNull()
      expect(config?.benchmarks).toHaveLength(1)

      const bench = config?.benchmarks[0]
      expect(bench?.name).toBe('sequential-inserts')
      expect(bench?.warmupIterations).toBe(2)
      expect(bench?.measuredIterations).toBe(10)
      expect(bench?.workload.numOperations).toBe(1000)
      expect(bench?.workload.keySizeBytes).toBe(16)
      expect(bench?.workload.valueSizeBytes).toBe(64)
      expect(bench?.targetMetrics.opsPerSec).toBe(100)
      expect(bench?.referenceVersion).toBe('milestone-1-v1')
    })

    it('should return null when benchmarks array is empty', async () => {
      setupFs(
        {
          [`${CONTENT_ROOT}/02-storage-engine/brief.md`]: '# Milestone 2',
          [`${CONTENT_ROOT}/02-storage-engine/acceptance-criteria.yaml`]: EMPTY_CRITERIA_YAML,
          [`${CONTENT_ROOT}/02-storage-engine/benchmark-config.yaml`]: EMPTY_BENCHMARK_YAML,
        },
        {
          [`${CONTENT_ROOT}/02-storage-engine/assets`]: [],
          [`${CONTENT_ROOT}/02-storage-engine/starter-code`]: ['.gitkeep'],
        }
      )

      const config = await loader.loadBenchmarkConfig('02-storage-engine')
      expect(config).toBeNull()
    })

    it('should return null when file does not exist', async () => {
      setupFs({})

      const config = await loader.loadBenchmarkConfig('nonexistent')
      expect(config).toBeNull()
    })
  })

  describe('listConceptExplainerAssets', () => {
    it('should return SVG files from assets directory with null altText and title when no manifest', async () => {
      setupFs(
        {
          [`${CONTENT_ROOT}/01-kv-store/brief.md`]: BRIEF_CONTENT,
          [`${CONTENT_ROOT}/01-kv-store/acceptance-criteria.yaml`]: ACCEPTANCE_CRITERIA_YAML,
          [`${CONTENT_ROOT}/01-kv-store/benchmark-config.yaml`]: BENCHMARK_CONFIG_YAML,
        },
        {
          [`${CONTENT_ROOT}/01-kv-store/assets`]: ['kv-store-flow.svg', 'binary-format.svg'],
          [`${CONTENT_ROOT}/01-kv-store/starter-code`]: ['.gitkeep'],
        }
      )

      const assets = await loader.listConceptExplainerAssets('01-kv-store')
      expect(assets).toHaveLength(2)
      expect(assets.map((a) => a.name).sort()).toEqual(['binary-format.svg', 'kv-store-flow.svg'])
      expect(assets[0]?.path).toMatch(/^\/assets\/milestones\/01-kv-store\//)
      expect(assets[0]?.altText).toBeNull()
      expect(assets[0]?.title).toBeNull()
    })

    it('should enrich SVG assets with altText and title from manifest.yaml', async () => {
      const manifestYaml = `- filename: kv-store-flow.svg
  altText: "Diagram showing KV store data flow"
  title: "KV Store Flow"
- filename: binary-format.svg
  altText: "Binary format diagram"
`
      setupFs(
        {
          [`${CONTENT_ROOT}/01-kv-store/brief.md`]: BRIEF_CONTENT,
          [`${CONTENT_ROOT}/01-kv-store/acceptance-criteria.yaml`]: ACCEPTANCE_CRITERIA_YAML,
          [`${CONTENT_ROOT}/01-kv-store/benchmark-config.yaml`]: BENCHMARK_CONFIG_YAML,
          [`${CONTENT_ROOT}/01-kv-store/assets/manifest.yaml`]: manifestYaml,
        },
        {
          [`${CONTENT_ROOT}/01-kv-store/assets`]: ['kv-store-flow.svg', 'binary-format.svg'],
          [`${CONTENT_ROOT}/01-kv-store/starter-code`]: ['.gitkeep'],
        }
      )

      const assets = await loader.listConceptExplainerAssets('01-kv-store')
      expect(assets).toHaveLength(2)

      const kvAsset = assets.find((a) => a.name === 'kv-store-flow.svg')
      expect(kvAsset?.altText).toBe('Diagram showing KV store data flow')
      expect(kvAsset?.title).toBe('KV Store Flow')

      const binAsset = assets.find((a) => a.name === 'binary-format.svg')
      expect(binAsset?.altText).toBe('Binary format diagram')
      expect(binAsset?.title).toBeNull()
    })

    it('should return null altText and title for SVGs without manifest entries', async () => {
      const manifestYaml = `- filename: kv-store-flow.svg
  altText: "Diagram showing KV store data flow"
  title: "KV Store Flow"
`
      setupFs(
        {
          [`${CONTENT_ROOT}/01-kv-store/brief.md`]: BRIEF_CONTENT,
          [`${CONTENT_ROOT}/01-kv-store/acceptance-criteria.yaml`]: ACCEPTANCE_CRITERIA_YAML,
          [`${CONTENT_ROOT}/01-kv-store/benchmark-config.yaml`]: BENCHMARK_CONFIG_YAML,
          [`${CONTENT_ROOT}/01-kv-store/assets/manifest.yaml`]: manifestYaml,
        },
        {
          [`${CONTENT_ROOT}/01-kv-store/assets`]: ['kv-store-flow.svg', 'other-diagram.svg'],
          [`${CONTENT_ROOT}/01-kv-store/starter-code`]: ['.gitkeep'],
        }
      )

      const assets = await loader.listConceptExplainerAssets('01-kv-store')
      const otherAsset = assets.find((a) => a.name === 'other-diagram.svg')
      expect(otherAsset?.altText).toBeNull()
      expect(otherAsset?.title).toBeNull()
    })

    it('should silently ignore manifest entries for nonexistent SVGs', async () => {
      const manifestYaml = `- filename: nonexistent.svg
  altText: "This SVG does not exist"
- filename: kv-store-flow.svg
  altText: "Real diagram"
`
      setupFs(
        {
          [`${CONTENT_ROOT}/01-kv-store/brief.md`]: BRIEF_CONTENT,
          [`${CONTENT_ROOT}/01-kv-store/acceptance-criteria.yaml`]: ACCEPTANCE_CRITERIA_YAML,
          [`${CONTENT_ROOT}/01-kv-store/benchmark-config.yaml`]: BENCHMARK_CONFIG_YAML,
          [`${CONTENT_ROOT}/01-kv-store/assets/manifest.yaml`]: manifestYaml,
        },
        {
          [`${CONTENT_ROOT}/01-kv-store/assets`]: ['kv-store-flow.svg'],
          [`${CONTENT_ROOT}/01-kv-store/starter-code`]: ['.gitkeep'],
        }
      )

      const assets = await loader.listConceptExplainerAssets('01-kv-store')
      expect(assets).toHaveLength(1)
      expect(assets[0]?.name).toBe('kv-store-flow.svg')
      expect(assets[0]?.altText).toBe('Real diagram')
    })

    it('should filter out non-SVG files', async () => {
      setupFs(
        {
          [`${CONTENT_ROOT}/01-kv-store/brief.md`]: BRIEF_CONTENT,
          [`${CONTENT_ROOT}/01-kv-store/acceptance-criteria.yaml`]: ACCEPTANCE_CRITERIA_YAML,
          [`${CONTENT_ROOT}/01-kv-store/benchmark-config.yaml`]: BENCHMARK_CONFIG_YAML,
        },
        {
          [`${CONTENT_ROOT}/01-kv-store/assets`]: ['.gitkeep', 'notes.txt'],
          [`${CONTENT_ROOT}/01-kv-store/starter-code`]: ['.gitkeep'],
        }
      )

      const assets = await loader.listConceptExplainerAssets('01-kv-store')
      expect(assets).toEqual([])
    })

    it('should return empty array when assets directory does not exist', async () => {
      setupFs({})

      const assets = await loader.listConceptExplainerAssets('nonexistent')
      expect(assets).toEqual([])
    })

    it('should log error when manifest parsing fails with non-ENOENT error', async () => {
      const mockLog = { error: vi.fn() }
      const loaderWithLog = createContentLoader({
        redis: mockRedis as unknown as Redis,
        contentRoot: CONTENT_ROOT,
        log: mockLog,
      })

      mockReadFile.mockImplementation(async (path: string) => {
        if (path === `${CONTENT_ROOT}/01-kv-store/assets/manifest.yaml`) {
          throw new Error('Permission denied')
        }
        if (path === `${CONTENT_ROOT}/01-kv-store/brief.md`) return BRIEF_CONTENT
        if (path === `${CONTENT_ROOT}/01-kv-store/acceptance-criteria.yaml`) return ACCEPTANCE_CRITERIA_YAML
        if (path === `${CONTENT_ROOT}/01-kv-store/benchmark-config.yaml`) return BENCHMARK_CONFIG_YAML
        const err = new Error('ENOENT') as NodeJS.ErrnoException
        err.code = 'ENOENT'
        throw err
      })
      mockReaddir.mockImplementation(async (path: string) => {
        if (path === `${CONTENT_ROOT}/01-kv-store/assets`) return ['diagram.svg']
        if (path === `${CONTENT_ROOT}/01-kv-store/starter-code`) return ['.gitkeep']
        const err = new Error('ENOENT') as NodeJS.ErrnoException
        err.code = 'ENOENT'
        throw err
      })

      const assets = await loaderWithLog.listConceptExplainerAssets('01-kv-store')
      expect(assets).toHaveLength(1)
      expect(assets[0]?.altText).toBeNull()
      expect(mockLog.error).toHaveBeenCalledWith(
        expect.objectContaining({ slug: '01-kv-store' }),
        'Failed to parse concept explainer manifest'
      )
    })
  })

  describe('getStarterCodePath', () => {
    it('should return path when starter-code has real files', async () => {
      setupFs(
        {
          [`${CONTENT_ROOT}/01-kv-store/brief.md`]: BRIEF_CONTENT,
          [`${CONTENT_ROOT}/01-kv-store/acceptance-criteria.yaml`]: ACCEPTANCE_CRITERIA_YAML,
          [`${CONTENT_ROOT}/01-kv-store/benchmark-config.yaml`]: BENCHMARK_CONFIG_YAML,
        },
        {
          [`${CONTENT_ROOT}/01-kv-store/assets`]: ['.gitkeep'],
          [`${CONTENT_ROOT}/01-kv-store/starter-code`]: ['main.go'],
        }
      )

      const path = await loader.getStarterCodePath('01-kv-store')
      expect(path).toBe('content/milestones/01-kv-store/starter-code/')
    })

    it('should return null when starter-code only has .gitkeep', async () => {
      setupFs(
        {
          [`${CONTENT_ROOT}/02-storage-engine/brief.md`]: '# Milestone 2',
          [`${CONTENT_ROOT}/02-storage-engine/acceptance-criteria.yaml`]: EMPTY_CRITERIA_YAML,
          [`${CONTENT_ROOT}/02-storage-engine/benchmark-config.yaml`]: EMPTY_BENCHMARK_YAML,
        },
        {
          [`${CONTENT_ROOT}/02-storage-engine/assets`]: [],
          [`${CONTENT_ROOT}/02-storage-engine/starter-code`]: ['.gitkeep'],
        }
      )

      const path = await loader.getStarterCodePath('02-storage-engine')
      expect(path).toBeNull()
    })

    it('should return null when starter-code directory does not exist', async () => {
      setupFs({})

      const path = await loader.getStarterCodePath('nonexistent')
      expect(path).toBeNull()
    })
  })

  describe('loadStarterCode', () => {
    it('should return file content when main.go exists with content', async () => {
      const starterCode = 'package main\n\nfunc main() {}\n'
      setupFs(
        {
          [`${CONTENT_ROOT}/01-kv-store/brief.md`]: BRIEF_CONTENT,
          [`${CONTENT_ROOT}/01-kv-store/acceptance-criteria.yaml`]: ACCEPTANCE_CRITERIA_YAML,
          [`${CONTENT_ROOT}/01-kv-store/benchmark-config.yaml`]: BENCHMARK_CONFIG_YAML,
          [`${CONTENT_ROOT}/01-kv-store/starter-code/main.go`]: starterCode,
        },
        {
          [`${CONTENT_ROOT}/01-kv-store/assets`]: ['.gitkeep'],
          [`${CONTENT_ROOT}/01-kv-store/starter-code`]: ['main.go'],
        }
      )

      const code = await loader.loadStarterCode('01-kv-store')
      expect(code).toBe(starterCode)
    })

    it('should return null when main.go does not exist', async () => {
      setupFs(
        {
          [`${CONTENT_ROOT}/02-storage-engine/brief.md`]: '# Milestone 2',
          [`${CONTENT_ROOT}/02-storage-engine/acceptance-criteria.yaml`]: EMPTY_CRITERIA_YAML,
          [`${CONTENT_ROOT}/02-storage-engine/benchmark-config.yaml`]: EMPTY_BENCHMARK_YAML,
        },
        {
          [`${CONTENT_ROOT}/02-storage-engine/assets`]: [],
          [`${CONTENT_ROOT}/02-storage-engine/starter-code`]: ['.gitkeep'],
        }
      )

      const code = await loader.loadStarterCode('02-storage-engine')
      expect(code).toBeNull()
    })

    it('should return null when starter-code directory only has .gitkeep', async () => {
      setupFs(
        {
          [`${CONTENT_ROOT}/03-wal/brief.md`]: '# Milestone 3',
          [`${CONTENT_ROOT}/03-wal/acceptance-criteria.yaml`]: EMPTY_CRITERIA_YAML,
          [`${CONTENT_ROOT}/03-wal/benchmark-config.yaml`]: EMPTY_BENCHMARK_YAML,
        },
        {
          [`${CONTENT_ROOT}/03-wal/assets`]: [],
          [`${CONTENT_ROOT}/03-wal/starter-code`]: ['.gitkeep'],
        }
      )

      const code = await loader.loadStarterCode('03-wal')
      expect(code).toBeNull()
    })

    it('should return null on read error', async () => {
      mockReadFile.mockRejectedValue(new Error('Permission denied'))
      mockReaddir.mockRejectedValue(new Error('Permission denied'))

      const code = await loader.loadStarterCode('01-kv-store')
      expect(code).toBeNull()
    })
  })

  describe('Redis caching', () => {
    it('should cache content on first load and return cached on second', async () => {
      setupFs(
        {
          [`${CONTENT_ROOT}/01-kv-store/brief.md`]: BRIEF_CONTENT,
          [`${CONTENT_ROOT}/01-kv-store/acceptance-criteria.yaml`]: ACCEPTANCE_CRITERIA_YAML,
          [`${CONTENT_ROOT}/01-kv-store/benchmark-config.yaml`]: BENCHMARK_CONFIG_YAML,
        },
        {
          [`${CONTENT_ROOT}/01-kv-store/assets`]: ['.gitkeep'],
          [`${CONTENT_ROOT}/01-kv-store/starter-code`]: ['.gitkeep'],
        }
      )

      const brief1 = await loader.loadMilestoneBrief('01-kv-store')
      expect(brief1).toBe(BRIEF_CONTENT)
      expect(mockRedis.set).toHaveBeenCalledOnce()
      expect(mockRedis.set).toHaveBeenCalledWith(
        'curriculum:milestone:01-kv-store',
        expect.any(String),
        'EX',
        3600
      )

      const brief2 = await loader.loadMilestoneBrief('01-kv-store')
      expect(brief2).toBe(BRIEF_CONTENT)
      expect(mockRedis.get).toHaveBeenCalledTimes(2)
    })

    it('should use cached data when available', async () => {
      const cachedData = JSON.stringify({
        brief: 'Cached brief',
        acceptanceCriteria: [],
        benchmarkConfig: null,
        conceptExplainerAssets: [],
        starterCodePath: null,
        starterCode: null,
      })

      mockRedis.get.mockResolvedValueOnce(cachedData)

      const brief = await loader.loadMilestoneBrief('01-kv-store')
      expect(brief).toBe('Cached brief')
      expect(mockRedis.set).not.toHaveBeenCalled()
    })
  })

  describe('invalidateCache', () => {
    it('should delete the cache key for a specific slug', async () => {
      setupFs(
        {
          [`${CONTENT_ROOT}/01-kv-store/brief.md`]: BRIEF_CONTENT,
          [`${CONTENT_ROOT}/01-kv-store/acceptance-criteria.yaml`]: ACCEPTANCE_CRITERIA_YAML,
          [`${CONTENT_ROOT}/01-kv-store/benchmark-config.yaml`]: BENCHMARK_CONFIG_YAML,
        },
        {
          [`${CONTENT_ROOT}/01-kv-store/assets`]: ['.gitkeep'],
          [`${CONTENT_ROOT}/01-kv-store/starter-code`]: ['.gitkeep'],
        }
      )

      await loader.loadMilestoneBrief('01-kv-store')
      expect(mockRedis.set).toHaveBeenCalledOnce()

      await loader.invalidateCache('01-kv-store')
      expect(mockRedis.del).toHaveBeenCalledWith('curriculum:milestone:01-kv-store')
    })
  })

  describe('invalidateAllCaches', () => {
    it('should delete all curriculum cache keys', async () => {
      setupFs(
        {
          [`${CONTENT_ROOT}/01-kv-store/brief.md`]: BRIEF_CONTENT,
          [`${CONTENT_ROOT}/01-kv-store/acceptance-criteria.yaml`]: ACCEPTANCE_CRITERIA_YAML,
          [`${CONTENT_ROOT}/01-kv-store/benchmark-config.yaml`]: BENCHMARK_CONFIG_YAML,
        },
        {
          [`${CONTENT_ROOT}/01-kv-store/assets`]: ['.gitkeep'],
          [`${CONTENT_ROOT}/01-kv-store/starter-code`]: ['.gitkeep'],
        }
      )

      await loader.loadMilestoneBrief('01-kv-store')

      await loader.invalidateAllCaches()
      expect(mockRedis.keys).toHaveBeenCalledWith('curriculum:milestone:*')
      expect(mockRedis.del).toHaveBeenCalled()
    })

    it('should not call del when no cache keys exist', async () => {
      await loader.invalidateAllCaches()
      expect(mockRedis.keys).toHaveBeenCalledWith('curriculum:milestone:*')
      expect(mockRedis.del).not.toHaveBeenCalled()
    })
  })

  describe('slug validation', () => {
    it('should return null/empty for slugs with path traversal characters', async () => {
      const brief = await loader.loadMilestoneBrief('../../etc/passwd')
      expect(brief).toBeNull()
      expect(mockRedis.get).not.toHaveBeenCalled()
    })
  })
})
