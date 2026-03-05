import { describe, it, expect } from 'vitest'
import { parseGoError } from './parse-go-error'

describe('parseGoError', () => {
  it('should parse standard Go compiler error format', () => {
    const result = parseGoError('main.go:5:2: undefined: node')

    expect(result.interpretation).toContain('line 5')
    expect(result.interpretation).toContain('main.go')
    expect(result.rawOutput).toBe('main.go:5:2: undefined: node')
  })

  it('should generate "The..." framing in interpretation', () => {
    const result = parseGoError('main.go:10:1: syntax error: unexpected EOF')

    expect(result.interpretation).toMatch(/^The /)
    expect(result.interpretation).not.toMatch(/^Your /)
  })

  it('should handle runtime panic format', () => {
    const raw = `goroutine 1 [running]:
main.main()
        /app/main.go:10 +0x18`

    const result = parseGoError(raw)

    expect(result.interpretation).toBe('The program panicked at runtime.')
    expect(result.rawOutput).toBe(raw)
  })

  it('should handle unparseable errors gracefully', () => {
    const result = parseGoError('some random error output')

    expect(result.interpretation).toBe('A compilation error occurred.')
    expect(result.rawOutput).toBe('some random error output')
  })

  it('should never include prescriptive language', () => {
    const testCases = [
      'main.go:5:2: undefined: node',
      'main.go:10:1: syntax error: unexpected EOF',
      'main.go:3:1: imported and not used: "fmt"',
      'main.go:7:5: x declared and not used',
    ]

    const prescriptiveWords = ['try', 'fix', 'change', 'should']

    for (const raw of testCases) {
      const result = parseGoError(raw)
      for (const word of prescriptiveWords) {
        expect(result.interpretation.toLowerCase()).not.toContain(word)
      }
    }
  })

  it('should handle empty input', () => {
    const result = parseGoError('')
    expect(result.interpretation).toBe('A compilation error occurred.')
  })

  it('should handle multiple errors in output', () => {
    const raw = `main.go:5:2: undefined: x
main.go:10:1: syntax error: unexpected }`

    const result = parseGoError(raw)
    expect(result.interpretation).toContain('line 5')
    expect(result.interpretation).toContain('line 10')
  })

  it('should handle undefined variable errors', () => {
    const result = parseGoError('main.go:142:5: undefined: node')

    expect(result.interpretation).toContain('"node"')
    expect(result.interpretation).toContain('line 142')
    expect(result.interpretation).toContain('not been declared')
  })

  it('should handle unused import errors', () => {
    const result = parseGoError('main.go:3:1: imported and not used: "fmt"')

    expect(result.interpretation).toContain('import')
    expect(result.interpretation).toContain('not used')
  })
})
