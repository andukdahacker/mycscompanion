import type { AcceptanceCriterion, CriterionResult } from '@mycscompanion/shared'
import type { BenchmarkRunResult } from '@mycscompanion/execution'
import type { ExecutionResult } from './execution-types.js'

function evaluateSingle(
  criterion: AcceptanceCriterion,
  executionResult: ExecutionResult,
  benchmarkResult?: BenchmarkRunResult | null,
): CriterionResult {
  const { assertion } = criterion
  let status: 'met' | 'not-met'
  let actual: string | number | null

  switch (assertion.type) {
    case 'stdout-contains': {
      const expectedStr = String(assertion.expected)
      const found = executionResult.output.includes(expectedStr)
      status = found ? 'met' : 'not-met'
      if (found) {
        actual = 'Found'
      } else {
        const excerpt = executionResult.output.slice(0, 200)
        actual = excerpt ? `Not found in output (first 200 chars): ${excerpt}` : 'Not found in output (empty)'
      }
      break
    }
    case 'stdout-regex': {
      try {
        const regex = new RegExp(String(assertion.expected))
        const matched = regex.test(executionResult.output)
        status = matched ? 'met' : 'not-met'
        actual = matched ? 'Matched' : 'No match'
      } catch {
        status = 'not-met'
        actual = 'Invalid regex pattern'
      }
      break
    }
    case 'exit-code-equals': {
      const expected = Number(assertion.expected)
      if (executionResult.exitCode === null) {
        status = 'not-met'
        actual = null
      } else {
        status = executionResult.exitCode === expected ? 'met' : 'not-met'
        actual = executionResult.exitCode
      }
      break
    }
    case 'output-line-count': {
      const expected = Number(assertion.expected)
      const lineCount = executionResult.output === ''
        ? 0
        : executionResult.output.split('\n').filter((l) => l.trim()).length
      status = lineCount === expected ? 'met' : 'not-met'
      actual = lineCount
      break
    }
    case 'benchmark-threshold': {
      const threshold = Number(assertion.expected)
      const userOpsPerSec = benchmarkResult?.opsPerSec ?? 0
      status = userOpsPerSec >= threshold ? 'met' : 'not-met'
      actual = userOpsPerSec > 0 ? `${userOpsPerSec} ops/sec` : 'No benchmark data'
      break
    }
  }

  return {
    name: criterion.name,
    order: criterion.order,
    status,
    expected: assertion.expected,
    actual,
    ...(status === 'not-met' && criterion.errorHint ? { errorHint: criterion.errorHint } : {}),
  }
}

function evaluateCriteria(
  criteria: ReadonlyArray<AcceptanceCriterion>,
  executionResult: ExecutionResult,
  benchmarkResult?: BenchmarkRunResult | null,
): ReadonlyArray<CriterionResult> {
  return criteria.map((c) => evaluateSingle(c, executionResult, benchmarkResult))
}

function evaluateAllNotMet(
  criteria: ReadonlyArray<AcceptanceCriterion>,
  reason: string,
): ReadonlyArray<CriterionResult> {
  return criteria.map((c) => ({
    name: c.name,
    order: c.order,
    status: 'not-met' as const,
    expected: c.assertion.expected,
    actual: reason,
    ...(c.errorHint ? { errorHint: c.errorHint } : {}),
  }))
}

export { evaluateCriteria, evaluateAllNotMet }
