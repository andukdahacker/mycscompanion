import { useCallback, useEffect, useRef, useState } from 'react'
import type { TutorHookError } from '../../hooks/use-tutor-stream'

interface TutorInputProps {
  readonly onSend: (message: string) => void
  readonly isStreaming: boolean
  readonly error: TutorHookError | null
  readonly onClearError: () => void
}

function TutorInput({ onSend, isStreaming, error, onClearError }: TutorInputProps): React.ReactElement {
  const [value, setValue] = useState('')
  const [rateLimitCountdown, setRateLimitCountdown] = useState<number | null>(null)
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Handle rate limit / unavailable countdown
  useEffect(() => {
    const hasCountdown = error && (error.code === 'RATE_LIMITED' || error.code === 'TUTOR_UNAVAILABLE') && error.retryAfter
    if (!hasCountdown) {
      setRateLimitCountdown(null)
      if (countdownRef.current) clearInterval(countdownRef.current)
      return
    }
    if (!error || !error.retryAfter) return

    const retryAfter = error.retryAfter

    setRateLimitCountdown(retryAfter)
    countdownRef.current = setInterval(() => {
      setRateLimitCountdown((prev) => {
        if (prev === null || prev <= 1) {
          if (countdownRef.current) clearInterval(countdownRef.current)
          onClearError()
          return null
        }
        return prev - 1
      })
    }, 1000)

    return () => {
      if (countdownRef.current) clearInterval(countdownRef.current)
    }
  }, [error, onClearError])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key !== 'Enter') return
      e.preventDefault()

      const trimmed = value.trim()
      if (!trimmed || trimmed.length > 2000 || isStreaming) return

      onSend(trimmed)
      setValue('')
    },
    [value, isStreaming, onSend],
  )

  return (
    <div className="border-t px-3 py-2">
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask a question..."
          disabled={isStreaming}
          aria-label="Send a message to AI tutor"
          aria-disabled={isStreaming}
          className="flex-1 rounded-md border border-border bg-background px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
        />
        {isStreaming && (
          <span className="inline-block size-2 animate-pulse rounded-full bg-foreground/40" aria-hidden="true" />
        )}
      </div>

      {error && (
        <div className="mt-1.5 flex items-center justify-between text-xs text-destructive">
          <span>
            {error.message}
            {rateLimitCountdown !== null && (error.code === 'TUTOR_UNAVAILABLE'
              ? ` (available in ~${rateLimitCountdown}s)`
              : ` (retry in ${rateLimitCountdown}s)`)}
          </span>
          {error.code !== 'RATE_LIMITED' && error.code !== 'TUTOR_UNAVAILABLE' && (
            <button
              onClick={onClearError}
              className="ml-2 text-xs text-muted-foreground hover:text-foreground"
            >
              Dismiss
            </button>
          )}
        </div>
      )}
    </div>
  )
}

export { TutorInput }
export type { TutorInputProps }
