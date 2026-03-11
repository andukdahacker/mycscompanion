import { describe, it, expect, afterEach, vi } from 'vitest'
import { computeMedian, parseBenchmarkOutput, classifyBenchmarkError } from './benchmark-runner.js'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('computeMedian', () => {
  it('should return middle value for odd-length array', () => {
    expect(computeMedian([3, 1, 2])).toBe(2)
  })

  it('should return average of two middle values for even-length array', () => {
    expect(computeMedian([1, 2, 3, 4])).toBe(2.5)
  })

  it('should return the value for single-element array', () => {
    expect(computeMedian([42])).toBe(42)
  })

  it('should handle unsorted input', () => {
    expect(computeMedian([9, 1, 5, 3, 7])).toBe(5)
  })

  it('should return 0 for empty array', () => {
    expect(computeMedian([])).toBe(0)
  })

  it('should handle already-sorted input', () => {
    expect(computeMedian([1, 2, 3, 4, 5])).toBe(3)
  })
})

describe('parseBenchmarkOutput', () => {
  const validIterationLines = [
    '{"type":"benchmark_iteration","target":"user","iteration":1,"total":12,"ops_per_sec":8500,"p50_latency_us":117,"p99_latency_us":450}',
    '{"type":"benchmark_iteration","target":"reference","iteration":1,"total":12,"ops_per_sec":10200,"p50_latency_us":98,"p99_latency_us":380}',
    '{"type":"benchmark_iteration","target":"user","iteration":2,"total":12,"ops_per_sec":8700,"p50_latency_us":115,"p99_latency_us":440}',
    '{"type":"benchmark_iteration","target":"reference","iteration":2,"total":12,"ops_per_sec":10100,"p50_latency_us":99,"p99_latency_us":385}',
  ]

  const completeLine = '{"type":"benchmark_complete","user_median_ops":8200,"reference_median_ops":10100,"normalized_ratio":0.8119,"user_p50_us":120,"user_p99_us":445,"ref_p50_us":100,"ref_p99_us":385}'

  it('should parse valid structured JSON with iteration + complete lines', () => {
    const stdout = [...validIterationLines, completeLine].join('\n')

    const result = parseBenchmarkOutput(stdout, 'sequential-inserts')

    expect(result.benchmarkName).toBe('sequential-inserts')
    expect(result.userMedian).toBe(8200)
    expect(result.referenceMedian).toBe(10100)
    expect(result.normalizedRatio).toBeCloseTo(0.8119, 4)
    expect(result.opsPerSec).toBe(8200)
    expect(result.p50LatencyUs).toBe(120)
    expect(result.p99LatencyUs).toBe(445)
    expect(result.rawUserTimings).toEqual([8500, 8700])
    expect(result.rawReferenceTimings).toEqual([10200, 10100])
  })

  it('should handle malformed lines gracefully (skip bad, parse valid)', () => {
    const stdout = [
      'some garbage line',
      '{"invalid json',
      validIterationLines[0],
      '{"type":"unknown_type","data":123}',
      validIterationLines[1],
      completeLine,
    ].join('\n')

    const result = parseBenchmarkOutput(stdout, 'test-bench')

    expect(result.userMedian).toBe(8200)
    expect(result.referenceMedian).toBe(10100)
    expect(result.rawUserTimings).toHaveLength(1)
    expect(result.rawReferenceTimings).toHaveLength(1)
  })

  it('should compute medians from iteration data when benchmark_complete line is missing', () => {
    const stdout = validIterationLines.join('\n')

    const result = parseBenchmarkOutput(stdout, 'test-bench')

    // User timings: [8500, 8700] → median = 8600
    expect(result.userMedian).toBe(8600)
    // Reference timings: [10200, 10100] → median = 10150
    expect(result.referenceMedian).toBe(10150)
    expect(result.normalizedRatio).toBeCloseTo(8600 / 10150, 4)
    expect(result.opsPerSec).toBe(8600)
    // p50/p99 from last user iteration
    expect(result.p50LatencyUs).toBe(115)
    expect(result.p99LatencyUs).toBe(440)
  })

  it('should calculate normalized ratio correctly (user 8000, reference 10000 → 0.80)', () => {
    const stdout = [
      '{"type":"benchmark_complete","user_median_ops":8000,"reference_median_ops":10000,"normalized_ratio":0.8000,"user_p50_us":125,"user_p99_us":500,"ref_p50_us":100,"ref_p99_us":400}',
    ].join('\n')

    const result = parseBenchmarkOutput(stdout, 'test-bench')

    expect(result.normalizedRatio).toBeCloseTo(0.8, 4)
    expect(result.opsPerSec).toBe(8000)
  })

  it('should produce ratio ~1.0 with identical user and reference timings', () => {
    const stdout = [
      '{"type":"benchmark_iteration","target":"user","iteration":1,"total":2,"ops_per_sec":10000,"p50_latency_us":100,"p99_latency_us":400}',
      '{"type":"benchmark_iteration","target":"reference","iteration":1,"total":2,"ops_per_sec":10000,"p50_latency_us":100,"p99_latency_us":400}',
      '{"type":"benchmark_complete","user_median_ops":10000,"reference_median_ops":10000,"normalized_ratio":1.0000,"user_p50_us":100,"user_p99_us":400,"ref_p50_us":100,"ref_p99_us":400}',
    ].join('\n')

    const result = parseBenchmarkOutput(stdout, 'test-bench')

    expect(result.normalizedRatio).toBeCloseTo(1.0, 4)
  })

  it('should handle empty stdout', () => {
    const result = parseBenchmarkOutput('', 'test-bench')

    expect(result.userMedian).toBe(0)
    expect(result.referenceMedian).toBe(0)
    expect(result.normalizedRatio).toBe(0)
    expect(result.rawUserTimings).toHaveLength(0)
    expect(result.rawReferenceTimings).toHaveLength(0)
  })
})

describe('classifyBenchmarkError', () => {
  it('should classify timeout errors', () => {
    expect(classifyBenchmarkError(new Error('Operation timed out'))).toBe('timeout')
    expect(classifyBenchmarkError(new Error('Request timeout'))).toBe('timeout')
  })

  it('should classify parse errors', () => {
    expect(classifyBenchmarkError(new Error('Failed to parse JSON output'))).toBe('output_parse_error')
    expect(classifyBenchmarkError(new Error('Unexpected token in JSON'))).toBe('output_parse_error')
  })

  it('should classify reference missing errors', () => {
    expect(classifyBenchmarkError(new Error('Reference implementation not found'))).toBe('reference_missing')
    expect(classifyBenchmarkError(new Error('ENOENT: no such file'))).toBe('reference_missing')
  })

  it('should classify compilation errors', () => {
    expect(classifyBenchmarkError(new Error('Compilation failed'))).toBe('compilation_error')
    expect(classifyBenchmarkError(new Error('Build failed with errors'))).toBe('compilation_error')
  })

  it('should return unknown for unrecognized errors', () => {
    expect(classifyBenchmarkError(new Error('Something went wrong'))).toBe('unknown')
    expect(classifyBenchmarkError('string error')).toBe('unknown')
    expect(classifyBenchmarkError(null)).toBe('unknown')
  })
})
