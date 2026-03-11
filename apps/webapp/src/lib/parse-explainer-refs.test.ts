import { describe, it, expect } from 'vitest'
import { parseExplainerRefs, stripExplainerRefsForA11y } from './parse-explainer-refs.js'

describe('parseExplainerRefs', () => {
  it('should correctly parse a single explainer reference', () => {
    const text = 'Look at this diagram [explainer:kv-store-operations.svg] for clarity.'
    const result = parseExplainerRefs(text)

    expect(result.explainerRefs).toHaveLength(1)
    expect(result.explainerRefs[0]).toEqual({
      filename: 'kv-store-operations.svg',
      position: 21,
    })
    expect(result.text).toBe(text)
  })

  it('should correctly parse multiple explainer references', () => {
    const text =
      'See [explainer:kv-store-operations.svg] and also [explainer:persistence-flow.svg] for more.'
    const result = parseExplainerRefs(text)

    expect(result.explainerRefs).toHaveLength(2)
    expect(result.explainerRefs[0]!.filename).toBe('kv-store-operations.svg')
    expect(result.explainerRefs[1]!.filename).toBe('persistence-flow.svg')
  })

  it('should return original text unchanged when no references present', () => {
    const text = 'This is a normal message without any explainer references.'
    const result = parseExplainerRefs(text)

    expect(result.text).toBe(text)
    expect(result.explainerRefs).toEqual([])
  })

  it('should handle malformed references gracefully', () => {
    const text = 'Bad ref [explainer:] and [explainer:noextension] are ignored.'
    const result = parseExplainerRefs(text)

    expect(result.explainerRefs).toEqual([])
  })

  it('should handle duplicate references', () => {
    const text = '[explainer:kv-store-operations.svg] and again [explainer:kv-store-operations.svg]'
    const result = parseExplainerRefs(text)

    expect(result.explainerRefs).toHaveLength(2)
    expect(result.explainerRefs[0]!.filename).toBe('kv-store-operations.svg')
    expect(result.explainerRefs[1]!.filename).toBe('kv-store-operations.svg')
  })

  it('should handle empty text', () => {
    const result = parseExplainerRefs('')

    expect(result.text).toBe('')
    expect(result.explainerRefs).toEqual([])
  })
})

describe('stripExplainerRefsForA11y', () => {
  it('should replace explainer references with descriptive title text', () => {
    const text = 'Look at this [explainer:kv-store-operations.svg] diagram.'
    const result = stripExplainerRefsForA11y(text)

    expect(result).toBe('Look at this [See diagram: kv store operations] diagram.')
  })

  it('should use asset title from map when provided', () => {
    const text = 'Look at this [explainer:kv-store-operations.svg] diagram.'
    const assetsMap = {
      'kv-store-operations.svg': { title: 'Key-Value Store Operations' },
    }
    const result = stripExplainerRefsForA11y(text, assetsMap)

    expect(result).toBe('Look at this [See diagram: Key-Value Store Operations] diagram.')
  })

  it('should fall back to filename when asset has no title', () => {
    const text = '[explainer:kv-store-operations.svg]'
    const assetsMap = {
      'kv-store-operations.svg': { title: null },
    }
    const result = stripExplainerRefsForA11y(text, assetsMap)

    expect(result).toBe('[See diagram: kv store operations]')
  })

  it('should handle multiple references', () => {
    const text = '[explainer:kv-store-operations.svg] and [explainer:persistence-flow.svg]'
    const result = stripExplainerRefsForA11y(text)

    expect(result).toContain('[See diagram: kv store operations]')
    expect(result).toContain('[See diagram: persistence flow]')
  })

  it('should return text unchanged when no references present', () => {
    const text = 'Normal text without refs'
    const result = stripExplainerRefsForA11y(text)

    expect(result).toBe(text)
  })

  it('should produce readable diagram names from hyphenated filenames', () => {
    const text = '[explainer:persistence-flow.svg]'
    const result = stripExplainerRefsForA11y(text)

    expect(result).toBe('[See diagram: persistence flow]')
  })
})
