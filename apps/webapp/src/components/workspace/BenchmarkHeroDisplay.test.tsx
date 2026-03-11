import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, it, expect, vi } from 'vitest'
import { BenchmarkHeroDisplay } from './BenchmarkHeroDisplay'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('BenchmarkHeroDisplay', () => {
  describe('hero number formatting', () => {
    it('should render hero number with commas for thousands', () => {
      render(
        <BenchmarkHeroDisplay
          value={12400}
          unit="ops/sec"
          normalizedRatio={0.82}
          isFirstRun={true}
        />,
      )

      expect(screen.getByText('12,400')).toBeInTheDocument()
    })

    it('should render the unit label', () => {
      render(
        <BenchmarkHeroDisplay
          value={12400}
          unit="ops/sec"
          normalizedRatio={0.82}
          isFirstRun={true}
        />,
      )

      expect(screen.getByText('ops/sec')).toBeInTheDocument()
    })
  })

  describe('normalized ratio', () => {
    it('should render normalized ratio below hero number', () => {
      render(
        <BenchmarkHeroDisplay
          value={12400}
          unit="ops/sec"
          normalizedRatio={0.82}
          isFirstRun={true}
        />,
      )

      expect(screen.getByText('0.82x reference implementation')).toBeInTheDocument()
    })
  })

  describe('improvement state', () => {
    it('should show green text and up arrow icon when improving', () => {
      render(
        <BenchmarkHeroDisplay
          value={12400}
          unit="ops/sec"
          normalizedRatio={0.82}
          trendText="↑ from 8,200 ops/sec"
          isFirstRun={false}
        />,
      )

      const heroNumber = screen.getByTestId('benchmark-hero-number')
      expect(heroNumber).toHaveClass('text-primary')

      const upArrow = screen.getByTestId('benchmark-trend-arrow-up')
      expect(upArrow).toBeInTheDocument()

      expect(screen.getByText('↑ from 8,200 ops/sec')).toBeInTheDocument()
    })
  })

  describe('regression state', () => {
    it('should show white text and down arrow icon when regressing', () => {
      render(
        <BenchmarkHeroDisplay
          value={6000}
          unit="ops/sec"
          normalizedRatio={0.5}
          trendText="↓ from 8,200 ops/sec"
          isFirstRun={false}
        />,
      )

      const heroNumber = screen.getByTestId('benchmark-hero-number')
      expect(heroNumber).toHaveClass('text-foreground')

      const downArrow = screen.getByTestId('benchmark-trend-arrow-down')
      expect(downArrow).toBeInTheDocument()

      expect(screen.getByText('↓ from 8,200 ops/sec')).toBeInTheDocument()
    })
  })

  describe('first-run state', () => {
    it('should show green text with no trend text or arrow on first run', () => {
      render(
        <BenchmarkHeroDisplay
          value={12400}
          unit="ops/sec"
          normalizedRatio={0.82}
          isFirstRun={true}
        />,
      )

      const heroNumber = screen.getByTestId('benchmark-hero-number')
      expect(heroNumber).toHaveClass('text-primary')

      expect(screen.queryByTestId('benchmark-trend-arrow-up')).not.toBeInTheDocument()
      expect(screen.queryByTestId('benchmark-trend-arrow-down')).not.toBeInTheDocument()
      expect(screen.queryByTestId('benchmark-trend-text')).not.toBeInTheDocument()
    })
  })

  describe('accessibility', () => {
    it('should have aria-live region for screen reader announcement', () => {
      render(
        <BenchmarkHeroDisplay
          value={12400}
          unit="ops/sec"
          normalizedRatio={0.82}
          isFirstRun={true}
        />,
      )

      const liveRegion = screen.getByTestId('benchmark-hero-display')
      expect(liveRegion).toHaveAttribute('aria-live', 'polite')
    })

    it('should have aria-label with full benchmark description', () => {
      render(
        <BenchmarkHeroDisplay
          value={12400}
          unit="ops/sec"
          normalizedRatio={0.82}
          isFirstRun={true}
        />,
      )

      const liveRegion = screen.getByTestId('benchmark-hero-display')
      expect(liveRegion.getAttribute('aria-label')).toContain('12,400')
      expect(liveRegion.getAttribute('aria-label')).toContain('ops/sec')
      expect(liveRegion.getAttribute('aria-label')).toContain('0.82')
    })
  })

  describe('session qualifier', () => {
    it('should display "(this session)" qualifier', () => {
      render(
        <BenchmarkHeroDisplay
          value={12400}
          unit="ops/sec"
          normalizedRatio={0.82}
          isFirstRun={true}
        />,
      )

      expect(screen.getByText('(this session)')).toBeInTheDocument()
    })
  })
})
