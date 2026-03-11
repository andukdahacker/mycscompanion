import { useHistoricalBenchmarks } from '../../hooks/use-historical-benchmarks'
import type { HistoricalBenchmarkEntry } from '../../hooks/use-historical-benchmarks'

interface BenchmarkHistoryListProps {
  readonly milestoneId: string | undefined
}

const numberFormatter = new Intl.NumberFormat()

function formatRelativeDate(isoDate: string): string {
  const now = Date.now()
  const date = new Date(isoDate).getTime()
  const diffMs = now - date
  const diffMin = Math.floor(diffMs / 60_000)
  const diffHours = Math.floor(diffMs / 3_600_000)
  const diffDays = Math.floor(diffMs / 86_400_000)

  if (diffMs < 0) return 'just now'
  if (diffMin < 1) return 'just now'
  if (diffMin < 60) return `${diffMin}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays < 7) return `${diffDays}d ago`
  return new Date(isoDate).toLocaleDateString()
}

function getTrend(
  entries: ReadonlyArray<HistoricalBenchmarkEntry>,
  index: number,
): { arrow: string; className: string; ariaLabel: string } | null {
  if (index === 0) return null

  const current = entries[index]
  if (!current) return null

  // Find previous entry with the same benchmarkName
  let prev: HistoricalBenchmarkEntry | undefined
  for (let i = index - 1; i >= 0; i--) {
    if (entries[i]?.benchmarkName === current.benchmarkName) {
      prev = entries[i]
      break
    }
  }

  if (!prev) return null

  if (current.opsPerSec > prev.opsPerSec) {
    return {
      arrow: '\u2191',
      className: 'text-primary',
      ariaLabel: `Improving from ${numberFormatter.format(prev.opsPerSec)} ops/sec`,
    }
  }
  if (current.opsPerSec < prev.opsPerSec) {
    return {
      arrow: '\u2193',
      className: 'text-muted-foreground',
      ariaLabel: `Regressing from ${numberFormatter.format(prev.opsPerSec)} ops/sec`,
    }
  }
  return {
    arrow: '\u2192',
    className: 'text-muted-foreground',
    ariaLabel: `No change from ${numberFormatter.format(prev.opsPerSec)} ops/sec`,
  }
}

function BenchmarkHistoryList({ milestoneId }: BenchmarkHistoryListProps): React.ReactElement {
  const { entries, totalCount, isLoading, hasNextPage, fetchNextPage, isFetchingNextPage } =
    useHistoricalBenchmarks(milestoneId)

  if (isLoading) {
    return (
      <div className="p-3" data-testid="benchmark-history-skeleton">
        <div className="mb-3 h-4 w-40 animate-pulse rounded bg-muted motion-reduce:animate-none" />
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="mb-2 h-8 animate-pulse rounded bg-muted motion-reduce:animate-none" />
        ))}
      </div>
    )
  }

  if (entries.length === 0) {
    return (
      <div className="flex h-full items-center justify-center p-3">
        <p className="text-muted-foreground" data-testid="benchmark-history-empty">
          No benchmark results yet. Run a benchmark to see your performance history.
        </p>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col p-3">
      <p className="mb-2 text-sm text-muted-foreground">{totalCount} benchmark results</p>
      <div className="flex-1 overflow-auto">
        <table className="w-full text-sm" data-testid="benchmark-history-table">
          <thead>
            <tr className="border-b text-left text-muted-foreground">
              <th className="pb-2 pr-3 font-medium">#</th>
              <th className="pb-2 pr-3 font-medium">Ops/sec</th>
              <th className="hidden pb-2 pr-3 font-medium sm:table-cell">Ratio</th>
              <th className="pb-2 pr-3 font-medium">Trend</th>
              <th className="hidden pb-2 font-medium sm:table-cell">Date</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry, i) => {
              const trend = getTrend(entries, i)
              return (
                <tr key={entry.id} className="border-b border-border/50">
                  <td className="py-2 pr-3 text-muted-foreground">{entry.submissionNumber}</td>
                  <td className="py-2 pr-3 font-mono font-medium">{numberFormatter.format(entry.opsPerSec)}</td>
                  <td className="hidden py-2 pr-3 font-mono sm:table-cell">{entry.normalizedRatio.toFixed(2)}x ref</td>
                  <td className="py-2 pr-3">
                    {trend ? (
                      <span className={trend.className} aria-label={trend.ariaLabel}>
                        {trend.arrow}
                      </span>
                    ) : (
                      <span className="text-muted-foreground" aria-label="First benchmark result">{'\u2014'}</span>
                    )}
                  </td>
                  <td className="hidden py-2 text-muted-foreground sm:table-cell">{formatRelativeDate(entry.createdAt)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {hasNextPage ? (
        <button
          type="button"
          className="mt-2 w-full rounded-md border px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onClick={() => fetchNextPage()}
          disabled={isFetchingNextPage}
        >
          {isFetchingNextPage ? 'Loading...' : 'Load more results'}
        </button>
      ) : null}
    </div>
  )
}

export { BenchmarkHistoryList }
export type { BenchmarkHistoryListProps }
