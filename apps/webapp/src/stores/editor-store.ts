import { create } from 'zustand'

interface CursorPosition {
  line: number
  column: number
}

interface EditorState {
  content: string
  isDirty: boolean
  cursorPosition: CursorPosition
  pendingReset: string | null
  // Actions
  setContent: (content: string) => void
  setCursorPosition: (position: CursorPosition) => void
  markClean: () => void
  triggerReset: (code: string) => void
  clearPendingReset: () => void
}

const useEditorStore = create<EditorState>()((set) => ({
  content: '',
  isDirty: false,
  cursorPosition: { line: 1, column: 1 },
  pendingReset: null,
  setContent: (content) => set({ content, isDirty: true }),
  setCursorPosition: (position) => set({ cursorPosition: position }),
  markClean: () => set({ isDirty: false }),
  triggerReset: (code) => set({ content: code, isDirty: true, pendingReset: code }),
  clearPendingReset: () => set({ pendingReset: null }),
}))

export { useEditorStore }
export type { EditorState }
