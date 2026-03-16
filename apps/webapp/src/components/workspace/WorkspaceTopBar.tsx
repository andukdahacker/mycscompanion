import { Link } from 'react-router'
import { Button } from '@mycscompanion/ui/src/components/ui/button'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@mycscompanion/ui/src/components/ui/alert-dialog'
import { Play, BarChart3, Settings, RotateCcw } from 'lucide-react'

interface WorkspaceTopBarProps {
  readonly milestoneName: string
  readonly milestoneNumber: number
  readonly progress: number
  readonly onRun: () => void
  readonly onBenchmark: () => void
  readonly onResetToScaffold?: () => void
}

function WorkspaceTopBar({
  milestoneName,
  milestoneNumber,
  progress,
  onRun,
  onBenchmark,
  onResetToScaffold,
}: WorkspaceTopBarProps): React.ReactElement {
  return (
    <div className="flex h-12 shrink-0 items-center justify-between border-b bg-background px-4">
      <div className="flex items-center gap-3">
        <span className="text-sm text-muted-foreground">My CS Companion</span>
        <span className="text-muted-foreground">/</span>
        <span className="text-sm font-medium">
          Milestone {milestoneNumber}: {milestoneName} — {progress}%
        </span>
      </div>

      <div className="flex items-center gap-2">
        {onResetToScaffold && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="ghost" size="sm" title="Reset to scaffold code">
                <RotateCcw className="size-3.5" />
                Reset
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Reset to scaffold code?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will replace your current code with the original starter code. Your current code will be lost.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={onResetToScaffold}>
                  Reset
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
        <Link
          to="/settings"
          className="inline-flex items-center justify-center rounded-md text-sm font-medium text-muted-foreground hover:text-foreground h-8 w-8"
          aria-label="Account settings"
          title="Account settings"
        >
          <Settings className="size-4" />
        </Link>
        <Button
          variant="outline"
          size="sm"
          onClick={onRun}
          title="Run (Cmd+Enter)"
        >
          <Play className="size-3.5" />
          Run
        </Button>
        <Button
          size="sm"
          onClick={onBenchmark}
          title="Benchmark (Cmd+Shift+Enter)"
        >
          <BarChart3 className="size-3.5" />
          Benchmark
        </Button>
      </div>
    </div>
  )
}

export { WorkspaceTopBar }
export type { WorkspaceTopBarProps }
