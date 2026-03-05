interface ParsedError {
  readonly interpretation: string
  readonly rawOutput: string
}

const GO_ERROR_PATTERN = /^(.+\.go):(\d+):(\d+):\s*(.+)$/

const PANIC_PATTERN = /^goroutine \d+|^panic:/m

/** Parse Go compiler/runtime errors into human-readable interpretations.
 *  Uses "The..." framing — never "Your...". Never prescribes fixes. */
function parseGoError(raw: string): ParsedError {
  if (!raw.trim()) {
    return { interpretation: 'A compilation error occurred.', rawOutput: raw }
  }

  // Runtime panic
  if (PANIC_PATTERN.test(raw)) {
    return { interpretation: 'The program panicked at runtime.', rawOutput: raw }
  }

  // Try to parse standard Go compiler error: file.go:line:col: message
  const lines = raw.split('\n')
  const errors: Array<string> = []

  for (const line of lines) {
    const match = GO_ERROR_PATTERN.exec(line.trim())
    if (match && match[1] && match[2] && match[4]) {
      const interpretation = buildInterpretation(match[1], match[2], match[4])
      errors.push(interpretation)
    }
  }

  if (errors.length === 0) {
    return { interpretation: 'A compilation error occurred.', rawOutput: raw }
  }

  return {
    interpretation: errors.join(' '),
    rawOutput: raw,
  }
}

function buildInterpretation(file: string, line: string, message: string): string {
  const msg = message.trim()

  // Undefined/undeclared variable
  if (msg.includes('undefined:') || msg.includes('undeclared name:') || msg.includes('not declared')) {
    const name = msg.split(':').pop()?.trim() ?? 'a name'
    return `The identifier "${name}" on line ${line} in ${file} has not been declared in this scope.`
  }

  // Type mismatch
  if (msg.includes('cannot use') && msg.includes('as')) {
    return `The value on line ${line} in ${file} has a type mismatch: ${msg}.`
  }

  // Unused variable
  if (msg.includes('declared and not used') || msg.includes('declared but not used')) {
    const name = msg.split(' ')[0] ?? 'a variable'
    return `The variable "${name}" on line ${line} in ${file} is declared but never used.`
  }

  // Import not used
  if (msg.includes('imported and not used')) {
    return `The import on line ${line} in ${file} is not used.`
  }

  // Syntax error
  if (msg.includes('syntax error') || msg.includes('expected')) {
    return `The code on line ${line} in ${file} has a syntax issue: ${msg}.`
  }

  // Fallback: generic description
  return `The code on line ${line} in ${file} has an issue: ${msg}.`
}

export { parseGoError }
export type { ParsedError }
