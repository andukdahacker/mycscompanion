import { useEffect, useRef, useState } from 'react'

type BenchmarkProgressState = 'idle' | 'running' | 'elapsed' | 'context' | 'extended' | 'timeout'

interface UseBenchmarkProgressResult {
  readonly state: BenchmarkProgressState
  readonly elapsedSeconds: number
}

function getState(seconds: number): BenchmarkProgressState {
  if (seconds >= 60) return 'timeout'
  if (seconds >= 10) return 'extended'
  if (seconds >= 5) return 'context'
  if (seconds >= 2) return 'elapsed'
  return 'running'
}

function useBenchmarkProgress(isActive: boolean): UseBenchmarkProgressResult {
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const prevActiveRef = useRef(false)

  useEffect(() => {
    // Reset when transitioning from inactive to active
    if (isActive && !prevActiveRef.current) {
      setElapsedSeconds(0)
    }
    prevActiveRef.current = isActive

    if (!isActive) {
      setElapsedSeconds(0)
      return
    }

    const interval = setInterval(() => {
      setElapsedSeconds((prev) => {
        if (prev >= 60) return 60 // Stop at timeout
        return prev + 1
      })
    }, 1000)

    return () => clearInterval(interval)
  }, [isActive])

  const state: BenchmarkProgressState = isActive ? getState(elapsedSeconds) : 'idle'

  return { state, elapsedSeconds }
}

export { useBenchmarkProgress }
export type { BenchmarkProgressState, UseBenchmarkProgressResult }
