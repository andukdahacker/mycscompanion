import { render, screen, cleanup } from '@testing-library/react'
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest'
import { TrajectoryChart, TrajectoryDataTable } from './TrajectoryChart'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

const sampleDataPoints = [
  { milestoneName: 'KV Store', milestoneNumber: 1, bestOpsPerSec: 4200 },
  { milestoneName: 'B-Tree Indexing', milestoneNumber: 2, bestOpsPerSec: 8100 },
  { milestoneName: 'Storage Engine', milestoneNumber: 3, bestOpsPerSec: 12400 },
]

describe('TrajectoryChart', () => {
  beforeEach(() => {
    // Default to no reduced motion
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    })
  })

  it('should render SVG element with correct viewBox', () => {
    render(<TrajectoryChart dataPoints={sampleDataPoints} />)

    const svg = screen.getByRole('img', { name: /benchmark trajectory/i })
    expect(svg.getAttribute('viewBox')).toBe('0 0 500 180')
  })

  it('should render data points as circles for each milestone', () => {
    render(<TrajectoryChart dataPoints={sampleDataPoints} />)

    expect(screen.getByTestId('trajectory-point-1')).toBeDefined()
    expect(screen.getByTestId('trajectory-point-2')).toBeDefined()
    expect(screen.getByTestId('trajectory-point-3')).toBeDefined()
  })

  it('should render current milestone data point with glow effect (larger circle)', () => {
    render(<TrajectoryChart dataPoints={sampleDataPoints} currentMilestoneNumber={3} />)

    const currentPoint = screen.getByTestId('trajectory-point-3')
    const otherPoint = screen.getByTestId('trajectory-point-1')

    expect(currentPoint.getAttribute('r')).toBe('6')
    expect(otherPoint.getAttribute('r')).toBe('4')
    // Current point should have filter for glow
    expect(currentPoint.getAttribute('filter')).toMatch(/url\(#glow/)
    expect(otherPoint.getAttribute('filter')).toBeNull()
  })

  it('should render connecting polyline between data points', () => {
    render(<TrajectoryChart dataPoints={sampleDataPoints} />)

    const polyline = screen.getByTestId('trajectory-line')
    expect(polyline).toBeDefined()
    expect(polyline.getAttribute('points')).toBeTruthy()
  })

  it('should display ops/sec values with comma formatting', () => {
    render(<TrajectoryChart dataPoints={sampleDataPoints} />)

    const svg = screen.getByRole('img')
    expect(svg.textContent).toContain('4,200 ops/sec')
    expect(svg.textContent).toContain('8,100 ops/sec')
    expect(svg.textContent).toContain('12,400 ops/sec')
  })

  it('should display milestone name labels below chart', () => {
    render(<TrajectoryChart dataPoints={sampleDataPoints} />)

    expect(screen.getByTestId('trajectory-label-1').textContent).toBe('KV Store')
    expect(screen.getByTestId('trajectory-label-2').textContent).toBe('B-Tree Indexing')
    expect(screen.getByTestId('trajectory-label-3').textContent).toBe('Storage Engine')
  })

  it('should handle single data point (no connecting line)', () => {
    const singlePoint = [{ milestoneName: 'KV Store', milestoneNumber: 1, bestOpsPerSec: 4200 }]
    render(<TrajectoryChart dataPoints={singlePoint} />)

    expect(screen.getByTestId('trajectory-point-1')).toBeDefined()
    expect(screen.queryByTestId('trajectory-line')).toBeNull()
  })

  it('should handle identical values (no crash on zero range)', () => {
    const identicalPoints = [
      { milestoneName: 'KV Store', milestoneNumber: 1, bestOpsPerSec: 5000 },
      { milestoneName: 'B-Tree', milestoneNumber: 2, bestOpsPerSec: 5000 },
    ]
    render(<TrajectoryChart dataPoints={identicalPoints} />)

    // Should render without crashing
    expect(screen.getByTestId('trajectory-point-1')).toBeDefined()
    expect(screen.getByTestId('trajectory-point-2')).toBeDefined()
  })

  it('should respect motion-reduce — no glow effect when reduced motion active', () => {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: query === '(prefers-reduced-motion: reduce)',
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    })

    render(<TrajectoryChart dataPoints={sampleDataPoints} currentMilestoneNumber={3} />)

    const currentPoint = screen.getByTestId('trajectory-point-3')
    // No glow filter when reduced motion is active
    expect(currentPoint.getAttribute('filter')).toBeNull()
  })

  it('should have appropriate role="img" and aria-label on SVG', () => {
    render(<TrajectoryChart dataPoints={sampleDataPoints} />)

    const svg = screen.getByRole('img')
    expect(svg.getAttribute('aria-label')).toBe('Benchmark trajectory across milestones')
  })
})

describe('TrajectoryDataTable', () => {
  const tableDataPoints = [
    { milestoneName: 'KV Store', milestoneNumber: 1, bestOpsPerSec: 4200, bestNormalizedRatio: 0.4158, totalSubmissions: 3 },
    { milestoneName: 'B-Tree', milestoneNumber: 2, bestOpsPerSec: 8100, bestNormalizedRatio: 0.8020, totalSubmissions: 1 },
  ]

  it('should render table with correct column headers', () => {
    render(<TrajectoryDataTable dataPoints={tableDataPoints} />)

    const table = screen.getByRole('table', { name: /benchmark trajectory data/i })
    expect(table).toBeDefined()
    const headers = screen.getAllByRole('columnheader')
    expect(headers).toHaveLength(5)
    expect(headers[0].textContent).toBe('#')
    expect(headers[1].textContent).toBe('Milestone')
    expect(headers[2].textContent).toBe('Best Ops/sec')
    expect(headers[3].textContent).toBe('Ratio')
    expect(headers[4].textContent).toBe('Runs')
  })

  it('should display formatted ops/sec values', () => {
    render(<TrajectoryDataTable dataPoints={tableDataPoints} />)

    const cells = screen.getAllByRole('cell')
    // Row 1: #, name, ops/sec, ratio, runs
    const opsCell = cells.find((c) => c.textContent?.includes('4,200 ops/sec'))
    expect(opsCell).toBeDefined()
  })

  it('should be accessible with thead and th elements', () => {
    render(<TrajectoryDataTable dataPoints={tableDataPoints} />)

    const table = screen.getByRole('table')
    const rowgroups = table.querySelectorAll('thead')
    expect(rowgroups).toHaveLength(1)
    const thElements = table.querySelectorAll('th')
    expect(thElements.length).toBe(5)
  })
})
