import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { ErrorPresentation } from './ErrorPresentation'

describe('ErrorPresentation', () => {
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  describe('user-code errors', () => {
    it('should render interpretation with left border and elevated background', () => {
      const { container } = render(
        <ErrorPresentation interpretation="The variable on line 5..." rawOutput="main.go:5:2: error" isUserError={true} />
      )

      const elevated = container.querySelector('.bg-elevated')
      expect(elevated).toBeInTheDocument()
      expect(elevated?.className).toContain('border-l-2')
    })

    it('should have raw output collapsed by default', () => {
      render(
        <ErrorPresentation interpretation="Error occurred" rawOutput="main.go:5:2: error detail" isUserError={true} />
      )

      // Raw output should not be visible
      expect(screen.queryByText('main.go:5:2: error detail')).not.toBeInTheDocument()
    })

    it('should expand raw output when toggle is clicked', () => {
      render(
        <ErrorPresentation interpretation="Error occurred" rawOutput="main.go:5:2: expanded error" isUserError={true} />
      )

      fireEvent.click(screen.getByText(/show\/hide raw compiler output/i))

      expect(screen.getByText('main.go:5:2: expanded error')).toBeInTheDocument()
    })

    it('should have min-h-11 on collapsible trigger for touch targets', () => {
      render(
        <ErrorPresentation interpretation="Error" rawOutput="raw" isUserError={true} />
      )

      const trigger = screen.getByText(/show\/hide raw compiler output/i)
      expect(trigger.className).toContain('min-h-11')
    })

    it('should use 13px font size for interpretation text', () => {
      const { container } = render(
        <ErrorPresentation interpretation="The error" rawOutput="raw" isUserError={true} />
      )

      const text = container.querySelector('.text-\\[13px\\]')
      expect(text).toBeInTheDocument()
    })
  })

  describe('platform errors', () => {
    it('should render with error-surface background', () => {
      const { container } = render(
        <ErrorPresentation interpretation="Something went wrong" rawOutput="internal" isUserError={false} />
      )

      const errorSurface = container.querySelector('.bg-error-surface')
      expect(errorSurface).toBeInTheDocument()
    })

    it('should show "Try again" button when onRetry provided', () => {
      const onRetry = vi.fn()
      render(
        <ErrorPresentation interpretation="Something went wrong" rawOutput="internal" isUserError={false} onRetry={onRetry} />
      )

      const retryButton = screen.getByRole('button', { name: /try again/i })
      expect(retryButton).toBeInTheDocument()

      fireEvent.click(retryButton)
      expect(onRetry).toHaveBeenCalledOnce()
    })

    it('should not show retry button when onRetry is not provided', () => {
      render(
        <ErrorPresentation interpretation="Something went wrong" rawOutput="internal" isUserError={false} />
      )

      expect(screen.queryByRole('button', { name: /try again/i })).not.toBeInTheDocument()
    })
  })

  it('should not use red colors (no destructive or red classes)', () => {
    const { container } = render(
      <ErrorPresentation interpretation="Error" rawOutput="raw" isUserError={true} />
    )

    const html = container.innerHTML
    expect(html).not.toContain('destructive')
    expect(html).not.toContain('text-red')
    expect(html).not.toContain('bg-red')
  })

  it('should use "The..." framing in interpretation display', () => {
    render(
      <ErrorPresentation interpretation="The function references undeclared variable" rawOutput="raw" isUserError={true} />
    )

    const text = screen.getByText(/^The function/)
    expect(text).toBeInTheDocument()
  })
})
