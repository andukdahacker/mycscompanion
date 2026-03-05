import Markdown from 'react-markdown'
import { ScrollArea } from '@mycscompanion/ui/src/components/ui/scroll-area'

interface MilestoneBriefProps {
  readonly brief: string
}

const MARKDOWN_COMPONENTS = {
  h1: ({ children }: { readonly children?: React.ReactNode }) => (
    <h1 className="mb-3 text-lg font-medium text-foreground">{children}</h1>
  ),
  h2: ({ children }: { readonly children?: React.ReactNode }) => (
    <h2 className="mb-2 mt-4 text-base font-medium text-foreground">{children}</h2>
  ),
  h3: ({ children }: { readonly children?: React.ReactNode }) => (
    <h3 className="mb-2 mt-3 text-sm font-medium text-foreground">{children}</h3>
  ),
  p: ({ children }: { readonly children?: React.ReactNode }) => (
    <p className="mb-3 leading-relaxed text-secondary-foreground">{children}</p>
  ),
  ul: ({ children }: { readonly children?: React.ReactNode }) => (
    <ul className="mb-3 list-disc space-y-1 pl-5 text-secondary-foreground">{children}</ul>
  ),
  ol: ({ children }: { readonly children?: React.ReactNode }) => (
    <ol className="mb-3 list-decimal space-y-1 pl-5 text-secondary-foreground">{children}</ol>
  ),
  li: ({ children }: { readonly children?: React.ReactNode }) => (
    <li className="leading-relaxed">{children}</li>
  ),
  code: ({ children, className }: { readonly children?: React.ReactNode; readonly className?: string }) => {
    const isBlock = className?.includes('language-')
    if (isBlock) {
      return (
        <code className="block rounded bg-card p-2 font-mono text-sm text-foreground">
          {children}
        </code>
      )
    }
    return (
      <code className="rounded bg-card px-1 py-0.5 font-mono text-sm text-foreground">
        {children}
      </code>
    )
  },
  pre: ({ children }: { readonly children?: React.ReactNode }) => (
    <pre className="mb-3 overflow-x-auto rounded bg-card p-2 font-mono text-sm">
      {children}
    </pre>
  ),
}

function MilestoneBrief({ brief }: MilestoneBriefProps): React.ReactElement {
  return (
    <ScrollArea className="h-full">
      <div className="max-w-prose p-4" data-testid="milestone-brief">
        <Markdown components={MARKDOWN_COMPONENTS}>
          {brief}
        </Markdown>
      </div>
    </ScrollArea>
  )
}

export { MilestoneBrief }
export type { MilestoneBriefProps }
