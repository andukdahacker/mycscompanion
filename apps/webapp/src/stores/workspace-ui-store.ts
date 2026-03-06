import { create } from 'zustand'

type BreakpointMode = 'desktop' | 'small-desktop' | 'mobile'

interface WorkspaceUIState {
  // Panel state
  tutorExpanded: boolean
  tutorAvailable: boolean // 3 visual states: collapsed, expanded, unavailable (retry button)
  activeTerminalTab: 'brief' | 'diagrams' | 'output' | 'criteria'
  // Breakpoint — set once on mount, no reactive updates
  breakpointMode: BreakpointMode
  // Actions
  setTutorExpanded: (expanded: boolean) => void
  toggleTutor: () => void
  setTutorAvailable: (available: boolean) => void
  setActiveTerminalTab: (tab: 'brief' | 'diagrams' | 'output' | 'criteria') => void
  setBreakpointMode: (mode: BreakpointMode) => void
}

const useWorkspaceUIStore = create<WorkspaceUIState>()((set) => ({
  tutorExpanded: true,
  tutorAvailable: true,
  activeTerminalTab: 'output',
  breakpointMode: 'desktop',
  setTutorExpanded: (expanded) => set({ tutorExpanded: expanded }),
  toggleTutor: () => set((state) => ({ tutorExpanded: !state.tutorExpanded })),
  setTutorAvailable: (available) => set({ tutorAvailable: available }),
  setActiveTerminalTab: (tab) => set({ activeTerminalTab: tab }),
  setBreakpointMode: (mode) => set({ breakpointMode: mode }),
}))

export { useWorkspaceUIStore }
export type { WorkspaceUIState, BreakpointMode }
