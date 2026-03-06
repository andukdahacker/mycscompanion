import { readFile, readdir } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import yaml from 'js-yaml'
import type { Redis } from 'ioredis'
import { toCamelCase } from '@mycscompanion/shared'
import type {
  AcceptanceCriterion,
  BenchmarkConfig,
  ConceptExplainerAsset,
} from '@mycscompanion/shared'

const CONTENT_ROOT = resolve(process.cwd(), '..', '..', 'content', 'milestones')
const VALID_SLUG = /^[\w-]+$/

export interface ContentLoaderLogger {
  error(obj: Record<string, unknown>, msg: string): void
}

export interface ContentLoaderOptions {
  readonly redis: Redis
  readonly contentRoot?: string
  readonly log?: ContentLoaderLogger
}

export interface ContentLoader {
  loadMilestoneBrief(slug: string): Promise<string | null>
  loadAcceptanceCriteria(slug: string): Promise<readonly AcceptanceCriterion[]>
  loadBenchmarkConfig(slug: string): Promise<BenchmarkConfig | null>
  listConceptExplainerAssets(slug: string): Promise<readonly ConceptExplainerAsset[]>
  getStarterCodePath(slug: string): Promise<string | null>
  loadStarterCode(slug: string): Promise<string | null>
  invalidateCache(slug: string): Promise<void>
  invalidateAllCaches(): Promise<void>
}

export function createContentLoader(opts: ContentLoaderOptions): ContentLoader {
  const { redis, log } = opts
  const contentRoot = opts.contentRoot ?? CONTENT_ROOT

  function milestoneDir(slug: string): string {
    return join(contentRoot, slug)
  }

  function cacheKey(slug: string): string {
    return `curriculum:milestone:${slug}`
  }

  interface CachedMilestoneContent {
    brief: string | null
    acceptanceCriteria: readonly AcceptanceCriterion[]
    benchmarkConfig: BenchmarkConfig | null
    conceptExplainerAssets: readonly ConceptExplainerAsset[]
    starterCodePath: string | null
    starterCode: string | null
  }

  const emptyCachedContent: CachedMilestoneContent = {
    brief: null,
    acceptanceCriteria: [],
    benchmarkConfig: null,
    conceptExplainerAssets: [],
    starterCodePath: null,
    starterCode: null,
  }

  async function loadAndCache(slug: string): Promise<CachedMilestoneContent> {
    if (!VALID_SLUG.test(slug)) {
      return emptyCachedContent
    }

    const cached = await redis.get(cacheKey(slug))
    if (cached) {
      return JSON.parse(cached) as CachedMilestoneContent
    }

    const [brief, acceptanceCriteria, benchmarkConfig, conceptExplainerAssets, starterCodePath, starterCode] =
      await Promise.all([
        readBrief(slug),
        readAcceptanceCriteria(slug),
        readBenchmarkConfig(slug),
        readConceptExplainerAssets(slug),
        readStarterCodePath(slug),
        readStarterCode(slug),
      ])

    const content: CachedMilestoneContent = {
      brief,
      acceptanceCriteria,
      benchmarkConfig,
      conceptExplainerAssets,
      starterCodePath,
      starterCode,
    }

    await redis.set(cacheKey(slug), JSON.stringify(content), 'EX', 3600)

    return content
  }

  async function readBrief(slug: string): Promise<string | null> {
    try {
      return await readFile(join(milestoneDir(slug), 'brief.md'), 'utf-8')
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
        log?.error({ slug, error: String(err) }, 'Failed to read milestone brief')
      }
      return null
    }
  }

  async function readAcceptanceCriteria(slug: string): Promise<readonly AcceptanceCriterion[]> {
    try {
      const raw = await readFile(join(milestoneDir(slug), 'acceptance-criteria.yaml'), 'utf-8')
      const parsed = yaml.load(raw) as { criteria?: unknown[] }
      if (!parsed?.criteria || !Array.isArray(parsed.criteria)) {
        return []
      }
      return toCamelCase(parsed.criteria) as unknown as AcceptanceCriterion[]
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
        log?.error({ slug, error: String(err) }, 'Failed to parse acceptance criteria')
      }
      return []
    }
  }

  async function readBenchmarkConfig(slug: string): Promise<BenchmarkConfig | null> {
    try {
      const raw = await readFile(join(milestoneDir(slug), 'benchmark-config.yaml'), 'utf-8')
      const parsed = yaml.load(raw) as { benchmarks?: unknown[] }
      if (!parsed?.benchmarks || !Array.isArray(parsed.benchmarks) || parsed.benchmarks.length === 0) {
        return null
      }
      return toCamelCase({ benchmarks: parsed.benchmarks }) as unknown as BenchmarkConfig
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
        log?.error({ slug, error: String(err) }, 'Failed to parse benchmark config')
      }
      return null
    }
  }

  interface ManifestEntry {
    readonly filename: string
    readonly altText?: string
    readonly title?: string
  }

  async function readManifest(slug: string): Promise<readonly ManifestEntry[]> {
    try {
      const raw = await readFile(join(milestoneDir(slug), 'assets', 'manifest.yaml'), 'utf-8')
      const parsed = yaml.load(raw)
      if (!Array.isArray(parsed)) {
        return []
      }
      return parsed as ManifestEntry[]
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
        log?.error({ slug, error: String(err) }, 'Failed to parse concept explainer manifest')
      }
      return []
    }
  }

  async function readConceptExplainerAssets(slug: string): Promise<readonly ConceptExplainerAsset[]> {
    try {
      const assetsDir = join(milestoneDir(slug), 'assets')
      const files = await readdir(assetsDir)
      const svgFiles = files.filter((f) => f.endsWith('.svg'))
      if (svgFiles.length === 0) {
        return []
      }

      const manifest = await readManifest(slug)
      const manifestMap = new Map(manifest.map((entry) => [entry.filename, entry]))

      return svgFiles.map((name) => {
        const entry = manifestMap.get(name)
        return {
          name,
          path: `/assets/milestones/${slug}/${name}`,
          altText: entry?.altText ?? null,
          title: entry?.title ?? null,
        }
      })
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
        log?.error({ slug, error: String(err) }, 'Failed to read concept explainer assets')
      }
      return []
    }
  }

  async function readStarterCodePath(slug: string): Promise<string | null> {
    try {
      const starterDir = join(milestoneDir(slug), 'starter-code')
      const files = await readdir(starterDir)
      const hasContent = files.some((f) => f !== '.gitkeep')
      return hasContent ? `content/milestones/${slug}/starter-code/` : null
    } catch {
      return null
    }
  }

  async function readStarterCode(slug: string): Promise<string | null> {
    try {
      const content = await readFile(join(milestoneDir(slug), 'starter-code', 'main.go'), 'utf-8')
      return content
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
        log?.error({ slug, error: String(err) }, 'Failed to read starter code')
      }
      return null
    }
  }

  return {
    async loadMilestoneBrief(slug: string): Promise<string | null> {
      const content = await loadAndCache(slug)
      return content.brief
    },

    async loadAcceptanceCriteria(slug: string): Promise<readonly AcceptanceCriterion[]> {
      const content = await loadAndCache(slug)
      return content.acceptanceCriteria
    },

    async loadBenchmarkConfig(slug: string): Promise<BenchmarkConfig | null> {
      const content = await loadAndCache(slug)
      return content.benchmarkConfig
    },

    async listConceptExplainerAssets(slug: string): Promise<readonly ConceptExplainerAsset[]> {
      const content = await loadAndCache(slug)
      return content.conceptExplainerAssets
    },

    async getStarterCodePath(slug: string): Promise<string | null> {
      const content = await loadAndCache(slug)
      return content.starterCodePath
    },

    async loadStarterCode(slug: string): Promise<string | null> {
      const content = await loadAndCache(slug)
      return content.starterCode
    },

    async invalidateCache(slug: string): Promise<void> {
      await redis.del(cacheKey(slug))
    },

    async invalidateAllCaches(): Promise<void> {
      const keys = await redis.keys('curriculum:milestone:*')
      if (keys.length > 0) {
        await redis.del(...keys)
      }
    },
  }
}
