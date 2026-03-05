import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, cleanup, act } from '@testing-library/react'
import { createElement, useState, useRef } from 'react'
import { useAutoScroll } from './use-auto-scroll'

function TestHarness({
  initialDeps,
  scrollHeight,
  clientHeight,
  scrollTopLog,
}: {
  readonly initialDeps: ReadonlyArray<string>
  readonly scrollHeight: number
  readonly clientHeight: number
  readonly scrollTopLog: Array<number>
}) {
  const [deps, setDeps] = useState(initialDeps)
  const hookRef = useAutoScroll(deps)
  const hookRefStable = useRef(hookRef)
  hookRefStable.current = hookRef

  return createElement('div', {
    'data-testid': 'container',
    ref: (el: HTMLDivElement | null) => {
      if (el && !('__patched' in el)) {
        Object.defineProperty(el, '__patched', { value: true })
        Object.defineProperty(el, 'scrollHeight', { value: scrollHeight, configurable: true })
        Object.defineProperty(el, 'clientHeight', { value: clientHeight, configurable: true })
        let st = 0
        Object.defineProperty(el, 'scrollTop', {
          get: () => st,
          set: (v: number) => { st = v; scrollTopLog.push(v) },
          configurable: true,
        })
      }
      ;(hookRefStable.current as { current: HTMLDivElement | null }).current = el
    },
  },
    createElement('button', { 'data-testid': 'add', onClick: () => setDeps((p) => [...p, 'x']) }, 'Add'))
}

describe('useAutoScroll', () => {
  beforeEach(() => {
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      cb(0)
      return 0
    })
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {})
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('should scroll to bottom when deps change and shouldAutoScroll is true', async () => {
    const log: Array<number> = []
    const { getByTestId } = render(
      createElement(TestHarness, { initialDeps: ['a'], scrollHeight: 500, clientHeight: 300, scrollTopLog: log })
    )

    // shouldAutoScroll starts true — deps change triggers scroll
    await act(async () => { getByTestId('add').click() })

    expect(log).toContain(500)
  })

  it('should pause auto-scroll when user scrolls up beyond threshold', async () => {
    const log: Array<number> = []
    const { getByTestId } = render(
      createElement(TestHarness, { initialDeps: ['a'], scrollHeight: 1000, clientHeight: 300, scrollTopLog: log })
    )

    const container = getByTestId('container')
    // Simulate user scrolling up (gap = 1000 - 200 - 300 = 500 > 50px threshold)
    container.scrollTop = 200
    act(() => { container.dispatchEvent(new Event('scroll')) })

    log.length = 0
    await act(async () => { getByTestId('add').click() })

    // Should NOT have auto-scrolled to 1000
    expect(log).not.toContain(1000)
  })
})
