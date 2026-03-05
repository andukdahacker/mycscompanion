import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AcceptanceCriterion } from '@mycscompanion/shared'
import type { ExecutionResult } from './execution-types.js'
import { evaluateCriteria, evaluateAllNotMet } from './criteria-evaluator.js'

afterEach(() => {
  vi.restoreAllMocks()
})

function makeExecutionResult(overrides: Partial<ExecutionResult> = {}): ExecutionResult {
  return {
    exitCode: 0,
    output: '',
    machineId: 'machine-1',
    durationMs: 1000,
    compilationSucceeded: true,
    ...overrides,
  }
}

function makeCriterion(overrides: Partial<AcceptanceCriterion> & Pick<AcceptanceCriterion, 'assertion'>): AcceptanceCriterion {
  return {
    name: 'test-criterion',
    order: 1,
    ...overrides,
  }
}

describe('evaluateCriteria', () => {
  describe('stdout-contains', () => {
    it('should return met when output contains expected string', () => {
      const criteria: ReadonlyArray<AcceptanceCriterion> = [
        makeCriterion({
          name: 'put-and-get',
          order: 1,
          assertion: { type: 'stdout-contains', expected: 'PASS: put-and-get' },
        }),
      ]
      const result = makeExecutionResult({ output: 'Running tests...\nPASS: put-and-get\nDone' })

      const evaluated = evaluateCriteria(criteria, result)

      expect(evaluated).toHaveLength(1)
      expect(evaluated[0]!.status).toBe('met')
      expect(evaluated[0]!.name).toBe('put-and-get')
      expect(evaluated[0]!.expected).toBe('PASS: put-and-get')
      expect(evaluated[0]!.actual).toBe('Found')
    })

    it('should return not-met when output does not contain expected string', () => {
      const criteria: ReadonlyArray<AcceptanceCriterion> = [
        makeCriterion({
          name: 'put-and-get',
          order: 1,
          assertion: { type: 'stdout-contains', expected: 'PASS: put-and-get' },
          errorHint: 'Check that Put stores the key.',
        }),
      ]
      const result = makeExecutionResult({ output: 'Running tests...\nFAIL: put-and-get\nDone' })

      const evaluated = evaluateCriteria(criteria, result)

      expect(evaluated[0]!.status).toBe('not-met')
      expect(evaluated[0]!.actual).toContain('Not found in output')
      expect(evaluated[0]!.actual).toContain('Running tests...')
      expect(evaluated[0]!.errorHint).toBe('Check that Put stores the key.')
    })
  })

  describe('stdout-regex', () => {
    it('should return met when output matches regex pattern', () => {
      const criteria: ReadonlyArray<AcceptanceCriterion> = [
        makeCriterion({
          name: 'output-format',
          order: 1,
          assertion: { type: 'stdout-regex', expected: 'PASS:\\s+\\w+' },
        }),
      ]
      const result = makeExecutionResult({ output: 'PASS: test-name' })

      const evaluated = evaluateCriteria(criteria, result)

      expect(evaluated[0]!.status).toBe('met')
    })

    it('should return not-met when output does not match regex', () => {
      const criteria: ReadonlyArray<AcceptanceCriterion> = [
        makeCriterion({
          name: 'output-format',
          order: 1,
          assertion: { type: 'stdout-regex', expected: '^PASS:\\s+\\d+$' },
        }),
      ]
      const result = makeExecutionResult({ output: 'FAIL: something' })

      const evaluated = evaluateCriteria(criteria, result)

      expect(evaluated[0]!.status).toBe('not-met')
    })

    it('should return not-met with error message for invalid regex', () => {
      const criteria: ReadonlyArray<AcceptanceCriterion> = [
        makeCriterion({
          name: 'bad-regex',
          order: 1,
          assertion: { type: 'stdout-regex', expected: '[invalid(' },
        }),
      ]
      const result = makeExecutionResult({ output: 'some output' })

      const evaluated = evaluateCriteria(criteria, result)

      expect(evaluated[0]!.status).toBe('not-met')
      expect(evaluated[0]!.actual).toBe('Invalid regex pattern')
    })
  })

  describe('exit-code-equals', () => {
    it('should return met when exit code matches expected', () => {
      const criteria: ReadonlyArray<AcceptanceCriterion> = [
        makeCriterion({
          name: 'exit-clean',
          order: 1,
          assertion: { type: 'exit-code-equals', expected: 0 },
        }),
      ]
      const result = makeExecutionResult({ exitCode: 0 })

      const evaluated = evaluateCriteria(criteria, result)

      expect(evaluated[0]!.status).toBe('met')
      expect(evaluated[0]!.actual).toBe(0)
    })

    it('should return not-met when exit code does not match', () => {
      const criteria: ReadonlyArray<AcceptanceCriterion> = [
        makeCriterion({
          name: 'exit-clean',
          order: 1,
          assertion: { type: 'exit-code-equals', expected: 0 },
        }),
      ]
      const result = makeExecutionResult({ exitCode: 1 })

      const evaluated = evaluateCriteria(criteria, result)

      expect(evaluated[0]!.status).toBe('not-met')
      expect(evaluated[0]!.actual).toBe(1)
    })

    it('should handle null exit code', () => {
      const criteria: ReadonlyArray<AcceptanceCriterion> = [
        makeCriterion({
          name: 'exit-clean',
          order: 1,
          assertion: { type: 'exit-code-equals', expected: 0 },
        }),
      ]
      const result = makeExecutionResult({ exitCode: null })

      const evaluated = evaluateCriteria(criteria, result)

      expect(evaluated[0]!.status).toBe('not-met')
      expect(evaluated[0]!.actual).toBeNull()
    })
  })

  describe('output-line-count', () => {
    it('should return met when line count matches expected', () => {
      const criteria: ReadonlyArray<AcceptanceCriterion> = [
        makeCriterion({
          name: 'line-count',
          order: 1,
          assertion: { type: 'output-line-count', expected: 3 },
        }),
      ]
      const result = makeExecutionResult({ output: 'line1\nline2\nline3' })

      const evaluated = evaluateCriteria(criteria, result)

      expect(evaluated[0]!.status).toBe('met')
      expect(evaluated[0]!.actual).toBe(3)
    })

    it('should count only non-empty lines', () => {
      const criteria: ReadonlyArray<AcceptanceCriterion> = [
        makeCriterion({
          name: 'line-count',
          order: 1,
          assertion: { type: 'output-line-count', expected: 2 },
        }),
      ]
      const result = makeExecutionResult({ output: 'line1\n\n  \nline2\n' })

      const evaluated = evaluateCriteria(criteria, result)

      expect(evaluated[0]!.status).toBe('met')
      expect(evaluated[0]!.actual).toBe(2)
    })

    it('should return not-met when line count does not match', () => {
      const criteria: ReadonlyArray<AcceptanceCriterion> = [
        makeCriterion({
          name: 'line-count',
          order: 1,
          assertion: { type: 'output-line-count', expected: 5 },
        }),
      ]
      const result = makeExecutionResult({ output: 'line1\nline2' })

      const evaluated = evaluateCriteria(criteria, result)

      expect(evaluated[0]!.status).toBe('not-met')
      expect(evaluated[0]!.actual).toBe(2)
    })

    it('should handle empty output', () => {
      const criteria: ReadonlyArray<AcceptanceCriterion> = [
        makeCriterion({
          name: 'line-count',
          order: 1,
          assertion: { type: 'output-line-count', expected: 0 },
        }),
      ]
      const result = makeExecutionResult({ output: '' })

      const evaluated = evaluateCriteria(criteria, result)

      expect(evaluated[0]!.status).toBe('met')
      expect(evaluated[0]!.actual).toBe(0)
    })
  })

  describe('benchmark-threshold', () => {
    it('should return not-met with stub message', () => {
      const criteria: ReadonlyArray<AcceptanceCriterion> = [
        makeCriterion({
          name: 'perf-target',
          order: 1,
          assertion: { type: 'benchmark-threshold', expected: 100 },
        }),
      ]
      const result = makeExecutionResult({ output: 'ops/sec: 150' })

      const evaluated = evaluateCriteria(criteria, result)

      expect(evaluated[0]!.status).toBe('not-met')
      expect(evaluated[0]!.actual).toBe('Benchmark evaluation not yet supported')
    })
  })

  describe('ordering', () => {
    it('should preserve ordering from input criteria', () => {
      const criteria: ReadonlyArray<AcceptanceCriterion> = [
        makeCriterion({ name: 'third', order: 3, assertion: { type: 'stdout-contains', expected: 'c' } }),
        makeCriterion({ name: 'first', order: 1, assertion: { type: 'stdout-contains', expected: 'a' } }),
        makeCriterion({ name: 'second', order: 2, assertion: { type: 'stdout-contains', expected: 'b' } }),
      ]
      const result = makeExecutionResult({ output: 'a b c' })

      const evaluated = evaluateCriteria(criteria, result)

      expect(evaluated[0]!.name).toBe('third')
      expect(evaluated[0]!.order).toBe(3)
      expect(evaluated[1]!.name).toBe('first')
      expect(evaluated[1]!.order).toBe(1)
      expect(evaluated[2]!.name).toBe('second')
      expect(evaluated[2]!.order).toBe(2)
    })
  })

  describe('errorHint', () => {
    it('should include errorHint when status is not-met', () => {
      const criteria: ReadonlyArray<AcceptanceCriterion> = [
        makeCriterion({
          name: 'test',
          order: 1,
          assertion: { type: 'stdout-contains', expected: 'PASS' },
          errorHint: 'Make sure your program outputs PASS',
        }),
      ]
      const result = makeExecutionResult({ output: 'FAIL' })

      const evaluated = evaluateCriteria(criteria, result)

      expect(evaluated[0]!.errorHint).toBe('Make sure your program outputs PASS')
      expect(evaluated[0]!.actual).toContain('Not found in output')
      expect(evaluated[0]!.actual).toContain('FAIL')
    })

    it('should not include errorHint when status is met', () => {
      const criteria: ReadonlyArray<AcceptanceCriterion> = [
        makeCriterion({
          name: 'test',
          order: 1,
          assertion: { type: 'stdout-contains', expected: 'PASS' },
          errorHint: 'Make sure your program outputs PASS',
        }),
      ]
      const result = makeExecutionResult({ output: 'PASS' })

      const evaluated = evaluateCriteria(criteria, result)

      expect(evaluated[0]!.errorHint).toBeUndefined()
    })
  })
})

describe('evaluateAllNotMet', () => {
  it('should mark all criteria as not-met with compilation failure reason', () => {
    const criteria: ReadonlyArray<AcceptanceCriterion> = [
      makeCriterion({ name: 'test-1', order: 1, assertion: { type: 'stdout-contains', expected: 'PASS' }, errorHint: 'hint1' }),
      makeCriterion({ name: 'test-2', order: 2, assertion: { type: 'exit-code-equals', expected: 0 } }),
    ]

    const evaluated = evaluateAllNotMet(criteria, 'Compilation failed')

    expect(evaluated).toHaveLength(2)
    expect(evaluated[0]!.status).toBe('not-met')
    expect(evaluated[0]!.actual).toBe('Compilation failed')
    expect(evaluated[0]!.errorHint).toBe('hint1')
    expect(evaluated[1]!.status).toBe('not-met')
    expect(evaluated[1]!.actual).toBe('Compilation failed')
  })

  it('should mark all criteria as not-met with timeout reason', () => {
    const criteria: ReadonlyArray<AcceptanceCriterion> = [
      makeCriterion({ name: 'test-1', order: 1, assertion: { type: 'stdout-contains', expected: 'PASS' } }),
    ]

    const evaluated = evaluateAllNotMet(criteria, 'Execution timed out')

    expect(evaluated[0]!.status).toBe('not-met')
    expect(evaluated[0]!.actual).toBe('Execution timed out')
  })

  it('should preserve order and expected values', () => {
    const criteria: ReadonlyArray<AcceptanceCriterion> = [
      makeCriterion({ name: 'a', order: 3, assertion: { type: 'stdout-contains', expected: 'X' } }),
      makeCriterion({ name: 'b', order: 1, assertion: { type: 'exit-code-equals', expected: 0 } }),
    ]

    const evaluated = evaluateAllNotMet(criteria, 'Runtime error')

    expect(evaluated[0]!.order).toBe(3)
    expect(evaluated[0]!.expected).toBe('X')
    expect(evaluated[1]!.order).toBe(1)
    expect(evaluated[1]!.expected).toBe(0)
  })
})
