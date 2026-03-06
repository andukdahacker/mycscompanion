import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@mycscompanion/ui/src/components/ui/dialog'
import type { ConceptExplainerAsset } from '@mycscompanion/shared'

interface ConceptExplainerDialogProps {
  readonly asset: ConceptExplainerAsset | null
  readonly open: boolean
  readonly onOpenChange: (open: boolean) => void
}

function ConceptExplainerDialog({ asset, open, onOpenChange }: ConceptExplainerDialogProps): React.ReactElement {
  const label = asset?.title ?? asset?.altText ?? asset?.name ?? 'Concept explainer'

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[90vw] max-h-[90vh] overflow-auto" aria-label={label} aria-describedby={undefined}>
        <DialogTitle className="sr-only">{label}</DialogTitle>
        {asset ? (
          <img
            src={asset.path}
            alt={asset.altText ?? asset.name}
            className="w-full"
          />
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

export { ConceptExplainerDialog }
export type { ConceptExplainerDialogProps }
