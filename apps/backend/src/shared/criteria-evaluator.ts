import type { AcceptanceCriterion, CriterionResult } from '@mycscompanion/shared'
import type { ExecutionResult } from './execution-types.js'

function evaluateSingle(
  criterion: AcceptanceCriterion,
  executionResult: ExecutionResult,
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
      // TODO(epic-7): Implement benchmark threshold evaluation — extract numeric value from output via regex
      status = 'not-met'
      actual = 'Benchmark evaluation not yet supported'
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
): ReadonlyArray<CriterionResult> {
  return criteria.map((c) => evaluateSingle(c, executionResult))
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
