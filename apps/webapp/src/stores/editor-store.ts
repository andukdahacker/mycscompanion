import { create } from 'zustand'

interface EditorState {
  content: string
  isDirty: boolean
  // Actions
  setContent: (content: string) => void
  markClean: () => void
}

const useEditorStore = create<EditorState>()((set) => ({
  content: '',
  isDirty: false,
  setContent: (content) => set({ content, isDirty: true }),
  markClean: () => set({ isDirty: false }),
}))

export { useEditorStore }
export type { EditorState }
