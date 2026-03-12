import { render, cleanup } from '@testing-library/react'
import { describe, it, expect, afterEach, vi } from 'vitest'
import { AccountSettingsSkeleton } from './AccountSettingsSkeleton'

describe('AccountSettingsSkeleton', () => {
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('should render skeleton with pulse animation elements', () => {
    const { container } = render(<AccountSettingsSkeleton />)

    const pulseElements = container.querySelectorAll('.animate-pulse')
    expect(pulseElements.length).toBeGreaterThan(0)
  })

  it('should render a main landmark element', () => {
    const { container } = render(<AccountSettingsSkeleton />)

    const main = container.querySelector('main')
    expect(main).not.toBeNull()
  })

  it('should include motion-reduce:animate-none on all pulse elements', () => {
    const { container } = render(<AccountSettingsSkeleton />)

    const pulseElements = container.querySelectorAll('.animate-pulse')
    for (const element of pulseElements) {
      expect(element.className).toContain('motion-reduce:animate-none')
    }
  })
})
