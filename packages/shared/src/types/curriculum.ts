/**
 * Curriculum types for mycscompanion.
 * Derived from content/schema/acceptance-criteria.schema.json and
 * content/schema/benchmark-config.schema.json.
 */

// --- Acceptance Criteria ---

export type AssertionType =
  | 'stdout-contains'
  | 'stdout-regex'
  | 'exit-code-equals'
  | 'output-line-count'
  | 'benchmark-threshold'

export interface AcceptanceCriterionAssertion {
  readonly type: AssertionType
  readonly expected: string | number
  readonly commandArgs?: string
}

export interface AcceptanceCriterion {
  readonly name: string
  readonly order: number
  readonly description?: string
  readonly assertion: AcceptanceCriterionAssertion
  readonly errorHint?: string
}

// --- Criterion Result ---

export type CriterionResultStatus = 'met' | 'not-met'

export interface CriterionResult {
  readonly name: string
  readonly order: number
  readonly status: CriterionResultStatus
  readonly expected: string | number
  readonly actual: string | number | null
  readonly errorHint?: string
}

// --- Benchmark Config ---

export type BenchmarkWorkloadType = 'inserts' | 'lookups' | 'range-scans' | 'mixed'

export interface BenchmarkMixRatio {
  readonly inserts?: number
  readonly lookups?: number
  readonly deletes?: number
}

export interface BenchmarkWorkload {
  readonly type: BenchmarkWorkloadType
  readonly numOperations: number
  readonly keySizeBytes?: number
  readonly valueSizeBytes?: number
  readonly mixRatio?: BenchmarkMixRatio
}

export interface BenchmarkTargetMetrics {
  readonly opsPerSec: number
  readonly p50LatencyUs?: number
  readonly p99LatencyUs?: number
}

export interface Benchmark {
  readonly name: string
  readonly description: string
  readonly warmupIterations?: number
  readonly measuredIterations?: number
  readonly workload: BenchmarkWorkload
  readonly targetMetrics: BenchmarkTargetMetrics
  readonly referenceVersion?: string
}

export interface BenchmarkConfig {
  readonly benchmarks: readonly Benchmark[]
}

// --- Concept Explainer Asset ---

export interface ConceptExplainerAsset {
  readonly name: string
  readonly path: string
  readonly altText: string | null
}

// --- API Response Types ---

export interface MilestoneContent {
  readonly milestoneId: string
  readonly trackId: string
  readonly slug: string
  readonly title: string
  readonly position: number
  readonly brief: string | null
  readonly acceptanceCriteria: readonly AcceptanceCriterion[]
  readonly benchmarkConfig: BenchmarkConfig | null
  readonly conceptExplainerAssets: readonly ConceptExplainerAsset[]
  readonly starterCode: string | null
}

export interface MilestoneSummary {
  readonly id: string
  readonly slug: string
  readonly title: string
  readonly position: number
}

export interface TrackSummary {
  readonly id: string
  readonly name: string
  readonly slug: string
  readonly description: string | null
  readonly milestones: readonly MilestoneSummary[]
}
