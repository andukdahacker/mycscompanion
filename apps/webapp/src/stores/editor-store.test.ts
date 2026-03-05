import { describe, it, expect, beforeEach } from 'vitest'
import { useEditorStore } from './editor-store'

describe('useEditorStore', () => {
  beforeEach(() => {
    useEditorStore.setState({ content: '', isDirty: false, cursorPosition: { line: 1, column: 1 } })
  })

  it('should have default cursor position at line 1, column 1', () => {
    const state = useEditorStore.getState()
    expect(state.cursorPosition).toEqual({ line: 1, column: 1 })
  })

  it('should update cursor position via setCursorPosition', () => {
    useEditorStore.getState().setCursorPosition({ line: 5, column: 12 })

    const state = useEditorStore.getState()
    expect(state.cursorPosition).toEqual({ line: 5, column: 12 })
  })

  it('should set content and mark dirty', () => {
    useEditorStore.getState().setContent('package main')

    const state = useEditorStore.getState()
    expect(state.content).toBe('package main')
    expect(state.isDirty).toBe(true)
  })

  it('should mark clean without changing content', () => {
    useEditorStore.getState().setContent('package main')
    useEditorStore.getState().markClean()

    const state = useEditorStore.getState()
    expect(state.content).toBe('package main')
    expect(state.isDirty).toBe(false)
  })
})
