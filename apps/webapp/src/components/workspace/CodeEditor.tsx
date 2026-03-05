import { useCallback, useRef } from 'react'
import Editor, { type OnMount, type BeforeMount } from '@monaco-editor/react'
import { Skeleton } from '@mycscompanion/ui/src/components/ui/skeleton'
import { defineMycscompanionTheme } from './monaco-theme'
import { announceToScreenReader } from './workspace-a11y'
import { useEditorStore } from '../../stores/editor-store'

interface CodeEditorProps {
  readonly initialContent: string
  readonly onRun: () => void
}

function CodeEditor({ initialContent, onRun }: CodeEditorProps): React.ReactElement {
  const setContent = useEditorStore((s) => s.setContent)

  // Ref to avoid stale closure in Monaco addCommand handlers.
  // onMount is called ONCE by @monaco-editor/react — if onRun changes
  // on re-render, the addCommand handler would reference the old closure.
  const onRunRef = useRef(onRun)
  onRunRef.current = onRun

  const handleBeforeMount: BeforeMount = useCallback((monaco) => {
    defineMycscompanionTheme(monaco)
  }, [])

  const handleMount: OnMount = useCallback((editor, monaco) => {
    // AC #3: Initial focus on workspace load
    editor.focus()

    // AC #6: Unbind Monaco default Cmd+Enter and bind to Run
    editor.addCommand(
      monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter,
      () => { onRunRef.current() }
    )

    // AC #4: Escape releases focus from Monaco when no widgets open
    editor.addCommand(
      monaco.KeyCode.Escape,
      () => {
        const container = document.getElementById('workspace-container')
        if (container) container.focus()
      },
      '!suggestWidgetVisible && !findWidgetVisible && !markersNavigationVisible'
    )

    // AC #8: Announce editor ready
    announceToScreenReader('Code editor ready')
  }, [])

  const handleChange = useCallback((value: string | undefined) => {
    if (value !== undefined) {
      setContent(value)
    }
  }, [setContent])

  return (
    <div id="code-editor-boundary" className="h-full w-full">
      <Editor
        language="go"
        theme="mycscompanion-dark"
        defaultValue={initialContent}
        onChange={handleChange}
        beforeMount={handleBeforeMount}
        onMount={handleMount}
        loading={<CodeEditorSkeleton />}
        options={{
          accessibilitySupport: 'on',
          fontSize: 14,
          fontFamily: "'JetBrains Mono', 'Fira Code', 'SF Mono', 'Cascadia Code', monospace",
          minimap: { enabled: false },
          scrollBeyondLastLine: false,
          automaticLayout: true,
          tabSize: 4,
          insertSpaces: false,
          renderWhitespace: 'none',
          lineNumbers: 'on',
          folding: true,
          wordWrap: 'off',
          quickSuggestions: false,
          parameterHints: { enabled: false },
          suggestOnTriggerCharacters: false,
          acceptSuggestionOnCommitCharacter: false,
        }}
      />
    </div>
  )
}

function CodeEditorSkeleton(): React.ReactElement {
  return (
    <div className="flex h-full w-full flex-col gap-2 p-4" data-testid="code-editor-skeleton">
      <Skeleton className="h-4 w-1/4" />
      <Skeleton className="h-4 w-3/5" />
      <Skeleton className="h-4 w-2/5" />
      <Skeleton className="h-4 w-1/2" />
      <Skeleton className="h-4 w-1/3" />
      <Skeleton className="h-4 w-3/4" />
      <Skeleton className="h-4 w-2/5" />
      <Skeleton className="h-4 w-1/2" />
    </div>
  )
}

export { CodeEditor, CodeEditorSkeleton }
export type { CodeEditorProps }
