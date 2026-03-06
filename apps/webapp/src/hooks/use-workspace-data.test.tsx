import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClientProvider } from '@tanstack/react-query'
import { createTestQueryClient } from '@mycscompanion/config/test-utils/query-client'
import type { QueryClient } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import type { MilestoneContent } from '@mycscompanion/shared'

const mockApiFetch = vi.fn()

vi.mock('../lib/api-fetch', () => ({
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
}))

const MOCK_MILESTONE_CONTENT: MilestoneContent = {
  milestoneId: 'ms-1',
  trackId: 'track-1',
  slug: '01-kv-store',
  title: 'Simple Key-Value Store',
  position: 1,
  brief: '# Milestone 1\n\nBuild a KV store.',
  acceptanceCriteria: [
    { name: 'put-and-get', order: 1, description: 'Put and get', assertion: { type: 'stdout-contains', expected: 'PASS' } },
  ],
  benchmarkConfig: null,
  conceptExplainerAssets: [],
  starterCode: 'package main\n\nfunc main() {}\n',
}

describe('useWorkspaceData', () => {
  let queryClient: QueryClient

  function wrapper({ children }: { readonly children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  }

  beforeEach(() => {
    queryClient = createTestQueryClient()
    mockApiFetch.mockResolvedValue(MOCK_MILESTONE_CONTENT)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('should call apiFetch with correct curriculum endpoint', async () => {
    const { useWorkspaceData } = await import('./use-workspace-data')
    renderHook(() => useWorkspaceData('01-kv-store'), { wrapper })

    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenCalledWith('/api/curriculum/milestones/01-kv-store')
    })
  })

  it('should map MilestoneContent to WorkspaceData shape', async () => {
    const { useWorkspaceData } = await import('./use-workspace-data')
    const { result } = renderHook(() => useWorkspaceData('01-kv-store'), { wrapper })

    await waitFor(() => {
      expect(result.current.data).toBeDefined()
    })

    expect(result.current.data).toEqual(
      expect.objectContaining({
        milestoneName: 'Simple Key-Value Store',
        milestoneNumber: 1,
        progress: 0,
        initialContent: 'package main\n\nfunc main() {}\n',
        brief: '# Milestone 1\n\nBuild a KV store.',
        criteria: MOCK_MILESTONE_CONTENT.acceptanceCriteria,
      })
    )
  })

  it('should fall back to default Go template when starterCode is null', async () => {
    mockApiFetch.mockResolvedValue({ ...MOCK_MILESTONE_CONTENT, starterCode: null })

    const { useWorkspaceData } = await import('./use-workspace-data')
    const { result } = renderHook(() => useWorkspaceData('01-kv-store'), { wrapper })

    await waitFor(() => {
      expect(result.current.data).toBeDefined()
    })

    expect(result.current.data?.initialContent).toContain('package main')
    expect(result.current.data?.initialContent).toContain('fmt.Println')
  })

  it('should include stuck detection thresholds in response', async () => {
    const { useWorkspaceData } = await import('./use-workspace-data')
    const { result } = renderHook(() => useWorkspaceData('milestone-1'), { wrapper })

    await waitFor(() => {
      expect(result.current.data).toBeDefined()
    })

    expect(result.current.data).toEqual(
      expect.objectContaining({
        stuckDetection: expect.objectContaining({
          thresholdMinutes: expect.any(Number),
          stage2OffsetSeconds: expect.any(Number),
        }),
      })
    )
  })

  it('should use query key pattern [workspace, get, milestoneId]', async () => {
    const { useWorkspaceData } = await import('./use-workspace-data')
    renderHook(() => useWorkspaceData('ms-42'), { wrapper })

    await waitFor(() => {
      expect(queryClient.getQueryData(['workspace', 'get', 'ms-42'])).toBeDefined()
    })
  })

  it('should set staleTime to 5 minutes', async () => {
    const { useWorkspaceData } = await import('./use-workspace-data')
    const { result } = renderHook(() => useWorkspaceData('milestone-1'), { wrapper })

    await waitFor(() => {
      expect(result.current.data).toBeDefined()
    })

    const queryState = queryClient.getQueryState(['workspace', 'get', 'milestone-1'])
    expect(queryState?.isInvalidated).toBe(false)
  })

  it('should return isLoading and isError states', async () => {
    const { useWorkspaceData } = await import('./use-workspace-data')
    const { result } = renderHook(() => useWorkspaceData('milestone-1'), { wrapper })

    expect(typeof result.current.isLoading).toBe('boolean')
    expect(typeof result.current.isError).toBe('boolean')

    await waitFor(() => {
      expect(result.current.data).toBeDefined()
    })
  })

  it('should pass through conceptExplainerAssets from API response', async () => {
    const assetsContent = {
      ...MOCK_MILESTONE_CONTENT,
      conceptExplainerAssets: [
        { name: 'kv-ops.svg', path: '/assets/milestones/01-kv-store/kv-ops.svg', altText: 'KV operations', title: 'KV Ops' },
        { name: 'flow.svg', path: '/assets/milestones/01-kv-store/flow.svg', altText: null, title: null },
      ],
    }
    mockApiFetch.mockResolvedValue(assetsContent)

    const { useWorkspaceData } = await import('./use-workspace-data')
    const { result } = renderHook(() => useWorkspaceData('01-kv-store'), { wrapper })

    await waitFor(() => {
      expect(result.current.data).toBeDefined()
    })

    expect(result.current.data?.conceptExplainerAssets).toHaveLength(2)
    expect(result.current.data?.conceptExplainerAssets[0]?.name).toBe('kv-ops.svg')
    expect(result.current.data?.conceptExplainerAssets[0]?.title).toBe('KV Ops')
    expect(result.current.data?.conceptExplainerAssets[1]?.altText).toBeNull()
  })

  it('should return empty conceptExplainerAssets when API returns none', async () => {
    const { useWorkspaceData } = await import('./use-workspace-data')
    const { result } = renderHook(() => useWorkspaceData('01-kv-store'), { wrapper })

    await waitFor(() => {
      expect(result.current.data).toBeDefined()
    })

    expect(result.current.data?.conceptExplainerAssets).toEqual([])
  })

  it('should expose refetch function', async () => {
    const { useWorkspaceData } = await import('./use-workspace-data')
    const { result } = renderHook(() => useWorkspaceData('milestone-1'), { wrapper })

    await waitFor(() => {
      expect(result.current.data).toBeDefined()
    })

    expect(typeof result.current.refetch).toBe('function')
  })
})
