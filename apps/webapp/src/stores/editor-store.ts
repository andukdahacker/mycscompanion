import { create } from 'zustand'

interface CursorPosition {
  readonly line: number
  readonly column: number
}

interface EditorState {
  readonly content: string
  readonly isDirty: boolean
  readonly cursorPosition: CursorPosition
  readonly pendingReset: string | null
  // Multi-file state
  readonly files: Record<string, string>
  readonly activeFile: string
  readonly editableFiles: string[]
  // Actions
  setContent: (content: string) => void
  setCursorPosition: (position: CursorPosition) => void
  markClean: () => void
  triggerReset: (code: string) => void
  clearPendingReset: () => void
  // Multi-file actions
  initFiles: (files: Record<string, string>, editableFiles: string[]) => void
  setActiveFile: (name: string) => void
  updateFileContent: (name: string, content: string) => void
  getEditableFilesSnapshot: () => Record<string, string>
}

const useEditorStore = create<EditorState>()((set, get) => ({
  content: '',
  isDirty: false,
  cursorPosition: { line: 1, column: 1 },
  pendingReset: null,
  files: {},
  activeFile: 'main.go',
  editableFiles: [],
  setContent: (content) => {
    const { activeFile, files } = get()
    set({
      content,
      isDirty: true,
      files: { ...files, [activeFile]: content },
    })
  },
  setCursorPosition: (position) => set({ cursorPosition: position }),
  markClean: () => set({ isDirty: false }),
  triggerReset: (code) => set({ content: code, isDirty: true, pendingReset: code }),
  clearPendingReset: () => set({ pendingReset: null }),
  initFiles: (files, editableFiles) => {
    // Default active file: first editable file, or first file
    const activeFile = editableFiles[0] ?? Object.keys(files)[0] ?? 'main.go'
    set({
      files,
      editableFiles,
      activeFile,
      content: files[activeFile] ?? '',
      isDirty: false,
    })
  },
  setActiveFile: (name) => {
    const { files } = get()
    set({
      activeFile: name,
      content: files[name] ?? '',
    })
  },
  updateFileContent: (name, content) => {
    const { files, activeFile } = get()
    const updatedFiles = { ...files, [name]: content }
    set({
      files: updatedFiles,
      isDirty: true,
      ...(name === activeFile ? { content } : {}),
    })
  },
  getEditableFilesSnapshot: () => {
    const { files, editableFiles } = get()
    if (editableFiles.length === 0) {
      // M1 single-file mode — return all files
      return files
    }
    const snapshot: Record<string, string> = {}
    for (const name of editableFiles) {
      if (files[name] !== undefined) {
        snapshot[name] = files[name] ?? ''
      }
    }
    return snapshot
  },
}))

export { useEditorStore }
export type { EditorState }
