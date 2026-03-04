import {
  Group,
  Panel,
  Separator,
  usePanelRef,
} from 'react-resizable-panels'
import type { PanelSize } from 'react-resizable-panels'

import { cn } from '../../lib/utils'

function ResizablePanelGroup({
  className,
  ...props
}: React.ComponentProps<typeof Group>) {
  return (
    <Group
      data-slot="resizable-panel-group"
      className={cn(
        'flex h-full w-full data-[orientation=vertical]:flex-col',
        className
      )}
      {...props}
    />
  )
}

function ResizablePanel({
  className,
  ...props
}: React.ComponentProps<typeof Panel>) {
  return (
    <Panel
      data-slot="resizable-panel"
      className={cn(className)}
      {...props}
    />
  )
}

function ResizableHandle({
  withHandle,
  className,
  ...props
}: React.ComponentProps<typeof Separator> & {
  withHandle?: boolean
}) {
  return (
    <Separator
      data-slot="resizable-handle"
      className={cn(
        'bg-border focus-visible:ring-ring relative flex w-px items-center justify-center after:absolute after:inset-y-0 after:left-1/2 after:w-1 after:-translate-x-1/2 focus-visible:ring-1 focus-visible:ring-offset-1 focus-visible:outline-hidden data-[orientation=vertical]:h-px data-[orientation=vertical]:w-full data-[orientation=vertical]:after:left-0 data-[orientation=vertical]:after:h-1 data-[orientation=vertical]:after:w-full data-[orientation=vertical]:after:-translate-y-1/2 data-[orientation=vertical]:after:translate-x-0 [&[data-orientation=vertical]>div]:rotate-90',
        className
      )}
      {...props}
    >
      {withHandle && (
        <div className="bg-border z-10 flex h-4 w-3 items-center justify-center rounded-sm border">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="6"
            height="10"
            viewBox="0 0 6 10"
            fill="none"
            stroke="currentColor"
            strokeWidth="1"
            className="text-muted-foreground"
          >
            <circle cx="1" cy="2" r="0.5" fill="currentColor" />
            <circle cx="1" cy="5" r="0.5" fill="currentColor" />
            <circle cx="1" cy="8" r="0.5" fill="currentColor" />
            <circle cx="5" cy="2" r="0.5" fill="currentColor" />
            <circle cx="5" cy="5" r="0.5" fill="currentColor" />
            <circle cx="5" cy="8" r="0.5" fill="currentColor" />
          </svg>
        </div>
      )}
    </Separator>
  )
}

export {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
  usePanelRef,
}
export type { PanelSize }
