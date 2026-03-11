import { render, screen, cleanup } from '@testing-library/react'
import { afterEach, describe, it, expect, vi } from 'vitest'
import type { UseHistoricalBenchmarksResult, HistoricalBenchmarkEntry } from '../../hooks/use-historical-benchmarks'

const mockUseHistoricalBenchmarks = vi.fn<(milestoneId: string | undefined) => UseHistoricalBenchmarksResult>()
vi.mock('../../hooks/use-historical-benchmarks', () => ({
  useHistoricalBenchmarks: (milestoneId: string | undefined) => mockUseHistoricalBenchmarks(milestoneId),
}))

import { BenchmarkHistoryList } from './BenchmarkHistoryList'

afterEach(() => {
  cleanup()
  mockUseHistoricalBenchmarks.mockReset()
  vi.restoreAllMocks()
})

function makeEntry(overrides: Partial<HistoricalBenchmarkEntry> & { readonly id: string; readonly submissionNumber: number }): HistoricalBenchmarkEntry {
  return {
    submissionId: 's1',
    benchmarkName: 'sequential-inserts',
    opsPerSec: 8000,
    normalizedRatio: 0.79,
    userMedian: 8000,
    referenceMedian: 10100,
    p50LatencyUs: 120,
    p99LatencyUs: 445,
    referenceVersion: 'v1',
    createdAt: '2026-03-01T00:00:00Z',
    ...overrides,
  }
}

function mockHookResult(overrides: Partial<UseHistoricalBenchmarksResult> = {}): UseHistoricalBenchmarksResult {
  return {
    entries: [],
    totalCount: 0,
    isLoading: false,
    hasNextPage: false,
    fetchNextPage: vi.fn(),
    isFetchingNextPage: false,
    ...overrides,
  }
}

describe('BenchmarkHistoryList', () => {
  it('should render table with correct column headers', () => {
    mockUseHistoricalBenchmarks.mockReturnValue(mockHookResult({
      entries: [makeEntry({ id: 'r1', submissionNumber: 1 })],
      totalCount: 1,
    }))

    render(<BenchmarkHistoryList milestoneId="ms-1" />)

    expect(screen.getByText('#')).toBeInTheDocument()
    expect(screen.getByText('Ops/sec')).toBeInTheDocument()
    expect(screen.getByText('Ratio')).toBeInTheDocument()
    expect(screen.getByText('Trend')).toBeInTheDocument()
    expect(screen.getByText('Date')).toBeInTheDocument()
  })

  it('should display formatted ops/sec with commas', () => {
    mockUseHistoricalBenchmarks.mockReturnValue(mockHookResult({
      entries: [makeEntry({ id: 'r1', submissionNumber: 1, opsPerSec: 12400 })],
      totalCount: 1,
    }))

    render(<BenchmarkHistoryList milestoneId="ms-1" />)

    expect(screen.getByText('12,400')).toBeInTheDocument()
  })

  it('should display normalized ratio with 2 decimal places', () => {
    mockUseHistoricalBenchmarks.mockReturnValue(mockHookResult({
      entries: [makeEntry({ id: 'r1', submissionNumber: 1, normalizedRatio: 0.8119 })],
      totalCount: 1,
    }))

    render(<BenchmarkHistoryList milestoneId="ms-1" />)

    expect(screen.getByText('0.81x ref')).toBeInTheDocument()
  })

  it('should show improvement arrow when ops/sec increases', () => {
    mockUseHistoricalBenchmarks.mockReturnValue(mockHookResult({
      entries: [
        makeEntry({ id: 'r1', submissionNumber: 1, opsPerSec: 8000 }),
        makeEntry({ id: 'r2', submissionNumber: 2, opsPerSec: 10000 }),
      ],
      totalCount: 2,
    }))

    render(<BenchmarkHistoryList milestoneId="ms-1" />)

    const arrow = screen.getByLabelText(/Improving from/)
    expect(arrow.textContent).toBe('\u2191')
  })

  it('should show regression arrow when ops/sec decreases', () => {
    mockUseHistoricalBenchmarks.mockReturnValue(mockHookResult({
      entries: [
        makeEntry({ id: 'r1', submissionNumber: 1, opsPerSec: 10000 }),
        makeEntry({ id: 'r2', submissionNumber: 2, opsPerSec: 8000 }),
      ],
      totalCount: 2,
    }))

    render(<BenchmarkHistoryList milestoneId="ms-1" />)

    const arrow = screen.getByLabelText(/Regressing from/)
    expect(arrow.textContent).toBe('\u2193')
  })

  it('should show dash for first entry (no previous to compare)', () => {
    mockUseHistoricalBenchmarks.mockReturnValue(mockHookResult({
      entries: [makeEntry({ id: 'r1', submissionNumber: 1 })],
      totalCount: 1,
    }))

    render(<BenchmarkHistoryList milestoneId="ms-1" />)

    const dashes = screen.getAllByLabelText('First benchmark result')
    expect(dashes.length).toBeGreaterThan(0)
    expect(dashes[0]?.textContent).toBe('\u2014')
  })

  it('should render "Load more results" button when hasNextPage is true', () => {
    mockUseHistoricalBenchmarks.mockReturnValue(mockHookResult({
      entries: [makeEntry({ id: 'r1', submissionNumber: 1 })],
      totalCount: 5,
      hasNextPage: true,
    }))

    render(<BenchmarkHistoryList milestoneId="ms-1" />)

    expect(screen.getByText('Load more results')).toBeInTheDocument()
  })

  it('should not render "Load more" when hasNextPage is false', () => {
    mockUseHistoricalBenchmarks.mockReturnValue(mockHookResult({
      entries: [makeEntry({ id: 'r1', submissionNumber: 1 })],
      totalCount: 1,
      hasNextPage: false,
    }))

    render(<BenchmarkHistoryList milestoneId="ms-1" />)

    expect(screen.queryByText('Load more results')).not.toBeInTheDocument()
  })

  it('should render empty state message when entries is empty', () => {
    mockUseHistoricalBenchmarks.mockReturnValue(mockHookResult())

    render(<BenchmarkHistoryList milestoneId="ms-1" />)

    expect(screen.getByTestId('benchmark-history-empty')).toBeInTheDocument()
    expect(screen.getByText(/No benchmark results yet/)).toBeInTheDocument()
  })

  it('should render loading skeleton when isLoading is true', () => {
    mockUseHistoricalBenchmarks.mockReturnValue(mockHookResult({ isLoading: true }))

    render(<BenchmarkHistoryList milestoneId="ms-1" />)

    expect(screen.getByTestId('benchmark-history-skeleton')).toBeInTheDocument()
  })

  it('should have accessible thead with column headers', () => {
    mockUseHistoricalBenchmarks.mockReturnValue(mockHookResult({
      entries: [makeEntry({ id: 'r1', submissionNumber: 1 })],
      totalCount: 1,
    }))

    const { container } = render(<BenchmarkHistoryList milestoneId="ms-1" />)

    const table = screen.getByTestId('benchmark-history-table')
    expect(table).toBeInTheDocument()
    const headers = container.querySelectorAll('thead th')
    expect(headers.length).toBe(5)
  })

  it('should have descriptive aria-label on trend arrows', () => {
    mockUseHistoricalBenchmarks.mockReturnValue(mockHookResult({
      entries: [
        makeEntry({ id: 'r1', submissionNumber: 1, opsPerSec: 8000 }),
        makeEntry({ id: 'r2', submissionNumber: 2, opsPerSec: 10000 }),
      ],
      totalCount: 2,
    }))

    render(<BenchmarkHistoryList milestoneId="ms-1" />)

    const arrows = screen.getAllByLabelText('Improving from 8,000 ops/sec')
    expect(arrows.length).toBeGreaterThan(0)
    expect(arrows[0]?.textContent).toBe('\u2191')
  })
})
