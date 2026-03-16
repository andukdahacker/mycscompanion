export interface ExplainerRef {
  readonly filename: string
  readonly position: number
}

export interface ParsedMessage {
  readonly text: string
  readonly explainerRefs: readonly ExplainerRef[]
}

export function stripExplainerRefsForA11y(
  text: string,
  assetsMap?: Readonly<Record<string, { readonly title?: string | null }>>
): string {
  return text
    .replace(/\[explainer:([\w.-]+\.svg)\]/g, (_match, filename: string) => {
      const asset = assetsMap?.[filename]
      if (asset?.title) return `[See diagram: ${asset.title}]`
      const name = filename.replace(/\.svg$/, '').replace(/[-_]/g, ' ')
      return `[See diagram: ${name}]`
    })
}

export function parseExplainerRefs(text: string): ParsedMessage {
  const pattern = /\[explainer:([\w.-]+\.svg)\]/g
  const explainerRefs: ExplainerRef[] = []
  let match: RegExpExecArray | null

  while ((match = pattern.exec(text)) !== null) {
    explainerRefs.push({
      filename: match[1] ?? '',
      position: match.index,
    })
  }

  return { text, explainerRefs }
}
