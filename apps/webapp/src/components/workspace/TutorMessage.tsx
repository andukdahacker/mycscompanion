import { useMemo } from 'react'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { TutorConversationMessage, ConceptExplainerAsset } from '@mycscompanion/shared'
import { parseExplainerRefs } from '../../lib/parse-explainer-refs.js'
import { TutorExplainerCard } from './TutorExplainerCard'

interface TutorMessageProps {
  readonly message: TutorConversationMessage
  readonly isStreaming?: boolean
  readonly streamingContent?: string
  readonly conceptExplainerAssets?: Readonly<Record<string, ConceptExplainerAsset>>
}

const TUTOR_MARKDOWN_COMPONENTS = {
  h1: ({ children }: { readonly children?: React.ReactNode }) => (
    <h1 className="mb-2 text-base font-medium text-foreground">{children}</h1>
  ),
  h2: ({ children }: { readonly children?: React.ReactNode }) => (
    <h2 className="mb-1.5 mt-3 text-sm font-medium text-foreground">{children}</h2>
  ),
  h3: ({ children }: { readonly children?: React.ReactNode }) => (
    <h3 className="mb-1 mt-2 text-sm font-medium text-foreground">{children}</h3>
  ),
  p: ({ children }: { readonly children?: React.ReactNode }) => (
    <p className="mb-2 text-sm leading-relaxed">{children}</p>
  ),
  ul: ({ children }: { readonly children?: React.ReactNode }) => (
    <ul className="mb-2 list-disc space-y-0.5 pl-4 text-sm">{children}</ul>
  ),
  ol: ({ children }: { readonly children?: React.ReactNode }) => (
    <ol className="mb-2 list-decimal space-y-0.5 pl-4 text-sm">{children}</ol>
  ),
  li: ({ children }: { readonly children?: React.ReactNode }) => (
    <li className="leading-relaxed">{children}</li>
  ),
  code: ({ children, className }: { readonly children?: React.ReactNode; readonly className?: string }) => {
    const isBlock = className?.includes('language-')
    if (isBlock) {
      return (
        <code className="block rounded bg-card p-2 font-mono text-xs text-foreground">
          {children}
        </code>
      )
    }
    return (
      <code className="rounded bg-card px-1 py-0.5 font-mono text-xs text-foreground">
        {children}
      </code>
    )
  },
  pre: ({ children }: { readonly children?: React.ReactNode }) => (
    <pre className="mb-2 overflow-x-auto rounded bg-card p-2 font-mono text-xs">
      {children}
    </pre>
  ),
}

const PARTIAL_EXPLAINER_TAIL = /\[explainer:[^\]]*$/

function formatRelativeTime(dateStr: string): string {
  const now = Date.now()
  const then = new Date(dateStr).getTime()
  const diffMs = now - then
  const diffSec = Math.floor(diffMs / 1000)

  if (diffSec < 60) return 'just now'
  const diffMin = Math.floor(diffSec / 60)
  if (diffMin < 60) return `${diffMin}m ago`
  const diffHr = Math.floor(diffMin / 60)
  if (diffHr < 24) return `${diffHr}h ago`

  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(dateStr))
}

function renderAssistantContent(
  rawContent: string,
  isStreaming: boolean,
  assetsMap?: Readonly<Record<string, ConceptExplainerAsset>>
): React.ReactNode[] {
  // During streaming, suppress partial [explainer: at end of text
  let content = rawContent
  if (isStreaming) {
    const partialMatch = PARTIAL_EXPLAINER_TAIL.exec(content)
    if (partialMatch) {
      content = content.slice(0, partialMatch.index)
    }
  }

  const { explainerRefs } = parseExplainerRefs(content)

  if (explainerRefs.length === 0) {
    return [
      <Markdown key="md-0" components={TUTOR_MARKDOWN_COMPONENTS} remarkPlugins={[remarkGfm]}>
        {content}
      </Markdown>,
    ]
  }

  // Split text around explainer references and interleave with cards
  const segments: React.ReactNode[] = []
  let lastEnd = 0

  for (const ref of explainerRefs) {
    const matchStr = `[explainer:${ref.filename}]`
    const textBefore = content.slice(lastEnd, ref.position)

    if (textBefore) {
      segments.push(
        <Markdown key={`md-${ref.position}`} components={TUTOR_MARKDOWN_COMPONENTS} remarkPlugins={[remarkGfm]}>
          {textBefore}
        </Markdown>
      )
    }

    const asset = assetsMap?.[ref.filename]
    if (asset) {
      segments.push(<TutorExplainerCard key={`exp-${ref.position}`} asset={asset} />)
    }

    lastEnd = ref.position + matchStr.length
  }

  const trailing = content.slice(lastEnd)
  if (trailing) {
    segments.push(
      <Markdown key={`md-${lastEnd}`} components={TUTOR_MARKDOWN_COMPONENTS} remarkPlugins={[remarkGfm]}>
        {trailing}
      </Markdown>
    )
  }

  return segments
}

function TutorMessage({ message, isStreaming = false, streamingContent, conceptExplainerAssets }: TutorMessageProps): React.ReactElement {
  const isUser = message.role === 'user'
  const content = isStreaming && streamingContent ? streamingContent : message.content

  const timestamp = useMemo(() => formatRelativeTime(message.createdAt), [message.createdAt])

  return (
    <div
      role="listitem"
      className={`mb-3 flex ${isUser ? 'justify-end' : 'justify-start'}`}
    >
      <div
        className={`max-w-[85%] rounded-lg px-3 py-2 ${
          isUser
            ? 'bg-muted text-foreground'
            : 'border border-border bg-background text-foreground'
        }`}
      >
        {isUser ? (
          <p className="text-sm whitespace-pre-wrap">{content}</p>
        ) : (
          renderAssistantContent(content, isStreaming, conceptExplainerAssets)
        )}

        {isStreaming && (
          <span className="inline-block h-4 w-1.5 animate-pulse bg-foreground/60" aria-hidden="true" />
        )}

        <div className="mt-1 text-[10px] text-muted-foreground">
          {timestamp}
        </div>
      </div>
    </div>
  )
}

export { TutorMessage }
export type { TutorMessageProps }
