import { describe, it, expect, vi } from 'vitest'
import { THEME_COLORS, defineMycscompanionTheme } from './monaco-theme'

/**
 * Parse hex color to linear sRGB components (0-1 range).
 * Applies gamma-correct sRGB linearization per WCAG spec.
 */
function hexToLinearRgb(hex: string): [number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16) / 255
  const g = parseInt(hex.slice(3, 5), 16) / 255
  const b = parseInt(hex.slice(5, 7), 16) / 255

  const linearize = (c: number) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4))

  return [linearize(r), linearize(g), linearize(b)]
}

/**
 * Calculate relative luminance per WCAG 2.x.
 * L = 0.2126*R + 0.7152*G + 0.0722*B
 */
function relativeLuminance(hex: string): number {
  const [r, g, b] = hexToLinearRgb(hex)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/**
 * Calculate WCAG contrast ratio between two hex colors.
 * ratio = (L1 + 0.05) / (L2 + 0.05) where L1 >= L2
 */
function contrastRatio(hex1: string, hex2: string): number {
  const l1 = relativeLuminance(hex1)
  const l2 = relativeLuminance(hex2)
  const lighter = Math.max(l1, l2)
  const darker = Math.min(l1, l2)
  return (lighter + 0.05) / (darker + 0.05)
}

describe('monaco-theme', () => {
  describe('WCAG contrast compliance', () => {
    const bg = THEME_COLORS.background

    it('should have foreground on background at >= 7:1 (WCAG AAA)', () => {
      const ratio = contrastRatio(THEME_COLORS.foreground, bg)
      expect(ratio).toBeGreaterThanOrEqual(7)
    })

    it('should have lineNumber on background at >= 4.5:1 (WCAG AA)', () => {
      const ratio = contrastRatio(THEME_COLORS.lineNumber, bg)
      expect(ratio).toBeGreaterThanOrEqual(4.5)
    })

    const syntaxTokens: Array<[string, string]> = [
      ['keyword', THEME_COLORS.keyword],
      ['string', THEME_COLORS.string],
      ['number', THEME_COLORS.number],
      ['comment', THEME_COLORS.comment],
      ['type', THEME_COLORS.type],
      ['function', THEME_COLORS.function],
    ]

    for (const [name, color] of syntaxTokens) {
      it(`should have ${name} token on background at >= 4.5:1 (WCAG AA)`, () => {
        const ratio = contrastRatio(color, bg)
        expect(ratio).toBeGreaterThanOrEqual(4.5)
      })
    }
  })

  describe('defineMycscompanionTheme', () => {
    it('should call monaco.editor.defineTheme with correct theme name', () => {
      const mockDefineTheme = vi.fn()
      const mockMonaco = {
        editor: { defineTheme: mockDefineTheme },
      }

      defineMycscompanionTheme(mockMonaco as never)

      expect(mockDefineTheme).toHaveBeenCalledOnce()
      expect(mockDefineTheme).toHaveBeenCalledWith(
        'mycscompanion-dark',
        expect.objectContaining({
          base: 'vs-dark',
          inherit: true,
        })
      )
    })
  })
})
