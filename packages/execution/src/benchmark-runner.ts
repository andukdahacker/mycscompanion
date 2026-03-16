/**
 * Benchmark runner — parses structured JSON output from Go benchmark harness
 * and computes normalized performance ratios.
 *
 * Lives in packages/execution per ARCH-9.
 */

export interface BenchmarkRunResult {
  readonly benchmarkName: string
  readonly userMedian: number
  readonly referenceMedian: number
  readonly normalizedRatio: number
  readonly rawUserTimings: readonly number[]
  readonly rawReferenceTimings: readonly number[]
  readonly opsPerSec: number
  readonly p50LatencyUs: number | null
  readonly p99LatencyUs: number | null
}

export type BenchmarkErrorType =
  | 'timeout'
  | 'output_parse_error'
  | 'reference_missing'
  | 'compilation_error'
  | 'unknown'

interface BenchmarkIterationLine {
  readonly type: 'benchmark_iteration'
  readonly target: 'user' | 'reference'
  readonly iteration: number
  readonly total: number
  readonly ops_per_sec: number
  readonly p50_latency_us: number
  readonly p99_latency_us: number
}

interface BenchmarkCompleteLine {
  readonly type: 'benchmark_complete'
  readonly user_median_ops: number
  readonly reference_median_ops: number
  readonly normalized_ratio: number
  readonly user_p50_us: number
  readonly user_p99_us: number
  readonly ref_p50_us: number
  readonly ref_p99_us: number
}

type BenchmarkLine = BenchmarkIterationLine | BenchmarkCompleteLine

/** Sorts a copy of the array and returns the median value. */
export function computeMedian(values: readonly number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 0) {
    // mid and mid-1 are always valid indices when length >= 2 and even
    return ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2
  }
  return sorted[mid] ?? 0
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function tryParseIteration(obj: Record<string, unknown>): BenchmarkIterationLine | null {
  if (
    obj.type !== 'benchmark_iteration' ||
    (obj.target !== 'user' && obj.target !== 'reference') ||
    typeof obj.iteration !== 'number' ||
    typeof obj.total !== 'number' ||
    typeof obj.ops_per_sec !== 'number' ||
    typeof obj.p50_latency_us !== 'number' ||
    typeof obj.p99_latency_us !== 'number'
  ) return null
  return {
    type: 'benchmark_iteration',
    target: obj.target,
    iteration: obj.iteration,
    total: obj.total,
    ops_per_sec: obj.ops_per_sec,
    p50_latency_us: obj.p50_latency_us,
    p99_latency_us: obj.p99_latency_us,
  }
}

function tryParseComplete(obj: Record<string, unknown>): BenchmarkCompleteLine | null {
  if (
    obj.type !== 'benchmark_complete' ||
    typeof obj.user_median_ops !== 'number' ||
    typeof obj.reference_median_ops !== 'number' ||
    typeof obj.normalized_ratio !== 'number' ||
    typeof obj.user_p50_us !== 'number' ||
    typeof obj.user_p99_us !== 'number' ||
    typeof obj.ref_p50_us !== 'number' ||
    typeof obj.ref_p99_us !== 'number'
  ) return null
  return {
    type: 'benchmark_complete',
    user_median_ops: obj.user_median_ops,
    reference_median_ops: obj.reference_median_ops,
    normalized_ratio: obj.normalized_ratio,
    user_p50_us: obj.user_p50_us,
    user_p99_us: obj.user_p99_us,
    ref_p50_us: obj.ref_p50_us,
    ref_p99_us: obj.ref_p99_us,
  }
}

function tryParseLine(line: string): BenchmarkLine | null {
  try {
    const parsed: unknown = JSON.parse(line.trim())
    if (!isRecord(parsed) || !('type' in parsed)) return null
    return tryParseIteration(parsed) ?? tryParseComplete(parsed)
  } catch {
    return null
  }
}

/**
 * Parses the complete structured JSON output from the Go benchmark harness.
 * Does NOT execute anything — the execution processor runs the Go process
 * and passes stdout here for parsing.
 */
export function parseBenchmarkOutput(
  stdout: string,
  benchmarkName: string,
): BenchmarkRunResult {
  const lines = stdout.split('\n').filter(Boolean)
  const userTimings: number[] = []
  const referenceTimings: number[] = []
  let completeLine: BenchmarkCompleteLine | null = null
  let lastUserP50: number | null = null
  let lastUserP99: number | null = null

  for (const line of lines) {
    const parsed = tryParseLine(line)
    if (!parsed) continue

    if (parsed.type === 'benchmark_iteration') {
      if (parsed.target === 'user') {
        userTimings.push(parsed.ops_per_sec)
        lastUserP50 = parsed.p50_latency_us
        lastUserP99 = parsed.p99_latency_us
      } else {
        referenceTimings.push(parsed.ops_per_sec)
      }
    } else if (parsed.type === 'benchmark_complete') {
      completeLine = parsed
    }
  }

  if (completeLine) {
    return {
      benchmarkName,
      userMedian: completeLine.user_median_ops,
      referenceMedian: completeLine.reference_median_ops,
      normalizedRatio: completeLine.normalized_ratio,
      rawUserTimings: userTimings,
      rawReferenceTimings: referenceTimings,
      opsPerSec: completeLine.user_median_ops,
      p50LatencyUs: completeLine.user_p50_us,
      p99LatencyUs: completeLine.user_p99_us,
    }
  }

  // Fallback: compute from iteration data
  const userMedian = computeMedian(userTimings)
  const referenceMedian = computeMedian(referenceTimings)
  const normalizedRatio = referenceMedian > 0 ? userMedian / referenceMedian : 0

  return {
    benchmarkName,
    userMedian,
    referenceMedian,
    normalizedRatio,
    rawUserTimings: userTimings,
    rawReferenceTimings: referenceTimings,
    opsPerSec: userMedian,
    p50LatencyUs: lastUserP50,
    p99LatencyUs: lastUserP99,
  }
}

/** Categorizes benchmark failures by inspecting the error. */
export function classifyBenchmarkError(error: unknown): BenchmarkErrorType {
  if (error instanceof Error) {
    const msg = error.message.toLowerCase()
    if (msg.includes('timeout') || msg.includes('timed out')) return 'timeout'
    if (msg.includes('parse') || msg.includes('json') || msg.includes('unexpected token')) return 'output_parse_error'
    if (msg.includes('reference') || msg.includes('not found') || msg.includes('enoent')) return 'reference_missing'
    if (msg.includes('compil') || msg.includes('build failed')) return 'compilation_error'
  }
  return 'unknown'
}
