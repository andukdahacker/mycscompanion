import { create } from 'zustand'

interface CursorPosition {
  line: number
  column: number
}

interface EditorState {
  content: string
  isDirty: boolean
  cursorPosition: CursorPosition
  // Actions
  setContent: (content: string) => void
  setCursorPosition: (position: CursorPosition) => void
  markClean: () => void
}

const useEditorStore = create<EditorState>()((set) => ({
  content: '',
  isDirty: false,
  cursorPosition: { line: 1, column: 1 },
  setContent: (content) => set({ content, isDirty: true }),
  setCursorPosition: (position) => set({ cursorPosition: position }),
  markClean: () => set({ isDirty: false }),
}))

export { useEditorStore }
export type { EditorState }
