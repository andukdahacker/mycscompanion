import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { CodeEditor } from './CodeEditor'
import { announceToScreenReader } from './workspace-a11y'
import { useEditorStore } from '../../stores/editor-store'

// Track what mock Editor receives
let capturedProps: Record<string, unknown> = {}
let capturedBeforeMount: ((monaco: unknown) => void) | null = null
let capturedOnMount: ((editor: unknown, monaco: unknown) => void) | null = null

vi.mock('@monaco-editor/react', () => ({
  default: function MockEditor(props: Record<string, unknown>) {
    capturedProps = props

    if (typeof props.beforeMount === 'function') {
      capturedBeforeMount = props.beforeMount as (monaco: unknown) => void
    }
    if (typeof props.onMount === 'function') {
      capturedOnMount = props.onMount as (editor: unknown, monaco: unknown) => void
    }

    // Render the loading component if provided
    if (props.loading) {
      return <div data-testid="mock-editor-with-loading">{props.loading as React.ReactNode}</div>
    }
    return <div data-testid="mock-editor" />
  },
}))

vi.mock('./monaco-theme', () => ({
  defineMycscompanionTheme: vi.fn(),
}))

describe('CodeEditor', () => {
  const defaultProps = {
    initialContent: 'package main\n\nfunc main() {}\n',
    onRun: vi.fn(),
  }

  beforeEach(() => {
    capturedProps = {}
    capturedBeforeMount = null
    capturedOnMount = null
    useEditorStore.setState({ content: '', isDirty: false })
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('should render Editor with language="go"', () => {
    render(<CodeEditor {...defaultProps} />)

    expect(capturedProps.language).toBe('go')
  })

  it('should render Editor with theme="mycscompanion-dark"', () => {
    render(<CodeEditor {...defaultProps} />)

    expect(capturedProps.theme).toBe('mycscompanion-dark')
  })

  it('should pass initialContent as defaultValue (uncontrolled mode)', () => {
    render(<CodeEditor {...defaultProps} />)

    expect(capturedProps.defaultValue).toBe(defaultProps.initialContent)
  })

  it('should set accessibilitySupport to "on" in options (AC #7)', () => {
    render(<CodeEditor {...defaultProps} />)

    const options = capturedProps.options as Record<string, unknown>
    expect(options.accessibilitySupport).toBe('on')
  })

  it('should disable quickSuggestions (no LSP for Go)', () => {
    render(<CodeEditor {...defaultProps} />)

    const options = capturedProps.options as Record<string, unknown>
    expect(options.quickSuggestions).toBe(false)
  })

  it('should use tabs for indentation (Go convention)', () => {
    render(<CodeEditor {...defaultProps} />)

    const options = capturedProps.options as Record<string, unknown>
    expect(options.insertSpaces).toBe(false)
    expect(options.tabSize).toBe(4)
  })

  describe('beforeMount', () => {
    it('should call defineMycscompanionTheme (AC #9)', async () => {
      const { defineMycscompanionTheme } = await import('./monaco-theme')

      render(<CodeEditor {...defaultProps} />)

      const mockMonaco = { editor: { defineTheme: vi.fn() } }
      capturedBeforeMount!(mockMonaco)

      expect(defineMycscompanionTheme).toHaveBeenCalledWith(mockMonaco)
    })
  })

  describe('onMount', () => {
    function createMockEditor() {
      return {
        focus: vi.fn(),
        addCommand: vi.fn(),
        getModel: vi.fn().mockReturnValue({ getValue: vi.fn().mockReturnValue('package main') }),
      }
    }

    function createMockMonaco() {
      return {
        KeyMod: { CtrlCmd: 2048 },
        KeyCode: { Enter: 3, Escape: 9 },
      }
    }

    it('should call editor.focus() on mount (AC #3)', () => {
      render(<CodeEditor {...defaultProps} />)

      const mockEditor = createMockEditor()
      const mockMonaco = createMockMonaco()
      capturedOnMount!(mockEditor, mockMonaco)

      expect(mockEditor.focus).toHaveBeenCalledOnce()
    })

    it('should register Cmd+Enter command for onRun (AC #6)', () => {
      render(<CodeEditor {...defaultProps} />)

      const mockEditor = createMockEditor()
      const mockMonaco = createMockMonaco()
      capturedOnMount!(mockEditor, mockMonaco)

      // First addCommand call is Cmd+Enter
      const cmdEnterCall = mockEditor.addCommand.mock.calls.find(
        (call: unknown[]) => call[0] === (2048 | 3)
      )
      expect(cmdEnterCall).toBeDefined()

      // Execute the handler to verify it calls onRun via ref
      const handler = cmdEnterCall![1] as () => void
      handler()
      expect(defaultProps.onRun).toHaveBeenCalledOnce()
    })

    it('should use ref for onRun to avoid stale closure (AC #6)', () => {
      const firstOnRun = vi.fn()
      const secondOnRun = vi.fn()

      const { rerender } = render(<CodeEditor initialContent="" onRun={firstOnRun} />)

      const mockEditor = createMockEditor()
      const mockMonaco = createMockMonaco()
      capturedOnMount!(mockEditor, mockMonaco)

      // Re-render with new onRun
      rerender(<CodeEditor initialContent="" onRun={secondOnRun} />)

      // Execute the Cmd+Enter handler — should call secondOnRun via ref
      const cmdEnterCall = mockEditor.addCommand.mock.calls.find(
        (call: unknown[]) => call[0] === (2048 | 3)
      )
      const handler = cmdEnterCall![1] as () => void
      handler()

      expect(firstOnRun).not.toHaveBeenCalled()
      expect(secondOnRun).toHaveBeenCalledOnce()
    })

    it('should register Escape command with widget precondition (AC #4)', () => {
      render(<CodeEditor {...defaultProps} />)

      const mockEditor = createMockEditor()
      const mockMonaco = createMockMonaco()
      capturedOnMount!(mockEditor, mockMonaco)

      const escapeCall = mockEditor.addCommand.mock.calls.find(
        (call: unknown[]) => call[0] === 9
      )
      expect(escapeCall).toBeDefined()
      expect(escapeCall![2]).toBe('!suggestWidgetVisible && !findWidgetVisible && !markersNavigationVisible')
    })

    it('should move focus to workspace-container on Escape (AC #4)', () => {
      render(<CodeEditor {...defaultProps} />)

      const mockEditor = createMockEditor()
      const mockMonaco = createMockMonaco()
      capturedOnMount!(mockEditor, mockMonaco)

      // Set up workspace container in DOM
      const container = document.createElement('div')
      container.id = 'workspace-container'
      container.focus = vi.fn()
      document.body.appendChild(container)

      const escapeCall = mockEditor.addCommand.mock.calls.find(
        (call: unknown[]) => call[0] === 9
      )
      const handler = escapeCall![1] as () => void
      handler()

      expect(container.focus).toHaveBeenCalledOnce()

      document.body.removeChild(container)
    })
  })

  describe('onChange', () => {
    it('should sync content to editor store', () => {
      render(<CodeEditor {...defaultProps} />)

      const onChange = capturedProps.onChange as (value: string | undefined) => void
      onChange('new content')

      expect(useEditorStore.getState().content).toBe('new content')
      expect(useEditorStore.getState().isDirty).toBe(true)
    })

    it('should not update store when value is undefined', () => {
      render(<CodeEditor {...defaultProps} />)

      const onChange = capturedProps.onChange as (value: string | undefined) => void
      onChange(undefined)

      expect(useEditorStore.getState().content).toBe('')
      expect(useEditorStore.getState().isDirty).toBe(false)
    })
  })

  describe('CodeEditorSkeleton', () => {
    it('should render skeleton while editor loads', () => {
      render(<CodeEditor {...defaultProps} />)

      expect(screen.getByTestId('code-editor-skeleton')).toBeInTheDocument()
    })
  })
})

describe('announceToScreenReader', () => {
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('should update the workspace-announcer element (AC #8)', () => {
    const announcer = document.createElement('div')
    announcer.id = 'workspace-announcer'
    document.body.appendChild(announcer)

    // Mock requestAnimationFrame
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      cb(0)
      return 0
    })

    announceToScreenReader('Code editor ready')

    expect(announcer.textContent).toBe('Code editor ready')

    document.body.removeChild(announcer)
  })

  it('should clear text before setting new text for screen reader detection', () => {
    const announcer = document.createElement('div')
    announcer.id = 'workspace-announcer'
    announcer.textContent = 'old message'
    document.body.appendChild(announcer)

    const rafCalls: FrameRequestCallback[] = []
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      rafCalls.push(cb)
      return 0
    })

    announceToScreenReader('new message')

    // Before rAF fires, text should be cleared
    expect(announcer.textContent).toBe('')

    // After rAF fires, new text is set
    rafCalls[0]!(0)
    expect(announcer.textContent).toBe('new message')

    document.body.removeChild(announcer)
  })

  it('should not throw when workspace-announcer is not in DOM', () => {
    expect(() => announceToScreenReader('test')).not.toThrow()
  })
})
