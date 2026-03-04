import { Button } from '@mycscompanion/ui/src/components/ui/button'
import { Play, BarChart3 } from 'lucide-react'

interface WorkspaceTopBarProps {
  readonly milestoneName: string
  readonly milestoneNumber: number
  readonly progress: number
  readonly onRun: () => void
  readonly onBenchmark: () => void
}

function WorkspaceTopBar({
  milestoneName,
  milestoneNumber,
  progress,
  onRun,
  onBenchmark,
}: WorkspaceTopBarProps): React.ReactElement {
  return (
    <div className="flex h-12 shrink-0 items-center justify-between border-b bg-background px-4">
      <div className="flex items-center gap-3">
        <span className="text-sm text-muted-foreground">mycscompanion</span>
        <span className="text-muted-foreground">/</span>
        <span className="text-sm font-medium">
          Milestone {milestoneNumber}: {milestoneName} — {progress}%
        </span>
      </div>

      <div className="flex items-center gap-2">
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
