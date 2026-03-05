import { useCallback, useEffect, useRef, useState } from 'react'
import type { StuckDetectionConfig } from './use-workspace-data'

interface UseStuckDetectionResult {
  readonly isStage1: boolean
  readonly isStage2: boolean
  readonly resetTimer: () => void
  readonly stage1Timestamp: number | null
  readonly stage2Timestamp: number | null
}

const CHECK_INTERVAL_MS = 1000

function useStuckDetection(config: StuckDetectionConfig): UseStuckDetectionResult {
  const [isStage1, setIsStage1] = useState(false)
  const [isStage2, setIsStage2] = useState(false)
  const [stage1Timestamp, setStage1Timestamp] = useState<number | null>(null)
  const [stage2Timestamp, setStage2Timestamp] = useState<number | null>(null)

  const lastActivityRef = useRef(Date.now())
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const thresholdMs = config.thresholdMinutes * 60 * 1000
  const stage2OffsetMs = config.stage2OffsetSeconds * 1000

  const resetTimer = useCallback((): void => {
    lastActivityRef.current = Date.now()
    setIsStage1(false)
    setIsStage2(false)
    setStage1Timestamp(null)
    setStage2Timestamp(null)
  }, [])

  useEffect(() => {
    intervalRef.current = setInterval(() => {
      const elapsed = Date.now() - lastActivityRef.current

      if (elapsed >= thresholdMs + stage2OffsetMs) {
        setIsStage1(true)
        setIsStage2((prev) => {
          if (!prev) {
            setStage2Timestamp(Date.now())
          }
          return true
        })
      } else if (elapsed >= thresholdMs) {
        setIsStage1((prev) => {
          if (!prev) {
            setStage1Timestamp(Date.now())
          }
          return true
        })
      }
    }, CHECK_INTERVAL_MS)

    return () => {
      if (intervalRef.current !== null) {
        clearInterval(intervalRef.current)
      }
    }
  }, [thresholdMs, stage2OffsetMs])

  return { isStage1, isStage2, resetTimer, stage1Timestamp, stage2Timestamp }
}

export { useStuckDetection }
export type { UseStuckDetectionResult }
