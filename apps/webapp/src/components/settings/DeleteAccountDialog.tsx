import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@mycscompanion/ui/src/components/ui/alert-dialog'

interface DeleteAccountDialogProps {
  readonly open: boolean
  readonly onOpenChange: (open: boolean) => void
  readonly onConfirm: () => void
  readonly isDeleting: boolean
}

function DeleteAccountDialog({
  open,
  onOpenChange,
  onConfirm,
  isDeleting,
}: DeleteAccountDialogProps): React.ReactElement {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete Account</AlertDialogTitle>
          <AlertDialogDescription>
            This action is permanent and cannot be undone. All your data will be
            permanently deleted, including:
          </AlertDialogDescription>
        </AlertDialogHeader>
        <ul className="list-disc pl-6 text-sm text-muted-foreground space-y-1">
          <li>Your profile and account information</li>
          <li>All code submissions and snapshots</li>
          <li>Benchmark results and progress data</li>
          <li>AI tutor conversation history</li>
          <li>Session summaries</li>
        </ul>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault()
              onConfirm()
            }}
            disabled={isDeleting}
            variant="destructive"
          >
            {isDeleting ? 'Deleting\u2026' : 'Delete My Account'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

export { DeleteAccountDialog }
