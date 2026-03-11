import { useState } from 'react'
import type { ConceptExplainerAsset } from '@mycscompanion/shared'
import { ConceptExplainerDialog } from './ConceptExplainerDialog'

interface TutorExplainerCardProps {
  readonly asset: ConceptExplainerAsset
}

function TutorExplainerCard({ asset }: TutorExplainerCardProps): React.ReactElement {
  const [expanded, setExpanded] = useState(false)
  const label = asset.title ?? asset.name

  return (
    <>
      <div className="my-2 rounded-md border border-border bg-card p-2">
        <button
          type="button"
          className="flex w-full cursor-pointer items-center gap-2 bg-transparent p-0 text-left"
          onClick={() => setExpanded(true)}
          aria-label={`View diagram: ${label}`}
        >
          <img
            src={asset.path}
            alt={asset.altText ?? asset.name}
            role="img"
            loading="lazy"
            className="h-12 w-12 shrink-0 rounded object-contain dark:invert"
          />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-foreground">{label}</p>
            <p className="text-[10px] text-muted-foreground">View diagram</p>
          </div>
        </button>
      </div>
      <ConceptExplainerDialog
        asset={asset}
        open={expanded}
        onOpenChange={setExpanded}
      />
    </>
  )
}

export { TutorExplainerCard }
export type { TutorExplainerCardProps }
