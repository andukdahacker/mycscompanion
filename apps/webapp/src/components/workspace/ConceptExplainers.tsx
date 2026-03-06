import { useState } from 'react'
import { ScrollArea } from '@mycscompanion/ui/src/components/ui/scroll-area'
import type { ConceptExplainerAsset } from '@mycscompanion/shared'
import { ConceptExplainerDialog } from './ConceptExplainerDialog'

interface ConceptExplainersProps {
  readonly assets: readonly ConceptExplainerAsset[]
}

function ConceptExplainers({ assets }: ConceptExplainersProps): React.ReactElement | null {
  const [expandedAsset, setExpandedAsset] = useState<ConceptExplainerAsset | null>(null)

  if (assets.length === 0) {
    return null
  }

  return (
    <>
      <ScrollArea className="h-full">
        <div className="space-y-6 p-4">
          {assets.map((asset) => (
            <div key={asset.name}>
              {asset.title ? (
                <h3 className="mb-2 text-sm font-medium text-foreground">{asset.title}</h3>
              ) : null}
              <div className="overflow-x-auto">
                <button
                  type="button"
                  className="cursor-pointer border-0 bg-transparent p-0"
                  onClick={() => setExpandedAsset(asset)}
                  aria-label={`Expand ${asset.title ?? asset.name}`}
                >
                  <img
                    src={asset.path}
                    alt={asset.altText ?? asset.name}
                    role="img"
                    loading="lazy"
                    className="max-w-full"
                  />
                </button>
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>
      <ConceptExplainerDialog
        asset={expandedAsset}
        open={expandedAsset !== null}
        onOpenChange={(open) => { if (!open) setExpandedAsset(null) }}
      />
    </>
  )
}

export { ConceptExplainers }
export type { ConceptExplainersProps }
