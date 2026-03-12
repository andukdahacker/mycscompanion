import { useId, useMemo } from 'react'
import { cn } from '@mycscompanion/ui/src/lib/utils'

interface TrajectoryDataPointInput {
  readonly milestoneName: string
  readonly milestoneNumber: number
  readonly bestOpsPerSec: number
}

interface TrajectoryChartProps {
  readonly dataPoints: ReadonlyArray<TrajectoryDataPointInput>
  readonly currentMilestoneNumber?: number
  readonly className?: string
}

interface TrajectoryDataTableProps {
  readonly dataPoints: ReadonlyArray<{
    readonly milestoneName: string
    readonly milestoneNumber: number
    readonly bestOpsPerSec: number
    readonly bestNormalizedRatio: number
    readonly totalSubmissions: number
  }>
}

const VIEW_WIDTH = 500
const VIEW_HEIGHT = 180
const PADDING_TOP = 30
const PADDING_BOTTOM = 35
const PADDING_X = 60
const CHART_HEIGHT = VIEW_HEIGHT - PADDING_TOP - PADDING_BOTTOM

const numberFormatter = new Intl.NumberFormat()

function computeYPositions(values: ReadonlyArray<number>): ReadonlyArray<number> {
  if (values.length === 0) return []
  if (values.length === 1) return [PADDING_TOP + CHART_HEIGHT / 2]

  const min = Math.min(...values)
  const max = Math.max(...values)

  if (min === max) {
    return values.map(() => PADDING_TOP + CHART_HEIGHT / 2)
  }

  const paddedMin = min - (max - min) * 0.1
  const paddedMax = max + (max - min) * 0.1
  const range = paddedMax - paddedMin

  return values.map((v) => {
    const normalized = (v - paddedMin) / range
    return PADDING_TOP + CHART_HEIGHT - normalized * CHART_HEIGHT
  })
}

function TrajectoryChart({ dataPoints, currentMilestoneNumber, className }: TrajectoryChartProps): React.ReactElement {
  const filterId = useId()
  const glowId = `glow-${filterId.replace(/:/g, '')}`
  const hasReducedMotion = useMemo(
    () =>
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    [],
  )

  if (dataPoints.length === 0) {
    return (
      <div className={cn('w-full rounded-lg border border-border bg-card p-4', 'lg:max-w-[400px] xl:max-w-[500px]', className)}>
        <p className="text-sm text-muted-foreground">Run benchmarks to see your performance trajectory across milestones.</p>
      </div>
    )
  }

  const values = dataPoints.map((d) => d.bestOpsPerSec)
  const yPositions = computeYPositions(values)

  const xStep = dataPoints.length === 1
    ? 0
    : (VIEW_WIDTH - 2 * PADDING_X) / (dataPoints.length - 1)

  const xPositions = dataPoints.map((_, i) =>
    dataPoints.length === 1 ? VIEW_WIDTH / 2 : PADDING_X + i * xStep,
  )

  const polylinePoints = xPositions.map((x, i) => `${x},${yPositions[i]}`).join(' ')

  return (
    <div className={cn('w-full rounded-lg border border-border bg-card p-4', 'lg:max-w-[400px] xl:max-w-[500px]', className)}>
      <svg
        className="h-auto w-full"
        viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
        role="img"
        aria-label="Benchmark trajectory across milestones"
      >
        {/* Glow filter definition */}
        {!hasReducedMotion ? (
          <defs>
            <filter id={glowId}>
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
        ) : null}

        {/* Connecting line */}
        {dataPoints.length > 1 ? (
          <polyline
            data-testid="trajectory-line"
            points={polylinePoints}
            fill="none"
            stroke="#34d399"
            strokeWidth="2"
            opacity="0.6"
          />
        ) : null}

        {/* Data points and labels */}
        {dataPoints.map((point, i) => {
          const x = xPositions[i] ?? VIEW_WIDTH / 2
          const y = yPositions[i] ?? PADDING_TOP + CHART_HEIGHT / 2
          const isCurrent = point.milestoneNumber === currentMilestoneNumber
          const radius = isCurrent ? 6 : 4
          const formattedOps = `${numberFormatter.format(point.bestOpsPerSec)} ops/sec`

          return (
            <g key={point.milestoneNumber}>
              {/* Data point circle */}
              <circle
                data-testid={`trajectory-point-${point.milestoneNumber}`}
                cx={x}
                cy={y}
                r={radius}
                fill="#34d399"
                filter={isCurrent && !hasReducedMotion ? `url(#${glowId})` : undefined}
              />

              {/* Value label above point */}
              <text
                x={x}
                y={y - 12}
                fontSize="10"
                fill={isCurrent ? '#e4e4e7' : '#8b8fa3'}
                textAnchor="middle"
                fontWeight={isCurrent ? '600' : 'normal'}
              >
                {formattedOps}
              </text>

              {/* Milestone label below */}
              <text
                data-testid={`trajectory-label-${point.milestoneNumber}`}
                x={x}
                y={VIEW_HEIGHT - 5}
                fontSize="10"
                fill={isCurrent ? '#34d399' : '#555973'}
                textAnchor="middle"
                fontWeight={isCurrent ? '600' : 'normal'}
              >
                {point.milestoneName}
              </text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}

function TrajectoryDataTable({ dataPoints }: TrajectoryDataTableProps): React.ReactElement {
  return (
    <table className="sr-only" aria-label="Benchmark trajectory data">
      <thead>
        <tr>
          <th scope="col">#</th>
          <th scope="col">Milestone</th>
          <th scope="col">Best Ops/sec</th>
          <th scope="col">Ratio</th>
          <th scope="col">Runs</th>
        </tr>
      </thead>
      <tbody>
        {dataPoints.map((point) => (
          <tr key={point.milestoneNumber}>
            <td>{point.milestoneNumber}</td>
            <td>{point.milestoneName}</td>
            <td>{numberFormatter.format(point.bestOpsPerSec)} ops/sec</td>
            <td>{point.bestNormalizedRatio.toFixed(2)}x ref</td>
            <td>{point.totalSubmissions}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export { TrajectoryChart, TrajectoryDataTable }
export type { TrajectoryChartProps, TrajectoryDataTableProps }
