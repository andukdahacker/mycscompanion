import { describe, it, expect } from 'vitest'
import type {
  AssertionType,
  AcceptanceCriterion,
  AcceptanceCriterionAssertion,
  CriterionResultStatus,
  CriterionResult,
  BenchmarkWorkload,
  BenchmarkWorkloadType,
  BenchmarkTargetMetrics,
  BenchmarkMixRatio,
  Benchmark,
  BenchmarkConfig,
  ConceptExplainerAsset,
  MilestoneContent,
  MilestoneSummary,
  TrackSummary,
} from './curriculum.js'

describe('Curriculum types', () => {
  it('should compile AssertionType as union of valid assertion types', () => {
    const types: AssertionType[] = [
      'stdout-contains',
      'stdout-regex',
      'exit-code-equals',
      'output-line-count',
      'benchmark-threshold',
    ]
    expect(types).toHaveLength(5)
  })

  it('should compile AcceptanceCriterion with required and optional fields', () => {
    const criterion: AcceptanceCriterion = {
      name: 'put-and-get',
      order: 1,
      description: 'Put a key-value pair and retrieve it.',
      assertion: { type: 'stdout-contains', expected: 'PASS: put-and-get', commandArgs: 'test' },
      errorHint: 'Check that Put stores the key.',
    }
    expect(criterion.name).toBe('put-and-get')
  })

  it('should compile AcceptanceCriterion without optional fields', () => {
    const criterion: AcceptanceCriterion = {
      name: 'exit-clean',
      order: 8,
      assertion: { type: 'exit-code-equals', expected: 0 },
    }
    expect(criterion.assertion.expected).toBe(0)
  })

  it('should compile AcceptanceCriterionAssertion with string or number expected', () => {
    const strAssertion: AcceptanceCriterionAssertion = {
      type: 'stdout-contains',
      expected: 'PASS',
    }
    const numAssertion: AcceptanceCriterionAssertion = {
      type: 'exit-code-equals',
      expected: 0,
    }
    expect(typeof strAssertion.expected).toBe('string')
    expect(typeof numAssertion.expected).toBe('number')
  })

  it('should compile CriterionResultStatus as met or not-met', () => {
    const statuses: CriterionResultStatus[] = ['met', 'not-met']
    expect(statuses).toHaveLength(2)
  })

  it('should compile CriterionResult with all fields', () => {
    const result: CriterionResult = {
      name: 'put-and-get',
      order: 1,
      status: 'met',
      expected: 'PASS: put-and-get',
      actual: 'Found',
      errorHint: 'Check that Put stores the key.',
    }
    expect(result.status).toBe('met')
  })

  it('should compile CriterionResult with null actual', () => {
    const result: CriterionResult = {
      name: 'exit-clean',
      order: 8,
      status: 'not-met',
      expected: 0,
      actual: null,
    }
    expect(result.actual).toBeNull()
  })

  it('should compile CriterionResult without optional errorHint', () => {
    const result: CriterionResult = {
      name: 'test-criterion',
      order: 2,
      status: 'met',
      expected: 'PASS',
      actual: 'Found',
    }
    expect(result.errorHint).toBeUndefined()
  })

  it('should compile BenchmarkWorkload with all workload types', () => {
    const types: BenchmarkWorkloadType[] = ['inserts', 'lookups', 'range-scans', 'mixed']
    expect(types).toHaveLength(4)
  })

  it('should compile BenchmarkWorkload with optional fields', () => {
    const workload: BenchmarkWorkload = {
      type: 'inserts',
      numOperations: 1000,
      keySizeBytes: 16,
      valueSizeBytes: 64,
    }
    expect(workload.numOperations).toBe(1000)
  })

  it('should compile BenchmarkWorkload with mixRatio for mixed type', () => {
    const mixRatio: BenchmarkMixRatio = { inserts: 0.5, lookups: 0.3, deletes: 0.2 }
    const workload: BenchmarkWorkload = {
      type: 'mixed',
      numOperations: 500,
      mixRatio,
    }
    expect(workload.mixRatio?.inserts).toBe(0.5)
  })

  it('should compile BenchmarkTargetMetrics with optional latency fields', () => {
    const metrics: BenchmarkTargetMetrics = {
      opsPerSec: 100,
      p50LatencyUs: 500,
      p99LatencyUs: 2000,
    }
    expect(metrics.opsPerSec).toBe(100)
  })

  it('should compile Benchmark with all fields', () => {
    const benchmark: Benchmark = {
      name: 'sequential-inserts',
      description: 'Sequential insertion test',
      warmupIterations: 2,
      measuredIterations: 10,
      workload: { type: 'inserts', numOperations: 1000 },
      targetMetrics: { opsPerSec: 100 },
      referenceVersion: 'milestone-1-v1',
    }
    expect(benchmark.name).toBe('sequential-inserts')
  })

  it('should compile BenchmarkConfig with benchmarks array', () => {
    const config: BenchmarkConfig = {
      benchmarks: [
        {
          name: 'test',
          description: 'test benchmark',
          workload: { type: 'inserts', numOperations: 100 },
          targetMetrics: { opsPerSec: 50 },
        },
      ],
    }
    expect(config.benchmarks).toHaveLength(1)
  })

  it('should compile ConceptExplainerAsset with all fields', () => {
    const asset: ConceptExplainerAsset = {
      name: 'kv-store-flow.svg',
      path: '/assets/milestones/01-kv-store/kv-store-flow.svg',
      altText: 'KV store data flow',
      title: 'Key-Value Store Operations',
    }
    expect(asset.name).toBe('kv-store-flow.svg')
    expect(asset.title).toBe('Key-Value Store Operations')
  })

  it('should compile ConceptExplainerAsset with null title and altText', () => {
    const asset: ConceptExplainerAsset = {
      name: 'diagram.svg',
      path: '/assets/milestones/01-kv-store/diagram.svg',
      altText: null,
      title: null,
    }
    expect(asset.altText).toBeNull()
    expect(asset.title).toBeNull()
  })

  it('should compile MilestoneContent with all fields', () => {
    const content: MilestoneContent = {
      milestoneId: 'abc123',
      trackId: 'track123',
      slug: '01-kv-store',
      title: 'Simple Key-Value Store',
      position: 1,
      brief: '# Milestone 1',
      acceptanceCriteria: [
        { name: 'test', order: 1, assertion: { type: 'stdout-contains', expected: 'PASS' } },
      ],
      benchmarkConfig: {
        benchmarks: [
          {
            name: 'bench',
            description: 'test',
            workload: { type: 'inserts', numOperations: 100 },
            targetMetrics: { opsPerSec: 50 },
          },
        ],
      },
      conceptExplainerAssets: [],
      starterCode: 'content/milestones/01-kv-store/starter-code/',
      csConceptLabel: 'Systems Programming & I/O',
    }
    expect(content.slug).toBe('01-kv-store')
  })

  it('should compile MilestoneContent with null optional fields', () => {
    const content: MilestoneContent = {
      milestoneId: 'abc123',
      trackId: 'track123',
      slug: '02-storage-engine',
      title: 'Storage Engine',
      position: 2,
      brief: '# Milestone 2',
      acceptanceCriteria: [],
      benchmarkConfig: null,
      conceptExplainerAssets: [],
      starterCode: null,
      csConceptLabel: null,
    }
    expect(content.benchmarkConfig).toBeNull()
    expect(content.starterCode).toBeNull()
  })

  it('should compile MilestoneSummary', () => {
    const summary: MilestoneSummary = {
      id: 'abc123',
      slug: '01-kv-store',
      title: 'Simple Key-Value Store',
      position: 1,
    }
    expect(summary.position).toBe(1)
  })

  it('should compile TrackSummary with milestones', () => {
    const track: TrackSummary = {
      id: 'track123',
      name: 'Build Your Own Database',
      slug: 'build-your-own-database',
      description: 'Learn CS by building a database.',
      milestones: [
        { id: 'ms1', slug: '01-kv-store', title: 'Simple Key-Value Store', position: 1 },
      ],
    }
    expect(track.milestones).toHaveLength(1)
  })

  it('should compile TrackSummary with null description', () => {
    const track: TrackSummary = {
      id: 'track123',
      name: 'Test Track',
      slug: 'test',
      description: null,
      milestones: [],
    }
    expect(track.description).toBeNull()
  })
})
