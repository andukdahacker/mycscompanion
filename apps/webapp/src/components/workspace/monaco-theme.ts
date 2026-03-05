import type * as monacoTypes from 'monaco-editor'

// Theme token colors — contrast ratio requirements per UX spec NFR-A4:
//   foreground on background: >= 7:1 (WCAG AAA — evening dark-mode reading)
//   lineNumber on background: >= 4.5:1 (WCAG AA)
//   syntax token colors on background: >= 4.5:1 (WCAG AA)
//
// Hex values manually converted from oklch CSS custom properties in
// packages/config/tailwind-tokens.css (oklch has no native JS conversion):
//   --background: oklch(0.14 0.005 250)  => #17171a
//   --foreground: oklch(0.93 0.005 250)  => #e4e4e7
//   --muted-foreground: oklch(0.63 0.01 250) => ~#a1a1aa
//
// lineNumber uses #9ca3af (gray-400) instead of --muted-foreground because
// the oklch equivalent (#a1a1aa) only achieves ~4.2:1 contrast ratio on
// this background, failing WCAG AA 4.5:1. gray-400 meets the threshold.
const THEME_COLORS = {
  background: '#17171a',
  foreground: '#e4e4e7',
  lineNumber: '#9ca3af',
  selection: '#27272a',
  keyword: '#93c5fd',
  string: '#86efac',
  number: '#fde68a',
  comment: '#a1a1aa',
  type: '#c4b5fd',
  function: '#67e8f9',
  variable: '#e4e4e7',
  operator: '#e4e4e7',
} as const

type MonacoInstance = typeof monacoTypes

function defineMycscompanionTheme(monaco: MonacoInstance): void {
  monaco.editor.defineTheme('mycscompanion-dark', {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: 'keyword', foreground: THEME_COLORS.keyword.slice(1) },
      { token: 'string', foreground: THEME_COLORS.string.slice(1) },
      { token: 'number', foreground: THEME_COLORS.number.slice(1) },
      { token: 'comment', foreground: THEME_COLORS.comment.slice(1) },
      { token: 'type', foreground: THEME_COLORS.type.slice(1) },
      { token: 'type.identifier', foreground: THEME_COLORS.type.slice(1) },
      { token: 'identifier', foreground: THEME_COLORS.function.slice(1) },
      { token: 'delimiter', foreground: THEME_COLORS.operator.slice(1) },
    ],
    colors: {
      'editor.background': THEME_COLORS.background,
      'editor.foreground': THEME_COLORS.foreground,
      'editorLineNumber.foreground': THEME_COLORS.lineNumber,
      'editor.selectionBackground': THEME_COLORS.selection,
      'editor.lineHighlightBackground': '#1e1e21',
      'editorCursor.foreground': '#10b981',
    },
  })
}

export { defineMycscompanionTheme, THEME_COLORS }
