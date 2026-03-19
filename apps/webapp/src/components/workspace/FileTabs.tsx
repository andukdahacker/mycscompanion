import { useEditorStore } from '../../stores/editor-store'

function FileTabs() {
  const files = useEditorStore((s) => s.files)
  const activeFile = useEditorStore((s) => s.activeFile)
  const editableFiles = useEditorStore((s) => s.editableFiles)
  const setActiveFile = useEditorStore((s) => s.setActiveFile)

  const fileNames = Object.keys(files)

  // M1 single-file mode: no tabs needed
  if (fileNames.length <= 1 && editableFiles.length === 0) {
    return null
  }

  const editableSet = new Set(editableFiles)

  // Sort: editable files first, then read-only
  const sortedFiles = [...fileNames].sort((a, b) => {
    const aEditable = editableSet.has(a) ? 0 : 1
    const bEditable = editableSet.has(b) ? 0 : 1
    if (aEditable !== bEditable) return aEditable - bEditable
    return a.localeCompare(b)
  })

  return (
    <div className="flex border-b border-zinc-700 bg-zinc-900 text-sm" role="tablist">
      {sortedFiles.map((name) => {
        const isActive = name === activeFile
        const isReadOnly = editableSet.size > 0 && !editableSet.has(name)

        return (
          <button
            key={name}
            role="tab"
            aria-selected={isActive}
            onClick={() => setActiveFile(name)}
            className={`px-3 py-1.5 flex items-center gap-1.5 border-r border-zinc-700 transition-colors ${
              isActive
                ? 'bg-zinc-800 text-zinc-100'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50'
            }`}
          >
            <span>{name}</span>
            {isReadOnly && (
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 16 16"
                fill="currentColor"
                className="w-3 h-3 text-zinc-500"
                aria-label="Read-only"
              >
                <path
                  fillRule="evenodd"
                  d="M8 1a3.5 3.5 0 0 0-3.5 3.5V7A1.5 1.5 0 0 0 3 8.5v5A1.5 1.5 0 0 0 4.5 15h7a1.5 1.5 0 0 0 1.5-1.5v-5A1.5 1.5 0 0 0 11.5 7V4.5A3.5 3.5 0 0 0 8 1Zm2 6V4.5a2 2 0 1 0-4 0V7h4Z"
                  clipRule="evenodd"
                />
              </svg>
            )}
          </button>
        )
      })}
    </div>
  )
}

export { FileTabs }
