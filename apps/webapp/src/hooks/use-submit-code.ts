import { useCallback, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { ExecutionEvent } from '@mycscompanion/execution'
import { apiFetch, ApiError, API_URL } from '../lib/api-fetch'
import { useSSE } from './use-sse'
import { parseGoError } from '../components/workspace/parse-go-error'
import { announceToScreenReader } from '../components/workspace/workspace-a11y'
import type { OutputLine } from '../components/workspace/TerminalPanel'

interface SubmitCodeParams {
  readonly milestoneId: string
  readonly code: string
}

interface UseSubmitCodeResult {
  readonly submit: (params: SubmitCodeParams) => void
  readonly submissionId: string | null
  readonly isRunning: boolean
  readonly outputLines: ReadonlyArray<OutputLine>
}

function useSubmitCode(): UseSubmitCodeResult {
  const queryClient = useQueryClient()
  const [submissionId, setSubmissionId] = useState<string | null>(null)
  const [isStreaming, setIsStreaming] = useState(false)
  const [submitErrorOutput, setSubmitErrorOutput] = useState<ReadonlyArray<OutputLine> | null>(null)

  const compileErrorCountRef = useRef(0)
  const maxSeenSequenceIdRef = useRef(-1)
  const submissionIdRef = useRef<string | null>(null)

  const sseUrl = submissionId ? `${API_URL}/api/execution/${submissionId}/stream` : null

  // Mutation for POST /api/execution/submit (AC #1, Task 1.1)
  const submitMutation = useMutation({
    mutationKey: ['execution', 'submit'],
    mutationFn: (params: SubmitCodeParams) =>
      apiFetch<{ submissionId: string }>('/api/execution/submit', {
        method: 'POST',
        body: JSON.stringify({ milestoneId: params.milestoneId, code: params.code }),
      }),
    onSuccess: (data) => {
      submissionIdRef.current = data.submissionId
      setSubmissionId(data.submissionId)
      setIsStreaming(true)
      // Seed the cache entry before the query observer subscribes
      queryClient.setQueryData<ReadonlyArray<OutputLine>>(
        ['execution', 'output', data.submissionId],
        [],
      )
    },
  })

  // Subscribe to execution output from TanStack Query cache (AC #4 — cache is source of truth).
  // enabled: !!submissionId ensures the observer actively subscribes to cache updates.
  // staleTime: Infinity prevents refetching — data is written exclusively via setQueryData from SSE events.
  const { data: cachedOutput = [] } = useQuery<ReadonlyArray<OutputLine>>({
    queryKey: ['execution', 'output', submissionId],
    queryFn: () => Promise.resolve([] as ReadonlyArray<OutputLine>),
    enabled: !!submissionId,
    staleTime: Infinity,
  })

  // Helper: append output line to query cache
  const appendOutput = useCallback(
    (line: OutputLine): void => {
      const subId = submissionIdRef.current
      if (subId) {
        queryClient.setQueryData<ReadonlyArray<OutputLine>>(
          ['execution', 'output', subId],
          (prev = []) => [...prev, line],
        )
      }
    },
    [queryClient],
  )

  const setOutput = useCallback(
    (lines: ReadonlyArray<OutputLine>): void => {
      const subId = submissionIdRef.current
      if (subId) {
        queryClient.setQueryData<ReadonlyArray<OutputLine>>(
          ['execution', 'output', subId],
          lines,
        )
      }
    },
    [queryClient],
  )

  const handleSSEEvent = useCallback(
    (event: ExecutionEvent): void => {
      // Deduplicate by sequenceId (reconnect replay protection)
      if ('sequenceId' in event) {
        if (event.sequenceId <= maxSeenSequenceIdRef.current) return
        maxSeenSequenceIdRef.current = event.sequenceId
      }

      switch (event.type) {
        case 'queued':
          compileErrorCountRef.current = 0
          setOutput([{ kind: 'status', text: 'Queued...', phase: 'preparing' }])
          break
        case 'compile_output':
        case 'output':
          appendOutput({ kind: 'stdout', text: event.data })
          break
        case 'compile_error': {
          compileErrorCountRef.current++
          const { interpretation, rawOutput } = parseGoError(event.data)
          appendOutput({ kind: 'error', interpretation, rawOutput, isUserError: true })
          break
        }
        case 'error': {
          if (event.isUserError) {
            compileErrorCountRef.current++
            const parsed = parseGoError(event.data)
            appendOutput({ kind: 'error', ...parsed, isUserError: true })
            const count = compileErrorCountRef.current
            announceToScreenReader(`Compilation failed: ${count} ${count === 1 ? 'issue' : 'issues'}`)
          } else {
            appendOutput({
              kind: 'error',
              interpretation: event.message,
              rawOutput: event.data,
              isUserError: false,
            })
          }
          setIsStreaming(false)
          break
        }
        case 'complete':
          appendOutput({ kind: 'success', text: 'Build successful.' })
          setIsStreaming(false)
          announceToScreenReader('Build successful')
          break
        case 'timeout':
          appendOutput({
            kind: 'error',
            interpretation: `Execution timed out after ${event.timeoutSeconds} seconds.`,
            rawOutput: event.data,
            isUserError: true,
          })
          setIsStreaming(false)
          announceToScreenReader('Execution timed out')
          break
        case 'test_output':
          appendOutput({ kind: 'stdout', text: event.data })
          break
        case 'test_result':
          appendOutput({ kind: event.passed ? 'success' : 'stderr', text: event.data })
          break
        case 'benchmark_progress':
          appendOutput({
            kind: 'status',
            text: `Benchmark: ${event.iteration}/${event.total}`,
            phase: 'benchmarking',
          })
          break
        case 'benchmark_result':
          appendOutput({ kind: 'stdout', text: event.data })
          break
        case 'heartbeat':
          break
      }
    },
    [appendOutput, setOutput],
  )

  useSSE({ url: sseUrl, onEvent: handleSSEEvent })

  const submit = useCallback(
    (params: SubmitCodeParams): void => {
      setSubmissionId(null)
      setIsStreaming(false)
      setSubmitErrorOutput(null)
      submissionIdRef.current = null
      maxSeenSequenceIdRef.current = -1
      compileErrorCountRef.current = 0

      submitMutation.mutate(params, {
        onError: (err) => {
          if (err instanceof ApiError && err.status === 429) {
            setSubmitErrorOutput([{
              kind: 'error',
              interpretation: 'Too many submissions. Try again shortly.',
              rawOutput: err.message,
              isUserError: false,
            }])
          } else {
            const message = err instanceof Error ? err.message : 'Something went wrong'
            setSubmitErrorOutput([{
              kind: 'error',
              interpretation: `${message}. Try again.`,
              rawOutput: '',
              isUserError: false,
            }])
          }
        },
      })
    },
    [submitMutation.mutate],
  )

  const isRunning = submitMutation.isPending || isStreaming
  const outputLines = submitErrorOutput ?? cachedOutput

  return { submit, submissionId, isRunning, outputLines }
}

export { useSubmitCode }
export type { SubmitCodeParams, UseSubmitCodeResult }
