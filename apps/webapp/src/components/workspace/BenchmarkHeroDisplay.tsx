import { ArrowUp, ArrowDown } from 'lucide-react'

interface BenchmarkHeroDisplayProps {
  readonly value: number
  readonly unit: string
  readonly normalizedRatio: number
  readonly trendText?: string
  readonly isFirstRun: boolean
}

const numberFormatter = new Intl.NumberFormat()

function BenchmarkHeroDisplay({
  value,
  unit,
  normalizedRatio,
  trendText,
  isFirstRun,
}: BenchmarkHeroDisplayProps): React.ReactElement {
  const isImprovement = !isFirstRun && trendText?.startsWith('↑')
  const isRegression = !isFirstRun && trendText?.startsWith('↓')

  const formattedValue = numberFormatter.format(value)
  const formattedRatio = `${normalizedRatio.toFixed(2)}x reference implementation`
  const ariaLabel = `Benchmark result: ${formattedValue} ${unit}, ${normalizedRatio.toFixed(2)}x reference implementation`

  return (
    <div
      data-testid="benchmark-hero-display"
      aria-live="polite"
      aria-label={ariaLabel}
      className="space-y-1 p-3"
    >
      {/* Hero number */}
      <div className="flex items-baseline gap-2">
        <span
          data-testid="benchmark-hero-number"
          className={`font-mono text-4xl font-bold lg:text-3xl xl:text-4xl motion-reduce:animate-none ${
            isRegression ? 'text-foreground' : 'text-primary'
          }`}
        >
          {formattedValue}
        </span>
        <span className="text-sm text-muted-foreground">{unit}</span>
        <span className="text-sm text-secondary-foreground">(this session)</span>
      </div>

      {/* Normalized ratio */}
      <div className="font-mono text-sm text-muted-foreground">
        {formattedRatio}
      </div>

      {/* Trend */}
      {!isFirstRun && trendText ? (
        <div className="flex items-center gap-1 text-sm text-secondary-foreground">
          {isImprovement ? (
            <ArrowUp data-testid="benchmark-trend-arrow-up" className="size-4" />
          ) : null}
          {isRegression ? (
            <ArrowDown data-testid="benchmark-trend-arrow-down" className="size-4" />
          ) : null}
          <span data-testid="benchmark-trend-text">{trendText}</span>
        </div>
      ) : null}
    </div>
  )
}

export { BenchmarkHeroDisplay }
export type { BenchmarkHeroDisplayProps }
